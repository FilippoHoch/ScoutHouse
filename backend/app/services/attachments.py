from __future__ import annotations
import logging
import os
import re
from functools import lru_cache
from typing import Any, TYPE_CHECKING
from urllib.parse import urlparse, urlunparse
from uuid import uuid4

import boto3
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


if TYPE_CHECKING:
    from mypy_boto3_s3.client import S3Client
else:  # pragma: no cover - type checking only
    from botocore.client import BaseClient as S3Client


logger = logging.getLogger("app.attachments")

SAFE_CHARS_RE = re.compile(r"[^A-Za-z0-9._-]+")


class StorageUnavailableError(RuntimeError):
    """Raised when the storage backend is not configured."""


def _filter_kwargs(**kwargs: Any) -> dict[str, Any]:
    return {key: value for key, value in kwargs.items() if value is not None}


@lru_cache
def get_s3_client() -> S3Client:
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


def ensure_bucket_exists(client: S3Client, bucket: str) -> None:
    """Ensure the configured bucket exists, creating it if missing."""

    try:
        client.head_bucket(Bucket=bucket)
        return
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code not in {"404", "NoSuchBucket", "NotFound"}:
            raise StorageUnavailableError("Unable to verify storage bucket") from exc

    create_kwargs: dict[str, Any] = {"Bucket": bucket}
    region = get_settings().s3_region
    if region and region != "us-east-1":
        create_kwargs["CreateBucketConfiguration"] = {"LocationConstraint": region}

    try:
        client.create_bucket(**create_kwargs)
    except ClientError as exc:  # pragma: no cover - defensive guard
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in {"BucketAlreadyOwnedByYou", "BucketAlreadyExists"}:
            return
        raise StorageUnavailableError("Unable to create storage bucket") from exc


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


def head_object(client: S3Client, bucket: str, key: str) -> dict[str, Any]:
    try:
        return client.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:  # pragma: no cover - defensive logging
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in {"404", "NoSuchKey"}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Uploaded file not found") from exc
        logger.exception("Unexpected error while verifying attachment upload: %s", error_code)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Storage backend error") from exc


def delete_object(client: S3Client, bucket: str, key: str) -> None:
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


def _rewrite_presigned_url(url: str) -> str:
    settings = get_settings()
    public_endpoint = settings.s3_public_endpoint
    if not public_endpoint:
        return url

    try:
        public_parts = urlparse(public_endpoint)
    except ValueError:  # pragma: no cover - defensive guard
        logger.warning("Invalid S3_PUBLIC_ENDPOINT value: %s", public_endpoint)
        return url

    if not public_parts.scheme or not public_parts.netloc:
        logger.warning("Incomplete S3_PUBLIC_ENDPOINT value: %s", public_endpoint)
        return url

    try:
        url_parts = urlparse(url)
    except ValueError:  # pragma: no cover - defensive guard
        logger.warning("Unable to parse presigned URL: %s", url)
        return url

    path = url_parts.path
    public_path = public_parts.path.rstrip("/")
    if public_path:
        suffix = path.lstrip("/")
        if suffix:
            path = f"{public_path}/{suffix}"
        else:
            path = public_path
        if not path.startswith("/"):
            path = f"/{path}"

    return urlunparse(
        url_parts._replace(
            scheme=public_parts.scheme,
            netloc=public_parts.netloc,
            path=path,
        )
    )


def rewrite_presigned_post_signature(signature: dict[str, Any]) -> dict[str, Any]:
    url = signature.get("url")
    if not isinstance(url, str):  # pragma: no cover - defensive guard
        return signature
    rewritten = dict(signature)
    rewritten["url"] = _rewrite_presigned_url(url)
    return rewritten


def rewrite_presigned_url(url: str) -> str:
    return _rewrite_presigned_url(url)


__all__ = [
    "MAX_ATTACHMENT_SIZE",
    "allowed_mime_types",
    "build_storage_key",
    "delete_object",
    "ensure_bucket",
    "ensure_bucket_exists",
    "ensure_size_within_limits",
    "get_s3_client",
    "head_object",
    "rewrite_presigned_post_signature",
    "rewrite_presigned_url",
    "sanitize_filename",
    "S3Client",
    "StorageUnavailableError",
    "validate_key",
    "validate_mime",
]
