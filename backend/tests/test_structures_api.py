import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def setup_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def get_client() -> TestClient:
    return TestClient(app)


def test_structures_flow() -> None:
    client = get_client()

    response = client.get("/api/v1/structures/")
    assert response.status_code == 200
    assert response.json() == []

    payload = {
        "name": "Scout Training Center",
        "slug": "scout-training-center",
        "province": "MI",
        "type": "training",
    }

    create_resp = client.post("/api/v1/structures/", json=payload)
    assert create_resp.status_code == 201
    created = create_resp.json()
    for key, value in payload.items():
        assert created[key] == value

    list_resp = client.get("/api/v1/structures/")
    assert list_resp.status_code == 200
    data = list_resp.json()
    assert len(data) == 1
    assert data[0]["slug"] == payload["slug"]
