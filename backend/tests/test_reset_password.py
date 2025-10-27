import os
from uuid import uuid4
from typing import Generator

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import PasswordResetToken  # noqa: E402

from tests.utils import (  # noqa: E402
    TEST_RATE_LIMIT_HEADER,
    TEST_USER_EMAIL,
    TEST_USER_PASSWORD,
    auth_headers,
    ensure_user,
)


@pytest.fixture(autouse=True)
def setup_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def get_client(*, authenticated: bool = False) -> TestClient:
    client = TestClient(app)
    if authenticated:
        client.headers.update(auth_headers(client))
    return client


def test_password_reset_flow(monkeypatch: pytest.MonkeyPatch) -> None:
    ensure_user()
    client = get_client()

    captured: dict[str, str] = {}

    from app.api.v1 import auth as auth_module  # noqa: WPS433 - runtime patching

    original = auth_module.create_reset_token

    def capture_token(db, user):  # type: ignore[no-untyped-def]
        token_value, record = original(db, user)
        captured["token"] = token_value
        return token_value, record

    monkeypatch.setattr(auth_module, "create_reset_token", capture_token)

    response = client.post(
        "/api/v1/auth/forgot-password",
        json={"email": TEST_USER_EMAIL},
        headers={TEST_RATE_LIMIT_HEADER: str(uuid4())},
    )
    assert response.status_code == 202
    assert "token" in captured

    token_value = captured["token"]

    with SessionLocal() as db:
        tokens = db.query(PasswordResetToken).all()
        assert len(tokens) == 1
        assert tokens[0].used is False

    reset_resp = client.post(
        "/api/v1/auth/reset-password",
        json={"token": token_value, "password": "newpassword!"},
    )
    assert reset_resp.status_code == 204

    reuse = client.post(
        "/api/v1/auth/reset-password",
        json={"token": token_value, "password": "anotherpass!"},
    )
    assert reuse.status_code == 400

    old_login = client.post(
        "/api/v1/auth/login",
        json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD},
        headers={TEST_RATE_LIMIT_HEADER: str(uuid4())},
    )
    assert old_login.status_code == 401

    new_login = client.post(
        "/api/v1/auth/login",
        json={"email": TEST_USER_EMAIL, "password": "newpassword!"},
        headers={TEST_RATE_LIMIT_HEADER: str(uuid4())},
    )
    assert new_login.status_code == 200

    with SessionLocal() as db:
        record = db.query(PasswordResetToken).first()
        assert record is not None
        assert record.used is True
