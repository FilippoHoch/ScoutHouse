from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Sequence
from datetime import date
from enum import Enum
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.db import get_db
from app.core.http_cache import apply_http_cache
from app.deps import get_current_user, require_structure_editor
from app.models import (
    Attachment,
    AttachmentOwnerType,
    CellCoverageQuality,
    Contact,
    ContactPreferredChannel,
    FirePolicy,
    FloodRiskLevel,
    RiverSwimmingOption,
    Structure,
    StructureContact,
    StructureCostModifier,
    StructureCostOption,
    StructureOpenPeriod,
    StructureOpenPeriodKind,
    StructureOpenPeriodSeason,
    StructurePhoto,
    StructureSeason,
    StructureSeasonAvailability,
    StructureType,
    StructureUnit,
    User,
    WastewaterType,
)
from app.schemas import (
    ContactCreate,
    ContactRead,
    ContactUpdate,
    StructureAvailabilityCreate,
    StructureAvailabilityRead,
    StructureAvailabilityUpdate,
    StructureCostModifierCreate,
    StructureCostModifierRead,
    StructureCostModifierUpdate,
    StructureCostOptionCreate,
    StructureCostOptionRead,
    StructureCostOptionUpdate,
    StructureCreate,
    StructureOpenPeriodCreate,
    StructureOpenPeriodRead,
    StructureOpenPeriodUpdate,
    StructurePhotoCreate,
    StructurePhotoRead,
    StructureRead,
    StructureSearchItem,
    StructureSearchResponse,
    StructureUpdate,
)
from app.services.attachments import (
    StorageUnavailableError,
    delete_object,
    ensure_bucket,
    ensure_bucket_exists,
    get_s3_client,
    rewrite_presigned_url,
)
from app.services.audit import record_audit
from app.services.costs import CostBand, band_for_cost, estimate_mean_daily_cost
from app.services.filters import structure_matches_filters
from app.services.geo import haversine_km

router = APIRouter()


DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
StructureEditor = Annotated[User, Depends(require_structure_editor)]


SLUG_SANITIZE_RE = re.compile(r"[^a-z0-9]+")

_WEBSITE_CHECK_TIMEOUT = 5.0


def _website_responds(client: httpx.Client, url: str) -> bool:
    try:
        response = client.head(url, headers={"User-Agent": "ScoutHouse/website-check"})
    except httpx.HTTPError:
        response = None

    if response is None or response.status_code >= 400:
        try:
            response = client.get(
                url, headers={"User-Agent": "ScoutHouse/website-check"}
            )
        except httpx.HTTPError:
            return False

    if response.status_code < 400:
        return True
    if response.status_code in {401, 403}:
        return True
    return False


def _check_website_urls(urls: Iterable[str]) -> list[str]:
    candidates = [str(url) for url in urls if url]
    if not candidates:
        return []

    warnings: list[str] = []
    try:
        with httpx.Client(
            timeout=_WEBSITE_CHECK_TIMEOUT, follow_redirects=True
        ) as client:
            for url in candidates:
                try:
                    if not _website_responds(client, url):
                        warnings.append(url)
                except httpx.HTTPError:
                    warnings.append(url)
    except httpx.HTTPError:
        return []

    return warnings


def _ensure_storage_ready() -> tuple[str, Any]:
    try:
        bucket = ensure_bucket()
    except StorageUnavailableError as exc:  # pragma: no cover - defensive guard
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File storage not configured",
        ) from exc
    client = get_s3_client()
    try:
        ensure_bucket_exists(client, bucket)
    except StorageUnavailableError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File storage not configured",
        ) from exc
    return bucket, client


DEFAULT_SORT_FIELD = "created_at"
DEFAULT_SORT_ORDER = "desc"
VALID_SORT_FIELDS = {"name", "created_at", "distance"}
VALID_SORT_ORDERS = {"asc", "desc"}


def _serialize_units(raw_units: Sequence[str | StructureUnit]) -> list[StructureUnit]:
    units: list[StructureUnit] = []
    for value in raw_units:
        if isinstance(value, StructureUnit):
            units.append(value)
            continue
        try:
            units.append(StructureUnit(value))
        except ValueError:  # pragma: no cover - defensive guard
            continue
    return units


def _serialize_availability(
    availability: StructureSeasonAvailability,
) -> StructureAvailabilityRead:
    return StructureAvailabilityRead(
        id=availability.id,
        season=availability.season,
        units=_serialize_units(availability.units),
        capacity_min=availability.capacity_min,
        capacity_max=availability.capacity_max,
    )


def _serialize_cost_modifier(
    modifier: StructureCostModifier,
) -> StructureCostModifierRead:
    return StructureCostModifierRead(
        id=modifier.id,
        kind=modifier.kind,
        amount=modifier.amount,
        season=modifier.season,
        date_start=modifier.date_start,
        date_end=modifier.date_end,
        price_per_resource=modifier.price_per_resource,
    )


def _serialize_cost_option(option: StructureCostOption) -> StructureCostOptionRead:
    return StructureCostOptionRead(
        id=option.id,
        model=option.model,
        amount=option.amount,
        currency=option.currency,
        booking_deposit=getattr(option, "booking_deposit", None),
        damage_deposit=getattr(option, "damage_deposit", None),
        city_tax_per_night=option.city_tax_per_night,
        utilities_flat=option.utilities_flat,
        utilities_included=option.utilities_included,
        utilities_notes=option.utilities_notes,
        min_total=option.min_total,
        max_total=option.max_total,
        age_rules=option.age_rules,
        payment_methods=option.payment_methods,
        payment_terms=option.payment_terms,
        price_per_resource=option.price_per_resource,
        modifiers=[_serialize_cost_modifier(item) for item in option.modifiers]
        if option.modifiers
        else None,
    )


