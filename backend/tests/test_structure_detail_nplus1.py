from __future__ import annotations

import os
from collections.abc import Generator, Iterable
from contextlib import contextmanager
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models.availability import (  # noqa: E402
    StructureSeason,
    StructureSeasonAvailability,
)
from app.models.cost_option import StructureCostModel, StructureCostOption  # noqa: E402
from app.models.structure import Structure, StructureType  # noqa: E402


@pytest.fixture(autouse=True)
def setup_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def get_client() -> TestClient:
    return TestClient(app)


@contextmanager
def capture_statements() -> Generator[list[str], None, None]:
    statements: list[str] = []

    def before_cursor_execute(  # type: ignore[no-redef]
        conn, cursor, statement, parameters, context, executemany
    ) -> None:
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", before_cursor_execute)
    try:
        yield statements
    finally:
        event.remove(engine, "before_cursor_execute", before_cursor_execute)


def _count_relevant_selects(statements: Iterable[str]) -> int:
    targets = (
        " from structures",
        " from structure_season_availability",
        " from structure_cost_option",
    )
    count = 0
    for statement in statements:
        normalized = statement.lower().lstrip().replace('"', "").replace("\n", " ")
        if not normalized.startswith("select"):
            continue
        if any(target in normalized for target in targets):
            count += 1
    return count


def _create_structure_with_details(slug: str) -> None:
    with SessionLocal() as session:
        structure = Structure(
            name="Structure N+1",
            slug=slug,
            province="BS",
            type=StructureType.MIXED,
        )
        session.add(structure)
        session.flush()

        session.add_all(
            [
                StructureSeasonAvailability(
                    structure_id=structure.id,
                    season=StructureSeason.SPRING,
                    units=["LC"],
                    capacity_min=10,
                    capacity_max=40,
                ),
                StructureCostOption(
                    structure_id=structure.id,
                    model=StructureCostModel.PER_PERSON_DAY,
                    amount=Decimal("12.50"),
                    currency="EUR",
                ),
            ]
        )
        session.commit()


def _append_structure_details(slug: str, extra_sets: int) -> None:
    seasons_cycle = [
        StructureSeason.SUMMER,
        StructureSeason.AUTUMN,
        StructureSeason.WINTER,
    ]
    models_cycle = [
        StructureCostModel.PER_PERSON_NIGHT,
        StructureCostModel.FORFAIT,
    ]

    with SessionLocal() as session:
        structure = session.query(Structure).filter(Structure.slug == slug).one()
        for index in range(extra_sets):
            session.add(
                StructureSeasonAvailability(
                    structure_id=structure.id,
                    season=seasons_cycle[index % len(seasons_cycle)],
                    units=["EG"],
                    capacity_min=20 + index,
                    capacity_max=60 + index,
                )
            )
            session.add(
                StructureCostOption(
                    structure_id=structure.id,
                    model=models_cycle[index % len(models_cycle)],
                    amount=Decimal("15.00") + Decimal(index),
                    currency="EUR",
                )
            )
        session.commit()


def test_structure_detail_query_count_stable() -> None:
    slug = "structure-nplus1"
    _create_structure_with_details(slug)

    client = get_client()
    # warm-up request to stabilize connection-level pragmas
    warmup = client.get(f"/api/v1/structures/by-slug/{slug}", params={"include": "details"})
    assert warmup.status_code == 200

    with capture_statements() as baseline:
        response = client.get(
            f"/api/v1/structures/by-slug/{slug}",
            params={"include": "details"},
        )
    assert response.status_code == 200
    baseline_selects = _count_relevant_selects(baseline)
    assert baseline_selects > 0

    # add additional availabilities and cost options
    _append_structure_details(slug, extra_sets=4)

    with capture_statements() as loaded:
        response_loaded = client.get(
            f"/api/v1/structures/by-slug/{slug}",
            params={"include": "details"},
        )
    assert response_loaded.status_code == 200
    loaded_selects = _count_relevant_selects(loaded)

    assert loaded_selects == baseline_selects
