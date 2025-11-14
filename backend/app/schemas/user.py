from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserType


class UserBase(BaseModel):
    id: str = Field(..., description="User identifier")
    email: EmailStr
    name: str
    is_admin: bool = False
    is_active: bool = True
    user_type: UserType | None = None

    model_config = {
        "from_attributes": True,
    }


class UserRead(UserBase):
    created_at: datetime
    can_edit_structures: bool = False


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    user_type: UserType | None = None


class UserUpdate(BaseModel):
    name: str | None = None
    password: str | None = None
    user_type: UserType | None = None


class UserAdminCreate(UserCreate):
    is_admin: bool = False
    is_active: bool = True


class UserAdminUpdate(UserUpdate):
    email: EmailStr | None = None
    is_admin: bool | None = None
    is_active: bool | None = None


class UserSelfUpdate(BaseModel):
    user_type: UserType | None = None


__all__ = [
    "UserBase",
    "UserRead",
    "UserCreate",
    "UserUpdate",
    "UserAdminCreate",
    "UserAdminUpdate",
    "UserSelfUpdate",
]
