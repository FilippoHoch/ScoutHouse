from __future__ import annotations

import os
from typing import Generator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Structure, StructureType  # noqa: E402

from tests.utils import auth_headers  # noqa: E402


@pytest.fixture(autouse=True)
def setup_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def get_client() -> TestClient:
    client = TestClient(app)
    client.headers.update(auth_headers(client))
    return client


def create_structure(
    *,
    structure_type: StructureType,
    indoor_beds: int | None = None,
    pitches_tende: int | None = None,
) -> int:
    with SessionLocal() as session:
        identifier = uuid4().hex
        structure = Structure(
            name=f"Struttura {identifier[:6]}",
            slug=f"struttura-{identifier[:6]}",
            province="MI",
            type=structure_type,
            indoor_beds=indoor_beds,
            pitches_tende=pitches_tende,
        )
        session.add(structure)
        session.commit()
        session.refresh(structure)
        return structure.id


def test_create_event_with_branch_segments() -> None:
    client = get_client()
    response = client.post(
        "/api/v1/events/",
        json={
            "title": "Campo di gruppo",
            "branch": "ALL",
            "start_date": "2025-07-01",
            "end_date": "2025-07-10",
            "participants": {},
            "branch_segments": [
                {
                    "branch": "EG",
                    "start_date": "2025-07-01",
                    "end_date": "2025-07-10",
                    "youth_count": 28,
                    "leaders_count": 4,
                    "accommodation": "tents",
                },
                {
                    "branch": "LC",
                    "start_date": "2025-07-05",
                    "end_date": "2025-07-10",
                    "youth_count": 24,
                    "leaders_count": 2,
                    "accommodation": "indoor",
                },
            ],
        },
    )

    assert response.status_code == 201, response.text
    payload = response.json()

    assert payload["participants"]["eg"] == 28
    assert payload["participants"]["lc"] == 24
    assert payload["participants"]["leaders"] == 6
    assert len(payload["branch_segments"]) == 2
    assert {segment["accommodation"] for segment in payload["branch_segments"]} == {
        "tents",
        "indoor",
    }


def test_suggestions_reflect_branch_requirements() -> None:
    client = get_client()

    valid_structure_id = create_structure(
        structure_type=StructureType.MIXED,
        indoor_beds=70,
        pitches_tende=60,
    )
    create_structure(
        structure_type=StructureType.MIXED,
        indoor_beds=30,
        pitches_tende=80,
    )
    create_structure(
        structure_type=StructureType.HOUSE,
        indoor_beds=80,
    )

    event_response = client.post(
        "/api/v1/events/",
        json={
            "title": "Campo estivo",
            "branch": "ALL",
            "start_date": "2025-07-01",
            "end_date": "2025-07-08",
            "participants": {},
            "branch_segments": [
                {
                    "branch": "EG",
                    "start_date": "2025-07-01",
                    "end_date": "2025-07-08",
                    "youth_count": 40,
                    "leaders_count": 5,
                    "accommodation": "tents",
                },
                {
                    "branch": "LC",
                    "start_date": "2025-07-03",
                    "end_date": "2025-07-08",
                    "youth_count": 30,
                    "leaders_count": 5,
                    "accommodation": "indoor",
                },
            ],
        },
    )
    assert event_response.status_code == 201, event_response.text
    event = event_response.json()

    response = client.get(f"/api/v1/events/{event['id']}/suggest")
    assert response.status_code == 200, response.text
    suggestions = response.json()
    assert len(suggestions) == 1
    assert suggestions[0]["structure_id"] == valid_structure_id
