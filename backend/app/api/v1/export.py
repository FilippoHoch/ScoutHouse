from __future__ import annotations

import csv
import json
import time
from datetime import date
from io import BytesIO, StringIO
from typing import Annotated, Any
from zipfile import ZipFile

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.deps import get_current_user, require_admin
from app.models import (
    Event,
    EventBranch,
    EventMember,
    EventStatus,
    FirePolicy,
    Structure,
    StructureOpenPeriod,
    StructureOpenPeriodKind,
    StructureOpenPeriodSeason,
    StructureType,
    User,
    WaterSource,
)
from app.models.availability import StructureSeason, StructureUnit
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
    "postal_code",
    "type",
    "address",
    "latitude",
    "altitude",
    "longitude",
    "indoor_beds",
    "indoor_bathrooms",
    "indoor_showers",
    "indoor_activity_rooms",
    "has_kitchen",
    "hot_water",
    "land_area_m2",
    "shelter_on_field",
    "water_sources",
    "electricity_available",
    "fire_policy",
    "access_by_car",
    "access_by_coach",
    "access_by_public_transport",
    "coach_turning_area",
    "transport_access_points",
    "weekend_only",
    "has_field_poles",
    "pit_latrine_allowed",
    "contact_emails",
    "website_urls",
    "notes_logistics",
    "notes",
    "estimated_cost",
    "cost_band",
    "created_at",
)

CSV_HEADERS_OPEN_PERIODS = (
    "structure_id",
    "structure_slug",
    "kind",
    "season",
    "units",
    "date_start",
    "date_end",
    "notes",
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


def _parse_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y"}:
        return True
    if text in {"0", "false", "no", "n"}:
        return False
    raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid boolean value")


def _serialize_transport_access_points(
    points: list[dict[str, Any]] | None,
) -> list[dict[str, Any]] | None:
    if not points:
        return None
    return points


def _normalise_structure_filters(
    payload: dict[str, Any],
) -> tuple[
    str | None,
    str | None,
    StructureType | None,
    StructureSeason | None,
    StructureUnit | None,
    CostBand | None,
    str | None,
    FirePolicy | None,
    float | None,
    bool | None,
    StructureOpenPeriodSeason | None,
    date | None,
]:
    q = payload.get("q")
    province = payload.get("province")
    type_value = payload.get("type")
    season_value = payload.get("season")
    unit_value = payload.get("unit")
    cost_band_value = payload.get("cost_band")
    access_value = payload.get("access")
    fire_value = payload.get("fire")
    min_land_area_value = payload.get("min_land_area")
    hot_water_value = payload.get("hot_water")
    open_in_season_value = payload.get("open_in_season")
    open_on_date_value = payload.get("open_on_date")

    structure_type = None
    if type_value is not None:
        try:
            structure_type = StructureType(type_value)
        except ValueError as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail="Invalid structure type"
            ) from exc

    season = None
    if season_value is not None:
        try:
            season = StructureSeason(season_value)
        except ValueError as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail="Invalid season filter"
            ) from exc

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
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail="Invalid cost band filter"
            ) from exc

    fire_policy = None
    if fire_value is not None:
        try:
            fire_policy = FirePolicy(str(fire_value))
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid fire filter") from exc

    min_land_area = None
    if min_land_area_value is not None and min_land_area_value != "":
        try:
            min_land_area = float(min_land_area_value)
        except (ValueError, TypeError) as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail="Invalid min_land_area filter"
            ) from exc
        if min_land_area < 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid min_land_area filter")

    hot_water = _parse_bool(hot_water_value)
    open_in_season = None
    if open_in_season_value is not None and open_in_season_value != "":
        try:
            open_in_season = StructureOpenPeriodSeason(open_in_season_value)
        except ValueError as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail="Invalid open_in_season filter"
            ) from exc

    open_on_date = None
    if open_on_date_value is not None and str(open_on_date_value).strip():
        try:
            open_on_date = date.fromisoformat(str(open_on_date_value).strip())
        except ValueError as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail="Invalid open_on_date filter"
            ) from exc

    return (
        q,
        province,
        structure_type,
        season,
        unit,
        cost_band,
        access_value,
        fire_policy,
        min_land_area,
        hot_water,
        open_in_season,
        open_on_date,
    )


