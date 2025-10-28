import os
from typing import Generator

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.config import get_settings  # noqa: E402
from app.core.db import Base, engine  # noqa: E402
from app.core.mail import override_mail_provider, reset_mail_provider  # noqa: E402
from app.main import app  # noqa: E402

from tests.utils import auth_headers, ensure_user  # noqa: E402


class PreviewStub:
    name = "console"

    def __init__(self) -> None:
        self.messages: list[dict[str, str]] = []

    def send(self, *, to: str, subject: str, html: str, text: str) -> None:
        self.messages.append({"to": to, "subject": subject, "html": html, "text": text})


@pytest.fixture(autouse=True)
def reset_state() -> Generator[None, None, None]:
    get_settings.cache_clear()
    reset_mail_provider()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    reset_mail_provider()
    get_settings.cache_clear()


@pytest.fixture
def stub_provider() -> Generator[PreviewStub, None, None]:
    stub = PreviewStub()
    override_mail_provider(stub)
    yield stub
    override_mail_provider(None)


def get_admin_client() -> TestClient:
    client = TestClient(app)
    client.headers.update(auth_headers(client, is_admin=True))
    return client


def test_admin_can_preview_templates(stub_provider: PreviewStub) -> None:
    ensure_user(is_admin=True)
    client = get_admin_client()
    response = client.get("/api/v1/mail/preview", params={"template": "reset_password", "sample": True})
    assert response.status_code == 200
    body = response.json()
    assert body["template"] == "reset_password"
    assert "password" in body["subject"].lower()
    assert "reset-password" in body["html"]


def test_admin_can_send_test_mail(stub_provider: PreviewStub) -> None:
    ensure_user(is_admin=True)
    client = get_admin_client()
    payload = {"to": "admin@example.com", "template": "task_assigned"}
    response = client.post("/api/v1/mail/test", json=payload)
    assert response.status_code == 200
    assert response.json()["provider"] == "console"
    assert len(stub_provider.messages) == 1
    assert stub_provider.messages[0]["to"] == "admin@example.com"
