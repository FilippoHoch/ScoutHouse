from __future__ import annotations

from datetime import datetime
import re

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.contact import ContactPreferredChannel

PHONE_PATTERN = re.compile(r"^[+0-9 ]+$")


class ContactBase(BaseModel):
    name: str = Field(..., min_length=1)
    role: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    preferred_channel: ContactPreferredChannel = ContactPreferredChannel.EMAIL
    is_primary: bool = False
    notes: str | None = None
    gdpr_consent_at: datetime | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Name cannot be empty")
        return stripped

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            return None
        if not PHONE_PATTERN.fullmatch(stripped):
            raise ValueError("Phone numbers may contain digits, spaces, and '+'")
        return stripped


class ContactCreate(ContactBase):
    pass


class ContactUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    role: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    preferred_channel: ContactPreferredChannel | None = None
    is_primary: bool | None = None
    notes: str | None = None
    gdpr_consent_at: datetime | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Name cannot be empty")
        return stripped

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            return None
        if not PHONE_PATTERN.fullmatch(stripped):
            raise ValueError("Phone numbers may contain digits, spaces, and '+'")
        return stripped


class ContactRead(ContactBase):
    id: int
    structure_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }


__all__ = ["ContactCreate", "ContactUpdate", "ContactRead"]
