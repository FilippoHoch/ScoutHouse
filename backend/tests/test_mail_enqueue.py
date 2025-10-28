import os
from types import SimpleNamespace
from typing import Generator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.config import get_settings  # noqa: E402
from app.core.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

from tests.utils import auth_headers, ensure_user  # noqa: E402


@pytest.fixture(autouse=True)
def reset_state() -> Generator[None, None, None]:
    get_settings.cache_clear()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    get_settings.cache_clear()


@pytest.fixture
def admin_client() -> TestClient:
    ensure_user(is_admin=True)
    client = TestClient(app)
    client.headers.update(auth_headers(client, is_admin=True))
    return client


def test_mail_test_enqueues(monkeypatch: pytest.MonkeyPatch, admin_client: TestClient) -> None:
    calls: list[dict[str, object]] = []

    def _enqueue(func, *args, **kwargs):
        kwargs = {key: value for key, value in kwargs.items() if key != "job_timeout"}
        calls.append({"func": func, "args": args, "kwargs": kwargs})
        return SimpleNamespace(id=str(uuid4()))

    monkeypatch.setattr("app.tasks.queue.queue.enqueue", _enqueue)

    response = admin_client.post(
        "/api/v1/mail/test",
        json={"to": "a@b.c", "template": "reset_password"},
    )

    assert response.status_code == 202
    assert len(calls) == 1
    payload = calls[0]["args"][0]
    assert payload["to"] == "a@b.c"
    assert payload["subject"]
    assert payload["html"]
    assert payload["text"]


def test_ops_queue_metrics(monkeypatch: pytest.MonkeyPatch, admin_client: TestClient) -> None:
    class DummyQueue:
        name = "dummy"
        count = 3

    def _started(queue):  # type: ignore[unused-argument]
        return ["job1", "job2"]

    def _failed(queue):  # type: ignore[unused-argument]
        return ["job3"]

    monkeypatch.setattr("app.api.v1.ops.queue", DummyQueue())
    monkeypatch.setattr("app.api.v1.ops.StartedJobRegistry", lambda queue: _started(queue))
    monkeypatch.setattr("app.api.v1.ops.FailedJobRegistry", lambda queue: _failed(queue))

    response = admin_client.get("/api/v1/ops/queue")
    assert response.status_code == 200
    body = response.json()
    assert body == {"queue": "dummy", "queued": 3, "started": 2, "failed": 1}


def test_mail_test_returns_job_id(monkeypatch: pytest.MonkeyPatch, admin_client: TestClient) -> None:
    job_id = str(uuid4())

    def _enqueue(func, *args, **kwargs):
        kwargs = {key: value for key, value in kwargs.items() if key != "job_timeout"}
        func(*args, **kwargs)
        return SimpleNamespace(id=job_id)

    monkeypatch.setattr("app.tasks.queue.queue.enqueue", _enqueue)

    response = admin_client.post(
        "/api/v1/mail/test",
        json={"to": "queue@example.com", "template": "reset_password"},
    )
    assert response.status_code == 202
    assert response.json()["job_id"] == job_id
