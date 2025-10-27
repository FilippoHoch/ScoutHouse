from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

from .user import UserRead


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1)
    email: EmailStr
    password: str = Field(..., min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


__all__ = [
    "AuthResponse",
    "LoginRequest",
    "RefreshResponse",
    "RegisterRequest",
]
