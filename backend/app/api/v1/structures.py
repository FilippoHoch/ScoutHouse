from __future__ import annotations

from collections.abc import Sequence
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.http_cache import apply_http_cache
from app.core.db import get_db
from app.deps import get_current_user, require_admin
from app.models import (
    Contact,
    ContactPreferredChannel,
    StructureContact,
    FirePolicy,
    Structure,
    StructureCostOption,
    StructureOpenPeriod,
    StructureOpenPeriodKind,
    StructureOpenPeriodSeason,
    StructureSeason,
    StructureSeasonAvailability,
    StructureType,
    StructureUnit,
    User,
)
from app.schemas import (
    ContactCreate,
    ContactRead,
    ContactUpdate,
    StructureAvailabilityCreate,
    StructureAvailabilityRead,
    StructureAvailabilityUpdate,
    StructureCostOptionCreate,
    StructureCostOptionRead,
    StructureCostOptionUpdate,
    StructureCreate,
    StructureOpenPeriodCreate,
    StructureOpenPeriodRead,
    StructureOpenPeriodUpdate,
    StructureRead,
    StructureSearchItem,
    StructureSearchResponse,
    StructureUpdate,
)
from app.services.audit import record_audit
from app.services.costs import CostBand, band_for_cost, estimate_mean_daily_cost
from app.services.filters import structure_matches_filters
from app.services.geo import haversine_km

router = APIRouter()


DbSession = Annotated[Session, Depends(get_db)]

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


def _serialize_availability(availability: StructureSeasonAvailability) -> StructureAvailabilityRead:
    return StructureAvailabilityRead(
        id=availability.id,
        season=availability.season,
        units=_serialize_units(availability.units),
        capacity_min=availability.capacity_min,
        capacity_max=availability.capacity_max,
    )


def _serialize_cost_option(option: StructureCostOption) -> StructureCostOptionRead:
    return StructureCostOptionRead(
        id=option.id,
        model=option.model,
        amount=option.amount,
        currency=option.currency,
        deposit=option.deposit,
        city_tax_per_night=option.city_tax_per_night,
        utilities_flat=option.utilities_flat,
        age_rules=option.age_rules,
    )


def _serialize_open_period(period: StructureOpenPeriod) -> StructureOpenPeriodRead:
    return StructureOpenPeriodRead(
        id=period.id,
        kind=period.kind,
        season=period.season,
        date_start=period.date_start,
        date_end=period.date_end,
        notes=period.notes,
    )


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
            seen_ids.add(period_id)
            continue

        new_period = StructureOpenPeriod(
            kind=item_dict["kind"],
            season=item_dict.get("season"),
            date_start=item_dict.get("date_start"),
            date_end=item_dict.get("date_end"),
            notes=item_dict.get("notes"),
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
            _serialize_cost_option(option)
            for option in structure.cost_options
        ]

    update["open_periods"] = [
        _serialize_open_period(period)
        for period in structure.open_periods
    ]

    if include_contacts:
        contacts = sorted(
            structure.contacts,
            key=lambda item: (not item.is_primary, item.name.lower()),
        )
        update["contacts"] = [ContactRead.model_validate(contact) for contact in contacts]
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
                selectinload(Structure.cost_options),
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


def _get_contact_or_404(db: Session, structure_id: int, contact_id: int) -> StructureContact:
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
    include: str | None = Query(default=None),
    *,
    request: Request,
    response: Response,
) -> StructureRead | Response:
    include_parts = {part.strip().lower() for part in (include.split(",") if include else [])}
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
        db.execute(query.where(Structure.slug == slug))
        .unique()
        .scalar_one_or_none()
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
    cached = apply_http_cache(request, response, result)
    return cached


