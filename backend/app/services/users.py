from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import User


def ensure_default_admin(
    db: Session, *, email: str, password: str, name: str = "Admin"
) -> User:
    """Ensure the default admin user exists and is active."""

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        user = User(
            name=name,
            email=email,
            password_hash=hash_password(password),
            is_admin=True,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    changed = False
    if not user.is_admin:
        user.is_admin = True
        changed = True
    if not user.is_active:
        user.is_active = True
        changed = True

    if changed:
        db.add(user)
        db.commit()
        db.refresh(user)

    return user


__all__ = ["ensure_default_admin"]
