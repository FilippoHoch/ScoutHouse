from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
from typing import Tuple

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

from app.core.config import get_settings

_password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        _password_hasher.verify(password_hash, password)
        return True
    except VerifyMismatchError:
        return False


def _token_expiry(minutes: int | None = None, days: int | None = None) -> datetime:
    now = datetime.now(timezone.utc)
    delta = timedelta(minutes=minutes or 0, days=days or 0)
    return now + delta


def create_access_token(user_id: str) -> str:
    settings = get_settings()
    expire = _token_expiry(minutes=settings.access_ttl_min)
    payload = {"sub": user_id, "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def generate_refresh_token() -> Tuple[str, datetime, str]:
    import secrets

    settings = get_settings()
    token = secrets.token_urlsafe(48)
    expires = _token_expiry(days=settings.refresh_ttl_days)
    token_hash = sha256(token.encode("utf-8")).hexdigest()
    return token, expires, token_hash


def decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except JWTError as exc:  # pragma: no cover - jose raises generic JWTError
        raise ValueError("Invalid token") from exc


def hash_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()
