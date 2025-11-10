"""Application entrypoint for the ScoutHouse API."""

from __future__ import annotations

import logging

import asyncio
from typing import cast

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.types import ExceptionHandler

from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.limiter import limiter
from app.core.logging import RequestIDMiddleware, RequestLoggingMiddleware, configure_logging
from app.core.metrics import setup_metrics
from app.core.pubsub import event_bus
from app.core.sentry import init_sentry
from app.services import ensure_default_admin


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings)
    init_sentry(settings)

    logger = logging.getLogger("app.lifecycle")

    app = FastAPI(title="ScoutHouse API", version="0.2.0")

    app.state.limiter = limiter
    app.add_exception_handler(
        RateLimitExceeded,
        cast(ExceptionHandler, _rate_limit_exceeded_handler),
    )
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(GZipMiddleware, minimum_size=settings.gzip_min_length)

    allow_origins = list(settings.cors_allowed_origins)
    if not allow_origins:
        allow_origins = ["*"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(RequestIDMiddleware)

    app.include_router(api_router)

    app.state.instrumentator = setup_metrics(app)

    def _bootstrap_admin_user() -> None:
        db = SessionLocal()
        try:
            ensure_default_admin(
                db,
                email=settings.default_admin_email,
                password=settings.default_admin_password,
                name=settings.default_admin_name,
            )
        finally:
            db.close()

    @app.on_event("startup")
    async def _on_startup() -> None:
        event_bus.bind_to_loop(asyncio.get_running_loop())
        await asyncio.to_thread(_bootstrap_admin_user)
        logger.info("Application startup complete")

    @app.on_event("shutdown")
    async def _on_shutdown() -> None:
        logger.info("Application shutdown complete")

    return app


app = create_app()
