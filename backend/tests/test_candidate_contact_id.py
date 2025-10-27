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


def create_structure(client: TestClient, slug: str) -> dict:
    response = client.post(
        "/api/v1/structures/",
        json={
            "name": f"Struttura {slug}",
            "slug": slug,
            "province": "BS",
            "type": "house",
        },
    )
    assert response.status_code == 201
    return response.json()


def create_contact(client: TestClient, structure_id: int, name: str) -> dict:
    response = client.post(
        f"/api/v1/structures/{structure_id}/contacts",
        json={
            "name": name,
            "email": f"{name.replace(' ', '.').lower()}@example.com",
            "phone": "+39 333 0000000",
            "preferred_channel": "email",
            "is_primary": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_event(client: TestClient) -> dict:
    payload = {
        "title": "Campo Invernale",
        "branch": "LC",
        "start_date": "2025-01-15",
        "end_date": "2025-01-20",
        "participants": {"lc": 20, "leaders": 5},
    }
    response = client.post("/api/v1/events/", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_candidate_contact_assignment() -> None:
    client = get_client(authenticated=True, is_admin=True)

    structure = create_structure(client, "casa-contatti")
    other_structure = create_structure(client, "casa-altro")
    contact = create_contact(client, structure["id"], "Referente Contatti")
    other_contact = create_contact(client, other_structure["id"], "Altro Contatto")

    event = create_event(client)

    add_candidate = client.post(
        f"/api/v1/events/{event['id']}/candidates",
        json={"structure_id": structure["id"], "contact_id": contact["id"]},
    )
    assert add_candidate.status_code == 201, add_candidate.text
    candidate = add_candidate.json()
    assert candidate["contact_id"] == contact["id"]
    assert candidate["contact"]["id"] == contact["id"]

    clear_contact = client.patch(
        f"/api/v1/events/{event['id']}/candidates/{candidate['id']}",
        json={"contact_id": None},
    )
    assert clear_contact.status_code == 200, clear_contact.text
    cleared = clear_contact.json()
    assert cleared["contact_id"] is None
    assert cleared["contact"] is None

    invalid_contact = client.patch(
        f"/api/v1/events/{event['id']}/candidates/{candidate['id']}",
        json={"contact_id": other_contact["id"]},
    )
    assert invalid_contact.status_code == 400

    set_contact_again = client.patch(
        f"/api/v1/events/{event['id']}/candidates/{candidate['id']}",
        json={"contact_id": contact["id"]},
    )
    assert set_contact_again.status_code == 200, set_contact_again.text
    updated = set_contact_again.json()
    assert updated["contact_id"] == contact["id"]
    assert updated["contact"]["id"] == contact["id"]
