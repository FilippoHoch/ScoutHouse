from __future__ import annotations

import csv
import os
from io import StringIO
from typing import Generator

import pytest
from fastapi.testclient import TestClient

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


def build_csv(rows: list[dict[str, object]]) -> bytes:
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(HEADERS)
    for row in rows:
        writer.writerow(
            [
                row.get("name"),
                row.get("slug"),
                row.get("province"),
                row.get("address"),
                row.get("latitude"),
                row.get("longitude"),
                row.get("type"),
            ]
        )
    return buffer.getvalue().encode("utf-8")


def upload_csv(
    client: TestClient,
    content: bytes,
    *,
    dry_run: bool | None = True,
):
    params = {}
    if dry_run is not None:
        params["dry_run"] = str(dry_run).lower()
    return client.post(
        "/api/v1/import/structures",
        params=params,
        files={"file": ("structures.csv", content, "text/csv")},
    )


def seed_structure(
    client: TestClient,
    *,
    slug: str,
    name: str = "Casa",
    province: str = "MI",
) -> None:
    payload = {
        "name": name,
        "slug": slug,
        "province": province,
        "type": "house",
    }
    response = client.post("/api/v1/structures/", json=payload)
    assert response.status_code == 201, response.text


def test_csv_dry_run_preview_lists_actions() -> None:
    client = get_client(authenticated=True, is_admin=True)
    seed_structure(client, slug="casa-alpina", name="Casa Alpina", province="BS")

    csv_file = build_csv(
        [
            {
                "name": "Casa Alpina",
                "slug": "casa-alpina",
                "province": "BS",
                "address": "Via Neve 12",
                "latitude": 46.2,
                "longitude": 10.5,
                "type": "house",
            },
            {
                "name": "Nuovo Rifugio",
                "slug": "nuovo-rifugio",
                "province": "TN",
                "address": "Località Bosco",
                "latitude": 46.0,
                "longitude": 11.0,
                "type": "mixed",
            },
        ]
    )

    response = upload_csv(client, csv_file, dry_run=True)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["valid_rows"] == 2
    assert data["invalid_rows"] == 0
    assert data["source_format"] == "csv"
    assert data["preview"] == [
        {"slug": "casa-alpina", "action": "update"},
        {"slug": "nuovo-rifugio", "action": "create"},
    ]


def test_csv_validation_errors_include_source_format() -> None:
    client = get_client(authenticated=True, is_admin=True)

    csv_file = build_csv(
        [
            {
                "name": "",
                "slug": "",
                "province": "Milano",
                "type": "villa",
            }
        ]
    )

    response = upload_csv(client, csv_file, dry_run=True)
    assert response.status_code == 200
    payload = response.json()
    assert payload["invalid_rows"] == 1
    assert payload["source_format"] == "csv"
    assert payload["errors"]
    assert {error["source_format"] for error in payload["errors"]} == {"csv"}


def test_csv_confirmed_import_upserts_rows() -> None:
    client = get_client(authenticated=True, is_admin=True)
    seed_structure(client, slug="casa-alpina", name="Casa Alpina", province="BS")

    csv_file = build_csv(
        [
            {
                "name": "Casa Alpina Rinnovata",
                "slug": "casa-alpina",
                "province": "MI",
                "address": "Via Centro 10",
                "latitude": 45.5,
                "longitude": 9.19,
                "type": "house",
            },
            {
                "name": "Baite Unite",
                "slug": "baite-unite",
                "province": "TO",
                "address": "Borgata Bosco",
                "latitude": 45.1,
                "longitude": 7.7,
                "type": "land",
            },
        ]
    )

    response = upload_csv(client, csv_file, dry_run=False)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["created"] == 1
    assert result["updated"] == 1
    assert result["skipped"] == 0
    assert result["source_format"] == "csv"
    assert result["errors"] == []

    updated = client.get("/api/v1/structures/by-slug/casa-alpina")
    assert updated.status_code == 200
    payload = updated.json()
    assert payload["province"] == "MI"
    assert payload["address"] == "Via Centro 10"

    created = client.get("/api/v1/structures/by-slug/baite-unite")
    assert created.status_code == 200
    created_payload = created.json()
    assert created_payload["name"] == "Baite Unite"
    assert created_payload["province"] == "TO"
