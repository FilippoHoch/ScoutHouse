from __future__ import annotations

import asyncio
from datetime import date
from functools import partial
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.deps import require_admin
from app.models import (
    Structure,
    StructureOpenPeriod,
    StructureOpenPeriodKind,
    StructureOpenPeriodSeason,
    User,
    WaterSource,
)
from app.services.audit import record_audit
from app.services.structures_import import (
    ParsedOpenPeriods,
    ParsedWorkbook,
    RowError,
    TemplateFormat,
    parse_structure_open_periods_file,
    parse_structures_file,
)


def _serialize_water_sources(
    sources: list[WaterSource] | None,
) -> list[str] | None:
    if not sources:
        return None
    return [item.value for item in sources]

router = APIRouter()

MAX_UPLOAD_SIZE = 5 * 1024 * 1024
ALLOWED_MIME_TYPES: dict[str, TemplateFormat] = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xlsx",
    "application/csv": "csv",
    "text/csv": "csv",
}
ALLOWED_EXTENSIONS: dict[str, TemplateFormat] = {
    ".xlsx": "xlsx",
    ".csv": "csv",
}
PARSE_TIMEOUT_SECONDS = 10

DbSession = Annotated[Session, Depends(get_db)]
CurrentAdmin = Annotated[User, Depends(require_admin)]


def _build_error_payload(parsed: ParsedWorkbook) -> list[dict[str, object]]:
    return [
        {
            "row": error.row,
            "field": error.field,
            "msg": error.message,
            "source_format": error.source_format,
        }
        for error in parsed.errors
    ]


def _lookup_existing_structures(db: Session, slugs: list[str]) -> dict[str, Structure]:
    if not slugs:
        return {}
    result = db.execute(select(Structure).where(Structure.slug.in_(slugs)))
    return {item.slug: item for item in result.scalars().all()}


def _detect_source_format(file: UploadFile) -> TemplateFormat:
    if file.content_type:
        content_type = file.content_type.split(";", 1)[0].strip().lower()
        if content_type in ALLOWED_MIME_TYPES:
            return ALLOWED_MIME_TYPES[content_type]

    extension = Path(file.filename or "").suffix.lower()
    if extension in ALLOWED_EXTENSIONS:
        return ALLOWED_EXTENSIONS[extension]

    accepted = ".csv, .xlsx"
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Invalid file type. Please upload a CSV or XLSX file ({accepted}).",
    )


