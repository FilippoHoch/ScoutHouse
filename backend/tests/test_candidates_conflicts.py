import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.db import Base, engine, SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Structure, StructureType  # noqa: E402


@pytest.fixture(autouse=True)
def setup_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def get_client() -> TestClient:
    return TestClient(app)


def create_structure() -> int:
    with SessionLocal() as session:
        structure = Structure(
            name="Casa Scout",
            slug="casa-scout",
            province="MI",
            type=StructureType.HOUSE,
        )
        session.add(structure)
        session.commit()
        return structure.id


def test_confirm_conflict_blocked() -> None:
    client = get_client()
    structure_id = create_structure()

    event1 = client.post(
        "/api/v1/events/",
        json={
            "title": "Camp 1",
            "branch": "LC",
            "start_date": "2025-06-01",
            "end_date": "2025-06-05",
            "participants": {},
        },
    ).json()

    event2 = client.post(
        "/api/v1/events/",
        json={
            "title": "Camp 2",
            "branch": "LC",
            "start_date": "2025-06-03",
            "end_date": "2025-06-06",
            "participants": {},
        },
    ).json()

    candidate1 = client.post(
        f"/api/v1/events/{event1['id']}/candidates",
        json={"structure_id": structure_id},
    ).json()

    confirm1 = client.patch(
        f"/api/v1/events/{event1['id']}/candidates/{candidate1['id']}",
        json={"status": "confirmed"},
    )
    assert confirm1.status_code == 200

    candidate2_resp = client.post(
        f"/api/v1/events/{event2['id']}/candidates",
        json={"structure_id": structure_id},
    )
    assert candidate2_resp.status_code == 201
    candidate2 = candidate2_resp.json()

    conflict = client.patch(
        f"/api/v1/events/{event2['id']}/candidates/{candidate2['id']}",
        json={"status": "confirmed"},
    )
    assert conflict.status_code == 409

    move_dates = client.patch(
        f"/api/v1/events/{event2['id']}",
        json={"start_date": "2025-06-10", "end_date": "2025-06-12"},
    )
    assert move_dates.status_code == 200

    succeed = client.patch(
        f"/api/v1/events/{event2['id']}/candidates/{candidate2['id']}",
        json={"status": "confirmed"},
    )
    assert succeed.status_code == 200
