from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.core.db import engine

logger = logging.getLogger("app.health")

router = APIRouter(prefix="/health")


@router.get("/live", tags=["health"])
def live() -> dict[str, str]:
    """Simple liveness probe."""

    return {"status": "ok"}


@router.get("/ready", tags=["health"])
def ready() -> dict[str, str]:
    """Readiness probe verifying database connectivity and migrations."""

    is_ready, detail = _database_ready()
    if not is_ready:
        raise HTTPException(status_code=503, detail=detail)
    return {"status": "ok"}


def _database_ready() -> tuple[bool, str]:
    settings = get_settings()
    versions: set[str] = set()
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

            if settings.database_url.startswith("sqlite"):
                return True, "ok"

            try:
                versions = {
                    row[0]
                    for row in connection.execute(text("SELECT version_num FROM alembic_version"))
                }
            except SQLAlchemyError:
                logger.exception("Failed to read alembic_version table")
                return False, "missing_alembic_version"
    except SQLAlchemyError:
        logger.exception("Database connection failed during readiness check")
        return False, "database_unreachable"

    expected = _alembic_heads()
    if not expected:
        logger.warning("No Alembic heads detected; treating database as ready")
        return True, "ok"

    if expected.issubset(versions):
        return True, "ok"

    logger.error("Database not on latest migration", extra={"expected": list(expected), "found": list(versions)})
    return False, "pending_migrations"


@lru_cache
def _alembic_heads() -> set[str]:
    config_path = Path(__file__).resolve().parents[3] / "alembic.ini"
    if not config_path.exists():
        logger.error("Alembic configuration not found", extra={"path": str(config_path)})
        return set()

    try:
        config = Config(str(config_path))
        script = ScriptDirectory.from_config(config)
        return set(script.get_heads())
    except Exception:  # pragma: no cover - defensive guard
        logger.exception("Unable to determine Alembic head revisions")
        return set()
