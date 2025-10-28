from __future__ import annotations

import json
import time
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.deps import get_current_user, require_admin
from app.models import Event, EventMember, Structure, StructureType, User
from app.models.availability import StructureSeason, StructureUnit
from app.models.user import EventMemberRole
from app.services.audit import record_audit
from app.services.costs import CostBand
from app.services.export import (
    rows_to_csv_stream,
    rows_to_json_stream,
    rows_to_xlsx_stream,
)
from app.services.filters import structure_matches_filters


router = APIRouter()


DbSession = Annotated[Session, Depends(get_db)]

EXPORT_FORMATS = {"csv", "xlsx", "json"}
MAX_EXPORT_ROWS = 10_000
EXPORT_TIMEOUT_SECONDS = 10

CSV_HEADERS_STRUCTURES = (
    "id",
    "slug",
    "name",
    "province",
    "type",
    "address",
    "latitude",
    "longitude",
    "estimated_cost",
    "cost_band",
    "created_at",
)

CSV_HEADERS_EVENTS = (
    "id",
    "slug",
    "title",
    "branch",
    "status",
    "start_date",
    "end_date",
    "participants_total",
    "created_at",
    "updated_at",
)

MEDIA_TYPES = {
    "csv": "text/csv",
    "json": "application/json",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _parse_filters(filters: str | None) -> dict[str, Any]:
    if not filters:
        return {}
    try:
        payload = json.loads(filters)
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid filters payload") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid filters payload")
    return payload


def _normalise_structure_filters(payload: dict[str, Any]) -> tuple[
    str | None,
    str | None,
    StructureType | None,
    StructureSeason | None,
    StructureUnit | None,
    CostBand | None,
]:
    q = payload.get("q")
    province = payload.get("province")
    type_value = payload.get("type")
    season_value = payload.get("season")
    unit_value = payload.get("unit")
    cost_band_value = payload.get("cost_band")

    structure_type = None
    if type_value is not None:
        try:
            structure_type = StructureType(type_value)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid structure type") from exc

    season = None
    if season_value is not None:
        try:
            season = StructureSeason(season_value)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid season filter") from exc

    unit = None
    if unit_value is not None:
        try:
            unit = StructureUnit(unit_value)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid unit filter") from exc

    cost_band = None
    if cost_band_value is not None:
        try:
            cost_band = CostBand(cost_band_value)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid cost band filter") from exc

    return q, province, structure_type, season, unit, cost_band


def _build_structure_row(
    structure: Structure,
    *,
    estimated_cost: float | None,
    cost_band: CostBand | None,
) -> dict[str, Any]:
    return {
        "id": structure.id,
        "slug": structure.slug,
        "name": structure.name,
        "province": structure.province,
        "type": structure.type.value,
        "address": structure.address,
        "latitude": float(structure.latitude) if structure.latitude is not None else None,
        "longitude": float(structure.longitude) if structure.longitude is not None else None,
        "estimated_cost": estimated_cost,
        "cost_band": cost_band.value if cost_band else None,
        "created_at": structure.created_at.isoformat(),
    }


def _build_event_row(event: Event) -> dict[str, Any]:
    participants = event.participants or {}
    total_participants = 0
    if isinstance(participants, dict):
        total_participants = int(sum(int(value) for value in participants.values()))
    return {
        "id": event.id,
        "slug": event.slug,
        "title": event.title,
        "branch": event.branch.value,
        "status": event.status.value,
        "start_date": event.start_date.isoformat(),
        "end_date": event.end_date.isoformat(),
        "participants_total": total_participants,
        "created_at": event.created_at.isoformat(),
        "updated_at": event.updated_at.isoformat(),
    }


def _render_rows(
    rows: list[dict[str, Any]],
    *,
    export_format: str,
    headers: tuple[str, ...],
) -> StreamingResponse:
    media_type = MEDIA_TYPES[export_format]
    if export_format == "csv":
        return StreamingResponse(rows_to_csv_stream(rows, headers), media_type=media_type)
    if export_format == "json":
        return StreamingResponse(rows_to_json_stream(rows), media_type=media_type)
    return StreamingResponse(rows_to_xlsx_stream(rows, headers), media_type=media_type)