@router.get("/search", response_model=StructureSearchResponse)
def search_structures(
    db: DbSession,
    q: str | None = Query(default=None, min_length=1),
    province: str | None = Query(default=None, min_length=2, max_length=2),
    structure_type: StructureType | None = Query(default=None, alias="type"),
    season: StructureSeason | None = Query(default=None),
    unit: StructureUnit | None = Query(default=None),
    cost_band: CostBand | None = Query(default=None),
    max_km: float | None = Query(default=None, gt=0),
    access: str | None = Query(default=None),
    fire_policy: FirePolicy | None = Query(default=None, alias="fire"),
    min_land_area: float | None = Query(default=None, ge=0),
    hot_water: bool | None = Query(default=None),
    open_in_season: StructureOpenPeriodSeason | None = Query(default=None),
    open_on_date: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    sort: str = Query(default=DEFAULT_SORT_FIELD),
    order: str = Query(default=DEFAULT_SORT_ORDER),
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
        seasons = sorted({availability.season for availability in availability_reads}, key=lambda item: item.value)
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
        def distance_key(item: tuple[Structure, float | None, CostBand | None, float | None, list[StructureSeason], list[StructureUnit]]) -> float:
            distance = item[1]
            if distance is None:
                return float("inf") if not reverse else float("-inf")
            return distance

        items_with_distance.sort(key=distance_key, reverse=reverse)
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
            type=structure.type,
            address=structure.address,
            latitude=float(structure.latitude) if structure.latitude is not None else None,
            longitude=float(structure.longitude) if structure.longitude is not None else None,
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
    current_user: Annotated[User, Depends(require_admin)],
) -> Structure:
    existing = db.execute(
        select(Structure).where(Structure.slug == structure_in.slug)
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slug already exists",
        )

    payload = structure_in.model_dump(mode="json", exclude={"open_periods"})
    structure = Structure(**payload)
    structure.open_periods = [
        StructureOpenPeriod(
            kind=period.kind,
            season=period.season,
            date_start=period.date_start,
            date_end=period.date_end,
            notes=period.notes,
        )
        for period in structure_in.open_periods
    ]
    db.add(structure)
    db.flush()

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
    return structure


@router.put("/{structure_id}", response_model=StructureRead)
def update_structure(
    structure_id: int,
    structure_in: StructureUpdate,
    db: DbSession,
    request: Request,
    current_user: Annotated[User, Depends(require_admin)],
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

    payload = structure_in.model_dump(mode="json", exclude={"open_periods"})
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
    return structure


@router.get("/{structure_id}/contacts", response_model=list[ContactRead])
def list_structure_contacts(
    structure_id: int,
    db: DbSession,
    _: Annotated[User, Depends(get_current_user)],
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
    _: Annotated[User, Depends(get_current_user)],
    first_name: str | None = Query(default=None),
    last_name: str | None = Query(default=None),
    email: str | None = Query(default=None),
    phone: str | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
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
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")
        already_linked = (
            db.execute(
                select(StructureContact)
                .where(
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
        preferred_channel=payload.get("preferred_channel", ContactPreferredChannel.EMAIL),
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


@router.delete("/{structure_id}/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
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

    existing = {availability.id: availability for availability in structure.availabilities}
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
        deposit=cost_option_in.deposit,
        city_tax_per_night=cost_option_in.city_tax_per_night,
        utilities_flat=cost_option_in.utilities_flat,
        age_rules=cost_option_in.age_rules,
    )
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
        _serialize_cost_option(option).model_dump()
        for option in structure.cost_options
    ]

    existing = {option.id: option for option in structure.cost_options}
    seen_ids: set[int] = set()

    for payload in cost_options_in:
        if payload.id is not None and payload.id in existing:
            option = existing[payload.id]
            option.model = payload.model
            option.amount = payload.amount
            option.currency = payload.currency
            option.deposit = payload.deposit
            option.city_tax_per_night = payload.city_tax_per_night
            option.utilities_flat = payload.utilities_flat
            option.age_rules = payload.age_rules
            seen_ids.add(payload.id)
        else:
            option = StructureCostOption(
                structure_id=structure.id,
                model=payload.model,
                amount=payload.amount,
                currency=payload.currency,
                deposit=payload.deposit,
                city_tax_per_night=payload.city_tax_per_night,
                utilities_flat=payload.utilities_flat,
                age_rules=payload.age_rules,
            )
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

    return [
        _serialize_cost_option(option)
        for option in updated_structure.cost_options
    ]
