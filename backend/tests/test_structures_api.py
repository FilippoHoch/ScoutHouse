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


def get_client(*, authenticated: bool = False, is_admin: bool = True) -> TestClient:
    client = TestClient(app)
    if authenticated:
        client.headers.update(auth_headers(client, is_admin=is_admin))
    return client


def test_structures_flow() -> None:
    client = get_client(authenticated=True)

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
        "indoor_beds": 48,
        "indoor_bathrooms": 6,
        "indoor_showers": 10,
        "indoor_activity_rooms": 4,
        "has_kitchen": True,
        "hot_water": True,
        "access_by_car": True,
        "access_by_public_transport": True,
        "website_url": "https://example.org/scout-center",
        "notes_logistics": "Ingresso pullman",
        "notes": "Struttura con ampi spazi verdi.",
        "open_periods": [
            {
                "kind": "season",
                "season": "summer",
                "notes": "Aperta in estate",
                "units": ["ALL"],
            },
            {
                "kind": "range",
                "date_start": "2025-08-01",
                "date_end": "2025-08-31",
                "notes": "Chiusura straordinaria",
                "units": ["EG", "RS"],
            },
        ],
    }

    create_resp = client.post("/api/v1/structures/", json=payload)
    assert create_resp.status_code == 201
    created = create_resp.json()
    assert created["province"] == "MI"
    assert created["latitude"] == pytest.approx(payload["latitude"], rel=1e-3)
    assert created["longitude"] == pytest.approx(payload["longitude"], rel=1e-3)
    assert created["indoor_beds"] == payload["indoor_beds"]
    assert created["indoor_bathrooms"] == payload["indoor_bathrooms"]
    assert created["indoor_showers"] == payload["indoor_showers"]
    assert created["indoor_activity_rooms"] == payload["indoor_activity_rooms"]
    assert created["has_kitchen"] is True
    assert created["hot_water"] is True
    assert created["access_by_car"] is True
    assert created["access_by_public_transport"] is True
    assert created["website_url"] == payload["website_url"]
    assert created["notes_logistics"] == payload["notes_logistics"]
    assert created["notes"] == payload["notes"]
    assert len(created["open_periods"]) == 2
    assert created["open_periods"][0]["units"] == ["ALL"]
    assert created["open_periods"][1]["units"] == ["EG", "RS"]

    list_resp = client.get("/api/v1/structures/")
    assert list_resp.status_code == 200
    data = list_resp.json()
    assert len(data) == 1
    assert data[0]["slug"] == payload["slug"]

    slug_resp = client.get("/api/v1/structures/by-slug/scout-training-center")
    assert slug_resp.status_code == 200
    slug_data = slug_resp.json()
    assert slug_data["id"] == created["id"]
    assert len(slug_data["open_periods"]) == 2


def test_unique_slug_validation() -> None:
    client = get_client(authenticated=True)

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
    client = get_client(authenticated=True)

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


def test_authenticated_user_can_manage_structure_details() -> None:
    client = get_client(authenticated=True)

    create_payload = {
        "name": "Casa Arcobaleno",
        "slug": "casa-arcobaleno",
        "province": "BG",
        "type": "house",
    }

    create_resp = client.post("/api/v1/structures/", json=create_payload)
    assert create_resp.status_code == 201, create_resp.text
    structure_id = create_resp.json()["id"]

    unauthenticated = get_client()
    contact_payload = {
        "first_name": "Mario",
        "last_name": "Rossi",
        "email": "mario.rossi@example.org",
        "phone": "+39 02 1234567",
        "preferred_channel": "phone",
        "is_primary": True,
    }
    unauth_resp = unauthenticated.post(
        f"/api/v1/structures/{structure_id}/contacts",
        json=contact_payload,
    )
    assert unauth_resp.status_code == 401

    contact_resp = client.post(
        f"/api/v1/structures/{structure_id}/contacts",
        json=contact_payload,
    )
    assert contact_resp.status_code == 201, contact_resp.text
    contact_data = contact_resp.json()
    assert contact_data["name"] == "Mario Rossi"
    assert contact_data["preferred_channel"] == "phone"

    update_resp = client.patch(
        f"/api/v1/structures/{structure_id}/contacts/{contact_data['id']}",
        json={"notes": "Disponibile nel weekend", "is_primary": True},
    )
    assert update_resp.status_code == 200, update_resp.text
    updated_contact = update_resp.json()
    assert updated_contact["is_primary"] is True
    assert updated_contact["notes"] == "Disponibile nel weekend"

    availability_payload = {
        "season": "summer",
        "units": ["LC", "EG"],
        "capacity_min": 12,
        "capacity_max": 48,
    }
    availability_resp = client.post(
        f"/api/v1/structures/{structure_id}/availabilities",
        json=availability_payload,
    )
    assert availability_resp.status_code == 201, availability_resp.text
    availability_data = availability_resp.json()
    assert availability_data["season"] == "summer"
    assert availability_data["units"] == ["LC", "EG"]

    cost_payload = {
        "model": "per_person_day",
        "amount": 18,
        "currency": "EUR",
    }
    cost_resp = client.post(
        f"/api/v1/structures/{structure_id}/cost-options",
        json=cost_payload,
    )
    assert cost_resp.status_code == 201, cost_resp.text
    cost_data = cost_resp.json()
    assert cost_data["model"] == "per_person_day"
    assert float(cost_data["amount"]) == 18.0

    details_resp = client.get(
        f"/api/v1/structures/by-slug/{create_payload['slug']}?include=details"
    )
    assert details_resp.status_code == 200, details_resp.text
    details = details_resp.json()
    assert len(details["availabilities"]) == 1
    assert len(details["cost_options"]) == 1


