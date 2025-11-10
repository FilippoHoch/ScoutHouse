import os
from collections.abc import Generator

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
            "name": "Casa Base",
            "slug": "casa-base",
            "province": "BS",
            "type": "mixed",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_contacts_crud_and_primary_uniqueness() -> None:
    client = get_client(authenticated=True, is_admin=True)
    structure = create_structure(client)

    create_primary = client.post(
        f"/api/v1/structures/{structure['id']}/contacts",
        json={
            "name": "Mario Rossi",
            "role": "Referente",
            "email": "mario.rossi@example.com",
            "phone": "+39 333 1234567",
            "preferred_channel": "email",
            "is_primary": True,
        },
    )
    assert create_primary.status_code == 201, create_primary.text
    first_contact = create_primary.json()
    assert first_contact["is_primary"] is True

    create_secondary = client.post(
        f"/api/v1/structures/{structure['id']}/contacts",
        json={
            "name": "Lucia Bianchi",
            "role": "Amministrazione",
            "email": "lucia.bianchi@example.com",
            "phone": "+39 02 99887766",
            "preferred_channel": "phone",
            "is_primary": False,
        },
    )
    assert create_secondary.status_code == 201, create_secondary.text
    second_contact = create_secondary.json()
    assert second_contact["is_primary"] is False

    list_response = client.get(f"/api/v1/structures/{structure['id']}/contacts")
    assert list_response.status_code == 200
    contacts = list_response.json()
    assert [contact["id"] for contact in contacts] == [first_contact["id"], second_contact["id"]]
    assert contacts[0]["is_primary"] is True

    promote_response = client.patch(
        f"/api/v1/structures/{structure['id']}/contacts/{second_contact['id']}",
        json={"is_primary": True},
    )
    assert promote_response.status_code == 200, promote_response.text
    promoted = promote_response.json()
    assert promoted["is_primary"] is True

    list_after_promote = client.get(f"/api/v1/structures/{structure['id']}/contacts")
    assert list_after_promote.status_code == 200
    promoted_contacts = list_after_promote.json()
    assert promoted_contacts[0]["id"] == second_contact["id"]
    assert promoted_contacts[0]["is_primary"] is True
    assert promoted_contacts[1]["is_primary"] is False

    delete_response = client.delete(
        f"/api/v1/structures/{structure['id']}/contacts/{first_contact['id']}"
    )
    assert delete_response.status_code == 204

    list_after_delete = client.get(f"/api/v1/structures/{structure['id']}/contacts")
    assert list_after_delete.status_code == 200
    remaining = list_after_delete.json()
    assert len(remaining) == 1
    assert remaining[0]["id"] == second_contact["id"]

    invalid_contact = client.post(
        f"/api/v1/structures/{structure['id']}/contacts",
        json={
            "name": "Contatto invalido",
            "email": "not-an-email",
        },
    )
    assert invalid_contact.status_code == 422
