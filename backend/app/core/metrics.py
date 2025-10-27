"""Prometheus metrics instrumentation helpers."""

from __future__ import annotations

import logging
from typing import Final

from prometheus_client import Gauge
from prometheus_fastapi_instrumentator import Instrumentator, metrics

from app.core.db import engine

logger = logging.getLogger("app.metrics")

DB_POOL_IN_USE: Final[Gauge] = Gauge(
    "db_pool_connections_in_use",
    "Number of database connections currently checked out from the pool.",
)


def _record_db_pool_metrics(_: metrics.Info) -> None:
    """Update gauges describing the SQLAlchemy connection pool."""

    try:
        pool = engine.pool  # type: ignore[attr-defined]
    except Exception:  # pragma: no cover - safeguard for unusual engines
        logger.debug("Database engine does not expose a pool; skipping metric")
        return

    checked_out: float = 0.0
    try:
        checked_out_accessor = getattr(pool, "checkedout", None)
        if callable(checked_out_accessor):
            checked_out = float(checked_out_accessor())
        elif checked_out_accessor is not None:
            checked_out = float(checked_out_accessor)
    except Exception:  # pragma: no cover - defensive guard
        logger.debug("Unable to sample pool usage", exc_info=True)
        return

    DB_POOL_IN_USE.set(checked_out)


def setup_metrics(app) -> Instrumentator:
    """Register Prometheus instrumentation on the provided app."""

    instrumentator = Instrumentator(
        should_group_status_codes=False,
        should_ignore_untemplated=True,
    )
    instrumentator.add(metrics.default())
    instrumentator.add(metrics.requests())
    instrumentator.add(metrics.latency())
    instrumentator.add(_record_db_pool_metrics)

    instrumentator.instrument(app)
    instrumentator.expose(app, include_in_schema=False)
    return instrumentator


__all__ = ["setup_metrics"]
