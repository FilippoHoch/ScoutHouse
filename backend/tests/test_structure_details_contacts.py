from collections.abc import Generator
import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

from tests.utils import auth_headers


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


def create_structure(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/structures/",
        json={
            "name": "Base Contatti",
            "slug": "base-contatti",
            "province": "MI",
            "type": "house",
        },
    )
    assert response.status_code == 201
    return response.json()


def add_contact(client: TestClient, structure_id: int) -> dict:
    response = client.post(
        f"/api/v1/structures/{structure_id}/contacts",
        json={
            "name": "Responsabile Casa",
            "email": "responsabile@example.com",
            "phone": "+39 045 1234567",
            "preferred_channel": "phone",
            "is_primary": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_structure_detail_includes_contacts() -> None:
    client = get_client(authenticated=True, is_admin=True)
    structure = create_structure(client)
    contact = add_contact(client, structure["id"])

    detail_without_contacts = client.get("/api/v1/structures/by-slug/base-contatti")
    assert detail_without_contacts.status_code == 200
    payload = detail_without_contacts.json()
    assert payload.get("contacts") is None

    detail_with_contacts = client.get(
        "/api/v1/structures/by-slug/base-contatti",
        params={"include": "contacts"},
    )
    assert detail_with_contacts.status_code == 200
    detail = detail_with_contacts.json()
    assert detail["contacts"]
    assert detail["contacts"][0]["id"] == contact["id"]
    assert detail["contacts"][0]["is_primary"] is True

    detail_with_details = client.get(
        "/api/v1/structures/by-slug/base-contatti",
        params={"include": "details"},
    )
    assert detail_with_details.status_code == 200
    detail_full = detail_with_details.json()
    assert detail_full["contacts"]
    assert detail_full["contacts"][0]["name"] == "Responsabile Casa"