def _sync_cost_modifiers(
    option: StructureCostOption,
    modifiers_payload: Sequence[
        StructureCostModifierUpdate | StructureCostModifierCreate
    ],
) -> None:
    existing = {modifier.id: modifier for modifier in option.modifiers}
    seen: set[int] = set()

    for payload in modifiers_payload:
        payload_id = getattr(payload, "id", None)
        if payload_id is not None and payload_id in existing:
            modifier = existing[payload_id]
            modifier.kind = payload.kind
            modifier.amount = payload.amount
            modifier.season = payload.season
            modifier.date_start = payload.date_start
            modifier.date_end = payload.date_end
            modifier.price_per_resource = payload.price_per_resource
            seen.add(payload_id)
        else:
            option.modifiers.append(
                StructureCostModifier(
                    kind=payload.kind,
                    amount=payload.amount,
                    season=payload.season,
                    date_start=payload.date_start,
                    date_end=payload.date_end,
                    price_per_resource=payload.price_per_resource,
                )
            )

    for modifier_id, modifier in list(existing.items()):
        if modifier_id not in seen:
            option.modifiers.remove(modifier)


def _coerce_units(units: Sequence[object] | None) -> list[str] | None:
    if not units:
        return None
    result: list[str] = []
    for item in units:
        if isinstance(item, Enum):
            result.append(str(item.value))
        else:
            result.append(str(item))
    return result


def _serialize_open_period(period: StructureOpenPeriod) -> StructureOpenPeriodRead:
    return StructureOpenPeriodRead(
        id=period.id,
        kind=period.kind,
        season=period.season,
        date_start=period.date_start,
        date_end=period.date_end,
        notes=period.notes,
        units=_serialize_units(period.units) if period.units else None,
        blackout=period.blackout,
    )


def _serialize_photo(
    photo: StructurePhoto,
    attachment: Attachment,
    *,
    bucket: str,
    client: Any,
) -> StructurePhotoRead:
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": attachment.storage_key},
        ExpiresIn=120,
    )
    url = rewrite_presigned_url(url)
    return StructurePhotoRead(
        id=photo.id,
        structure_id=photo.structure_id,
        attachment_id=photo.attachment_id,
        filename=attachment.filename,
        mime=attachment.mime,
        size=attachment.size,
        position=photo.position,
        url=url,
        created_at=photo.created_at,
        description=attachment.description,
    )


def _slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    without_marks = "".join(
        char for char in normalized if not unicodedata.combining(char)
    )
    slug = SLUG_SANITIZE_RE.sub("-", without_marks.lower()).strip("-")
    return slug or "structure"


def _generate_unique_slug(db: Session, base_slug: str) -> str:
    slug = base_slug or "structure"
    counter = 2
    while (
        db.execute(
            select(Structure.id).where(func.lower(Structure.slug) == slug.lower())
        ).scalar_one_or_none()
        is not None
    ):
        slug = f"{base_slug}-{counter}" if base_slug else f"structure-{counter}"
        counter += 1
    return slug


def _structure_payload(
    structure_in: StructureCreate | StructureUpdate,
    *,
    include_slug: bool,
) -> dict[str, Any]:
    exclude: set[str] = {"open_periods"}
    if not include_slug:
        exclude.add("slug")

    payload = structure_in.model_dump(exclude=exclude)
    payload["contact_emails"] = [str(email) for email in structure_in.contact_emails]
    payload["website_urls"] = [str(url) for url in structure_in.website_urls]
    payload["map_resources_urls"] = [
        str(url) for url in structure_in.map_resources_urls
    ]
    payload["water_sources"] = (
        [source.value for source in structure_in.water_sources]
        if structure_in.water_sources is not None
        else None
    )
    if structure_in.field_slope is not None:
        payload["field_slope"] = structure_in.field_slope.value
    if structure_in.animal_policy is not None:
        payload["animal_policy"] = structure_in.animal_policy.value
    if structure_in.contact_status is not None:
        payload["contact_status"] = structure_in.contact_status.value
    if structure_in.operational_status is not None:
        payload["operational_status"] = structure_in.operational_status.value
    if structure_in.wastewater_type is not None:
        payload["wastewater_type"] = structure_in.wastewater_type.value
    if structure_in.cell_coverage is not None:
        payload["cell_coverage"] = structure_in.cell_coverage.value
    if structure_in.river_swimming is not None:
        payload["river_swimming"] = structure_in.river_swimming.value
    if structure_in.flood_risk is not None:
        payload["flood_risk"] = structure_in.flood_risk.value
    payload["bus_type_access"] = list(structure_in.bus_type_access or [])
    payload["allowed_audiences"] = list(structure_in.allowed_audiences or [])
    if structure_in.usage_recommendation is not None:
        payload["usage_recommendation"] = structure_in.usage_recommendation.value
    else:
        payload["usage_recommendation"] = None
    return payload


def _collect_structure_warnings(db: Session, structure: Structure) -> list[str]:
    warnings: list[str] = []

    name = (structure.name or "").strip()
    municipality = (structure.municipality or "").strip()
    if name and municipality:
        duplicate_exists = db.execute(
            select(func.count())
            .select_from(Structure)
            .where(
                func.lower(Structure.name) == name.lower(),
                func.lower(Structure.municipality) == municipality.lower(),
                Structure.id != structure.id,
            )
        ).scalar_one()
        if duplicate_exists:
            warnings.append(
                "Esistono altre strutture con lo stesso nome nel medesimo comune"
            )

    if structure.fire_policy is FirePolicy.WITH_PERMIT and not structure.fire_rules:
        warnings.append("Specificare le regole per i fuochi (fire_rules)")

    if structure.in_area_protetta and not structure.ente_area_protetta:
        warnings.append("Indicare l'ente responsabile dell'area protetta")

    for option in getattr(structure, "cost_options", []) or []:
        if option.utilities_flat is not None and option.utilities_included:
            warnings.append(
                "Verificare le utenze: utilities_flat e utilities_included sono entrambi valorizzati"
            )
            break

    photos = getattr(structure, "photos", None)
    if photos is not None and 0 < len(photos) < 3:
        warnings.append("Aggiungere almeno 3 foto della struttura")

    return warnings


