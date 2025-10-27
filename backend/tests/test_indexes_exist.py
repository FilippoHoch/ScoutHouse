from __future__ import annotations

import os
from typing import Generator

import pytest
from sqlalchemy import inspect

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.db import Base, engine  # noqa: E402


@pytest.fixture(autouse=True)
def setup_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def _index_names(table_name: str) -> set[str]:
    inspector = inspect(engine)
    names = {index["name"] for index in inspector.get_indexes(table_name)}
    if engine.dialect.name == "sqlite":
        pragma = f"PRAGMA index_list('{table_name}')"
        with engine.connect() as connection:
            for row in connection.exec_driver_sql(pragma):
                names.add(row[1])
    return names


def test_structure_indexes_exist() -> None:
    indexes = _index_names("structures")
    assert "ix_structures_lower_name" in indexes
    assert "ix_structures_province" in indexes
    assert "ix_structures_type" in indexes


def test_structure_child_indexes_exist() -> None:
    availability_indexes = _index_names("structure_season_availability")
    assert (
        "ix_structure_season_availability_structure_id_season"
        in availability_indexes
    )

    cost_indexes = _index_names("structure_cost_option")
    assert "ix_structure_cost_option_structure_id_model" in cost_indexes

