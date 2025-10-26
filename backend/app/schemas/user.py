from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    id: str = Field(..., description="User identifier")
    email: EmailStr
    name: str
    is_admin: bool = False

    model_config = {
        "from_attributes": True,
    }


class UserRead(UserBase):
    created_at: datetime


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    name: str | None = None
    password: str | None = None


__all__ = ["UserBase", "UserRead", "UserCreate", "UserUpdate"]
