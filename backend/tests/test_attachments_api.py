from __future__ import annotations

import os
import sys
import types
from typing import Any, Generator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from botocore.exceptions import ClientError


def _install_boto_stubs() -> None:
    if "boto3" not in sys.modules:
        boto3_stub = types.ModuleType("boto3")

        def _client(*_args: Any, **_kwargs: Any) -> Any:
            raise AssertionError("boto3 client stub invoked without monkeypatching")

        boto3_stub.client = _client  # type: ignore[attr-defined]
        sys.modules["boto3"] = boto3_stub

    botocore_stub = sys.modules.setdefault("botocore", types.ModuleType("botocore"))

    if "botocore.client" not in sys.modules:
        client_stub = types.ModuleType("botocore.client")

        class BaseClient:  # noqa: D401 - simple stub for typing
            """Minimal stub matching the interface used in tests."""

            pass

        client_stub.BaseClient = BaseClient  # type: ignore[attr-defined]
        sys.modules["botocore.client"] = client_stub
        setattr(botocore_stub, "client", client_stub)

    if "botocore.config" not in sys.modules:
        config_stub = types.ModuleType("botocore.config")

        class Config:  # noqa: D401 - simple stub for typing
            """Minimal stub capturing initialisation arguments."""

            def __init__(self, *_args: Any, **_kwargs: Any) -> None:
                self.args = _args
                self.kwargs = _kwargs

        config_stub.Config = Config  # type: ignore[attr-defined]
        sys.modules["botocore.config"] = config_stub
        setattr(botocore_stub, "config", config_stub)

    if "botocore.exceptions" not in sys.modules:
        exceptions_stub = types.ModuleType("botocore.exceptions")

        class ClientError(Exception):
            def __init__(self, response: dict[str, Any], operation_name: str) -> None:
                super().__init__(operation_name)
                self.response = response
                self.operation_name = operation_name

        exceptions_stub.ClientError = ClientError  # type: ignore[attr-defined]
        sys.modules["botocore.exceptions"] = exceptions_stub
        setattr(botocore_stub, "exceptions", exceptions_stub)


_install_boto_stubs()

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")

from app.api.v1 import attachments as attachments_api  # noqa: E402
from app.api.v1 import structures as structures_api  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.db import Base, engine  # noqa: E402
from app.core.limiter import TEST_RATE_LIMIT_HEADER  # noqa: E402
from app.main import app  # noqa: E402
from app.models import EventMemberRole  # noqa: E402
from app.services import attachments as attachment_service  # noqa: E402

from tests.utils import (  # noqa: E402
    TEST_USER_PASSWORD,
    auth_headers,
    create_user,
)


class FakeS3Client:
    def __init__(self) -> None:
        self.head_responses: dict[str, dict[str, Any]] = {}
        self.deleted: list[tuple[str, str]] = []
        self.presigned_posts: list[dict[str, Any]] = []
        self.presigned_urls: list[dict[str, Any]] = []
        self.buckets: set[str] = set()

    def add_head(self, key: str, response: dict[str, Any]) -> None:
        self.head_responses[key] = response

    def head_bucket(self, *, Bucket: str) -> dict[str, Any]:
        if Bucket not in self.buckets:
            raise ClientError({"Error": {"Code": "404"}}, "HeadBucket")
        return {}

    def create_bucket(self, *, Bucket: str, **_kwargs: Any) -> dict[str, Any]:
        if Bucket in self.buckets:
            raise ClientError({"Error": {"Code": "BucketAlreadyOwnedByYou"}}, "CreateBucket")
        self.buckets.add(Bucket)
        return {}

    def head_object(self, *, Bucket: str, Key: str) -> dict[str, Any]:
        try:
            return self.head_responses[Key]
        except KeyError as exc:  # pragma: no cover - defensive guard
            raise AssertionError(f"Unexpected head_object call for {Key}") from exc

    def delete_object(self, *, Bucket: str, Key: str) -> None:
        self.deleted.append((Bucket, Key))

    def generate_presigned_post(
        self,
        *,
        Bucket: str,
        Key: str,
        Fields: dict[str, Any],
        Conditions: list[Any],
        ExpiresIn: int,
    ) -> dict[str, Any]:
        self.presigned_posts.append(
            {
                "Bucket": Bucket,
                "Key": Key,
                "Fields": Fields,
                "Conditions": Conditions,
                "ExpiresIn": ExpiresIn,
            }
        )
        return {
            "url": f"https://s3.example.com/{Bucket}",
            "fields": {
                **Fields,
                "policy": "stub-policy",
                "x-amz-signature": "stub-signature",
            },
        }

    def generate_presigned_url(
        self,
        client_method: str,
        *,
        Params: dict[str, Any] | None = None,
        ExpiresIn: int = 3600,
    ) -> str:
        params = Params or {}
        self.presigned_urls.append(
            {
                "ClientMethod": client_method,
                "Params": params,
                "ExpiresIn": ExpiresIn,
            }
        )
        key = params.get("Key", "object")
        return f"https://s3.example.com/{key}"


