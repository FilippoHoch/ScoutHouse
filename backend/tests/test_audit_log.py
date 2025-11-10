import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import AuditLog  # noqa: E402
from tests.utils import auth_headers, ensure_user, participants_payload  # noqa: E402


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


def test_audit_entries_created_for_core_actions() -> None:
    ensure_user(is_admin=True)
    admin_client = get_client(authenticated=True, is_admin=True)
    structure_resp = admin_client.post(
        "/api/v1/structures/",
        json={
            "name": "Audit Structure",
            "slug": "audit-structure",
            "province": "MI",
            "type": "house",
        },
    )
    assert structure_resp.status_code == 201
    structure_id = structure_resp.json()["id"]

    cost_resp = admin_client.post(
        f"/api/v1/structures/{structure_id}/cost-options",
        json={"model": "per_person_day", "amount": 12, "currency": "EUR"},
    )
    assert cost_resp.status_code == 201

    owner_client = get_client(authenticated=True)
    event_resp = owner_client.post(
        "/api/v1/events/",
        json={
            "title": "Audit Event",
            "branch": "LC",
            "start_date": "2025-05-01",
            "end_date": "2025-05-03",
            "participants": participants_payload(lc=10, leaders=2),
        },
    )
    assert event_resp.status_code == 201
    event_id = event_resp.json()["id"]

    update_resp = owner_client.patch(
        f"/api/v1/events/{event_id}",
        json={"notes": "Updated notes"},
    )
    assert update_resp.status_code == 200

    candidate_resp = owner_client.post(
        f"/api/v1/events/{event_id}/candidates",
        json={"structure_id": structure_id},
    )
    assert candidate_resp.status_code == 201

    quote_resp = owner_client.post(
        f"/api/v1/events/{event_id}/quotes",
        json={"structure_id": structure_id, "scenario": "base", "overrides": {}},
    )
    assert quote_resp.status_code == 201

    with SessionLocal() as db:
        actions = [log.action for log in db.query(AuditLog).order_by(AuditLog.id).all()]

    expected = {
        "structure.create",
        "structure.cost_option.create",
        "event.create",
        "event.update",
        "event.candidate.create",
        "quote.create",
    }
    assert expected.issubset(set(actions))

    with SessionLocal() as db:
        update_log = (
            db.query(AuditLog)
            .filter(AuditLog.action == "event.update")
            .order_by(AuditLog.id.desc())
            .first()
        )
        assert update_log is not None
        assert isinstance(update_log.diff, dict)
        assert "before" in update_log.diff and "after" in update_log.diff
