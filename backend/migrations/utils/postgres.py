"""Helpers for writing idempotent PostgreSQL Alembic migrations."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine import Connection
from sqlalchemy.sql import text


def _get_bind() -> Connection:
    bind = op.get_bind()
    if bind is None:
        raise RuntimeError("Alembic operation context is not bound")
    return bind


def create_enum_if_not_exists(name: str, values: Sequence[str]) -> sa.Enum:
    """Create an enum type if it does not already exist and return it."""

    enum_type = sa.Enum(*values, name=name)
    enum_type.create(_get_bind(), checkfirst=True)
    enum_type.create_type = False
    return enum_type


def drop_enum_if_exists(name: str) -> None:
    """Drop an enum type if it exists and no objects depend on it."""

    literal_name = name.replace("'", "''")
    op.execute(
        text(
            f"""
            DO $$
            DECLARE
                enum_name text := '{literal_name}';
                depend_count integer;
            BEGIN
                SELECT COUNT(*)
                  INTO depend_count
                  FROM pg_depend d
                  JOIN pg_type t ON t.oid = d.objid
                 WHERE t.typname = enum_name
                   AND d.deptype = 'n';
                IF depend_count = 0 THEN
                    IF EXISTS (
                        SELECT 1 FROM pg_type WHERE typname = enum_name
                    ) THEN
                        EXECUTE format('DROP TYPE IF EXISTS %I', enum_name);
                    END IF;
                END IF;
            END$$;
            """
        )
    )


def add_enum_value_if_missing(name: str, value: str) -> None:
    """Add a value to an enum type if it is not already present."""

    literal_name = name.replace("'", "''")
    literal_value = value.replace("'", "''")
    op.execute(
        text(
            f"""
            DO $$
            DECLARE
                enum_name text := '{literal_name}';
                enum_value text := '{literal_value}';
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                      FROM pg_enum e
                      JOIN pg_type t ON t.oid = e.enumtypid
                     WHERE t.typname = enum_name
                       AND e.enumlabel = enum_value
                ) THEN
                    EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_name, enum_value);
                END IF;
            END$$;
            """
        )
    )


def enum_value_exists(name: str, value: str) -> bool:
    """Return ``True`` if the enum already contains the given label."""

    bind = _get_bind()
    result = bind.execute(
        text(
            """
            SELECT 1
              FROM pg_enum e
              JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = :enum_name
               AND e.enumlabel = :enum_value
            """
        ),
        {"enum_name": name, "enum_value": value},
    )
    return result.scalar() is not None


def add_column_if_not_exists(table: str, column_sql: str) -> None:
    """Add a column to ``table`` using ``column_sql`` if it is missing."""

    op.execute(sa.text(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS {column_sql}'))


def create_index_if_not_exists(index_sql: str) -> None:
    """Execute ``index_sql`` which must include ``IF NOT EXISTS``."""

    op.execute(sa.text(index_sql))


def add_constraint_if_not_exists(
    table: str, constraint_name: str, constraint_sql: str
) -> None:
    """Create a constraint if it does not already exist on ``table``."""

    bind = _get_bind()
    exists = bind.execute(
        text(
            """
            SELECT 1
              FROM pg_constraint c
              JOIN pg_class rel ON rel.oid = c.conrelid
             WHERE c.conname = :constraint_name
               AND rel.relname = :table_name
            """
        ),
        {"constraint_name": constraint_name, "table_name": table},
    ).scalar()
    if not exists:
        op.execute(sa.text(constraint_sql))
