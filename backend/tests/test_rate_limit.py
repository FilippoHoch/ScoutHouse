import os
from email.utils import parsedate_to_datetime
from uuid import uuid4
from typing import Generator

import pytest
from fastapi.testclient import TestClient


def _assert_rate_limit_headers(response) -> None:
    retry_after = response.headers.get("Retry-After")
    assert retry_after is not None
    assert retry_after.strip()
    try:
        float(retry_after)
    except ValueError:
        parsedate_to_datetime(retry_after)

    limit = response.headers.get("X-RateLimit-Limit")
    assert limit is not None

    remaining = response.headers.get("X-RateLimit-Remaining")
    assert remaining is not None
    assert int(remaining) <= 0

    reset = response.headers.get("X-RateLimit-Reset")
    assert reset is not None
    float(reset)

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

from tests.utils import (  # noqa: E402
    TEST_RATE_LIMIT_HEADER,
    TEST_USER_EMAIL,
    TEST_USER_PASSWORD,
    ensure_user,
)


@pytest.fixture(autouse=True)
def setup_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def get_client() -> TestClient:
    return TestClient(app)


def test_login_rate_limit_triggered() -> None:
    ensure_user()
    client = get_client()
    payload = {"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}

    for _ in range(5):
        resp = client.post(
            "/api/v1/auth/login",
            json=payload,
            headers={TEST_RATE_LIMIT_HEADER: "login-limit"},
        )
        assert resp.status_code == 200

    blocked = client.post(
        "/api/v1/auth/login",
        json=payload,
        headers={TEST_RATE_LIMIT_HEADER: "login-limit"},
    )
    assert blocked.status_code == 429
    _assert_rate_limit_headers(blocked)


def test_forgot_password_rate_limit() -> None:
    ensure_user()
    client = get_client()

    for _ in range(5):
        resp = client.post(
            "/api/v1/auth/forgot-password",
            json={"email": TEST_USER_EMAIL},
            headers={TEST_RATE_LIMIT_HEADER: "forgot-limit"},
        )
        assert resp.status_code == 202

    blocked = client.post(
        "/api/v1/auth/forgot-password",
        json={"email": TEST_USER_EMAIL},
        headers={TEST_RATE_LIMIT_HEADER: "forgot-limit"},
    )
    assert blocked.status_code == 429
    _assert_rate_limit_headers(blocked)


def test_refresh_rate_limit() -> None:
    ensure_user()
    client = get_client()

    login = client.post(
        "/api/v1/auth/login",
        json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD},
        headers={TEST_RATE_LIMIT_HEADER: str(uuid4())},
    )
    assert login.status_code == 200

    for _ in range(30):
        resp = client.post(
            "/api/v1/auth/refresh",
            headers={TEST_RATE_LIMIT_HEADER: "refresh-limit"},
        )
        assert resp.status_code in {200, 401}

    blocked = client.post(
        "/api/v1/auth/refresh",
        headers={TEST_RATE_LIMIT_HEADER: "refresh-limit"},
    )
    assert blocked.status_code == 429
    _assert_rate_limit_headers(blocked)
