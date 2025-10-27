from __future__ import annotations

import asyncio
from functools import partial
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.deps import require_admin
from app.models import Structure, User
from app.services.audit import record_audit
from app.services.structures_import import ParsedWorkbook, TemplateFormat, parse_structures_file

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

    return {"created": created, "updated": updated, "skipped": parsed.blank_rows}


__all__ = ["router"]
