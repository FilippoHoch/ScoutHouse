import os
from collections.abc import Generator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.config import get_settings  # noqa: E402
from app.core.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import EventMemberRole  # noqa: E402
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


def login_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers={TEST_RATE_LIMIT_HEADER: str(uuid4())},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_structure_creation_requires_admin() -> None:
    client = get_client(authenticated=True)
    payload = {"name": "Test", "slug": "test", "province": "MI", "type": "house"}

    forbidden = client.post("/api/v1/structures/", json=payload)
    assert forbidden.status_code == 403

    admin_client = get_client(authenticated=True, is_admin=True)
    created = admin_client.post("/api/v1/structures/", json=payload)
    assert created.status_code == 201


def test_structure_creation_allowed_for_non_admin_when_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ALLOW_NON_ADMIN_STRUCTURE_EDIT", "true")
    get_settings.cache_clear()
    try:
        client = get_client(authenticated=True, is_admin=False)
        payload = {"name": "User Test", "slug": "user-test", "province": "MI", "type": "house"}

        created = client.post("/api/v1/structures/", json=payload)
        assert created.status_code == 201
    finally:
        get_settings.cache_clear()


def test_event_visibility_requires_membership() -> None:
    owner_client = get_client(authenticated=True)
    event = owner_client.post(
        "/api/v1/events/",
        json={
            "title": "Secret Event",
            "branch": "LC",
            "start_date": "2025-01-01",
            "end_date": "2025-01-03",
            "participants": {"lc": 10, "leaders": 2, "eg": 0, "rs": 0},
        },
    )
    assert event.status_code == 201
    event_id = event.json()["id"]

    other_email = "other@example.com"
    create_user(email=other_email, name="Other User")
    other_client = get_client()
    other_headers = login_headers(other_client, other_email, TEST_USER_PASSWORD)

    view = other_client.get(f"/api/v1/events/{event_id}", headers=other_headers)
    assert view.status_code == 403


def test_event_update_requires_collaborator_role() -> None:
    owner_client = get_client(authenticated=True)
    event_resp = owner_client.post(
        "/api/v1/events/",
        json={
            "title": "Role Test",
            "branch": "LC",
            "start_date": "2025-02-01",
            "end_date": "2025-02-03",
            "participants": {"lc": 5, "leaders": 1, "eg": 0, "rs": 0},
        },
    )
    assert event_resp.status_code == 201
    event_id = event_resp.json()["id"]

    viewer_email = "viewer@example.com"
    create_user(email=viewer_email, name="Viewer User")

    add_member = owner_client.post(
        f"/api/v1/events/{event_id}/members",
        json={"email": viewer_email, "role": EventMemberRole.VIEWER.value},
    )
    assert add_member.status_code == 201
    member_id = add_member.json()["id"]

    viewer_client = get_client()
    viewer_headers = login_headers(viewer_client, viewer_email, TEST_USER_PASSWORD)

    forbidden = viewer_client.patch(
        f"/api/v1/events/{event_id}",
        json={"notes": "Trying update"},
        headers=viewer_headers,
    )
    assert forbidden.status_code == 403

    promote = owner_client.patch(
        f"/api/v1/events/{event_id}/members/{member_id}",
        json={"role": EventMemberRole.COLLAB.value},
    )
    assert promote.status_code == 200

    allowed = viewer_client.patch(
        f"/api/v1/events/{event_id}",
        json={"notes": "Updated"},
        headers=viewer_headers,
    )
    assert allowed.status_code == 200
    assert allowed.json()["notes"] == "Updated"


def test_quote_creation_requires_membership() -> None:
    owner_client = get_client(authenticated=True)
    event = owner_client.post(
        "/api/v1/events/",
        json={
            "title": "Quote Event",
            "branch": "LC",
            "start_date": "2025-03-01",
            "end_date": "2025-03-02",
            "participants": {"lc": 8, "leaders": 2, "eg": 0, "rs": 0},
        },
    )
    assert event.status_code == 201
    event_id = event.json()["id"]

    outsider_email = "outsider@example.com"
    create_user(email=outsider_email, name="Outsider")
    outsider_client = get_client()
    outsider_headers = login_headers(outsider_client, outsider_email, TEST_USER_PASSWORD)

    response = outsider_client.post(
        f"/api/v1/events/{event_id}/quotes",
        json={"structure_id": 9999, "scenario": "base", "overrides": {}},
        headers=outsider_headers,
    )
    assert response.status_code == 403
