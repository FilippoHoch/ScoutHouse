from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.attachment import AttachmentOwnerType

MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024
ALLOWED_MIME_TYPES = {"application/pdf"}
ALLOWED_MIME_PREFIXES = ("image/",)


class AttachmentBase(BaseModel):
    owner_type: AttachmentOwnerType
    owner_id: int = Field(gt=0)


class AttachmentSignRequest(AttachmentBase):
    filename: str = Field(min_length=1, max_length=255)
    mime: str = Field(min_length=1, max_length=100)

    @field_validator("filename")
    @classmethod
    def _trim_filename(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("filename cannot be blank")
        return cleaned

    @field_validator("mime")
    @classmethod
    def _validate_mime(cls, value: str) -> str:
        lowered = value.strip().lower()
        if not lowered:
            raise ValueError("mime cannot be blank")
        if lowered in ALLOWED_MIME_TYPES:
            return lowered
        if any(lowered.startswith(prefix) for prefix in ALLOWED_MIME_PREFIXES):
            return lowered
        raise ValueError("Unsupported mime type")


class AttachmentUploadSignature(BaseModel):
    url: str
    fields: dict[str, str]


class AttachmentConfirmRequest(AttachmentSignRequest):
    size: int = Field(gt=0, le=MAX_ATTACHMENT_SIZE)
    key: str = Field(min_length=1)


class AttachmentUpdateRequest(BaseModel):
    filename: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("filename")
    @classmethod
    def _trim_filename(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("filename cannot be blank")
        return cleaned

    @field_validator("description")
    @classmethod
    def _normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class AttachmentRead(BaseModel):
    id: int
    owner_type: AttachmentOwnerType
    owner_id: int
    filename: str
    mime: str
    size: int
    created_by: str | None = None
    created_by_name: str | None = None
    description: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AttachmentDownloadSignature(BaseModel):
    url: str