@pytest.fixture(autouse=True)
def setup_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def configure_storage(monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    monkeypatch.setenv("S3_BUCKET", "test-bucket")
    monkeypatch.setenv("S3_ACCESS_KEY", "test-access")
    monkeypatch.setenv("S3_SECRET_KEY", "test-secret")
    monkeypatch.setenv("S3_REGION", "eu-west-1")
    monkeypatch.setenv("S3_PUBLIC_ENDPOINT", "https://s3.example.com")
    get_settings.cache_clear()
    if hasattr(attachment_service.get_s3_client, "cache_clear"):
        attachment_service.get_s3_client.cache_clear()
    yield
    get_settings.cache_clear()
    if hasattr(attachment_service.get_s3_client, "cache_clear"):
        attachment_service.get_s3_client.cache_clear()


def login_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers={TEST_RATE_LIMIT_HEADER: str(uuid4())},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _install_fake_storage(monkeypatch: pytest.MonkeyPatch) -> FakeS3Client:
    fake_s3 = FakeS3Client()

    def fake_get_client() -> FakeS3Client:
        return fake_s3

    fake_get_client.cache_clear = lambda: None  # type: ignore[attr-defined]
    monkeypatch.setattr(attachments_api, "get_s3_client", fake_get_client)
    monkeypatch.setattr(structures_api, "get_s3_client", fake_get_client)
    monkeypatch.setattr(attachment_service, "get_s3_client", fake_get_client)
    return fake_s3


def test_event_attachment_flow(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    headers = auth_headers(client)

    fake_s3 = _install_fake_storage(monkeypatch)

    event_resp = client.post(
        "/api/v1/events/",
        json={
            "title": "Document upload",
            "branch": "LC",
            "start_date": "2025-08-01",
            "end_date": "2025-08-05",
            "participants": {"lc": 10, "leaders": 2, "eg": 0, "rs": 0},
        },
        headers=headers,
    )
    assert event_resp.status_code == 201, event_resp.text
    event_id = event_resp.json()["id"]

    sign = client.post(
        "/api/v1/attachments/sign-put",
        json={
            "owner_type": "event",
            "owner_id": event_id,
            "filename": "programma.pdf",
            "mime": "application/pdf",
        },
        headers=headers,
    )
    assert sign.status_code == 200, sign.text
    signature = sign.json()
    upload_key = signature["fields"]["key"]

    fake_s3.add_head(upload_key, {"ContentLength": 2048, "ContentType": "application/pdf"})

    confirm = client.post(
        "/api/v1/attachments/confirm",
        json={
            "owner_type": "event",
            "owner_id": event_id,
            "filename": "programma.pdf",
            "mime": "application/pdf",
            "size": 2048,
            "key": upload_key,
        },
        headers=headers,
    )
    assert confirm.status_code == 201, confirm.text
    attachment_id = confirm.json()["id"]

    listed = client.get(
        "/api/v1/attachments",
        params={"owner_type": "event", "owner_id": event_id},
        headers=headers,
    )
    assert listed.status_code == 200, listed.text
    assert len(listed.json()) == 1

    update = client.patch(
        f"/api/v1/attachments/{attachment_id}",
        json={"filename": "programma finale.pdf", "description": "Versione aggiornata"},
        headers=headers,
    )
    assert update.status_code == 200, update.text
    payload = update.json()
    assert payload["filename"] == "programma finale.pdf"
    assert payload["description"] == "Versione aggiornata"

    refreshed = client.get(
        "/api/v1/attachments",
        params={"owner_type": "event", "owner_id": event_id},
        headers=headers,
    )
    assert refreshed.status_code == 200
    assert refreshed.json()[0]["description"] == "Versione aggiornata"

    download = client.get(f"/api/v1/attachments/{attachment_id}/sign-get", headers=headers)
    assert download.status_code == 200, download.text
    assert download.json()["url"].startswith("http")
    assert fake_s3.presigned_urls[-1]["Params"]["ResponseContentDisposition"].startswith(
        "attachment;"
    )

    delete = client.delete(f"/api/v1/attachments/{attachment_id}", headers=headers)
    assert delete.status_code == 204, delete.text
    assert fake_s3.deleted == [("test-bucket", upload_key)]


def test_event_attachment_permissions(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    owner_headers = auth_headers(client)

    fake_s3 = _install_fake_storage(monkeypatch)

    event_resp = client.post(
        "/api/v1/events/",
        json={
            "title": "Permessi",
            "branch": "EG",
            "start_date": "2025-06-10",
            "end_date": "2025-06-12",
            "participants": {"eg": 12, "leaders": 3, "lc": 0, "rs": 0},
        },
        headers=owner_headers,
    )
    assert event_resp.status_code == 201
    event_id = event_resp.json()["id"]

    sign = client.post(
        "/api/v1/attachments/sign-put",
        json={
            "owner_type": "event",
            "owner_id": event_id,
            "filename": "foto.jpg",
            "mime": "image/jpeg",
        },
        headers=owner_headers,
    )
    signature = sign.json()
    upload_key = signature["fields"]["key"]

    fake_s3.add_head(upload_key, {"ContentLength": 1024, "ContentType": "image/jpeg"})

    confirm = client.post(
        "/api/v1/attachments/confirm",
        json={
            "owner_type": "event",
            "owner_id": event_id,
            "filename": "foto.jpg",
            "mime": "image/jpeg",
            "size": 1024,
            "key": upload_key,
        },
        headers=owner_headers,
    )
    assert confirm.status_code == 201
    attachment_id = confirm.json()["id"]

    viewer_email = "viewer@example.com"
    create_user(email=viewer_email, name="Viewer")
    add_viewer = client.post(
        f"/api/v1/events/{event_id}/members",
        json={"email": viewer_email, "role": EventMemberRole.VIEWER.value},
        headers=owner_headers,
    )
    assert add_viewer.status_code == 201

    viewer_headers = login_headers(client, viewer_email, TEST_USER_PASSWORD)
    viewer_list = client.get(
        "/api/v1/attachments",
        params={"owner_type": "event", "owner_id": event_id},
        headers=viewer_headers,
    )
    assert viewer_list.status_code == 200

    viewer_download = client.get(
        f"/api/v1/attachments/{attachment_id}/sign-get",
        headers=viewer_headers,
    )
    assert viewer_download.status_code == 200

    forbidden_delete = client.delete(
        f"/api/v1/attachments/{attachment_id}",
        headers=viewer_headers,
    )
    assert forbidden_delete.status_code == 403

    outsider_email = "outsider@example.com"
    create_user(email=outsider_email, name="Outsider")
    outsider_headers = login_headers(client, outsider_email, TEST_USER_PASSWORD)

    outsider_list = client.get(
        "/api/v1/attachments",
        params={"owner_type": "event", "owner_id": event_id},
        headers=outsider_headers,
    )
    assert outsider_list.status_code == 403


def test_structure_attachment_requires_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    admin_headers = auth_headers(client, is_admin=True)

    _install_fake_storage(monkeypatch)

    structure_resp = client.post(
        "/api/v1/structures/",
        json={
            "name": "Base Documenti",
            "slug": "base-documenti",
            "province": "MI",
            "type": "house",
        },
        headers=admin_headers,
    )
    assert structure_resp.status_code == 201
    structure_id = structure_resp.json()["id"]

    regular_email = "leader@example.com"
    create_user(email=regular_email, name="Leader")
    regular_headers = login_headers(client, regular_email, TEST_USER_PASSWORD)

    forbidden_sign = client.post(
        "/api/v1/attachments/sign-put",
        json={
            "owner_type": "structure",
            "owner_id": structure_id,
            "filename": "scheda.pdf",
            "mime": "application/pdf",
        },
        headers=regular_headers,
    )
    assert forbidden_sign.status_code == 403

    sign = client.post(
        "/api/v1/attachments/sign-put",
        json={
            "owner_type": "structure",
            "owner_id": structure_id,
            "filename": "scheda.pdf",
            "mime": "application/pdf",
        },
        headers=admin_headers,
    )
    assert sign.status_code == 200

    list_regular = client.get(
        "/api/v1/attachments",
        params={"owner_type": "structure", "owner_id": structure_id},
        headers=regular_headers,
    )
    assert list_regular.status_code == 200


def test_structure_photo_flow(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    admin_headers = auth_headers(client, is_admin=True)

    fake_s3 = _install_fake_storage(monkeypatch)

    structure_resp = client.post(
        "/api/v1/structures/",
        json={
            "name": "Base Immagini",
            "slug": "base-immagini",
            "province": "BG",
            "type": "house",
        },
        headers=admin_headers,
    )
    assert structure_resp.status_code == 201, structure_resp.text
    structure_id = structure_resp.json()["id"]

    sign = client.post(
        "/api/v1/attachments/sign-put",
        json={
            "owner_type": "structure",
            "owner_id": structure_id,
            "filename": "facciata.jpg",
            "mime": "image/jpeg",
        },
        headers=admin_headers,
    )
    assert sign.status_code == 200, sign.text
    upload_key = sign.json()["fields"]["key"]
    fake_s3.add_head(upload_key, {"ContentLength": 1024, "ContentType": "image/jpeg"})

    confirm = client.post(
        "/api/v1/attachments/confirm",
        json={
            "owner_type": "structure",
            "owner_id": structure_id,
            "filename": "facciata.jpg",
            "mime": "image/jpeg",
            "size": 1024,
            "key": upload_key,
        },
        headers=admin_headers,
    )
    assert confirm.status_code == 201, confirm.text
    attachment_id = confirm.json()["id"]

    create_photo = client.post(
        f"/api/v1/structures/{structure_id}/photos",
        json={"attachment_id": attachment_id},
        headers=admin_headers,
    )
    assert create_photo.status_code == 201, create_photo.text
    photo_payload = create_photo.json()
    assert photo_payload["url"].startswith("https://")
    photo_id = photo_payload["id"]

    listing = client.get(f"/api/v1/structures/{structure_id}/photos")
    assert listing.status_code == 200, listing.text
    assert len(listing.json()) == 1

    delete = client.delete(
        f"/api/v1/structures/{structure_id}/photos/{photo_id}",
        headers=admin_headers,
    )
    assert delete.status_code == 204, delete.text
    assert any(key == upload_key for _, key in fake_s3.deleted)

    after = client.get(f"/api/v1/structures/{structure_id}/photos")
    assert after.status_code == 200
    assert after.json() == []


def test_structure_photo_requires_image(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    admin_headers = auth_headers(client, is_admin=True)

    fake_s3 = _install_fake_storage(monkeypatch)

    structure_resp = client.post(
        "/api/v1/structures/",
        json={
            "name": "Base Documenti",
            "slug": "base-documenti-foto",
            "province": "TO",
            "type": "house",
        },
        headers=admin_headers,
    )
    assert structure_resp.status_code == 201, structure_resp.text
    structure_id = structure_resp.json()["id"]

    sign = client.post(
        "/api/v1/attachments/sign-put",
        json={
            "owner_type": "structure",
            "owner_id": structure_id,
            "filename": "listino.pdf",
            "mime": "application/pdf",
        },
        headers=admin_headers,
    )
    assert sign.status_code == 200
    upload_key = sign.json()["fields"]["key"]
    fake_s3.add_head(
        upload_key,
        {"ContentLength": 2048, "ContentType": "application/pdf"},
    )

    confirm = client.post(
        "/api/v1/attachments/confirm",
        json={
            "owner_type": "structure",
            "owner_id": structure_id,
            "filename": "listino.pdf",
            "mime": "application/pdf",
            "size": 2048,
            "key": upload_key,
        },
        headers=admin_headers,
    )
    assert confirm.status_code == 201
    attachment_id = confirm.json()["id"]

    create_photo = client.post(
        f"/api/v1/structures/{structure_id}/photos",
        json={"attachment_id": attachment_id},
        headers=admin_headers,
    )
    assert create_photo.status_code == 400
    assert create_photo.json()["detail"] == "Attachment is not an image"

    delete_attachment_resp = client.delete(
        f"/api/v1/attachments/{attachment_id}",
        headers=admin_headers,
    )
    assert delete_attachment_resp.status_code == 204


def test_non_admin_editor_can_manage_structure_photos(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ALLOW_NON_ADMIN_STRUCTURE_EDIT", "true")
    get_settings.cache_clear()

    client = TestClient(app)
    fake_s3 = _install_fake_storage(monkeypatch)

    create_user(email="admin@example.com", name="Admin", is_admin=True)
    admin_headers = login_headers(client, "admin@example.com", TEST_USER_PASSWORD)

    create_structure = client.post(
        "/api/v1/structures",
        json={
            "name": "Base Bosco",
            "slug": "base-bosco",
            "province": "BS",
            "type": "house",
        },
        headers=admin_headers,
    )
    assert create_structure.status_code == 201, create_structure.text
    structure_id = create_structure.json()["id"]

    create_user(email="editor@example.com", name="Editor", is_admin=False)
    editor_headers = login_headers(client, "editor@example.com", TEST_USER_PASSWORD)

    sign = client.post(
        "/api/v1/attachments/sign-put",
        json={
            "owner_type": "structure",
            "owner_id": structure_id,
            "filename": "facciata.jpg",
            "mime": "image/jpeg",
        },
        headers=editor_headers,
    )
    assert sign.status_code == 200, sign.text
    upload_key = sign.json()["fields"]["key"]
    fake_s3.add_head(upload_key, {"ContentLength": 1024, "ContentType": "image/jpeg"})

    confirm = client.post(
        "/api/v1/attachments/confirm",
        json={
            "owner_type": "structure",
            "owner_id": structure_id,
            "filename": "facciata.jpg",
            "mime": "image/jpeg",
            "size": 1024,
            "key": upload_key,
        },
        headers=editor_headers,
    )
    assert confirm.status_code == 201, confirm.text
    attachment_id = confirm.json()["id"]

    create_photo = client.post(
        f"/api/v1/structures/{structure_id}/photos",
        json={"attachment_id": attachment_id},
        headers=editor_headers,
    )
    assert create_photo.status_code == 201, create_photo.text
    photo_id = create_photo.json()["id"]

    delete_photo = client.delete(
        f"/api/v1/structures/{structure_id}/photos/{photo_id}",
        headers=editor_headers,
    )
    assert delete_photo.status_code == 204, delete_photo.text
