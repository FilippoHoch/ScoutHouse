"""Application-wide logging utilities.

This module configures structured JSON logging enriched with request identifiers
and provides middleware helpers to bind the generated IDs to every log record.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from contextvars import ContextVar
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import Settings

REQUEST_ID_CONTEXT: ContextVar[str | None] = ContextVar("request_id", default=None)
_LOGGING_CONFIGURED = False

_RESERVED_LOG_RECORD_KEYS = {
    "args",
    "asctime",
    "created",
    "exc_info",
    "exc_text",
    "filename",
    "funcName",
    "levelname",
    "levelno",
    "lineno",
    "module",
    "msecs",
    "message",
    "msg",
    "name",
    "pathname",
    "process",
    "processName",
    "relativeCreated",
    "stack_info",
    "thread",
    "threadName",
}


class RequestIdFilter(logging.Filter):
    """Inject the current request identifier into log records."""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: D401
        record.request_id = REQUEST_ID_CONTEXT.get()
        return True


class JsonFormatter(logging.Formatter):
    """Format log records as structured JSON."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: D401
        log_object: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        request_id = getattr(record, "request_id", None)
        if request_id:
            log_object["request_id"] = request_id

        # Attach extra attributes while preventing leakage of built-in metadata.
        for key, value in record.__dict__.items():
            if key in _RESERVED_LOG_RECORD_KEYS:
                continue
            if key.startswith("_"):
                continue
            if key == "request_id":
                continue
            log_object[key] = value

        if record.exc_info:
            log_object["exc_info"] = self.formatException(record.exc_info)
        if record.stack_info:
            log_object["stack"] = self.formatStack(record.stack_info)  # type: ignore[arg-type]

        return json.dumps(log_object, ensure_ascii=False)


def _default_formatter() -> logging.Formatter:
    return logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s", datefmt="%Y-%m-%dT%H:%M:%S%z"
    )


def configure_logging(settings: Settings) -> None:
    """Configure root logging handlers according to settings."""

    global _LOGGING_CONFIGURED
    if _LOGGING_CONFIGURED:
        return

    handler: logging.Handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestIdFilter())

    if settings.log_json:
        formatter: logging.Formatter = JsonFormatter()
    else:
        formatter = _default_formatter()

    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(settings.log_level.upper())

    # Align Uvicorn loggers with the root handler to avoid mixed formatting.
    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uvicorn_logger = logging.getLogger(logger_name)
        uvicorn_logger.handlers = [handler]
        uvicorn_logger.setLevel(settings.log_level.upper())
        uvicorn_logger.propagate = False

    _LOGGING_CONFIGURED = True


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a request identifier to each incoming request."""

    def __init__(self, app: Any, header_name: str = "X-Request-ID") -> None:
        super().__init__(app)
        self.header_name = header_name

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        request_id = request.headers.get(self.header_name)
        if not request_id:
            request_id = str(uuid4())

        token = REQUEST_ID_CONTEXT.set(request_id)
        request.state.request_id = request_id

        response: Response | None = None
        try:
            response = await call_next(request)
        finally:
            REQUEST_ID_CONTEXT.reset(token)

        if response is None:
            response = Response(status_code=500)
        response.headers[self.header_name] = request_id
        return response


@dataclass(slots=True)
class RequestLogContext:
    method: str
    path: str
    status_code: int
    duration_ms: float
    client_ip: str | None


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log HTTP request lifecycle events with execution timing."""

    def __init__(self, app: Any, logger: logging.Logger | None = None) -> None:
        super().__init__(app)
        self.logger = logger or logging.getLogger("app.request")

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 3)
            context = RequestLogContext(
                method=request.method,
                path=request.url.path,
                status_code=500,
                duration_ms=duration_ms,
                client_ip=request.client.host if request.client else None,
            )
            if not getattr(request.state, "skip_access_log", False):
                self.logger.exception("Unhandled error during request", extra=asdict(context))
            raise

        duration_ms = round((time.perf_counter() - start) * 1000, 3)
        context = RequestLogContext(
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
            client_ip=request.client.host if request.client else None,
        )
        if not getattr(request.state, "skip_access_log", False):
            self.logger.info("Request completed", extra=asdict(context))
        return response


__all__ = [
    "configure_logging",
    "JsonFormatter",
    "RequestIDMiddleware",
    "RequestLoggingMiddleware",
    "REQUEST_ID_CONTEXT",
]
