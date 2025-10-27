from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.db import SessionLocal
from app.core.limiter import TEST_RATE_LIMIT_HEADER
from app.core.security import hash_password
from app.models import User

TEST_USER_EMAIL = "test@example.com"
TEST_USER_PASSWORD = "password123"


def ensure_user(*, is_admin: bool = False) -> User:
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == TEST_USER_EMAIL).first()
        if user is None:
            user = User(
                name="Test User",
                email=TEST_USER_EMAIL,
                password_hash=hash_password(TEST_USER_PASSWORD),
                is_admin=is_admin,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        elif is_admin and not user.is_admin:
            user.is_admin = True
            db.add(user)
            db.commit()
            db.refresh(user)
        return user


def auth_headers(client: TestClient, *, is_admin: bool = False) -> dict[str, str]:
    ensure_user(is_admin=is_admin)
    response = client.post(
        "/api/v1/auth/login",
        json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD},
        headers={TEST_RATE_LIMIT_HEADER: str(uuid4())},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