def _sync_open_periods(
    structure: Structure,
    payloads: Sequence[StructureOpenPeriodUpdate | StructureOpenPeriodCreate],
    db: Session,
) -> None:
    existing = {period.id: period for period in structure.open_periods}
    seen_ids: set[int] = set()

    for item in payloads:
        item_dict = item.model_dump()
        period_id = item_dict.get("id")
        if period_id is not None and period_id in existing:
            period = existing[period_id]
            period.kind = item_dict["kind"]
            period.season = item_dict.get("season")
            period.date_start = item_dict.get("date_start")
            period.date_end = item_dict.get("date_end")
            period.notes = item_dict.get("notes")
            period.units = _coerce_units(item_dict.get("units"))
            period.blackout = bool(item_dict.get("blackout", False))
            seen_ids.add(period_id)
            continue

        new_period = StructureOpenPeriod(
            kind=item_dict["kind"],
            season=item_dict.get("season"),
            date_start=item_dict.get("date_start"),
            date_end=item_dict.get("date_end"),
            notes=item_dict.get("notes"),
            units=_coerce_units(item_dict.get("units")),
            blackout=bool(item_dict.get("blackout", False)),
        )
        structure.open_periods.append(new_period)

    for period_id, period in list(existing.items()):
        if period_id not in seen_ids:
            structure.open_periods.remove(period)
            db.delete(period)


def _build_structure_read(
    structure: Structure,
    *,
    include_details: bool = False,
    include_contacts: bool = False,
) -> StructureRead:
    base = StructureRead.model_validate(structure)

    estimated_cost = estimate_mean_daily_cost(structure)
    update: dict[str, Any] = {}
    if estimated_cost is not None:
        update["estimated_cost"] = estimated_cost
        update["cost_band"] = band_for_cost(estimated_cost)

    if include_details:
        update["availabilities"] = [
            _serialize_availability(availability)
            for availability in structure.availabilities
        ]
        update["cost_options"] = [
            _serialize_cost_option(option) for option in structure.cost_options
        ]

    update["open_periods"] = [
        _serialize_open_period(period) for period in structure.open_periods
    ]

    if include_contacts:
        contacts = sorted(
            structure.contacts,
            key=lambda item: (not item.is_primary, item.name.lower()),
        )
        update["contacts"] = [
            ContactRead.model_validate(contact) for contact in contacts
        ]
    else:
        update["contacts"] = None

    return base.model_copy(update=update)


def _get_structure_or_404(
    db: Session,
    structure_id: int,
    *,
    with_details: bool = False,
    with_contacts: bool = False,
) -> Structure:
    options = [selectinload(Structure.open_periods)]
    if with_details:
        options.extend(
            [
                selectinload(Structure.availabilities),
                selectinload(Structure.cost_options).selectinload(
                    StructureCostOption.modifiers
                ),
            ]
        )
    if with_contacts:
        options.append(
            selectinload(Structure.contacts).selectinload(StructureContact.contact)
        )

    structure = (
        db.execute(
            select(Structure).options(*options).where(Structure.id == structure_id)
        )
        .unique()
        .scalar_one_or_none()
    )
    if structure is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Structure not found",
        )
    return structure


def _serialize_contact(link: StructureContact) -> ContactRead:
    return ContactRead.model_validate(link)


def _get_contact_or_404(
    db: Session, structure_id: int, contact_id: int
) -> StructureContact:
    link = (
        db.execute(
            select(StructureContact)
            .options(selectinload(StructureContact.contact))
            .where(
                StructureContact.id == contact_id,
                StructureContact.structure_id == structure_id,
            )
        )
        .scalars()
        .first()
    )
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )
    return link


