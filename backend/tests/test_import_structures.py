from __future__ import annotations

import os
from io import BytesIO
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services.structures_import import HEADERS  # noqa: E402
from tests.utils import auth_headers  # noqa: E402


@pytest.fixture(autouse=True)
def setup_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def get_client(*, authenticated: bool = False, is_admin: bool = False) -> TestClient:
    client = TestClient(app)
    if authenticated:
        client.headers.update(auth_headers(client, is_admin=is_admin))
    return client


def build_workbook(rows: list[dict[str, object]]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(HEADERS)
    for row in rows:
        sheet.append([row.get(header) for header in HEADERS])
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def upload_file(
    client: TestClient,
    content: bytes,
    *,
    dry_run: bool | None = True,
    filename: str = "structures.xlsx",
    content_type: str = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
):
    params = {}
    if dry_run is not None:
        params["dry_run"] = str(dry_run).lower()
    return client.post(
        "/api/v1/import/structures",
        params=params,
        files={
            "file": (
                filename,
                content,
                content_type,
            )
        },
    )


def seed_structure(client: TestClient, *, slug: str, name: str = "Casa", province: str = "MI") -> None:
    payload = {
        "name": name,
        "slug": slug,
        "province": province,
        "type": "house",
    }
    response = client.post("/api/v1/structures/", json=payload)
    assert response.status_code == 201, response.text


def test_dry_run_preview_lists_actions() -> None:
    client = get_client(authenticated=True, is_admin=True)
    seed_structure(client, slug="casa-alpina", name="Casa Alpina", province="BS")

    workbook = build_workbook(
        [
            {
                "name": "Casa Alpina",
                "slug": "casa-alpina",
                "province": "BS",
                "address": "Via Neve 12",
                "latitude": 46.2,
                "longitude": 10.5,
                "altitude": 1450,
                "type": "house",
            },
            {
                "name": "Nuovo Rifugio",
                "slug": "nuovo-rifugio",
                "province": "TN",
                "address": "Località Bosco",
                "latitude": 46.0,
                "longitude": 11.0,
                "altitude": 980,
                "type": "mixed",
            },
        ]
    )

    response = upload_file(client, workbook, dry_run=True)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["valid_rows"] == 2
    assert data["invalid_rows"] == 0
    assert data["source_format"] == "xlsx"
    assert data["preview"] == [
        {"slug": "casa-alpina", "action": "update"},
        {"slug": "nuovo-rifugio", "action": "create"},
    ]
    assert data["errors"] == []


def test_validation_errors_reported_per_row() -> None:
    client = get_client(authenticated=True, is_admin=True)

    workbook = build_workbook(
        [
            {
                "name": "",
                "slug": "",
                "province": "Bergamo",
                "latitude": 91,
                "longitude": -181,
                "altitude": -900,
                "type": "villa",
            }
        ]
    )

    response = upload_file(client, workbook, dry_run=True)
    assert response.status_code == 200
    data = response.json()
    assert data["valid_rows"] == 0
    assert data["invalid_rows"] == 1
    assert data["source_format"] == "xlsx"

    error_map = {(item["field"], item["msg"], item["source_format"]) for item in data["errors"]}
    assert (
        ("name", "cannot be empty", "xlsx")
        in error_map
        and ("slug", "cannot be empty", "xlsx") in error_map
        and ("province", "must be 2 letters", "xlsx") in error_map
        and ("latitude", "must be between -90 and 90", "xlsx") in error_map
        and ("longitude", "must be between -180 and 180", "xlsx") in error_map
        and ("altitude", "must be between -500 and 9000", "xlsx") in error_map
        and ("type", "must be one of house, land, mixed", "xlsx") in error_map
    )


def test_confirmed_import_upserts_rows() -> None:
    client = get_client(authenticated=True, is_admin=True)
    seed_structure(
        client,
        slug="casa-alpina",
        name="Casa Alpina",
        province="BS",
    )

    workbook = build_workbook(
        [
            {
                "name": "Casa Alpina Rinnovata",
                "slug": "casa-alpina",
                "province": "MI",
                "address": "Via Centro 10",
                "latitude": 45.5,
                "longitude": 9.19,
                "altitude": 115,
                "type": "house",
            },
            {
                "name": "Baite Unite",
                "slug": "baite-unite",
                "province": "TO",
                "address": "Borgata Bosco",
                "latitude": 45.1,
                "longitude": 7.7,
                "altitude": 780,
                "type": "land",
            },
        ]
    )

    response = upload_file(client, workbook, dry_run=False)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["created"] == 1
    assert result["updated"] == 1
    assert result["skipped"] == 0
    assert result["source_format"] == "xlsx"
    assert result["errors"] == []

    updated = client.get("/api/v1/structures/by-slug/casa-alpina")
    assert updated.status_code == 200
    payload = updated.json()
    assert payload["province"] == "MI"
    assert payload["address"] == "Via Centro 10"
    assert payload["latitude"] == pytest.approx(45.5, rel=1e-3)
    assert payload["longitude"] == pytest.approx(9.19, rel=1e-3)

    created = client.get("/api/v1/structures/by-slug/baite-unite")
    assert created.status_code == 200
    created_payload = created.json()
    assert created_payload["name"] == "Baite Unite"
    assert created_payload["province"] == "TO"


def test_import_requires_admin() -> None:
    client = get_client(authenticated=True, is_admin=False)
    workbook = build_workbook(
        [
            {
                "name": "Casa",
                "slug": "casa",
                "province": "MI",
                "type": "house",
            }
        ]
    )
    response = upload_file(client, workbook, dry_run=True)
    assert response.status_code == 403


def test_rejects_invalid_file_type() -> None:
    client = get_client(authenticated=True, is_admin=True)
    response = upload_file(
        client,
        b"slug,name\n",
        filename="structures.txt",
        content_type="text/plain",
    )
    assert response.status_code == 400
    payload = response.json()
    assert payload["detail"].startswith("Invalid file type")
