"""Utilities for conditional HTTP responses on public endpoints."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from fastapi import Request, Response, status
from fastapi.responses import Response as FastAPIResponse
from pydantic import BaseModel

from app.core.config import get_settings


def _normalize_payload(payload: Any) -> Any:
    if isinstance(payload, BaseModel):
        return payload.model_dump(mode="json")
    if isinstance(payload, dict):
        return {key: _normalize_payload(value) for key, value in payload.items()}
    if isinstance(payload, (list, tuple)):
        return [_normalize_payload(item) for item in payload]
    return payload


def apply_http_cache(
    request: Request,
    response: Response,
    payload: Any,
) -> Any | Response:
    """Attach cache headers and handle conditional requests."""

    normalized = _normalize_payload(payload)
    body = json.dumps(
        normalized,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    etag = f'"{hashlib.sha256(body).hexdigest()}"'

    settings = get_settings()
    cache_control = (
        "public, "
        f"max-age={settings.public_cache_max_age}, "
        f"stale-while-revalidate={settings.public_cache_stale_while_revalidate}"
    )

    if request.headers.get("if-none-match") == etag:
        return FastAPIResponse(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={
                "ETag": etag,
                "Cache-Control": cache_control,
            },
        )

    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = cache_control
    return payload


__all__ = ["apply_http_cache"]