@router.get("/", response_model=list[StructureRead])
def list_structures(db: DbSession) -> Sequence[Structure]:
    result = db.execute(
        select(Structure)
        .options(selectinload(Structure.open_periods))
        .order_by(Structure.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/by-slug/{slug}", response_model=StructureRead)
def get_structure_by_slug(
    slug: str,
    db: DbSession,
    include: Annotated[str | None, Query(default=None)],
    *,
    request: Request,
    response: Response,
) -> StructureRead | Response:
    include_parts = {
        part.strip().lower() for part in (include.split(",") if include else [])
    }
    include_details = "details" in include_parts
    include_contacts = include_details or "contacts" in include_parts

    query = select(Structure).options(selectinload(Structure.open_periods))
    if include_details:
        query = query.options(
            selectinload(Structure.availabilities),
            selectinload(Structure.cost_options),
        )
    if include_contacts:
        query = query.options(selectinload(Structure.contacts))

    structure = (
        db.execute(query.where(Structure.slug == slug)).unique().scalar_one_or_none()
    )
    if structure is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Structure not found",
        )
    result = _build_structure_read(
        structure,
        include_details=include_details,
        include_contacts=include_contacts,
    )
    warnings = _collect_structure_warnings(db, structure)
    if warnings:
        result = result.model_copy(update={"warnings": warnings})
    cached = apply_http_cache(request, response, result)
    return cached


@router.get("/search", response_model=StructureSearchResponse)
def search_structures(
    db: DbSession,
    q: Annotated[str | None, Query(default=None, min_length=1)],
    province: Annotated[str | None, Query(default=None, min_length=2, max_length=2)],
    structure_type: Annotated[StructureType | None, Query(default=None, alias="type")],
    season: Annotated[StructureSeason | None, Query(default=None)],
    unit: Annotated[StructureUnit | None, Query(default=None)],
    cost_band: Annotated[CostBand | None, Query(default=None)],
    max_km: Annotated[float | None, Query(default=None, gt=0)],
    access: Annotated[str | None, Query(default=None)],
    fire_policy: Annotated[FirePolicy | None, Query(default=None, alias="fire")],
    min_land_area: Annotated[float | None, Query(default=None, ge=0)],
    hot_water: Annotated[bool | None, Query(default=None)],
    cell_coverage: Annotated[CellCoverageQuality | None, Query(default=None)],
    aed_on_site: Annotated[bool | None, Query(default=None)],
    river_swimming: Annotated[RiverSwimmingOption | None, Query(default=None)],
    wastewater_type: Annotated[WastewaterType | None, Query(default=None)],
    min_power_capacity_kw: Annotated[float | None, Query(default=None, ge=0)],
    min_parking_car_slots: Annotated[int | None, Query(default=None, ge=0)],
    flood_risk: Annotated[FloodRiskLevel | None, Query(default=None)],
    open_in_season: Annotated[StructureOpenPeriodSeason | None, Query(default=None)],
    open_on_date: Annotated[date | None, Query(default=None)],
    page: Annotated[int, Query(default=1, ge=1)],
    page_size: Annotated[int, Query(default=20, ge=1, le=100)],
    sort: Annotated[str, Query(default=DEFAULT_SORT_FIELD)],
    order: Annotated[str, Query(default=DEFAULT_SORT_ORDER)],
    *,
    request: Request,
    response: Response,
) -> StructureSearchResponse | Response:
    sort = sort.lower()
    order = order.lower()

    if sort not in VALID_SORT_FIELDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid sort field")
    if order not in VALID_SORT_ORDERS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid sort order")

    query = select(Structure).options(
        selectinload(Structure.availabilities),
        selectinload(Structure.cost_options),
        selectinload(Structure.open_periods),
    )
    filters = []

    if q:
        like_pattern = f"%{q.lower()}%"
        filters.append(
            or_(
                func.lower(Structure.name).like(like_pattern),
                func.lower(func.coalesce(Structure.address, "")).like(like_pattern),
            )
        )

    if province:
        filters.append(func.upper(Structure.province) == province.upper())

    if structure_type is not None:
        filters.append(Structure.type == structure_type)

    access_conditions: list[Any] = []
    if access:
        requested = {item.strip().lower() for item in access.split("|") if item.strip()}
        valid_map = {
            "car": Structure.access_by_car,
            "coach": Structure.access_by_coach,
            "pt": Structure.access_by_public_transport,
        }
        invalid = requested - set(valid_map.keys())
        if invalid:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Invalid access filter",
            )
        for key in requested:
            access_conditions.append(valid_map[key].is_(True))

    if fire_policy is not None:
        filters.append(Structure.fire_policy == fire_policy)

    if min_land_area is not None:
        filters.append(Structure.land_area_m2 >= min_land_area)

    if hot_water is not None:
        filters.append(Structure.hot_water.is_(hot_water))

    if cell_coverage is not None:
        filters.append(Structure.cell_coverage == cell_coverage)

    if aed_on_site is not None:
        filters.append(Structure.aed_on_site.is_(aed_on_site))

    if river_swimming is not None:
        filters.append(Structure.river_swimming == river_swimming)

    if wastewater_type is not None:
        filters.append(Structure.wastewater_type == wastewater_type)

    if min_power_capacity_kw is not None:
        filters.append(Structure.power_capacity_kw >= min_power_capacity_kw)

    if min_parking_car_slots is not None:
        filters.append(Structure.parking_car_slots >= min_parking_car_slots)

    if flood_risk is not None:
        filters.append(Structure.flood_risk == flood_risk)

    if open_in_season is not None:
        filters.append(
            select(StructureOpenPeriod.id)
            .where(
                StructureOpenPeriod.structure_id == Structure.id,
                StructureOpenPeriod.kind == StructureOpenPeriodKind.SEASON,
                StructureOpenPeriod.season == open_in_season,
            )
            .exists()
        )

    if open_on_date is not None:
        filters.append(
            select(StructureOpenPeriod.id)
            .where(
                StructureOpenPeriod.structure_id == Structure.id,
                StructureOpenPeriod.kind == StructureOpenPeriodKind.RANGE,
                StructureOpenPeriod.date_start <= open_on_date,
                StructureOpenPeriod.date_end >= open_on_date,
            )
            .exists()
        )

    if filters or access_conditions:
        query = query.where(*filters)
        if access_conditions:
            query = query.where(*access_conditions)

    results = db.execute(query).unique().scalars().all()

    settings = get_settings()
    base_lat = settings.default_base_lat
    base_lon = settings.default_base_lon

    items_with_distance: list[
        tuple[
            Structure,
            float | None,
            CostBand | None,
            float | None,
            list[StructureSeason],
            list[StructureUnit],
        ]
    ] = []
    for structure in results:
        distance = None
        if structure.has_coords:
            distance = haversine_km(
                float(structure.latitude),
                float(structure.longitude),
                base_lat,
                base_lon,
            )
        matches, computed_band, estimated_cost = structure_matches_filters(
            structure,
            season=season,
            unit=unit,
            cost_band=cost_band,
        )
        if not matches:
            continue

        availability_reads = [
            _serialize_availability(availability)
            for availability in structure.availabilities
        ]
        seasons = sorted(
            {availability.season for availability in availability_reads},
            key=lambda item: item.value,
        )
        units = sorted(
            {
                unit_value
                for availability in availability_reads
                for unit_value in availability.units
            },
            key=lambda item: item.value,
        )

        items_with_distance.append(
            (structure, distance, computed_band, estimated_cost, seasons, units)
        )

    if max_km is not None:
        items_with_distance = [
            item
            for item in items_with_distance
            if item[1] is not None and item[1] <= max_km
        ]

    reverse = order == "desc"

    if sort == "name":
        items_with_distance.sort(key=lambda item: item[0].name.lower(), reverse=reverse)
    elif sort == "distance":
        order_multiplier = -1.0 if reverse else 1.0

        def distance_key(
            item: tuple[
                Structure,
                float | None,
                CostBand | None,
                float | None,
                list[StructureSeason],
                list[StructureUnit],
            ],
        ) -> float:
            distance = item[1]
            if distance is None:
                return float("inf")
            return order_multiplier * distance

        items_with_distance.sort(key=distance_key)
    else:  # created_at
        items_with_distance.sort(key=lambda item: item[0].created_at, reverse=reverse)

    total = len(items_with_distance)
    start = (page - 1) * page_size
    end = start + page_size
    paginated = items_with_distance[start:end]

    items = [
        StructureSearchItem(
            id=structure.id,
            slug=structure.slug,
            name=structure.name,
            province=structure.province,
            postal_code=structure.postal_code,
            type=structure.type,
            address=structure.address,
            latitude=float(structure.latitude)
            if structure.latitude is not None
            else None,
            longitude=float(structure.longitude)
            if structure.longitude is not None
            else None,
            altitude=float(structure.altitude)
            if structure.altitude is not None
            else None,
            distance_km=distance,
            estimated_cost=estimated_cost,
            cost_band=band,
            seasons=seasons,
            units=units,
            fire_policy=structure.fire_policy,
            access_by_car=structure.access_by_car,
            access_by_coach=structure.access_by_coach,
            access_by_public_transport=structure.access_by_public_transport,
            has_kitchen=structure.has_kitchen,
            hot_water=structure.hot_water,
            cell_coverage=structure.cell_coverage,
            aed_on_site=structure.aed_on_site,
            river_swimming=structure.river_swimming,
            wastewater_type=structure.wastewater_type,
            flood_risk=structure.flood_risk,
            power_capacity_kw=float(structure.power_capacity_kw)
            if structure.power_capacity_kw is not None
            else None,
            parking_car_slots=structure.parking_car_slots,
            usage_recommendation=structure.usage_recommendation,
        )
        for structure, distance, band, estimated_cost, seasons, units in paginated
    ]

    result = StructureSearchResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
        sort=sort,
        order=order,
        base_coords={"lat": base_lat, "lon": base_lon},
    )
    cached = apply_http_cache(request, response, result)
    return cached


