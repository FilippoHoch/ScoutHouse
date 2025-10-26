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


def test_event_crud_flow() -> None:
    client = get_client()

    payload = {
        "title": "Winter Camp",
        "branch": "LC",
        "start_date": "2025-01-10",
        "end_date": "2025-01-12",
        "participants": {"lc": 12, "leaders": 3, "eg": 0, "rs": 0},
        "budget_total": 1500,
        "status": "planning",
    }

    response = client.post("/api/v1/events/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["slug"] == "winter-camp"
    event_id = data["id"]

    duplicate = client.post("/api/v1/events/", json=payload)
    assert duplicate.status_code == 201
    assert duplicate.json()["slug"] == "winter-camp-2"

    list_response = client.get("/api/v1/events/?page=1&page_size=5")
    assert list_response.status_code == 200
    list_data = list_response.json()
    assert list_data["total"] == 2
    assert len(list_data["items"]) == 2

    update_resp = client.patch(
        f"/api/v1/events/{event_id}",
        json={"status": "booked", "participants": {"lc": 15, "leaders": 4, "eg": 0, "rs": 0}},
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["status"] == "booked"
    assert updated["participants"]["lc"] == 15

    invalid = client.patch(
        f"/api/v1/events/{event_id}",
        json={"start_date": "2025-02-01"},
    )
    assert invalid.status_code == 400

    detail_resp = client.get(f"/api/v1/events/{event_id}?include=candidates,tasks")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["candidates"] == []
    assert detail["tasks"] == []
