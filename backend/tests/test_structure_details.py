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


def create_structure(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/structures/",
        json={
            "name": "Detail Base",
            "slug": "detail-base",
            "province": "BS",
            "type": "mixed",
        },
    )
    assert response.status_code == 201
    return response.json()


def test_structure_details_include_tabs() -> None:
    client = get_client(authenticated=True, is_admin=True)
    structure = create_structure(client)

    create_availability = client.post(
        f"/api/v1/structures/{structure['id']}/availabilities",
        json={
            "season": "spring",
            "units": ["LC", "EG", "RS"],
            "capacity_min": 30,
            "capacity_max": 120,
        },
    )
    assert create_availability.status_code == 201

    replace_availabilities = client.put(
        f"/api/v1/structures/{structure['id']}/availabilities",
        json=[
            {
                "id": create_availability.json()["id"],
                "season": "spring",
                "units": ["LC", "EG", "RS"],
                "capacity_min": 25,
                "capacity_max": 100,
            },
            {
                "season": "summer",
                "units": ["ALL"],
                "capacity_min": 80,
                "capacity_max": 300,
            },
        ],
    )
    assert replace_availabilities.status_code == 200
    assert len(replace_availabilities.json()) == 2

    create_cost = client.post(
        f"/api/v1/structures/{structure['id']}/cost-options",
        json={
            "model": "per_person_day",
            "amount": 10.0,
            "currency": "EUR",
            "city_tax_per_night": 1.0,
            "utilities_flat": 2.0,
        },
    )
    assert create_cost.status_code == 201

    replace_costs = client.put(
        f"/api/v1/structures/{structure['id']}/cost-options",
        json=[
            {
                "id": create_cost.json()["id"],
                "model": "per_person_day",
                "amount": 11.5,
                "currency": "EUR",
                "city_tax_per_night": 1.0,
                "utilities_flat": 2.5,
            },
            {
                "model": "forfait",
                "amount": 950.0,
                "currency": "EUR",
                "booking_deposit": 300.0,
            },
        ],
    )
    assert replace_costs.status_code == 200
    assert len(replace_costs.json()) == 2

    detail_response = client.get(
        "/api/v1/structures/by-slug/detail-base",
        params={"include": "details"},
    )
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["slug"] == "detail-base"
    assert detail["estimated_cost"] is not None
    assert detail["cost_band"] in {"cheap", "medium", "expensive"}
    assert len(detail["availabilities"]) == 2
    assert {availability["season"] for availability in detail["availabilities"]} == {"spring", "summer"}
    assert len(detail["cost_options"]) == 2
    assert any(option["model"] == "forfait" for option in detail["cost_options"])