@router.get("/{structure_id}", response_model=StructureRead)
def get_structure(structure_id: int, db: DbSession) -> Structure:
    structure = db.get(Structure, structure_id)
    if structure is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Structure not found",
        )
    return structure


@router.post("/", response_model=StructureRead, status_code=status.HTTP_201_CREATED)
def create_structure(
    structure_in: StructureCreate,
    db: DbSession,
    request: Request,
    current_user: StructureEditor,
) -> StructureRead:
    website_warnings = _check_website_urls(structure_in.website_urls)
    base_slug = structure_in.slug or _slugify(structure_in.name)
    unique_slug = _generate_unique_slug(db, base_slug)

    payload = _structure_payload(structure_in, include_slug=False)
    structure = Structure(**payload, slug=unique_slug)
    structure.open_periods = [
        StructureOpenPeriod(
            kind=period.kind,
            season=period.season,
            date_start=period.date_start,
            date_end=period.date_end,
            notes=period.notes,
            units=_coerce_units(period.units),
            blackout=period.blackout,
        )
        for period in structure_in.open_periods
    ]
    try:
        db.add(structure)
        db.flush()
    except (DataError, IntegrityError) as exc:
        db.rollback()
        raise HTTPException(
            status_code=422,
            detail="Valore 'type' non valido per structure_type",
        ) from exc

    record_audit(
        db,
        actor=current_user,
        action="structure.create",
        entity_type="structure",
        entity_id=structure.id,
        diff={"after": StructureRead.model_validate(structure).model_dump()},
        request=request,
    )

    db.commit()
    db.refresh(structure)
    response = StructureRead.model_validate(structure)
    warnings = website_warnings + _collect_structure_warnings(db, structure)
    if warnings:
        unique_warnings = list(dict.fromkeys(warnings))
        response = response.model_copy(update={"warnings": unique_warnings})
    return response


@router.put("/{structure_id}", response_model=StructureRead)
def update_structure(
    structure_id: int,
    structure_in: StructureUpdate,
    db: DbSession,
    request: Request,
    current_user: StructureEditor,
) -> Structure:
    structure = _get_structure_or_404(
        db,
        structure_id,
        with_details=True,
        with_contacts=True,
    )

    if structure.slug != structure_in.slug:
        conflict = db.execute(
            select(Structure.id)
            .where(Structure.slug == structure_in.slug, Structure.id != structure_id)
            .limit(1)
        ).scalar_one_or_none()
        if conflict is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Slug already exists",
            )

    before_snapshot = StructureRead.model_validate(structure).model_dump()

    payload = _structure_payload(structure_in, include_slug=True)
    for key, value in payload.items():
        setattr(structure, key, value)

    _sync_open_periods(structure, structure_in.open_periods, db)

    db.flush()
    db.refresh(structure)

    after_snapshot = StructureRead.model_validate(structure).model_dump()

    record_audit(
        db,
        actor=current_user,
        action="structure.update",
        entity_type="structure",
        entity_id=structure.id,
        diff={
            "before": before_snapshot,
            "after": after_snapshot,
            "payload": structure_in.model_dump(),
        },
        request=request,
    )

    db.commit()
    db.refresh(structure)

    response = _build_structure_read(
        structure,
        include_details=True,
        include_contacts=True,
    )
    warnings = _collect_structure_warnings(db, structure)
    website_warnings = _check_website_urls(structure.website_urls or [])
    all_warnings = list(dict.fromkeys([*warnings, *website_warnings]))
    if all_warnings:
        response = response.model_copy(update={"warnings": all_warnings})
    return response


