"""Sentry integration helpers."""

from __future__ import annotations

import logging

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.logging import LoggingIntegration

from app.core.config import Settings

logger = logging.getLogger("app.sentry")


def init_sentry(settings: Settings) -> None:
    """Initialise Sentry if a DSN is provided."""

    if not settings.sentry_dsn:
        logger.info("Sentry DSN not configured; skipping error tracking setup")
        return

    sentry_logging = LoggingIntegration(level=logging.INFO, event_level=logging.ERROR)

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        enable_tracing=settings.sentry_traces_sample_rate > 0,
        integrations=[FastApiIntegration(), sentry_logging],
        send_default_pii=False,
    )
    logger.info(
        "Sentry initialised",
        extra={"traces_sample_rate": settings.sentry_traces_sample_rate},
    )


__all__ = ["init_sentry"]
