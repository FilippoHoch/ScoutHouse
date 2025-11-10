from __future__ import annotations

import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
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


def seed_structure(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/structures/",
        json={
            "name": "Cache Base",
            "slug": "cache-base",
            "province": "BS",
            "type": "mixed",
            "address": "Via Cache 1",
        },
    )
    assert response.status_code == 201
    structure = response.json()

    availability = client.post(
        f"/api/v1/structures/{structure['id']}/availabilities",
        json={
            "season": "spring",
            "units": ["LC"],
            "capacity_min": 10,
            "capacity_max": 40,
        },
    )
    assert availability.status_code == 201

    cost_option = client.post(
        f"/api/v1/structures/{structure['id']}/cost-options",
        json={
            "model": "per_person_day",
            "amount": 12.5,
            "currency": "EUR",
        },
    )
    assert cost_option.status_code == 201

    return structure


def test_http_cache_headers_and_etag_roundtrip() -> None:
    client = get_client(authenticated=True, is_admin=True)
    seed_structure(client)

    first = client.get("/api/v1/structures/search")
    assert first.status_code == 200
    etag = first.headers.get("ETag")
    assert etag
    assert first.headers.get("Cache-Control") == "public, max-age=120, stale-while-revalidate=600"

    second = client.get(
        "/api/v1/structures/search",
        headers={"If-None-Match": etag},
    )
    assert second.status_code == 304
    assert second.headers.get("ETag") == etag
    assert second.headers.get("Cache-Control") == "public, max-age=120, stale-while-revalidate=600"


def test_http_cache_slug_endpoint() -> None:
    client = get_client(authenticated=True, is_admin=True)
    structure = seed_structure(client)

    first = client.get(
        f"/api/v1/structures/by-slug/{structure['slug']}",
        params={"include": "details"},
    )
    assert first.status_code == 200
    etag = first.headers.get("ETag")
    assert etag
    assert first.headers.get("Cache-Control") == "public, max-age=120, stale-while-revalidate=600"

    second = client.get(
        f"/api/v1/structures/by-slug/{structure['slug']}",
        params={"include": "details"},
        headers={"If-None-Match": etag},
    )
    assert second.status_code == 304
    assert second.headers.get("ETag") == etag
    assert second.headers.get("Cache-Control") == "public, max-age=120, stale-while-revalidate=600"