@router.get("/{structure_id}/contacts", response_model=list[ContactRead])
def list_structure_contacts(
    structure_id: int,
    db: DbSession,
    _: CurrentUser,
) -> list[ContactRead]:
    _get_structure_or_404(db, structure_id)
    contacts = (
        db.execute(
            select(StructureContact)
            .options(selectinload(StructureContact.contact))
            .join(Contact, StructureContact.contact_id == Contact.id)
            .where(StructureContact.structure_id == structure_id)
            .order_by(
                StructureContact.is_primary.desc(),
                func.lower(Contact.first_name),
                func.lower(Contact.last_name),
            )
        )
        .scalars()
        .all()
    )
    return [_serialize_contact(contact) for contact in contacts]


@router.get("/contacts/search", response_model=list[ContactRead])
def search_contacts(
    db: DbSession,
    _: CurrentUser,
    first_name: Annotated[str | None, Query(default=None)],
    last_name: Annotated[str | None, Query(default=None)],
    email: Annotated[str | None, Query(default=None)],
    phone: Annotated[str | None, Query(default=None)],
    limit: Annotated[int, Query(default=10, ge=1, le=50)],
) -> list[ContactRead]:
    normalized_clauses: list[Any] = []

    if first_name and last_name:
        normalized_clauses.append(
            and_(
                func.lower(Contact.first_name) == first_name.strip().lower(),
                func.lower(Contact.last_name) == last_name.strip().lower(),
            )
        )
    if email:
        normalized_clauses.append(func.lower(Contact.email) == email.strip().lower())
    if phone:
        normalized_phone = phone.strip().replace(" ", "")
        normalized_clauses.append(
            func.replace(func.replace(Contact.phone, " ", ""), "-", "")
            == normalized_phone.replace("-", "")
        )

    if not normalized_clauses:
        return []

    query = (
        select(StructureContact)
        .options(selectinload(StructureContact.contact))
        .join(Contact, StructureContact.contact_id == Contact.id)
        .where(or_(*normalized_clauses))
        .limit(limit)
    )

    contacts = db.execute(query).scalars().all()
    return [_serialize_contact(item) for item in contacts]


@router.post(
    "/{structure_id}/contacts",
    response_model=ContactRead,
    status_code=status.HTTP_201_CREATED,
)
def create_structure_contact(
    structure_id: int,
    contact_in: ContactCreate,
    db: DbSession,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
) -> ContactRead:
    structure = _get_structure_or_404(db, structure_id)
    payload = contact_in.model_dump()
    contact_id = payload.pop("contact_id", None)

    contact_data = {
        "first_name": payload.pop("first_name", None),
        "last_name": payload.pop("last_name", None),
        "email": payload.pop("email", None),
        "phone": payload.pop("phone", None),
        "notes": payload.pop("notes", None),
    }

    if contact_id is not None:
        contact = db.get(Contact, contact_id)
        if contact is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found"
            )
        already_linked = (
            db.execute(
                select(StructureContact).where(
                    StructureContact.structure_id == structure.id,
                    StructureContact.contact_id == contact.id,
                )
            )
            .scalars()
            .first()
        )
        if already_linked is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Contact already linked to this structure",
            )

        # Update contact details if provided
        for field, value in contact_data.items():
            if value is not None:
                setattr(contact, field, value)
        db.add(contact)
    else:
        contact = Contact(**contact_data)
        db.add(contact)
        db.flush()

    if payload.get("is_primary"):
        db.execute(
            update(StructureContact)
            .where(
                StructureContact.structure_id == structure.id,
                StructureContact.is_primary.is_(True),
            )
            .values(is_primary=False)
        )

    link = StructureContact(
        structure_id=structure.id,
        contact_id=contact.id,
        role=payload.get("role"),
        preferred_channel=payload.get(
            "preferred_channel", ContactPreferredChannel.EMAIL
        ),
        is_primary=payload.get("is_primary", False),
        gdpr_consent_at=payload.get("gdpr_consent_at"),
    )

    db.add(link)
    db.flush()
    db.refresh(link)
    db.refresh(contact)

    record_audit(
        db,
        actor=current_user,
        action="structure.contact.create",
        entity_type="structure_contact",
        entity_id=link.id,
        diff={
            "structure_id": structure.id,
            "after": _serialize_contact(link).model_dump(),
        },
        request=request,
    )

    db.commit()
    db.refresh(link)
    return _serialize_contact(link)


@router.patch(
    "/{structure_id}/contacts/{contact_id}",
    response_model=ContactRead,
)
def update_structure_contact(
    structure_id: int,
    contact_id: int,
    contact_in: ContactUpdate,
    db: DbSession,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
) -> ContactRead:
    structure = _get_structure_or_404(db, structure_id)
    link = _get_contact_or_404(db, structure.id, contact_id)

    before_snapshot = _serialize_contact(link).model_dump()
    data = contact_in.model_dump(exclude_unset=True)

    contact_updates = {
        key: data[key]
        for key in ("first_name", "last_name", "email", "phone", "notes")
        if key in data
    }
    relation_updates = {
        key: data[key]
        for key in ("role", "preferred_channel", "is_primary", "gdpr_consent_at")
        if key in data
    }

    if relation_updates.get("is_primary"):
        db.execute(
            update(StructureContact)
            .where(
                StructureContact.structure_id == structure.id,
                StructureContact.id != link.id,
                StructureContact.is_primary.is_(True),
            )
            .values(is_primary=False)
        )

    for key, value in contact_updates.items():
        setattr(link.contact, key, value)

    for key, value in relation_updates.items():
        setattr(link, key, value)

    db.add(link.contact)
    db.add(link)
    db.flush()
    db.refresh(link)

    record_audit(
        db,
        actor=current_user,
        action="structure.contact.update",
        entity_type="structure_contact",
        entity_id=link.id,
        diff={
            "structure_id": structure.id,
            "before": before_snapshot,
            "after": _serialize_contact(link).model_dump(),
        },
        request=request,
    )

    db.commit()
    db.refresh(link)
    return _serialize_contact(link)


