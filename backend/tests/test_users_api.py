from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from app.core.db import Base, engine
from app.main import app
from tests.utils import auth_headers


@pytest.fixture(autouse=True)
def _setup_db() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    try:
        yield
    finally:
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


def test_list_users_requires_admin(client: TestClient) -> None:
    response = client.get("/api/v1/users")
    assert response.status_code == 401

    headers = auth_headers(client, is_admin=False)
    response = client.get("/api/v1/users", headers=headers)
    assert response.status_code == 403


def test_default_admin_exists(client: TestClient) -> None:
    headers = auth_headers(client, is_admin=True)
    response = client.get("/api/v1/users", headers=headers)
    assert response.status_code == 200
    emails = [user["email"] for user in response.json()]
    assert "hoch.filippo@gmail.com" in emails


def test_admin_can_create_and_update_user(client: TestClient) -> None:
    headers = auth_headers(client, is_admin=True)

    create_payload = {
        "name": "Filippo Hoch",
        "email": "filippo@example.com",
        "password": "password123",
        "is_admin": False,
        "is_active": True,
        "user_type": "LC",
    }
    create_response = client.post("/api/v1/users", json=create_payload, headers=headers)
    assert create_response.status_code == 201, create_response.text
    created = create_response.json()
    assert created["email"] == create_payload["email"]
    assert created["is_admin"] is False
    assert created["is_active"] is True
    assert created["user_type"] == "LC"

    user_id = created["id"]

    update_payload = {
        "name": "Filippo Aggiornato",
        "email": "filippo.aggiornato@example.com",
        "password": "nuovasegreta",
        "is_admin": True,
        "is_active": False,
        "user_type": "LEADERS",
    }
    update_response = client.patch(f"/api/v1/users/{user_id}", json=update_payload, headers=headers)
    assert update_response.status_code == 200, update_response.text
    updated = update_response.json()
    assert updated["email"] == update_payload["email"]
    assert updated["is_admin"] is True
    assert updated["is_active"] is False
    assert updated["user_type"] == "LEADERS"

    # User should be unable to log in while disabled.
    disabled_login = client.post(
        "/api/v1/auth/login",
        json={"email": update_payload["email"], "password": update_payload["password"]},
    )
    assert disabled_login.status_code == 403

    # Re-enable and ensure login succeeds with the new password.
    reenable_response = client.patch(
        f"/api/v1/users/{user_id}",
        json={"is_active": True},
        headers=headers,
    )
    assert reenable_response.status_code == 200, reenable_response.text
    reenabled = reenable_response.json()
    assert reenabled["is_active"] is True

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": update_payload["email"], "password": update_payload["password"]},
    )
    assert login_response.status_code == 200, login_response.text


def test_cannot_create_duplicate_email(client: TestClient) -> None:
    headers = auth_headers(client, is_admin=True)

    payload = {
        "name": "User One",
        "email": "duplicate@example.com",
        "password": "password123",
        "is_admin": False,
        "is_active": True,
    }
    first = client.post("/api/v1/users", json=payload, headers=headers)
    assert first.status_code == 201, first.text

    second = client.post("/api/v1/users", json=payload, headers=headers)
    assert second.status_code == 400


def test_user_can_update_own_type(client: TestClient) -> None:
    headers = auth_headers(client, is_admin=False)

    response = client.patch(
        "/api/v1/auth/me",
        json={"user_type": "RS"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["user_type"] == "RS"

    clear_response = client.patch(
        "/api/v1/auth/me",
        json={"user_type": None},
        headers=headers,
    )
    assert clear_response.status_code == 200, clear_response.text
    assert clear_response.json()["user_type"] is None
