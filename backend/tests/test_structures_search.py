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


def seed_sample_structures(client: TestClient) -> None:
    structures = [
        {
            "name": "Campo Base Gussago",
            "slug": "campo-base-gussago",
            "province": "bs",
            "type": "mixed",
            "address": "Via Piazzetta 3, Gussago",
            "latitude": 45.5968,
            "longitude": 10.1658,
            "altitude": 320,
        },
        {
            "name": "Rifugio Panorama",
            "slug": "rifugio-panorama",
            "province": "BS",
            "type": "house",
            "address": "Località Monte Campione",
            "latitude": 45.7793,
            "longitude": 10.1774,
            "altitude": 1780,
        },
        {
            "name": "Campo Delta",
            "slug": "campo-delta",
            "province": "VR",
            "type": "land",
            "address": "Via del Lago 12, Lazise",
            "latitude": 45.5050,
            "longitude": 10.7360,
            "altitude": 68,
        },
        {
            "name": "Magazzino senza coordinate",
            "slug": "magazzino-senza-coordinate",
            "province": "MI",
            "type": "land",
        },
    ]

    for payload in structures:
        response = client.post("/api/v1/structures/", json=payload)
        assert response.status_code == 201


def test_search_pagination_and_sorting() -> None:
    client = get_client(authenticated=True, is_admin=True)
    seed_sample_structures(client)

    resp = client.get(
        "/api/v1/structures/search",
        params={"page": 1, "page_size": 2, "sort": "name", "order": "asc"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 4
    assert len(data["items"]) == 2
    assert [item["slug"] for item in data["items"]] == [
        "campo-base-gussago",
        "campo-delta",
    ]
    assert data["items"][0]["altitude"] == pytest.approx(320, rel=1e-3)

    resp_page_2 = client.get(
        "/api/v1/structures/search",
        params={"page": 2, "page_size": 2, "sort": "name", "order": "asc"},
    )
    assert [item["slug"] for item in resp_page_2.json()["items"]] == [
        "magazzino-senza-coordinate",
        "rifugio-panorama",
    ]


def test_distance_filter_and_sorting() -> None:
    client = get_client(authenticated=True, is_admin=True)
    seed_sample_structures(client)

    distance_sorted = client.get(
        "/api/v1/structures/search",
        params={"sort": "distance", "order": "asc"},
    )
    assert distance_sorted.status_code == 200
    distance_items = distance_sorted.json()["items"]
    assert [item["slug"] for item in distance_items] == [
        "campo-base-gussago",
        "rifugio-panorama",
        "campo-delta",
        "magazzino-senza-coordinate",
    ]
    assert distance_items[-1]["distance_km"] is None

    within_radius = client.get(
        "/api/v1/structures/search",
        params={"max_km": 25},
    )
    assert within_radius.status_code == 200
    within_slugs = [item["slug"] for item in within_radius.json()["items"]]
    assert within_slugs == ["campo-base-gussago", "rifugio-panorama"]

    tight_radius = client.get(
        "/api/v1/structures/search",
        params={"max_km": 5},
    )
    assert tight_radius.status_code == 200
    tight_slugs = [item["slug"] for item in tight_radius.json()["items"]]
    assert tight_slugs == ["campo-base-gussago"]


def test_distance_sort_desc_places_missing_coords_last() -> None:
    client = get_client(authenticated=True, is_admin=True)
    seed_sample_structures(client)

    response = client.get(
        "/api/v1/structures/search",
        params={"sort": "distance", "order": "desc"},
    )
    assert response.status_code == 200
    items = response.json()["items"]

    assert [item["slug"] for item in items] == [
        "campo-delta",
        "rifugio-panorama",
        "campo-base-gussago",
        "magazzino-senza-coordinate",
    ]
    assert items[-1]["distance_km"] is None


def test_search_filters_by_query_and_province() -> None:
    client = get_client(authenticated=True, is_admin=True)
    seed_sample_structures(client)

    resp = client.get(
        "/api/v1/structures/search",
        params={"q": "lago", "province": "vr"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["slug"] == "campo-delta"


def test_invalid_sort_parameter() -> None:
    client = get_client(authenticated=True, is_admin=True)
    seed_sample_structures(client)

    resp = client.get("/api/v1/structures/search", params={"sort": "unknown"})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid sort field"