@router.delete(
    "/{structure_id}/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_structure_contact(
    structure_id: int,
    contact_id: int,
    db: DbSession,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
) -> Response:
    structure = _get_structure_or_404(db, structure_id)
    link = _get_contact_or_404(db, structure.id, contact_id)
    before_snapshot = _serialize_contact(link).model_dump()

    contact = link.contact

    db.delete(link)
    db.flush()

    remaining = (
        db.execute(
            select(StructureContact).where(StructureContact.contact_id == contact.id)
        )
        .scalars()
        .first()
    )
    if remaining is None:
        db.delete(contact)
        db.flush()

    record_audit(
        db,
        actor=current_user,
        action="structure.contact.delete",
        entity_type="structure_contact",
        entity_id=contact_id,
        diff={
            "structure_id": structure.id,
            "before": before_snapshot,
        },
        request=request,
    )

    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{structure_id}/availabilities",
    response_model=StructureAvailabilityRead,
    status_code=status.HTTP_201_CREATED,
)
def create_structure_availability(
    structure_id: int,
    availability_in: StructureAvailabilityCreate,
    db: DbSession,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
) -> StructureAvailabilityRead:
    structure = _get_structure_or_404(db, structure_id)

    availability = StructureSeasonAvailability(
        structure_id=structure.id,
        season=availability_in.season,
        units=[unit.value for unit in availability_in.units],
        capacity_min=availability_in.capacity_min,
        capacity_max=availability_in.capacity_max,
    )
    db.add(availability)
    db.flush()

    record_audit(
        db,
        actor=current_user,
        action="structure.availability.create",
        entity_type="structure_availability",
        entity_id=availability.id,
        diff={
            "structure_id": structure.id,
            "after": _serialize_availability(availability).model_dump(),
        },
        request=request,
    )

    db.commit()
    db.refresh(availability)
    return _serialize_availability(availability)


