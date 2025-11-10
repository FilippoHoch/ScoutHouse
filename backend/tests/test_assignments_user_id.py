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
from tests.utils import (  # noqa: E402
    TEST_RATE_LIMIT_HEADER,
    TEST_USER_PASSWORD,
    auth_headers,
    create_user,
)


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


def create_structure() -> int:
    with SessionLocal() as db:
        structure = Structure(
            name="Assignment Base",
            slug="assignment-base",
            province="MI",
            type=StructureType.HOUSE,
        )
        db.add(structure)
        db.commit()
        return structure.id


def login_headers(client: TestClient, email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": TEST_USER_PASSWORD},
        headers={TEST_RATE_LIMIT_HEADER: str(uuid4())},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_assignment_responses_include_user_details() -> None:
    structure_id = create_structure()

    owner_client = get_client(authenticated=True)
    event_resp = owner_client.post(
        "/api/v1/events/",
        json={
            "title": "Assignments",
            "branch": "LC",
            "start_date": "2025-04-01",
            "end_date": "2025-04-02",
            "participants": {"lc": 5, "leaders": 1, "eg": 0, "rs": 0},
        },
    )
    assert event_resp.status_code == 201
    event_id = event_resp.json()["id"]

    assignee_email = "assignee@example.com"
    assignee = create_user(email=assignee_email, name="Assigned User")

    add_member = owner_client.post(
        f"/api/v1/events/{event_id}/members",
        json={"email": assignee_email, "role": "collab"},
    )
    assert add_member.status_code == 201

    candidate_resp = owner_client.post(
        f"/api/v1/events/{event_id}/candidates",
        json={"structure_id": structure_id, "assigned_user_id": assignee.id},
    )
    assert candidate_resp.status_code == 201
    candidate = candidate_resp.json()
    assert candidate["assigned_user_id"] == assignee.id
    assert candidate["assigned_user_name"] == "Assigned User"

    task_resp = owner_client.post(
        f"/api/v1/events/{event_id}/tasks",
        json={
            "structure_id": structure_id,
            "assigned_user_id": assignee.id,
            "status": "todo",
            "outcome": "pending",
        },
    )
    assert task_resp.status_code == 201
    task = task_resp.json()
    assert task["assigned_user_id"] == assignee.id
    assert task["assigned_user_name"] == "Assigned User"

    assignee_client = get_client()
    headers = login_headers(assignee_client, assignee_email)
    detail = assignee_client.get(
        f"/api/v1/events/{event_id}?include=candidates,tasks",
        headers=headers,
    )
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["candidates"][0]["assigned_user_name"] == "Assigned User"
    assert payload["tasks"][0]["assigned_user_name"] == "Assigned User"
