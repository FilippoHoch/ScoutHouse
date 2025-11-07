# File Storage Guidelines

The ScoutHouse platform stores binary attachments (PDF documents and images) on
an S3-compatible object storage. The application never proxies file contents
through the backend API; clients upload and download files directly using
presigned URLs.

## Storage policy

- **Bucket** – Configure the backend with `S3_BUCKET` and related credentials.
- **Public endpoint** – When using a private object store (like MinIO in Docker),
  expose the service to browsers with `S3_PUBLIC_ENDPOINT` so presigned URLs use
  a reachable host.
- **Max size** – Each attachment can be up to **5 MiB**.
- **Allowed types** – `application/pdf` and any `image/*` MIME type.
- **Retention** – Attachments remain until explicitly deleted via the API.
- **Security** – All objects are stored privately and accessed through
  presigned URLs that expire after a short time window (default 2 minutes).

## Upload flow

1. The frontend asks the API for a presigned form (`POST /api/v1/attachments/sign-put`).
2. The file is uploaded directly to S3 using the returned URL and form fields.
3. Once the upload completes, the client confirms it with
   `POST /api/v1/attachments/confirm`, which persists the metadata in the
   database.

## Download flow

- The client requests a short-lived URL with `GET /api/v1/attachments/{id}/sign-get`
  and then downloads the file straight from S3.

## Cleanup

- Removing an attachment via `DELETE /api/v1/attachments/{id}` deletes both the
  database record and the object stored in S3.
