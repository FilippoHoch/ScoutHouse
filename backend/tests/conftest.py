"""Pytest configuration for backend tests."""
from __future__ import annotations

import os
import sys
from collections.abc import Generator
from pathlib import Path

import pytest


def _ensure_backend_on_path() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    backend_path = str(backend_dir)
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)


_ensure_backend_on_path()

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("ALLOW_NON_ADMIN_STRUCTURE_EDIT", "false")

from app.core.config import get_settings  # noqa: E402


@pytest.fixture(autouse=True)
def reset_structure_edit_flag(
    monkeypatch: pytest.MonkeyPatch,
) -> Generator[None, None, None]:
    """Ensure structure editing requires admin rights unless a test opts in."""

    monkeypatch.setenv("ALLOW_NON_ADMIN_STRUCTURE_EDIT", "false")
    get_settings.cache_clear()
    try:
        yield
    finally:
        get_settings.cache_clear()
