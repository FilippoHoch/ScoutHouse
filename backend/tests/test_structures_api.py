import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def setup_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def get_client() -> TestClient:
    return TestClient(app)


def test_structures_flow() -> None:
    client = get_client()

    response = client.get("/api/v1/structures/")
    assert response.status_code == 200
    assert response.json() == []

    payload = {
        "name": "Scout Training Center",
        "slug": "scout-training-center",
        "province": "mi",
        "type": "house",
        "address": "Via Scout 1, Milano",
        "latitude": 45.4642,
        "longitude": 9.1900,
    }

    create_resp = client.post("/api/v1/structures/", json=payload)
    assert create_resp.status_code == 201
    created = create_resp.json()
    assert created["province"] == "MI"
    assert created["latitude"] == pytest.approx(payload["latitude"], rel=1e-3)
    assert created["longitude"] == pytest.approx(payload["longitude"], rel=1e-3)

    list_resp = client.get("/api/v1/structures/")
    assert list_resp.status_code == 200
    data = list_resp.json()
    assert len(data) == 1
    assert data[0]["slug"] == payload["slug"]

    slug_resp = client.get("/api/v1/structures/by-slug/scout-training-center")
    assert slug_resp.status_code == 200
    assert slug_resp.json()["id"] == created["id"]


def test_unique_slug_validation() -> None:
    client = get_client()

    payload = {
        "name": "Casa del Nord",
        "slug": "casa-del-nord",
        "province": "MI",
        "type": "house",
    }

    first = client.post("/api/v1/structures/", json=payload)
    assert first.status_code == 201

    duplicate = client.post("/api/v1/structures/", json=payload)
    assert duplicate.status_code == 400
    assert duplicate.json()["detail"] == "Slug already exists"


def test_field_validation_errors() -> None:
    client = get_client()

    invalid_payload = {
        "name": "Invalid Structure",
        "slug": "INVALID SLUG",
        "province": "Lombardia",
        "type": "house",
        "latitude": 123.0,
        "longitude": -200.0,
    }

    response = client.post("/api/v1/structures/", json=invalid_payload)
    assert response.status_code == 422


def test_get_structure_by_slug_not_found() -> None:
    client = get_client()
    response = client.get("/api/v1/structures/by-slug/unknown")
    assert response.status_code == 404
    assert response.json()["detail"] == "Structure not found"
