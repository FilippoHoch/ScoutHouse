from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_token
from app.models import EventMember, EventMemberRole, RefreshToken, User

auth_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = credentials.credentials
    try:
        payload = decode_token(token)
    except ValueError as exc:  # pragma: no cover - security path
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")

    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user


def require_event_member(min_role: EventMemberRole) -> Callable:
    role_rank = {
        EventMemberRole.VIEWER: 1,
        EventMemberRole.COLLAB: 2,
        EventMemberRole.OWNER: 3,
    }

    def dependency(
        event_id: int,
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> EventMember:
        membership = (
            db.query(EventMember)
            .filter(EventMember.event_id == event_id, EventMember.user_id == user.id)
            .first()
        )
        if membership is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
        if role_rank[membership.role] < role_rank[min_role]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return membership

    return dependency


def get_refresh_token_from_cookie(request: Request, db: Session = Depends(get_db)) -> RefreshToken:
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")

    token_hash = decode_refresh_cookie(token)

    token_record = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if token_record is None or token_record.revoked:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    if token_record.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Expired refresh token")
    return token_record


def decode_refresh_cookie(token: str) -> str:
    from app.core.security import hash_token

    return hash_token(token)


__all__ = [
    "auth_scheme",
    "decode_refresh_cookie",
    "get_current_user",
    "get_refresh_token_from_cookie",
    "require_admin",
    "require_event_member",
]
