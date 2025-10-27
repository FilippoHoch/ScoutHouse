from __future__ import annotations

import asyncio
import json
import os
from collections.abc import AsyncIterator, Generator

import httpx
import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"

from app.core.pubsub import EventMessage, event_bus
from app.main import app

from tests.utils import auth_headers

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")


@pytest.fixture(autouse=True)
def setup_database() -> Generator[None, None, None]:
    from app.core.db import Base, engine  # imported lazily to respect env vars

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


async def test_sse_single_event(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    headers = auth_headers(client)
    client.headers.update(headers)
    token = headers["Authorization"].split(" ", 1)[1]

    event = client.post(
        "/api/v1/events/",
        json={
            "title": "Realtime Camp",
            "branch": "LC",
            "start_date": "2025-08-01",
            "end_date": "2025-08-05",
            "participants": {},
        },
    ).json()
    event_id = event["id"]

    def fake_subscribe() -> AsyncIterator[EventMessage]:
        async def generator() -> AsyncIterator[EventMessage]:
            yield EventMessage("test", "candidate_updated", {"event_id": event_id})

        return generator()

    monkeypatch.setattr(event_bus, "subscribe", fake_subscribe)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        async with async_client.stream(
            "GET",
            f"/api/v1/events/{event_id}/live",
            params={"access_token": token},
        ) as response:
            await asyncio.sleep(0.05)

            buffer = ""
            try:
                async with asyncio.timeout(5):
                    async for chunk in response.aiter_bytes():
                        buffer += chunk.decode()
                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            if not line or not line.startswith("data: "):
                                continue
                            payload = json.loads(line[len("data: ") :])
                            if payload.get("type") == "keepalive":
                                continue
                            assert payload["type"] == "candidate_updated"
                            assert payload["event_id"] == event_id
                            assert payload["payload"] == {"event_id": event_id}
                            return
                    else:  # pragma: no cover - safety net
                        pytest.fail("Stream closed without data")
            except asyncio.TimeoutError:
                pytest.fail("Timed out waiting for SSE payload")
