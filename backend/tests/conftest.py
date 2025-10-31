"""Pytest configuration for backend tests."""
from __future__ import annotations

import sys
from pathlib import Path


def _ensure_backend_on_path() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    backend_path = str(backend_dir)
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)


_ensure_backend_on_path()
