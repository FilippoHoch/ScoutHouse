from __future__ import annotations

from typing import Annotated, Iterable

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.deps import get_current_user
from app.models import (
    Attachment,
    AttachmentOwnerType,
    Event,
    EventMember,
    EventMemberRole,
    Structure,
    User,
)
from app.schemas import (
    AttachmentConfirmRequest,
    AttachmentDownloadSignature,
    AttachmentRead,
    AttachmentSignRequest,
    AttachmentUploadSignature,
)
from app.services.attachments import (
    MAX_ATTACHMENT_SIZE,
    StorageUnavailableError,
    build_storage_key,
    delete_object,
    ensure_bucket,
    ensure_bucket_exists,
    ensure_size_within_limits,
    get_s3_client,
    head_object,
    rewrite_presigned_post_signature,
    rewrite_presigned_url,
    validate_key,
    validate_mime,
)


router = APIRouter(prefix="/attachments", tags=["attachments"])

DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def _structure_or_404(db: Session, structure_id: int) -> Structure:
    structure = db.get(Structure, structure_id)
    if structure is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Structure not found")
    return structure


def _event_or_404(db: Session, event_id: int) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _ensure_structure_access(db: Session, structure_id: int, user: User, *, write: bool) -> None:
    _structure_or_404(db, structure_id)
    if not write:
        return

    if user.is_admin:
        return

    if get_settings().allow_non_admin_structure_edit:
        return

    raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Admin required")


def _ensure_event_access(db: Session, event_id: int, user: User, *, write: bool) -> None:
    _event_or_404(db, event_id)
    if user.is_admin:
        return
    membership = (
        db.execute(
            select(EventMember.role).where(
                EventMember.event_id == event_id,
                EventMember.user_id == user.id,
            )
        )
        .scalars()
        .first()
    )
    if membership is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not a member")
    if write and membership not in {EventMemberRole.OWNER, EventMemberRole.COLLAB}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Insufficient role")


def _ensure_owner_access(
    db: Session,
    owner_type: AttachmentOwnerType,
    owner_id: int,
    user: User,
    *,
    write: bool,
) -> None:
    if owner_type is AttachmentOwnerType.STRUCTURE:
        _ensure_structure_access(db, owner_id, user, write=write)
    elif owner_type is AttachmentOwnerType.EVENT:
        _ensure_event_access(db, owner_id, user, write=write)
    else:  # pragma: no cover - defensive branch
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unsupported owner type")


def _serialize_attachment_rows(rows: Iterable[tuple[Attachment, User | None]]) -> list[AttachmentRead]:
    items: list[AttachmentRead] = []
    for attachment, creator in rows:
        items.append(
            AttachmentRead(
                id=attachment.id,
                owner_type=attachment.owner_type,
                owner_id=attachment.owner_id,
                filename=attachment.filename,
                mime=attachment.mime,
                size=attachment.size,
                created_by=attachment.created_by,
                created_by_name=creator.name if creator else None,
                created_at=attachment.created_at,
            )
        )
    return items


def _ensure_storage_ready() -> tuple[str, object]:
    try:
        bucket = ensure_bucket()
    except StorageUnavailableError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="File storage not configured") from exc
    client = get_s3_client()
    try:
        ensure_bucket_exists(client, bucket)
    except StorageUnavailableError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="File storage not configured") from exc
    return bucket, client


@router.get("/", response_model=list[AttachmentRead])
def list_attachments(
    owner_type: AttachmentOwnerType = Query(..., description="Attachment owner type"),
    owner_id: int = Query(..., gt=0, description="Attachment owner id"),
    *,
    db: DbSession,
    user: CurrentUser,
) -> list[AttachmentRead]:
    _ensure_owner_access(db, owner_type, owner_id, user, write=False)

    rows = (
        db.execute(
            select(Attachment, User)
            .outerjoin(User, Attachment.created_by == User.id)
            .where(
                Attachment.owner_type == owner_type,
                Attachment.owner_id == owner_id,
            )
            .order_by(Attachment.created_at.desc())
        )
        .all()
    )
    return _serialize_attachment_rows(rows)