def _build_structure_row(
    structure: Structure,
    *,
    estimated_cost: float | None,
    cost_band: CostBand | None,
) -> dict[str, Any]:
    open_periods_data = [
        {
            "id": period.id,
            "kind": period.kind.value,
            "season": period.season.value if period.season else None,
            "date_start": period.date_start.isoformat() if period.date_start else None,
            "date_end": period.date_end.isoformat() if period.date_end else None,
            "notes": period.notes,
        }
        for period in sorted(
            structure.open_periods,
            key=lambda item: (
                item.kind.value,
                item.season.value if item.season else "",
                item.date_start or date.min,
            ),
        )
    ]
    return {
        "id": structure.id,
        "slug": structure.slug,
        "name": structure.name,
        "province": structure.province,
        "postal_code": structure.postal_code,
        "type": structure.type.value,
        "address": structure.address,
        "latitude": float(structure.latitude) if structure.latitude is not None else None,
        "longitude": float(structure.longitude) if structure.longitude is not None else None,
        "altitude": float(structure.altitude) if structure.altitude is not None else None,
        "indoor_beds": structure.indoor_beds,
        "indoor_bathrooms": structure.indoor_bathrooms,
        "indoor_showers": structure.indoor_showers,
        "indoor_activity_rooms": structure.indoor_activity_rooms,
        "has_kitchen": structure.has_kitchen,
        "hot_water": structure.hot_water,
        "land_area_m2": float(structure.land_area_m2)
        if structure.land_area_m2 is not None
        else None,
        "shelter_on_field": structure.shelter_on_field,
        "water_sources": (
            ",".join(
                source.value if isinstance(source, WaterSource) else str(source)
                for source in (structure.water_sources or [])
            )
            or None
        ),
        "electricity_available": structure.electricity_available,
        "fire_policy": structure.fire_policy.value if structure.fire_policy else None,
        "access_by_car": structure.access_by_car,
        "access_by_coach": structure.access_by_coach,
        "access_by_public_transport": structure.access_by_public_transport,
        "coach_turning_area": structure.coach_turning_area,
        "transport_access_points": _serialize_transport_access_points(
            cast(list[dict[str, Any]] | None, structure.transport_access_points)
        ),
        "weekend_only": structure.weekend_only,
        "has_field_poles": structure.has_field_poles,
        "pit_latrine_allowed": structure.pit_latrine_allowed,
        "contact_emails": list(structure.contact_emails or []),
        "website_urls": list(structure.website_urls or []),
        "notes_logistics": structure.notes_logistics,
        "notes": structure.notes,
        "estimated_cost": estimated_cost,
        "cost_band": cost_band.value if cost_band else None,
        "created_at": structure.created_at.isoformat(),
        "open_periods": open_periods_data,
    }


def _build_open_period_export_row(
    structure: Structure,
    period: StructureOpenPeriod,
) -> dict[str, Any]:
    return {
        "structure_id": structure.id,
        "structure_slug": structure.slug,
        "kind": period.kind.value,
        "season": period.season.value if period.season else None,
        "units": ",".join(period.units) if period.units else None,
        "date_start": period.date_start.isoformat() if period.date_start else None,
        "date_end": period.date_end.isoformat() if period.date_end else None,
        "notes": period.notes,
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


def _format_tabular_value(value: Any) -> Any:
    if isinstance(value, list):
        if value and isinstance(value[0], dict):
            return json.dumps(value, ensure_ascii=False)
        return "; ".join(str(item) for item in value)
    return value


def _rows_to_csv_bytes(rows: list[dict[str, Any]], headers: tuple[str, ...]) -> bytes:
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(headers))
    writer.writeheader()
    for row in rows:
        filtered: dict[str, Any] = {}
        for header in headers:
            value = row.get(header)
            value = _format_tabular_value(value)
            filtered[header] = value
        writer.writerow(filtered)
    return buffer.getvalue().encode("utf-8")


def _render_structures_csv(
    rows: list[dict[str, Any]],
    open_period_rows: list[dict[str, Any]],
) -> StreamingResponse:
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr("structures.csv", _rows_to_csv_bytes(rows, CSV_HEADERS_STRUCTURES))
        archive.writestr(
            "structure_open_periods.csv",
            _rows_to_csv_bytes(open_period_rows, CSV_HEADERS_OPEN_PERIODS),
        )
    buffer.seek(0)
    return StreamingResponse(iter([buffer.getvalue()]), media_type="application/zip")


def _render_structures_xlsx(
    rows: list[dict[str, Any]],
    open_period_rows: list[dict[str, Any]],
) -> StreamingResponse:
    workbook = Workbook()
    main_sheet = workbook.active
    main_sheet.title = "structures"
    main_sheet.append(list(CSV_HEADERS_STRUCTURES))
    for row in rows:
        main_sheet.append(
            [_format_tabular_value(row.get(header)) for header in CSV_HEADERS_STRUCTURES]
        )

    period_sheet = workbook.create_sheet("structure_open_periods")
    period_sheet.append(list(CSV_HEADERS_OPEN_PERIODS))
    for row in open_period_rows:
        period_sheet.append(
            [_format_tabular_value(row.get(header)) for header in CSV_HEADERS_OPEN_PERIODS]
        )

    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return StreamingResponse(iter([buffer.getvalue()]), media_type=MEDIA_TYPES["xlsx"])