@router.put(
    "/{structure_id}/availabilities",
    response_model=list[StructureAvailabilityRead],
)
def upsert_structure_availabilities(
    structure_id: int,
    availabilities_in: list[StructureAvailabilityUpdate],
    db: DbSession,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[StructureAvailabilityRead]:
    structure = _get_structure_or_404(db, structure_id, with_details=True)

    before_snapshot = [
        _serialize_availability(availability).model_dump()
        for availability in structure.availabilities
    ]

    existing = {
        availability.id: availability for availability in structure.availabilities
    }
    seen_ids: set[int] = set()

    for payload in availabilities_in:
        payload_units = [unit.value for unit in payload.units]
        if payload.id is not None and payload.id in existing:
            availability = existing[payload.id]
            availability.season = payload.season
            availability.units = payload_units
            availability.capacity_min = payload.capacity_min
            availability.capacity_max = payload.capacity_max
            seen_ids.add(payload.id)
        else:
            availability = StructureSeasonAvailability(
                structure_id=structure.id,
                season=payload.season,
                units=payload_units,
                capacity_min=payload.capacity_min,
                capacity_max=payload.capacity_max,
            )
            db.add(availability)

    for availability_id, availability in list(existing.items()):
        if availability_id not in seen_ids:
            db.delete(availability)

    db.flush()

    updated_structure = _get_structure_or_404(db, structure_id, with_details=True)
    after_snapshot = [
        _serialize_availability(availability).model_dump()
        for availability in updated_structure.availabilities
    ]

    record_audit(
        db,
        actor=current_user,
        action="structure.availability.upsert",
        entity_type="structure_availability",
        entity_id=structure_id,
        diff={
            "structure_id": structure_id,
            "before": before_snapshot,
            "after": after_snapshot,
            "payload": [item.model_dump() for item in availabilities_in],
        },
        request=request,
    )

    db.commit()

    return [
        _serialize_availability(availability)
        for availability in updated_structure.availabilities
    ]


@router.post(
    "/{structure_id}/cost-options",
    response_model=StructureCostOptionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_structure_cost_option(
    structure_id: int,
    cost_option_in: StructureCostOptionCreate,
    db: DbSession,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
) -> StructureCostOptionRead:
    structure = _get_structure_or_404(db, structure_id)

    cost_option = StructureCostOption(
        structure_id=structure.id,
        model=cost_option_in.model,
        amount=cost_option_in.amount,
        currency=cost_option_in.currency,
        booking_deposit=cost_option_in.booking_deposit,
        damage_deposit=cost_option_in.damage_deposit,
        city_tax_per_night=cost_option_in.city_tax_per_night,
        utilities_flat=cost_option_in.utilities_flat,
        utilities_included=cost_option_in.utilities_included,
        utilities_notes=cost_option_in.utilities_notes,
        min_total=cost_option_in.min_total,
        max_total=cost_option_in.max_total,
        age_rules=cost_option_in.age_rules,
        payment_methods=cost_option_in.payment_methods,
        payment_terms=cost_option_in.payment_terms,
        price_per_resource=cost_option_in.price_per_resource,
    )
    if cost_option_in.modifiers:
        _sync_cost_modifiers(cost_option, cost_option_in.modifiers)
    db.add(cost_option)
    db.flush()

    record_audit(
        db,
        actor=current_user,
        action="structure.cost_option.create",
        entity_type="structure_cost_option",
        entity_id=cost_option.id,
        diff={
            "structure_id": structure.id,
            "after": _serialize_cost_option(cost_option).model_dump(),
        },
        request=request,
    )

    db.commit()
    db.refresh(cost_option)
    return _serialize_cost_option(cost_option)


@router.put(
    "/{structure_id}/cost-options",
    response_model=list[StructureCostOptionRead],
)
def upsert_structure_cost_options(
    structure_id: int,
    cost_options_in: list[StructureCostOptionUpdate],
    db: DbSession,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[StructureCostOptionRead]:
    structure = _get_structure_or_404(db, structure_id, with_details=True)

    before_snapshot = [
        _serialize_cost_option(option).model_dump() for option in structure.cost_options
    ]

    existing = {option.id: option for option in structure.cost_options}
    seen_ids: set[int] = set()

    for payload in cost_options_in:
        if payload.id is not None and payload.id in existing:
            option = existing[payload.id]
            option.model = payload.model
            option.amount = payload.amount
            option.currency = payload.currency
            option.booking_deposit = payload.booking_deposit
            option.damage_deposit = payload.damage_deposit
            option.city_tax_per_night = payload.city_tax_per_night
            option.utilities_flat = payload.utilities_flat
            option.utilities_included = payload.utilities_included
            option.utilities_notes = payload.utilities_notes
            option.min_total = payload.min_total
            option.max_total = payload.max_total
            option.age_rules = payload.age_rules
            option.payment_methods = payload.payment_methods
            option.payment_terms = payload.payment_terms
            option.price_per_resource = payload.price_per_resource
            if payload.modifiers is not None:
                _sync_cost_modifiers(option, payload.modifiers)
            seen_ids.add(payload.id)
        else:
            option = StructureCostOption(
                structure_id=structure.id,
                model=payload.model,
                amount=payload.amount,
                currency=payload.currency,
                booking_deposit=payload.booking_deposit,
                damage_deposit=payload.damage_deposit,
                city_tax_per_night=payload.city_tax_per_night,
                utilities_flat=payload.utilities_flat,
                utilities_included=payload.utilities_included,
                utilities_notes=payload.utilities_notes,
                min_total=payload.min_total,
                max_total=payload.max_total,
                age_rules=payload.age_rules,
                payment_methods=payload.payment_methods,
                payment_terms=payload.payment_terms,
                price_per_resource=payload.price_per_resource,
            )
            if payload.modifiers:
                _sync_cost_modifiers(option, payload.modifiers)
            db.add(option)

    for option_id, option in list(existing.items()):
        if option_id not in seen_ids:
            db.delete(option)

    db.flush()

    updated_structure = _get_structure_or_404(db, structure_id, with_details=True)
    after_snapshot = [
        _serialize_cost_option(option).model_dump()
        for option in updated_structure.cost_options
    ]

    record_audit(
        db,
        actor=current_user,
        action="structure.cost_option.upsert",
        entity_type="structure_cost_option",
        entity_id=structure_id,
        diff={
            "structure_id": structure_id,
            "before": before_snapshot,
            "after": after_snapshot,
            "payload": [item.model_dump() for item in cost_options_in],
        },
        request=request,
    )

    db.commit()

    return [_serialize_cost_option(option) for option in updated_structure.cost_options]


@router.get("/{structure_id}/photos", response_model=list[StructurePhotoRead])
def list_structure_photos(structure_id: int, db: DbSession) -> list[StructurePhotoRead]:
    _get_structure_or_404(db, structure_id)

    rows = db.execute(
        select(StructurePhoto, Attachment)
        .join(Attachment, StructurePhoto.attachment_id == Attachment.id)
        .where(StructurePhoto.structure_id == structure_id)
        .order_by(StructurePhoto.position, StructurePhoto.id)
    ).all()
    if not rows:
        return []

    bucket, client = _ensure_storage_ready()
    return [
        _serialize_photo(photo, attachment, bucket=bucket, client=client)
        for photo, attachment in rows
    ]


@router.post(
    "/{structure_id}/photos",
    response_model=StructurePhotoRead,
    status_code=status.HTTP_201_CREATED,
)
def create_structure_photo(
    structure_id: int,
    payload: StructurePhotoCreate,
    db: DbSession,
    _current_user: StructureEditor,
) -> StructurePhotoRead:
    _get_structure_or_404(db, structure_id)

    attachment = db.get(Attachment, payload.attachment_id)
    if attachment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    if attachment.owner_type is not AttachmentOwnerType.STRUCTURE:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Attachment must belong to a structure",
        )
    if attachment.owner_id != structure_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Attachment does not belong to this structure",
        )
    if not attachment.mime.lower().startswith("image/"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Attachment is not an image",
        )

    existing = (
        db.execute(
            select(StructurePhoto.id).where(
                StructurePhoto.attachment_id == attachment.id
            )
        )
        .scalars()
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Photo already registered",
        )

    max_position = (
        db.execute(
            select(func.max(StructurePhoto.position)).where(
                StructurePhoto.structure_id == structure_id
            )
        )
        .scalars()
        .first()
    )
    next_position = (max_position or -1) + 1

    photo = StructurePhoto(
        structure_id=structure_id,
        attachment_id=attachment.id,
        position=next_position,
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)

    bucket, client = _ensure_storage_ready()
    return _serialize_photo(photo, attachment, bucket=bucket, client=client)


@router.delete(
    "/{structure_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_structure_photo(
    structure_id: int,
    photo_id: int,
    db: DbSession,
    _current_user: StructureEditor,
) -> None:
    row = db.execute(
        select(StructurePhoto, Attachment)
        .join(Attachment, StructurePhoto.attachment_id == Attachment.id)
        .where(
            StructurePhoto.id == photo_id,
            StructurePhoto.structure_id == structure_id,
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Photo not found")

    photo, attachment = row
    bucket, client = _ensure_storage_ready()
    delete_object(client, bucket, attachment.storage_key)

    db.delete(photo)
    db.delete(attachment)
    db.execute(
        update(StructurePhoto)
        .where(
            StructurePhoto.structure_id == structure_id,
            StructurePhoto.position > photo.position,
        )
        .values(position=StructurePhoto.position - 1)
    )
    db.commit()
