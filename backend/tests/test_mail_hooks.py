from __future__ import annotations

from typing import Generator

import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.config import get_settings  # noqa: E402
from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.core.mail import override_mail_provider, reset_mail_provider  # noqa: E402
from app.main import app  # noqa: E402
from app.models import EventMemberRole, Structure, StructureType  # noqa: E402

from tests.utils import (  # noqa: E402
    TEST_RATE_LIMIT_HEADER,
    TEST_USER_EMAIL,
    create_user,
    ensure_user,
    auth_headers,
)


class StubMailProvider:
    name = "console"

    def __init__(self) -> None:
        self.messages: list[dict[str, str]] = []

    def send(self, *, to: str, subject: str, html: str, text: str) -> None:
        self.messages.append({"to": to, "subject": subject, "html": html, "text": text})


@pytest.fixture(autouse=True)
def setup_database() -> Generator[None, None, None]:
    get_settings.cache_clear()
    reset_mail_provider()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    reset_mail_provider()
    get_settings.cache_clear()


@pytest.fixture
def mail_stub() -> Generator[StubMailProvider, None, None]:
    stub = StubMailProvider()
    override_mail_provider(stub)
    yield stub
    override_mail_provider(None)


def get_client(*, authenticated: bool = False, is_admin: bool = False) -> TestClient:
    client = TestClient(app)
    if authenticated:
        client.headers.update(auth_headers(client, is_admin=is_admin))
    return client


def test_password_reset_triggers_mail(mail_stub: StubMailProvider) -> None:
    ensure_user()
    client = get_client()
    response = client.post(
        "/api/v1/auth/forgot-password",
        json={"email": TEST_USER_EMAIL},
        headers={TEST_RATE_LIMIT_HEADER: "rate-test"},
    )
    assert response.status_code == 202
    assert len(mail_stub.messages) == 1
    message = mail_stub.messages[0]
    assert message["to"] == TEST_USER_EMAIL
    assert "password" in message["subject"].lower()
    assert "/reset-password" in message["html"]


def test_task_assignment_emails_assignee(mail_stub: StubMailProvider) -> None:
    ensure_user()
    assignee = create_user(email="assign@example.com", name="Assign User")
    other = create_user(email="other@example.com", name="Other User")
    client = get_client(authenticated=True)

    event_payload = {
        "title": "Winter Camp",
        "branch": "LC",
        "start_date": "2025-02-01",
        "end_date": "2025-02-03",
        "participants": {"lc": 10, "leaders": 2, "eg": 0, "rs": 0},
        "status": "planning",
    }
    event_resp = client.post("/api/v1/events/", json=event_payload)
    assert event_resp.status_code == 201
    event_id = event_resp.json()["id"]

    # invite assignees
    invite_resp = client.post(
        f"/api/v1/events/{event_id}/members",
        json={"email": assignee.email, "role": EventMemberRole.COLLAB.value},
    )
    assert invite_resp.status_code == 201
    assignee_id = invite_resp.json()["user"]["id"]

    invite2 = client.post(
        f"/api/v1/events/{event_id}/members",
        json={"email": other.email, "role": EventMemberRole.COLLAB.value},
    )
    assert invite2.status_code == 201
    other_id = invite2.json()["user"]["id"]

    # create task assigned to first user
    task_resp = client.post(
        f"/api/v1/events/{event_id}/tasks",
        json={
            "structure_id": None,
            "assigned_user_id": assignee_id,
            "notes": "Verifica disponibilità",
        },
    )
    assert task_resp.status_code == 201
    task_id = task_resp.json()["id"]
    assert len(mail_stub.messages) == 1
    assert mail_stub.messages[0]["to"] == assignee.email

    mail_stub.messages.clear()

    # change assignment to second user
    update_resp = client.patch(
        f"/api/v1/events/{event_id}/tasks/{task_id}",
        json={"assigned_user_id": other_id},
    )
    assert update_resp.status_code == 200
    assert len(mail_stub.messages) == 1
    assert mail_stub.messages[0]["to"] == other.email


def test_candidate_status_change_notifies_members(mail_stub: StubMailProvider) -> None:
    ensure_user()
    assignee = create_user(email="candidate@example.com", name="Candidate Owner")
    client = get_client(authenticated=True)

    event_payload = {
        "title": "Spring Trek",
        "branch": "EG",
        "start_date": "2025-04-10",
        "end_date": "2025-04-12",
        "participants": {"lc": 0, "leaders": 2, "eg": 12, "rs": 0},
        "status": "planning",
    }
    event_resp = client.post("/api/v1/events/", json=event_payload)
    assert event_resp.status_code == 201
    event_id = event_resp.json()["id"]

    invite_resp = client.post(
        f"/api/v1/events/{event_id}/members",
        json={"email": assignee.email, "role": EventMemberRole.COLLAB.value},
    )
    assert invite_resp.status_code == 201
    assignee_id = invite_resp.json()["user"]["id"]

    with SessionLocal() as db:
        structure = Structure(name="Casa Bosco", slug="casa-bosco", type=StructureType.HOUSE)
        db.add(structure)
        db.commit()
        db.refresh(structure)
        structure_id = structure.id

    candidate_resp = client.post(
        f"/api/v1/events/{event_id}/candidates",
        json={"structure_id": structure_id, "assigned_user_id": assignee_id},
    )
    assert candidate_resp.status_code == 201
    candidate_id = candidate_resp.json()["id"]

    mail_stub.messages.clear()

    update_resp = client.patch(
        f"/api/v1/events/{event_id}/candidates/{candidate_id}",
        json={"status": "confirmed"},
    )
    assert update_resp.status_code == 200
    recipients = {message["to"] for message in mail_stub.messages}
    assert TEST_USER_EMAIL in recipients
    assert assignee.email in recipients
    assert len(recipients) == 2