@router.get("/structures")
def export_structures(
    format: str = Query(alias="format"),
    filters: str | None = Query(default=None),
    *,
    db: DbSession,
    request: Request,
    admin_user: Annotated[User, Depends(require_admin)],
) -> StreamingResponse:
    export_format = format.lower()
    if export_format not in EXPORT_FORMATS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unsupported export format")

    payload = _parse_filters(filters)
    q, province, structure_type, season, unit, cost_band = _normalise_structure_filters(payload)

    start_time = time.monotonic()
    query = (
        select(Structure)
        .options(
            selectinload(Structure.availabilities),
            selectinload(Structure.cost_options),
        )
    )

    conditions = []
    if q:
        like_pattern = f"%{q.lower()}%"
        conditions.append(
            or_(
                func.lower(Structure.name).like(like_pattern),
                func.lower(func.coalesce(Structure.address, "")).like(like_pattern),
            )
        )
    if province:
        conditions.append(func.upper(Structure.province) == str(province).upper())
    if structure_type is not None:
        conditions.append(Structure.type == structure_type)

    if conditions:
        query = query.where(and_(*conditions))

    results = db.execute(query).unique().scalars().all()

    rows: list[dict[str, Any]] = []
    for structure in results:
        matches, computed_band, estimated_cost = structure_matches_filters(
            structure,
            season=season,
            unit=unit,
            cost_band=cost_band,
        )
        if not matches:
            continue

        rows.append(
            _build_structure_row(
                structure,
                estimated_cost=estimated_cost,
                cost_band=computed_band,
            )
        )

        if len(rows) > MAX_EXPORT_ROWS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Export limit exceeded")
        if time.monotonic() - start_time > EXPORT_TIMEOUT_SECONDS:
            raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, detail="Export timed out")

    response = _render_rows(rows, export_format=export_format, headers=CSV_HEADERS_STRUCTURES)
    response.headers["Content-Disposition"] = f'attachment; filename="structures.{export_format}"'

    record_audit(
        db,
        actor=admin_user,
        action="export_structures",
        entity_type="structure",
        entity_id="*",
        diff={"format": export_format, "count": len(rows), "filters": payload},
        request=request,
    )
    db.commit()

    return response


@router.get("/events")
def export_events(
    format: str = Query(alias="format"),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    *,
    db: DbSession,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
) -> StreamingResponse:
    export_format = format.lower()
    if export_format not in EXPORT_FORMATS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unsupported export format")

    start_time = time.monotonic()
    base_query = (
        select(Event)
        .join(EventMember, EventMember.event_id == Event.id)
        .where(EventMember.user_id == current_user.id)
        .distinct()
    )

    filters = []
    if from_date is not None:
        filters.append(Event.start_date >= from_date)
    if to_date is not None:
        filters.append(Event.end_date <= to_date)
    if filters:
        base_query = base_query.where(and_(*filters))

    events = db.execute(base_query.order_by(Event.created_at.desc())).scalars().all()

    rows: list[dict[str, Any]] = []
    for event in events:
        rows.append(_build_event_row(event))
        if len(rows) > MAX_EXPORT_ROWS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Export limit exceeded")
        if time.monotonic() - start_time > EXPORT_TIMEOUT_SECONDS:
            raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, detail="Export timed out")

    response = _render_rows(rows, export_format=export_format, headers=CSV_HEADERS_EVENTS)
    response.headers["Content-Disposition"] = f'attachment; filename="events.{export_format}"'

    record_audit(
        db,
        actor=current_user,
        action="export_events",
        entity_type="event",
        entity_id="*",
        diff={"format": export_format, "count": len(rows), "filters": {"from": from_date, "to": to_date}},
        request=request,
    )
    db.commit()

    return response


__all__ = ["router", "MAX_EXPORT_ROWS", "EXPORT_TIMEOUT_SECONDS"]