@router.post("/structures")
async def import_structures(
    *,
    request: Request,
    db: DbSession,
    admin: CurrentAdmin,
    file: UploadFile = File(...),
    dry_run: bool = Query(True, alias="dry_run"),
) -> dict[str, object]:
    source_format = _detect_source_format(file)

    contents = await file.read()
    await file.close()

    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum allowed size is 5 MB.",
        )

    loop = asyncio.get_running_loop()
    try:
        parsed = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                partial(parse_structures_file, contents, source_format=source_format),
            ),
            timeout=PARSE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail="Parsing timed out. Please try again with a smaller file.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    valid_rows = len(parsed.rows)
    invalid_rows = len({error.row for error in parsed.errors})
    errors_payload = _build_error_payload(parsed)

    slugs = [row.slug for row in parsed.rows]
    existing = _lookup_existing_structures(db, slugs)

    if dry_run:
        preview = [
            {"slug": row.slug, "action": "update" if row.slug in existing else "create"}
            for row in parsed.rows
        ]
        return {
            "valid_rows": valid_rows,
            "invalid_rows": invalid_rows,
            "errors": errors_payload,
            "preview": preview,
            "source_format": parsed.source_format,
        }

    if invalid_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Import blocked due to validation errors.", "errors": errors_payload},
        )

    created = 0
    updated = 0

    for row in parsed.rows:
        structure = existing.get(row.slug)
        if structure is None:
            structure = Structure(
                name=row.name,
                slug=row.slug,
                province=row.province,
                address=row.address,
                latitude=row.latitude,
                longitude=row.longitude,
                type=row.type,
                indoor_beds=row.indoor_beds,
                indoor_bathrooms=row.indoor_bathrooms,
                indoor_showers=row.indoor_showers,
                indoor_activity_rooms=row.indoor_activity_rooms,
                has_kitchen=row.has_kitchen if row.has_kitchen is not None else False,
                hot_water=row.hot_water if row.hot_water is not None else False,
                land_area_m2=row.land_area_m2,
                shelter_on_field=row.shelter_on_field if row.shelter_on_field is not None else False,
                water_sources=_serialize_water_sources(row.water_sources),
                electricity_available=(
                    row.electricity_available if row.electricity_available is not None else False
                ),
                fire_policy=row.fire_policy,
                access_by_car=row.access_by_car if row.access_by_car is not None else False,
                access_by_coach=row.access_by_coach if row.access_by_coach is not None else False,
                access_by_public_transport=(
                    row.access_by_public_transport if row.access_by_public_transport is not None else False
                ),
                coach_turning_area=row.coach_turning_area if row.coach_turning_area is not None else False,
                nearest_bus_stop=row.nearest_bus_stop,
                weekend_only=row.weekend_only if row.weekend_only is not None else False,
                has_field_poles=row.has_field_poles if row.has_field_poles is not None else False,
                pit_latrine_allowed=(
                    row.pit_latrine_allowed if row.pit_latrine_allowed is not None else False
                ),
                website_urls=row.website_urls or None,
                notes_logistics=row.notes_logistics,
                notes=row.notes,
            )
            db.add(structure)
            created += 1
        else:
            structure.name = row.name
            structure.province = row.province
            structure.address = row.address
            structure.latitude = row.latitude
            structure.longitude = row.longitude
            structure.type = row.type
            structure.indoor_beds = row.indoor_beds
            structure.indoor_bathrooms = row.indoor_bathrooms
            structure.indoor_showers = row.indoor_showers
            structure.indoor_activity_rooms = row.indoor_activity_rooms
            if row.has_kitchen is not None:
                structure.has_kitchen = row.has_kitchen
            if row.hot_water is not None:
                structure.hot_water = row.hot_water
            structure.land_area_m2 = row.land_area_m2
            if row.shelter_on_field is not None:
                structure.shelter_on_field = row.shelter_on_field
            structure.water_sources = _serialize_water_sources(row.water_sources)
            if row.electricity_available is not None:
                structure.electricity_available = row.electricity_available
            structure.fire_policy = row.fire_policy
            if row.access_by_car is not None:
                structure.access_by_car = row.access_by_car
            if row.access_by_coach is not None:
                structure.access_by_coach = row.access_by_coach
            if row.access_by_public_transport is not None:
                structure.access_by_public_transport = row.access_by_public_transport
            if row.coach_turning_area is not None:
                structure.coach_turning_area = row.coach_turning_area
            structure.nearest_bus_stop = row.nearest_bus_stop
            if row.weekend_only is not None:
                structure.weekend_only = row.weekend_only
            if row.has_field_poles is not None:
                structure.has_field_poles = row.has_field_poles
            if row.pit_latrine_allowed is not None:
                structure.pit_latrine_allowed = row.pit_latrine_allowed
            structure.website_urls = row.website_urls or None
            structure.notes_logistics = row.notes_logistics
            structure.notes = row.notes
            updated += 1

    record_audit(
        db,
        actor=admin,
        action="import_structures",
        entity_type="structures",
        entity_id="import",
        diff={
            "created": created,
            "updated": updated,
            "skipped": parsed.blank_rows,
            "total_rows": valid_rows,
        },
        request=request,
    )
    db.commit()

    return {
        "created": created,
        "updated": updated,
        "skipped": parsed.blank_rows,
        "errors": errors_payload,
        "source_format": parsed.source_format,
    }


