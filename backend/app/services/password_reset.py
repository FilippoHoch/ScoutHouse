from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password, hash_token
from app.models import PasswordResetToken, User


def _expiry_time() -> datetime:
    settings = get_settings()
    return datetime.now(timezone.utc) + timedelta(minutes=settings.password_reset_ttl_minutes)


def create_reset_token(db: Session, user: User) -> tuple[str, PasswordResetToken]:
    raw_token = secrets.token_urlsafe(48)
    token_hash = hash_token(raw_token)

    # Invalidate previous unused tokens
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used.is_(False),
    ).update({"used": True}, synchronize_session=False)

    record = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=_expiry_time(),
        used=False,
    )
    db.add(record)
    return raw_token, record


def verify_reset_token(db: Session, token: str) -> PasswordResetToken:
    token_hash = hash_token(token)
    record = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == token_hash)
        .first()
    )
    if record is None or record.used:
        raise ValueError("Invalid token")
    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise ValueError("Token expired")
    return record


def reset_user_password(db: Session, record: PasswordResetToken, new_password: str) -> None:
    user = db.get(User, record.user_id)
    if user is None or not user.is_active:
        raise ValueError("User not found")
    user.password_hash = hash_password(new_password)
    record.used = True
    db.add(user)
    db.add(record)


__all__ = ["create_reset_token", "verify_reset_token", "reset_user_password"]
