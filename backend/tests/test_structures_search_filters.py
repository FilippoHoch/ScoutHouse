from __future__ import annotations

import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

from tests.utils import auth_headers


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


def create_structure(client: TestClient, payload: dict) -> dict:
    response = client.post("/api/v1/structures/", json=payload)
    assert response.status_code == 201
    return response.json()


def add_availability(client: TestClient, structure_id: int, payload: dict) -> dict:
    response = client.post(f"/api/v1/structures/{structure_id}/availabilities", json=payload)
    assert response.status_code == 201
    return response.json()


def add_cost_option(client: TestClient, structure_id: int, payload: dict) -> dict:
    response = client.post(f"/api/v1/structures/{structure_id}/cost-options", json=payload)
    assert response.status_code == 201
    return response.json()


def test_search_filters_by_season_and_unit() -> None:
    client = get_client(authenticated=True, is_admin=True)

    alpine = create_structure(
        client,
        {
            "name": "Alpine Hut",
            "slug": "alpine-hut",
            "province": "BS",
            "type": "house",
        },
    )
    lakeside = create_structure(
        client,
        {
            "name": "Lakeside Camp",
            "slug": "lakeside-camp",
            "province": "VR",
            "type": "mixed",
        },
    )

    add_availability(
        client,
        alpine["id"],
        {"season": "summer", "units": ["LC", "EG"], "capacity_min": 15, "capacity_max": 80},
    )
    add_availability(
        client,
        lakeside["id"],
        {"season": "winter", "units": ["RS"], "capacity_min": 20, "capacity_max": 90},
    )

    response = client.get(
        "/api/v1/structures/search",
        params={"season": "summer", "unit": "LC"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["slug"] == "alpine-hut"
    assert data["items"][0]["seasons"] == ["summer"]
    assert set(data["items"][0]["units"]) == {"LC", "EG"}


def test_search_filters_all_units_match_each_branch() -> None:
    client = get_client(authenticated=True, is_admin=True)

    universal_structure = create_structure(
        client,
        {
            "name": "Universal Base",
            "slug": "universal-base",
            "province": "MI",
            "type": "house",
        },
    )

    add_availability(
        client,
        universal_structure["id"],
        {"season": "summer", "units": ["ALL"], "capacity_min": 10, "capacity_max": 50},
    )

    for unit in ["LC", "EG", "RS"]:
        response = client.get(
            "/api/v1/structures/search",
            params={"season": "summer", "unit": unit},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["slug"] == "universal-base"
        assert data["items"][0]["seasons"] == ["summer"]
        assert data["items"][0]["units"] == ["ALL"]


def test_search_filters_by_cost_band() -> None:
    client = get_client(authenticated=True, is_admin=True)

    cheap = create_structure(
        client,
        {
            "name": "Budget Base",
            "slug": "budget-base",
            "province": "BS",
            "type": "house",
        },
    )
    medium = create_structure(
        client,
        {
            "name": "Comfort Camp",
            "slug": "comfort-camp",
            "province": "BS",
            "type": "mixed",
        },
    )
    premium = create_structure(
        client,
        {
            "name": "Premium Lodge",
            "slug": "premium-lodge",
            "province": "BS",
            "type": "house",
        },
    )
    no_cost = create_structure(
        client,
        {
            "name": "Volunteer Field",
            "slug": "volunteer-field",
            "province": "BS",
            "type": "land",
        },
    )

    add_cost_option(
        client,
        cheap["id"],
        {
            "model": "per_person_day",
            "amount": 6.0,
            "currency": "EUR",
        },
    )
    add_cost_option(
        client,
        medium["id"],
        {
            "model": "per_person_day",
            "amount": 12.0,
            "currency": "EUR",
            "city_tax_per_night": 1.0,
        },
    )
    add_cost_option(
        client,
        premium["id"],
        {
            "model": "forfait",
            "amount": 24.0,
            "currency": "EUR",
        },
    )

    cheap_resp = client.get(
        "/api/v1/structures/search",
        params={"cost_band": "cheap"},
    )
    assert cheap_resp.status_code == 200
    cheap_data = cheap_resp.json()
    assert cheap_data["total"] == 1
    assert cheap_data["items"][0]["slug"] == "budget-base"
    assert cheap_data["items"][0]["estimated_cost"] == pytest.approx(6.0)
    assert cheap_data["items"][0]["cost_band"] == "cheap"

    medium_resp = client.get(
        "/api/v1/structures/search",
        params={"cost_band": "medium"},
    )
    assert medium_resp.status_code == 200
    medium_data = medium_resp.json()
    assert medium_data["total"] == 1
    assert medium_data["items"][0]["slug"] == "comfort-camp"
    assert medium_data["items"][0]["cost_band"] == "medium"

    expensive_resp = client.get(
        "/api/v1/structures/search",
        params={"cost_band": "expensive"},
    )
    assert expensive_resp.status_code == 200
    expensive_data = expensive_resp.json()
    assert expensive_data["total"] == 1
    assert expensive_data["items"][0]["slug"] == "premium-lodge"
    assert expensive_data["items"][0]["cost_band"] == "expensive"

    none_resp = client.get(
        "/api/v1/structures/search",
        params={"cost_band": "cheap"},
    )
    assert none_resp.status_code == 200
    slugs = {item["slug"] for item in none_resp.json()["items"]}
    assert "volunteer-field" not in slugs
