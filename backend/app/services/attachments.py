from __future__ import annotations

import logging
import os
import re
from functools import lru_cache
from typing import Any
from uuid import uuid4

import boto3
from botocore.client import BaseClient
from botocore.config import Config
from botocore.exceptions import ClientError
from fastapi import HTTPException, status

from app.core.config import get_settings
from app.models.attachment import AttachmentOwnerType
from app.schemas.attachment import (
    ALLOWED_MIME_PREFIXES,
    ALLOWED_MIME_TYPES,
    MAX_ATTACHMENT_SIZE,
)


logger = logging.getLogger("app.attachments")

SAFE_CHARS_RE = re.compile(r"[^A-Za-z0-9._-]+")


class StorageUnavailableError(RuntimeError):
    """Raised when the storage backend is not configured."""


def _filter_kwargs(**kwargs: Any) -> dict[str, Any]:
    return {key: value for key, value in kwargs.items() if value is not None}


@lru_cache
def get_s3_client() -> BaseClient:
    settings = get_settings()
    config_kwargs: dict[str, Any] = {}
    if settings.s3_use_path_style:
        config_kwargs["s3"] = {"addressing_style": "path"}

    client_kwargs: dict[str, Any] = {
        "aws_access_key_id": settings.s3_access_key,
        "aws_secret_access_key": settings.s3_secret_key,
        "region_name": settings.s3_region,
        "endpoint_url": settings.s3_endpoint,
    }
    if config_kwargs:
        client_kwargs["config"] = Config(**config_kwargs)

    return boto3.client("s3", **_filter_kwargs(**client_kwargs))


def ensure_bucket() -> str:
    bucket = get_settings().s3_bucket
    if not bucket:
        raise StorageUnavailableError("S3 bucket not configured")
    return bucket


def sanitize_filename(filename: str) -> str:
    base = os.path.basename(filename.strip()) or "file"
    name, ext = os.path.splitext(base)
    safe_name = SAFE_CHARS_RE.sub("-", name).strip("-._") or "file"
    safe_ext = "".join(ch for ch in ext if ch.isalnum() or ch in {".", "_", "-"})
    candidate = safe_name
    if safe_ext:
        candidate = f"{safe_name}{safe_ext}" if safe_ext.startswith(".") else f"{safe_name}.{safe_ext}"
    return candidate[:255] or "file"


def build_storage_key(owner_type: AttachmentOwnerType, owner_id: int, filename: str) -> str:
    sanitized = sanitize_filename(filename)
    token = uuid4().hex
    return f"attachments/{owner_type.value}/{owner_id}/{token}/{sanitized}"


def validate_mime(mime: str) -> None:
    normalized = mime.strip().lower()
    if normalized in ALLOWED_MIME_TYPES:
        return
    if any(normalized.startswith(prefix) for prefix in ALLOWED_MIME_PREFIXES):
        return
    raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unsupported mime type")


def validate_key(owner_type: AttachmentOwnerType, owner_id: int, key: str) -> None:
    if ".." in key.split("/"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid upload key")
    expected_prefix = f"attachments/{owner_type.value}/{owner_id}/"
    if not key.startswith(expected_prefix):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Upload key mismatch")


def head_object(client: BaseClient, bucket: str, key: str) -> dict[str, Any]:
    try:
        return client.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:  # pragma: no cover - defensive logging
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in {"404", "NoSuchKey"}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Uploaded file not found") from exc
        logger.exception("Unexpected error while verifying attachment upload: %s", error_code)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Storage backend error") from exc


def delete_object(client: BaseClient, bucket: str, key: str) -> None:
    try:
        client.delete_object(Bucket=bucket, Key=key)
    except ClientError as exc:  # pragma: no cover - defensive logging
        error_code = exc.response.get("Error", {}).get("Code")
        logger.warning("Unable to delete attachment %s: %s", key, error_code)


def ensure_size_within_limits(size: int) -> None:
    if size > MAX_ATTACHMENT_SIZE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Attachment exceeds size limit")


def allowed_mime_types() -> set[str]:
    return {*ALLOWED_MIME_TYPES, *ALLOWED_MIME_PREFIXES}


__all__ = [
    "MAX_ATTACHMENT_SIZE",
    "allowed_mime_types",
    "build_storage_key",
    "delete_object",
    "ensure_bucket",
    "ensure_size_within_limits",
    "get_s3_client",
    "head_object",
    "sanitize_filename",
    "StorageUnavailableError",
    "validate_key",
    "validate_mime",
]
