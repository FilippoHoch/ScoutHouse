from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.models.contact import ContactPreferredChannel

PHONE_PATTERN = re.compile(r"^[+0-9 ]+$")


class ContactBase(BaseModel):
    first_name: str | None = Field(default=None, min_length=1)
    last_name: str | None = Field(default=None, min_length=1)
    role: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    preferred_channel: ContactPreferredChannel = ContactPreferredChannel.EMAIL
    is_primary: bool = False
    notes: str | None = None
    gdpr_consent_at: datetime | None = None

    @field_validator("first_name", "last_name")
    @classmethod
    def strip_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

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
    contact_id: int | None = None

    @model_validator(mode="after")
    def validate_payload(self) -> ContactCreate:
        if self.contact_id is None:
            if not any(
                [
                    self.first_name,
                    self.last_name,
                    self.email,
                    self.phone,
                    self.notes,
                ]
            ):
                raise ValueError("Provide at least one detail or specify an existing contact")
        return self


class ContactUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1)
    last_name: str | None = Field(default=None, min_length=1)
    role: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    preferred_channel: ContactPreferredChannel | None = None
    is_primary: bool | None = None
    notes: str | None = None
    gdpr_consent_at: datetime | None = None

    @field_validator("first_name", "last_name")
    @classmethod
    def strip_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

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
    contact_id: int
    structure_id: int
    name: str
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }


__all__ = ["ContactCreate", "ContactUpdate", "ContactRead"]
