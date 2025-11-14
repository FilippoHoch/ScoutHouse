from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import hash_password
from app.deps import require_admin
from app.models import User
from app.schemas import UserAdminCreate, UserAdminUpdate, UserRead

DbSession = Annotated[Session, Depends(get_db)]

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(require_admin)])


@router.get("", response_model=list[UserRead])
def list_users(db: DbSession) -> list[UserRead]:
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [UserRead.model_validate(user) for user in users]


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserAdminCreate, db: DbSession) -> UserRead:
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        is_admin=payload.is_admin,
        is_active=payload.is_active,
        user_type=payload.user_type,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserRead.model_validate(user)


@router.patch("/{user_id}", response_model=UserRead)
def update_user(user_id: str, payload: UserAdminUpdate, db: DbSession) -> UserRead:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if payload.email is not None and payload.email != user.email:
        conflict = db.query(User).filter(User.email == payload.email).first()
        if conflict is not None and conflict.id != user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already in use",
            )
        user.email = payload.email

    if payload.name is not None:
        user.name = payload.name

    if payload.is_admin is not None:
        user.is_admin = payload.is_admin

    if payload.is_active is not None:
        user.is_active = payload.is_active

    if "user_type" in payload.model_fields_set:
        user.user_type = payload.user_type

    if payload.password is not None:
        if not payload.password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password cannot be empty",
            )
        user.password_hash = hash_password(payload.password)

    db.add(user)
    db.commit()
    db.refresh(user)
    return UserRead.model_validate(user)


__all__ = ["router"]
