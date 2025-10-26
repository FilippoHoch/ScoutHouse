from __future__ import annotations

from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.models import Structure, StructureType
from app.schemas import (
    StructureCreate,
    StructureRead,
    StructureSearchItem,
    StructureSearchResponse,
)
from app.services.geo import haversine_km

router = APIRouter()


DbSession = Annotated[Session, Depends(get_db)]

DEFAULT_SORT_FIELD = "created_at"
DEFAULT_SORT_ORDER = "desc"
VALID_SORT_FIELDS = {"name", "created_at", "distance"}
VALID_SORT_ORDERS = {"asc", "desc"}


@router.get("/", response_model=list[StructureRead])
def list_structures(db: DbSession) -> Sequence[Structure]:
    result = db.execute(select(Structure).order_by(Structure.created_at.desc()))
    return list(result.scalars().all())


@router.get("/by-slug/{slug}", response_model=StructureRead)
def get_structure_by_slug(slug: str, db: DbSession) -> Structure:
    structure = db.execute(select(Structure).where(Structure.slug == slug)).scalar_one_or_none()
    if structure is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Structure not found",
        )
    return structure


@router.get("/search", response_model=StructureSearchResponse)
def search_structures(
    db: DbSession,
    q: str | None = Query(default=None, min_length=1),
    province: str | None = Query(default=None, min_length=2, max_length=2),
    structure_type: StructureType | None = Query(default=None, alias="type"),
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

    query = select(Structure)
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

    results = db.execute(query).scalars().all()

    settings = get_settings()
    base_lat = settings.default_base_lat
    base_lon = settings.default_base_lon

    items_with_distance: list[tuple[Structure, float | None]] = []
    for structure in results:
        distance = None
        if structure.has_coords:
            distance = haversine_km(
                float(structure.latitude),
                float(structure.longitude),
                base_lat,
                base_lon,
            )
        items_with_distance.append((structure, distance))

    if max_km is not None:
        items_with_distance = [
            (structure, distance)
            for structure, distance in items_with_distance
            if distance is not None and distance <= max_km
        ]

    reverse = order == "desc"

    if sort == "name":
        items_with_distance.sort(key=lambda item: item[0].name.lower(), reverse=reverse)
    elif sort == "distance":
        def distance_key(item: tuple[Structure, float | None]) -> float:
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
        )
        for structure, distance in paginated
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
