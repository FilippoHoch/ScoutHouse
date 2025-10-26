from __future__ import annotations

from collections.abc import Sequence
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.db import get_db
from app.models import (
    Structure,
    StructureCostOption,
    StructureSeason,
    StructureSeasonAvailability,
    StructureType,
    StructureUnit,
)
from app.schemas import (
    StructureCreate,
    StructureAvailabilityCreate,
    StructureAvailabilityRead,
    StructureAvailabilityUpdate,
    StructureCostOptionCreate,
    StructureCostOptionRead,
    StructureCostOptionUpdate,
    StructureRead,
    StructureSearchItem,
    StructureSearchResponse,
)
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


def _build_structure_read(structure: Structure, *, include_details: bool = False) -> StructureRead:
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

    return base.model_copy(update=update)


def _get_structure_or_404(
    db: Session,
    structure_id: int,
    *,
    with_details: bool = False,
) -> Structure:
    if with_details:
        structure = (
            db.execute(
                select(Structure)
                .options(
                    selectinload(Structure.availabilities),
                    selectinload(Structure.cost_options),
                )
                .where(Structure.id == structure_id)
            )
            .unique()
            .scalar_one_or_none()
        )
    else:
        structure = db.get(Structure, structure_id)
    if structure is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Structure not found",
        )
    return structure


@router.get("/", response_model=list[StructureRead])
def list_structures(db: DbSession) -> Sequence[Structure]:
    result = db.execute(select(Structure).order_by(Structure.created_at.desc()))
    return list(result.scalars().all())


@router.get("/by-slug/{slug}", response_model=StructureRead)
def get_structure_by_slug(
    slug: str,
    db: DbSession,
    include: str | None = Query(default=None),
) -> StructureRead:
    include_parts = {part.strip().lower() for part in (include.split(",") if include else [])}
    include_details = "details" in include_parts

    query = select(Structure)
    if include_details:
        query = query.options(
            selectinload(Structure.availabilities),
            selectinload(Structure.cost_options),
        )

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
    return _build_structure_read(structure, include_details=include_details)


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
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    sort: str = Query(default=DEFAULT_SORT_FIELD),
    order: str = Query(default=DEFAULT_SORT_ORDER),
) -> StructureSearchResponse:
    sort = sort.lower()
    order = order.lower()

    if sort not in VALID_SORT_FIELDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid sort field")
    if order not in VALID_SORT_ORDERS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid sort order")

    query = select(Structure).options(
        selectinload(Structure.availabilities),
        selectinload(Structure.cost_options),
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

    if filters:
        query = query.where(*filters)

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
        )
        for structure, distance, band, estimated_cost, seasons, units in paginated
    ]

    return StructureSearchResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
        sort=sort,
        order=order,
        base_coords={"lat": base_lat, "lon": base_lon},
    )


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
def create_structure(structure_in: StructureCreate, db: DbSession) -> Structure:
    existing = db.execute(
        select(Structure).where(Structure.slug == structure_in.slug)
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slug already exists",
        )

    structure = Structure(**structure_in.model_dump())
    db.add(structure)
    db.commit()
    db.refresh(structure)
    return structure


@router.post(
    "/{structure_id}/availabilities",
    response_model=StructureAvailabilityRead,
    status_code=status.HTTP_201_CREATED,
)
def create_structure_availability(
    structure_id: int,
    availability_in: StructureAvailabilityCreate,
    db: DbSession,
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
) -> list[StructureAvailabilityRead]:
    structure = _get_structure_or_404(db, structure_id, with_details=True)

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

    db.commit()

    updated_structure = _get_structure_or_404(db, structure_id, with_details=True)
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
) -> list[StructureCostOptionRead]:
    structure = _get_structure_or_404(db, structure_id, with_details=True)

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

    db.commit()

    updated_structure = _get_structure_or_404(db, structure_id, with_details=True)
    return [
        _serialize_cost_option(option)
        for option in updated_structure.cost_options
    ]
