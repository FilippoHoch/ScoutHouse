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


def test_search_filters_all_unit_matches_any() -> None:
    client = get_client(authenticated=True, is_admin=True)

    structure = create_structure(
        client,
        {
            "name": "Universal Base",
            "slug": "universal-base",
            "province": "BS",
            "type": "house",
        },
    )

    add_availability(
        client,
        structure["id"],
        {"season": "summer", "units": ["ALL"], "capacity_min": 5, "capacity_max": 50},
    )

    for unit in ("LC", "EG", "RS"):
        response = client.get(
            "/api/v1/structures/search",
            params={"season": "summer", "unit": unit},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["slug"] == "universal-base"


def test_search_filters_all_unit_matches_alongside_specific_units() -> None:
    client = get_client(authenticated=True, is_admin=True)

    universal = create_structure(
        client,
        {
            "name": "Universal Outpost",
            "slug": "universal-outpost",
            "province": "BS",
            "type": "house",
        },
    )

    lc_specific = create_structure(
        client,
        {
            "name": "Lake Camp",
            "slug": "lake-camp",
            "province": "VR",
            "type": "mixed",
        },
    )

    eg_specific = create_structure(
        client,
        {
            "name": "Eagle Nest",
            "slug": "eagle-nest",
            "province": "TN",
            "type": "house",
        },
    )

    rs_specific = create_structure(
        client,
        {
            "name": "River Shelter",
            "slug": "river-shelter",
            "province": "CN",
            "type": "house",
        },
    )

    add_availability(
        client,
        universal["id"],
        {"season": "summer", "units": ["ALL"], "capacity_min": 10, "capacity_max": 60},
    )
    add_availability(
        client,
        lc_specific["id"],
        {"season": "summer", "units": ["LC"], "capacity_min": 12, "capacity_max": 40},
    )
    add_availability(
        client,
        eg_specific["id"],
        {"season": "summer", "units": ["EG"], "capacity_min": 8, "capacity_max": 30},
    )
    add_availability(
        client,
        rs_specific["id"],
        {"season": "summer", "units": ["RS"], "capacity_min": 15, "capacity_max": 50},
    )

    for unit in ("LC", "EG", "RS"):
        response = client.get(
            "/api/v1/structures/search",
            params={"season": "summer", "unit": unit},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert "universal-outpost" in {item["slug"] for item in data["items"]}


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
    _ = create_structure(
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


def test_search_filters_by_cell_coverage_and_aed() -> None:
    client = get_client(authenticated=True, is_admin=True)

    create_structure(
        client,
        {
            "name": "Campo Sicuro",
            "slug": "campo-sicuro",
            "province": "BS",
            "type": "mixed",
            "cell_coverage": "excellent",
            "aed_on_site": True,
        },
    )
    create_structure(
        client,
        {
            "name": "Campo Basico",
            "slug": "campo-basico",
            "province": "BS",
            "type": "mixed",
            "cell_coverage": "limited",
            "aed_on_site": False,
        },
    )

    response = client.get(
        "/api/v1/structures/search",
        params={"cell_coverage": "excellent", "aed_on_site": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["slug"] == "campo-sicuro"


def test_search_filters_by_wastewater_and_river_swimming() -> None:
    client = get_client(authenticated=True, is_admin=True)

    create_structure(
        client,
        {
            "name": "Campo Fiume",
            "slug": "campo-fiume",
            "province": "CN",
            "type": "mixed",
            "wastewater_type": "mains",
            "river_swimming": "si",
            "wildlife_notes": "Sorvegliare il fiume",
        },
    )
    create_structure(
        client,
        {
            "name": "Campo Collina",
            "slug": "campo-collina",
            "province": "CN",
            "type": "mixed",
            "wastewater_type": "septic",
            "river_swimming": "no",
        },
    )

    mains_resp = client.get(
        "/api/v1/structures/search",
        params={"wastewater_type": "mains"},
    )
    assert mains_resp.status_code == 200
    mains_data = mains_resp.json()
    assert mains_data["total"] == 1
    assert mains_data["items"][0]["slug"] == "campo-fiume"

    swimming_resp = client.get(
        "/api/v1/structures/search",
        params={"river_swimming": "si"},
    )
    assert swimming_resp.status_code == 200
    swimming_data = swimming_resp.json()
    assert swimming_data["total"] == 1
    assert swimming_data["items"][0]["slug"] == "campo-fiume"


def test_search_filters_by_power_and_parking_thresholds() -> None:
    client = get_client(authenticated=True, is_admin=True)

    create_structure(
        client,
        {
            "name": "Campo Energia",
            "slug": "campo-energia",
            "province": "MI",
            "type": "mixed",
            "power_capacity_kw": 12.0,
            "parking_car_slots": 8,
        },
    )
    create_structure(
        client,
        {
            "name": "Campo Piccolo",
            "slug": "campo-piccolo",
            "province": "MI",
            "type": "mixed",
            "power_capacity_kw": 3.5,
            "parking_car_slots": 2,
        },
    )

    response = client.get(
        "/api/v1/structures/search",
        params={"min_power_capacity_kw": 5, "min_parking_car_slots": 5},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["slug"] == "campo-energia"


def test_search_filters_by_flood_risk() -> None:
    client = get_client(authenticated=True, is_admin=True)

    create_structure(
        client,
        {
            "name": "Campo Sicuro",
            "slug": "campo-sicuro-rischio",
            "province": "VR",
            "type": "mixed",
            "flood_risk": "low",
        },
    )
    create_structure(
        client,
        {
            "name": "Campo Critico",
            "slug": "campo-critico",
            "province": "VR",
            "type": "mixed",
            "flood_risk": "high",
        },
    )

    response = client.get(
        "/api/v1/structures/search",
        params={"flood_risk": "high"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["slug"] == "campo-critico"
