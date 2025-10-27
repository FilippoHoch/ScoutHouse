from __future__ import annotations

import os
from collections.abc import Generator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Structure, StructureType  # noqa: E402

from tests.utils import auth_headers  # noqa: E402


@pytest.fixture(autouse=True)
def setup_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def get_client() -> TestClient:
    client = TestClient(app)
    client.headers.update(auth_headers(client))
    return client


def create_structure() -> int:
    with SessionLocal() as session:
        identifier = uuid4().hex
        structure = Structure(
            name=f"Casa Scout {identifier[:6]}",
            slug=f"casa-scout-{identifier[:6]}",
            province="MI",
            type=StructureType.HOUSE,
        )
        session.add(structure)
        session.commit()
        session.refresh(structure)
        return structure.id


def create_event(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/events/",
        json={
            "title": "Publish Test",
            "branch": "LC",
            "start_date": "2025-07-01",
            "end_date": "2025-07-02",
            "participants": {},
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_candidate_publish_hooks(monkeypatch: pytest.MonkeyPatch) -> None:
    client = get_client()
    structure_id = create_structure()
    event = create_event(client)

    calls: list[tuple[str, dict[str, int]]] = []

    def fake_publish(event_type: str, payload: dict[str, int]) -> str:
        calls.append((event_type, payload))
        return "evt"

    monkeypatch.setattr("app.api.v1.events.event_bus.publish", fake_publish)

    response = client.post(
        f"/api/v1/events/{event['id']}/candidates",
        json={"structure_id": structure_id},
    )

    assert response.status_code == 201
    assert ("candidate_updated", {"event_id": event["id"]}) in calls
    assert ("summary_updated", {"event_id": event["id"]}) in calls


def test_candidate_update_publish_hooks(monkeypatch: pytest.MonkeyPatch) -> None:
    client = get_client()
    structure_id = create_structure()
    event = create_event(client)
    candidate = client.post(
        f"/api/v1/events/{event['id']}/candidates",
        json={"structure_id": structure_id},
    ).json()

    calls: list[tuple[str, dict[str, int]]] = []

    def fake_publish(event_type: str, payload: dict[str, int]) -> str:
        calls.append((event_type, payload))
        return "evt"

    monkeypatch.setattr("app.api.v1.events.event_bus.publish", fake_publish)

    response = client.patch(
        f"/api/v1/events/{event['id']}/candidates/{candidate['id']}",
        json={"status": "available"},
    )

    assert response.status_code == 200
    assert ("candidate_updated", {"event_id": event["id"]}) in calls
    assert ("summary_updated", {"event_id": event["id"]}) in calls


def test_task_publish_hooks(monkeypatch: pytest.MonkeyPatch) -> None:
    client = get_client()
    event = create_event(client)

    calls: list[tuple[str, dict[str, int]]] = []

    def fake_publish(event_type: str, payload: dict[str, int]) -> str:
        calls.append((event_type, payload))
        return "evt"

    monkeypatch.setattr("app.api.v1.events.event_bus.publish", fake_publish)

    response = client.post(
        f"/api/v1/events/{event['id']}/tasks",
        json={"notes": "Call the owner", "status": "todo", "outcome": "pending"},
    )

    assert response.status_code == 201
    assert ("task_updated", {"event_id": event["id"]}) in calls
    assert ("summary_updated", {"event_id": event["id"]}) in calls


def test_task_update_publish_hooks(monkeypatch: pytest.MonkeyPatch) -> None:
    client = get_client()
    event = create_event(client)
    task = client.post(
        f"/api/v1/events/{event['id']}/tasks",
        json={"notes": "Initial", "status": "todo", "outcome": "pending"},
    ).json()

    calls: list[tuple[str, dict[str, int]]] = []

    def fake_publish(event_type: str, payload: dict[str, int]) -> str:
        calls.append((event_type, payload))
        return "evt"

    monkeypatch.setattr("app.api.v1.events.event_bus.publish", fake_publish)

    response = client.patch(
        f"/api/v1/events/{event['id']}/tasks/{task['id']}",
        json={"status": "done"},
    )

    assert response.status_code == 200
    assert ("task_updated", {"event_id": event["id"]}) in calls
    assert ("summary_updated", {"event_id": event["id"]}) in calls


def test_event_update_summary_publish(monkeypatch: pytest.MonkeyPatch) -> None:
    client = get_client()
    event = create_event(client)

    calls: list[tuple[str, dict[str, int]]] = []

    def fake_publish(event_type: str, payload: dict[str, int]) -> str:
        calls.append((event_type, payload))
        return "evt"

    monkeypatch.setattr("app.api.v1.events.event_bus.publish", fake_publish)

    response = client.patch(
        f"/api/v1/events/{event['id']}",
        json={"status": "planning"},
    )

    assert response.status_code == 200
    assert ("summary_updated", {"event_id": event["id"]}) in calls
