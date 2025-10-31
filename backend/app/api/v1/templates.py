from __future__ import annotations

from fastapi import APIRouter, Response

from app.services.structures_import import (
    build_structure_open_periods_template_csv,
    build_structure_open_periods_template_workbook,
    build_structures_template_csv,
    build_structures_template_workbook,
)

router = APIRouter()


@router.get("/structures.xlsx")
def get_structures_template_xlsx() -> Response:
    content = build_structures_template_workbook()
    headers = {
        "Content-Disposition": 'attachment; filename="structures_import_template.xlsx"'
    }
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@router.get("/structures.csv")
def get_structures_template_csv() -> Response:
    content = build_structures_template_csv().encode("utf-8")
    headers = {
        "Content-Disposition": 'attachment; filename="structures_import_template.csv"'
    }
    return Response(content, media_type="text/csv; charset=utf-8", headers=headers)


@router.get("/structure-open-periods.xlsx")
def get_structure_open_periods_template_xlsx() -> Response:
    content = build_structure_open_periods_template_workbook()
    headers = {
        "Content-Disposition": 'attachment; filename="structure_open_periods_template.xlsx"'
    }
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@router.get("/structure-open-periods.csv")
def get_structure_open_periods_template_csv() -> Response:
    content = build_structure_open_periods_template_csv().encode("utf-8")
    headers = {
        "Content-Disposition": 'attachment; filename="structure_open_periods_template.csv"'
    }
    return Response(content, media_type="text/csv; charset=utf-8", headers=headers)


__all__ = ["router"]
