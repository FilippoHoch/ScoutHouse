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
        "beds": 48,
        "bathrooms": 6,
        "showers": 10,
        "dining_capacity": 60,
        "has_kitchen": True,
        "website_url": "https://example.org/scout-center",
        "notes": "Struttura con ampi spazi verdi.",
    }

    create_resp = client.post("/api/v1/structures/", json=payload)
    assert create_resp.status_code == 201
    created = create_resp.json()
    assert created["province"] == "MI"
    assert created["latitude"] == pytest.approx(payload["latitude"], rel=1e-3)
    assert created["longitude"] == pytest.approx(payload["longitude"], rel=1e-3)
    assert created["beds"] == payload["beds"]
    assert created["bathrooms"] == payload["bathrooms"]
    assert created["showers"] == payload["showers"]
    assert created["dining_capacity"] == payload["dining_capacity"]
    assert created["has_kitchen"] is True
    assert created["website_url"] == payload["website_url"]
    assert created["notes"] == payload["notes"]

    list_resp = client.get("/api/v1/structures/")
    assert list_resp.status_code == 200
    data = list_resp.json()
    assert len(data) == 1
    assert data[0]["slug"] == payload["slug"]

    slug_resp = client.get("/api/v1/structures/by-slug/scout-training-center")
    assert slug_resp.status_code == 200
    assert slug_resp.json()["id"] == created["id"]


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
        "name": "Mario Rossi",
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
