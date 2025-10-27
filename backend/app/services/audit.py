from __future__ import annotations

from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import AuditLog


def record_audit_log(
    db: Session,
    *,
    actor_user_id: str | None,
    action: str,
    entity_type: str,
    entity_id: str,
    diff: dict[str, Any] | None = None,
    request: Request | None = None,
) -> None:
    ip: str | None = None
    user_agent: str | None = None
    if request is not None:
        client = request.client
        if client is not None:
            ip = client.host
        user_agent = request.headers.get("user-agent")

    log_entry = AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        diff=diff,
        ip=ip,
        user_agent=user_agent,
    )
    db.add(log_entry)


__all__ = ["record_audit_log"]
