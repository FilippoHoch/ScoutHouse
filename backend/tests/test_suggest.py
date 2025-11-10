import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Structure,
    StructureSeason,
    StructureSeasonAvailability,
    StructureType,
)
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


def create_structure_with_availability(
    name: str,
    slug: str,
    season: StructureSeason,
    units: list[str],
    latitude: float | None,
    longitude: float | None,
) -> int:
    with SessionLocal() as session:
        structure = Structure(
            name=name,
            slug=slug,
            province="MI",
            type=StructureType.HOUSE,
            latitude=latitude,
            longitude=longitude,
        )
        session.add(structure)
        session.commit()
        availability = StructureSeasonAvailability(
            structure_id=structure.id,
            season=season,
            units=units,
            capacity_min=10,
            capacity_max=40,
        )
        session.add(availability)
        session.commit()
        return structure.id


def test_suggestions_match_branch_and_season() -> None:
    client = get_client(authenticated=True)
    create_structure_with_availability(
        "Casa Inverno",
        "casa-inverno",
        StructureSeason.WINTER,
        ["LC"],
        45.6,
        10.1,
    )
    create_structure_with_availability(
        "Base Estiva",
        "base-estiva",
        StructureSeason.SUMMER,
        ["RS"],
        44.0,
        11.0,
    )

    event_resp = client.post(
        "/api/v1/events/",
        json={
            "title": "Evento Invernale",
            "branch": "LC",
            "start_date": "2025-01-15",
            "end_date": "2025-01-18",
            "participants": {"lc": 20, "leaders": 4, "eg": 0, "rs": 0},
        },
    )
    assert event_resp.status_code == 201
    event_id = event_resp.json()["id"]

    suggestions = client.get(f"/api/v1/events/{event_id}/suggest?limit=5")
    assert suggestions.status_code == 200
    data = suggestions.json()
    assert len(data) == 1
    assert data[0]["structure_slug"] == "casa-inverno"
    assert data[0]["distance_km"] is not None