def _render_structures_export(
    rows: list[dict[str, Any]],
    open_period_rows: list[dict[str, Any]],
    *,
    export_format: str,
) -> StreamingResponse:
    if export_format == "json":
        response = _render_rows(rows, export_format=export_format, headers=CSV_HEADERS_STRUCTURES)
        response.headers["Content-Disposition"] = 'attachment; filename="structures.json"'
        return response
    if export_format == "csv":
        response = _render_structures_csv(rows, open_period_rows)
        response.headers["Content-Disposition"] = 'attachment; filename="structures.zip"'
        return response
    if export_format == "xlsx":
        response = _render_structures_xlsx(rows, open_period_rows)
        response.headers["Content-Disposition"] = 'attachment; filename="structures.xlsx"'
        return response
    raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unsupported export format")


@router.get("/structures")
def export_structures(
    format: Annotated[str, Query(alias="format")],
    filters: Annotated[str | None, Query()] = None,
    *,
    db: DbSession,
    request: Request,
    admin_user: Annotated[User, Depends(require_admin)],
) -> StreamingResponse:
    export_format = format.lower()
    if export_format not in EXPORT_FORMATS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unsupported export format")

    payload = _parse_filters(filters)
    (
        q,
        province,
        structure_type,
        season,
        unit,
        cost_band,
        access_value,
        fire_policy,
        min_land_area,
        hot_water,
        open_in_season,
        open_on_date,
    ) = _normalise_structure_filters(payload)

    start_time = time.monotonic()
    query = select(Structure).options(
        selectinload(Structure.availabilities),
        selectinload(Structure.cost_options),
        selectinload(Structure.open_periods),
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

    access_conditions: list[Any] = []
    if access_value:
        requested_access = {
            item.strip().lower() for item in str(access_value).split("|") if item.strip()
        }
        valid_access = {
            "car": Structure.access_by_car,
            "coach": Structure.access_by_coach,
            "pt": Structure.access_by_public_transport,
        }
        invalid = requested_access - set(valid_access.keys())
        if invalid:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid access filter")
        for key in requested_access:
            access_conditions.append(valid_access[key].is_(True))

    if fire_policy is not None:
        conditions.append(Structure.fire_policy == fire_policy)

    if min_land_area is not None:
        conditions.append(Structure.land_area_m2 >= min_land_area)

    if hot_water is not None:
        conditions.append(Structure.hot_water.is_(hot_water))

    if open_in_season is not None:
        conditions.append(
            select(StructureOpenPeriod.id)
            .where(
                StructureOpenPeriod.structure_id == Structure.id,
                StructureOpenPeriod.kind == StructureOpenPeriodKind.SEASON,
                StructureOpenPeriod.season == open_in_season,
            )
            .exists()
        )

    if open_on_date is not None:
        conditions.append(
            select(StructureOpenPeriod.id)
            .where(
                StructureOpenPeriod.structure_id == Structure.id,
                StructureOpenPeriod.kind == StructureOpenPeriodKind.RANGE,
                StructureOpenPeriod.date_start <= open_on_date,
                StructureOpenPeriod.date_end >= open_on_date,
            )
            .exists()
        )

    if conditions:
        query = query.where(and_(*conditions))
    if access_conditions:
        query = query.where(and_(*access_conditions))

    results = db.execute(query).unique().scalars().all()

    rows: list[dict[str, Any]] = []
    open_period_rows: list[dict[str, Any]] = []
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
        for period in structure.open_periods:
            open_period_rows.append(_build_open_period_export_row(structure, period))

        if len(rows) > MAX_EXPORT_ROWS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Export limit exceeded")
        if time.monotonic() - start_time > EXPORT_TIMEOUT_SECONDS:
            raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, detail="Export timed out")

    response = _render_structures_export(
        rows,
        open_period_rows,
        export_format=export_format,
    )

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
    format: Annotated[str, Query(alias="format")],
    from_date: Annotated[date | None, Query(alias="from")] = None,
    to_date: Annotated[date | None, Query(alias="to")] = None,
    search: Annotated[str | None, Query(alias="q")] = None,
    branch: Annotated[EventBranch | None, Query()] = None,
    event_status: Annotated[EventStatus | None, Query(alias="status")] = None,
    budget: Annotated[str | None, Query()] = None,
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
    if search:
        filters.append(Event.title.ilike(f"%{search.strip()}%"))
    if branch is not None:
        filters.append(Event.branch == branch)
    if event_status is not None:
        filters.append(Event.status == event_status)
    if budget is not None:
        if budget not in {"with", "without"}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid budget filter")
        if budget == "with":
            filters.append(Event.budget_total.is_not(None))
        else:
            filters.append(Event.budget_total.is_(None))
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
        diff={
            "format": export_format,
            "count": len(rows),
            "filters": {
                "from": from_date,
                "to": to_date,
                "q": search,
                "branch": branch,
                "status": event_status,
                "budget": budget,
            },
        },
        request=request,
    )
    db.commit()

    return response


__all__ = ["router", "MAX_EXPORT_ROWS", "EXPORT_TIMEOUT_SECONDS"]