@router.post("/sign-put", response_model=AttachmentUploadSignature)
def sign_attachment_upload(
    payload: AttachmentSignRequest,
    *,
    db: DbSession,
    user: CurrentUser,
) -> AttachmentUploadSignature:
    validate_mime(payload.mime)
    _ensure_owner_access(db, payload.owner_type, payload.owner_id, user, write=True)

    bucket, client = _ensure_storage_ready()
    key = build_storage_key(payload.owner_type, payload.owner_id, payload.filename)
    fields = {"Content-Type": payload.mime, "key": key}
    conditions = [
        {"Content-Type": payload.mime},
        {"key": key},
        ["content-length-range", 1, MAX_ATTACHMENT_SIZE],
    ]
    signature = client.generate_presigned_post(
        Bucket=bucket,
        Key=key,
        Fields=fields,
        Conditions=conditions,
        ExpiresIn=600,
    )
    signature = rewrite_presigned_post_signature(signature)
    return AttachmentUploadSignature(url=signature["url"], fields=signature["fields"])


@router.post("/confirm", response_model=AttachmentRead, status_code=status.HTTP_201_CREATED)
def confirm_attachment(
    payload: AttachmentConfirmRequest,
    *,
    db: DbSession,
    user: CurrentUser,
) -> AttachmentRead:
    validate_mime(payload.mime)
    _ensure_owner_access(db, payload.owner_type, payload.owner_id, user, write=True)
    validate_key(payload.owner_type, payload.owner_id, payload.key)
    ensure_size_within_limits(payload.size)

    existing = (
        db.execute(
            select(Attachment.id).where(Attachment.storage_key == payload.key)
        )
        .scalars()
        .first()
    )
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Attachment already registered")

    bucket, client = _ensure_storage_ready()
    metadata = head_object(client, bucket, payload.key)
    content_length = metadata.get("ContentLength") or payload.size
    ensure_size_within_limits(int(content_length))
    content_type = (metadata.get("ContentType") or payload.mime).lower()
    validate_mime(content_type)

    attachment = Attachment(
        owner_type=payload.owner_type,
        owner_id=payload.owner_id,
        storage_key=payload.key,
        filename=payload.filename,
        mime=content_type,
        size=int(content_length),
        created_by=user.id,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    return AttachmentRead(
        id=attachment.id,
        owner_type=attachment.owner_type,
        owner_id=attachment.owner_id,
        filename=attachment.filename,
        mime=attachment.mime,
        size=attachment.size,
        created_by=attachment.created_by,
        created_by_name=user.name,
        created_at=attachment.created_at,
    )


@router.get("/{attachment_id}/sign-get", response_model=AttachmentDownloadSignature)
def sign_attachment_download(
    attachment_id: int,
    *,
    db: DbSession,
    user: CurrentUser,
) -> AttachmentDownloadSignature:
    attachment = db.get(Attachment, attachment_id)
    if attachment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    _ensure_owner_access(db, attachment.owner_type, attachment.owner_id, user, write=False)
    bucket, client = _ensure_storage_ready()
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": attachment.storage_key},
        ExpiresIn=120,
    )
    url = rewrite_presigned_url(url)
    return AttachmentDownloadSignature(url=url)


@router.delete("/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(
    attachment_id: int,
    *,
    db: DbSession,
    user: CurrentUser,
) -> None:
    attachment = db.get(Attachment, attachment_id)
    if attachment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    _ensure_owner_access(db, attachment.owner_type, attachment.owner_id, user, write=True)
    bucket, client = _ensure_storage_ready()
    delete_object(client, bucket, attachment.storage_key)

    db.delete(attachment)
    db.commit()