@router.post("/structure-open-periods")
async def import_structure_open_periods(
    *,
    request: Request,
    db: DbSession,
    admin: CurrentAdmin,
    file: UploadFile = File(...),
    dry_run: bool = Query(True, alias="dry_run"),
) -> dict[str, object]:
    source_format = _detect_source_format(file)
    contents = await file.read()
    await file.close()

    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum allowed size is 5 MB.",
        )

    loop = asyncio.get_running_loop()
    try:
        parsed = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                partial(
                    parse_structure_open_periods_file,
                    contents,
                    source_format=source_format,
                ),
            ),
            timeout=PARSE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail="Parsing timed out. Please try again with a smaller file.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    errors_payload = _build_error_payload(parsed)
    slugs = [row.structure_slug for row in parsed.rows]
    structures = _lookup_existing_structures(db, slugs)

    missing_errors = [
        RowError(
            row=row.row,
            field="structure_slug",
            message="Structure not found",
            source_format=parsed.source_format,
        )
        for row in parsed.rows
        if row.structure_slug not in structures
    ]
    if missing_errors:
        parsed.errors.extend(missing_errors)
        errors_payload.extend(
            {
                "row": item.row,
                "field": item.field,
                "msg": item.message,
                "source_format": item.source_format,
            }
            for item in missing_errors
        )

    structure_ids = [structure.id for structure in structures.values()]
    existing_periods = []
    if structure_ids:
        existing_periods = db.execute(
            select(StructureOpenPeriod).where(StructureOpenPeriod.structure_id.in_(structure_ids))
        ).scalars()

    existing_keys: set[
        tuple[
            int,
            StructureOpenPeriodKind,
            StructureOpenPeriodSeason | None,
            date | None,
            date | None,
            tuple[str, ...],
        ]
    ] = {
        (
            period.structure_id,
            period.kind,
            period.season,
            period.date_start,
            period.date_end,
            tuple(period.units or ()),
        )
        for period in existing_periods
    }

    duplicate_keys: set[
        tuple[
            int,
            StructureOpenPeriodKind,
            StructureOpenPeriodSeason | None,
            date | None,
            date | None,
            tuple[str, ...],
        ]
    ] = set()
    for row in parsed.rows:
        structure = structures.get(row.structure_slug)
        if structure is None:
            continue
        row_units = tuple(unit.value for unit in row.units) if row.units else tuple()
        key = (
            structure.id,
            row.kind,
            row.season,
            row.date_start,
            row.date_end,
            row_units,
        )
        if key in existing_keys:
            duplicate_keys.add(key)
        else:
            existing_keys.add(key)

    if dry_run:
        preview: list[dict[str, object]] = []
        for row in parsed.rows:
            structure = structures.get(row.structure_slug)
            if structure is None:
                action = "missing_structure"
            else:
                row_units = tuple(unit.value for unit in row.units) if row.units else tuple()
                key = (
                    structure.id,
                    row.kind,
                    row.season,
                    row.date_start,
                    row.date_end,
                    row_units,
                )
                action = "skip" if key in duplicate_keys else "create"
            preview.append({"slug": row.structure_slug, "action": action})
        return {
            "valid_rows": len(parsed.rows),
            "invalid_rows": len({error.row for error in parsed.errors}),
            "errors": errors_payload,
            "preview": preview,
            "source_format": parsed.source_format,
        }

    if parsed.errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Import blocked due to validation errors.", "errors": errors_payload},
        )

    created = 0
    skipped = parsed.blank_rows + len(duplicate_keys)

    seen_keys = set(existing_keys)
    for row in parsed.rows:
        structure = structures.get(row.structure_slug)
        if structure is None:
            continue
        row_units = tuple(unit.value for unit in row.units) if row.units else tuple()
        key = (
            structure.id,
            row.kind,
            row.season,
            row.date_start,
            row.date_end,
            row_units,
        )
        if key in seen_keys:
            continue
        period = StructureOpenPeriod(
            structure_id=structure.id,
            kind=row.kind,
            season=row.season,
            date_start=row.date_start,
            date_end=row.date_end,
            notes=row.notes,
            units=[unit.value for unit in row.units] if row.units else None,
        )
        db.add(period)
        seen_keys.add(key)
        created += 1

    record_audit(
        db,
        actor=admin,
        action="import_structure_open_periods",
        entity_type="structure_open_period",
        entity_id="import",
        diff={
            "created": created,
            "skipped": skipped,
            "total_rows": len(parsed.rows),
        },
        request=request,
    )

    db.commit()

    return {
        "created": created,
        "skipped": skipped,
        "errors": errors_payload,
        "source_format": parsed.source_format,
    }


__all__ = ["router"]