def test_search_supports_extended_filters() -> None:
    client = get_client(authenticated=True)

    house_payload = {
        "name": "Casa Bosco",
        "slug": "casa-bosco",
        "province": "MI",
        "type": "house",
        "indoor_beds": 24,
        "indoor_bathrooms": 4,
        "indoor_showers": 6,
        "indoor_activity_rooms": 3,
        "has_kitchen": True,
        "hot_water": True,
        "access_by_car": True,
        "access_by_coach": True,
        "access_by_public_transport": True,
        "coach_turning_area": True,
        "open_periods": [
            {"kind": "season", "season": "summer", "units": ["ALL"]}
        ],
    }

    land_payload = {
        "name": "Campo Pianura",
        "slug": "campo-pianura",
        "province": "BG",
        "type": "land",
        "land_area_m2": 5000,
        "shelter_on_field": True,
        "water_sources": ["tap"],
        "electricity_available": False,
        "fire_policy": "allowed",
        "access_by_car": True,
        "access_by_coach": False,
        "access_by_public_transport": False,
        "has_field_poles": True,
        "pit_latrine_allowed": True,
        "open_periods": [
            {
                "kind": "range",
                "date_start": "2025-07-01",
                "date_end": "2025-07-31",
                "units": ["EG", "RS"],
            }
        ],
    }

    mixed_payload = {
        "name": "Base Mista",
        "slug": "base-mista",
        "province": "BS",
        "type": "mixed",
        "indoor_beds": 12,
        "indoor_bathrooms": 2,
        "indoor_activity_rooms": 2,
        "has_kitchen": True,
        "hot_water": True,
        "land_area_m2": 2000,
        "shelter_on_field": False,
        "fire_policy": "with_permit",
        "access_by_car": True,
        "access_by_coach": True,
        "access_by_public_transport": False,
        "open_periods": [
            {"kind": "season", "season": "autumn", "units": ["RS"]}
        ],
    }

    for payload in (house_payload, land_payload, mixed_payload):
        response = client.post("/api/v1/structures/", json=payload)
        assert response.status_code == 201, response.text

    coach_response = client.get("/api/v1/structures/search", params={"access": "coach"})
    assert coach_response.status_code == 200
    coach_slugs = {item["slug"] for item in coach_response.json()["items"]}
    assert coach_slugs == {"casa-bosco", "base-mista"}

    strict_access = client.get("/api/v1/structures/search", params={"access": "coach|pt"})
    assert strict_access.status_code == 200
    strict_slugs = {item["slug"] for item in strict_access.json()["items"]}
    assert strict_slugs == {"casa-bosco"}

    fire_allowed = client.get("/api/v1/structures/search", params={"fire": "allowed"})
    assert fire_allowed.status_code == 200
    assert [item["slug"] for item in fire_allowed.json()["items"]] == ["campo-pianura"]

    land_area_response = client.get("/api/v1/structures/search", params={"min_land_area": 3000})
    assert land_area_response.status_code == 200
    land_area_slugs = {item["slug"] for item in land_area_response.json()["items"]}
    assert land_area_slugs == {"campo-pianura"}

    hot_water_response = client.get("/api/v1/structures/search", params={"hot_water": "true"})
    assert hot_water_response.status_code == 200
    hot_water_slugs = {item["slug"] for item in hot_water_response.json()["items"]}
    assert hot_water_slugs == {"casa-bosco", "base-mista"}

    season_response = client.get("/api/v1/structures/search", params={"open_in_season": "summer"})
    assert season_response.status_code == 200
    season_slugs = {item["slug"] for item in season_response.json()["items"]}
    assert season_slugs == {"casa-bosco"}

    date_response = client.get("/api/v1/structures/search", params={"open_on_date": "2025-07-15"})
    assert date_response.status_code == 200
    date_slugs = {item["slug"] for item in date_response.json()["items"]}
    assert date_slugs == {"campo-pianura"}
