from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app.models import AuditLog, User


def _extract_ip(request: Request | None) -> str | None:
    if request is None or request.client is None:
        return None
    return request.client.host


def record_audit(
    db: Session,
    *,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: str | int,
    diff: Mapping[str, Any] | None = None,
    request: Request | None = None,
) -> None:
    payload = jsonable_encoder(diff) if diff is not None else None
    log = AuditLog(
        actor_user_id=actor.id if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        diff=payload,
        ip=_extract_ip(request),
        user_agent=request.headers.get("User-Agent") if request is not None else None,
    )
    db.add(log)


__all__ = ["record_audit"]
