# File Storage Guidelines

The ScoutHouse platform stores binary attachments (PDF documents and images) on
an S3-compatible object storage. Uploads happen directly from the browser to S3
via presigned forms, while downloads are proxied through the API using
short-lived signed tokens.

## Storage policy

- **Bucket** – Configure the backend with `S3_BUCKET` and related credentials.
- **Public endpoint** – When using a private object store (like MinIO in Docker),
  expose the service to browsers with `S3_PUBLIC_ENDPOINT` so presigned URLs use
  a reachable host.
- **Max size** – Each attachment can be up to **5 MiB**.
- **Allowed types** – `application/pdf` and any `image/*` MIME type.
- **Retention** – Attachments remain until explicitly deleted via the API.
- **Security** – All objects are stored privately. Upload URLs are presigned for
  direct browser access, while download links are API URLs backed by
  short-lived tokens (default 3 minutes for attachments, 10 minutes for inline
  previews).

## Upload flow

1. The frontend asks the API for a presigned form (`POST /api/v1/attachments/sign-put`).
2. The file is uploaded directly to S3 using the returned URL and form fields.
3. Once the upload completes, the client confirms it with
   `POST /api/v1/attachments/confirm`, which persists the metadata in the
   database.

## Download flow

- The client requests a short-lived URL with `GET /api/v1/attachments/{id}/sign-get`.
- The API returns a signed API URL (`/api/v1/attachments/download/{token}`) that
  streams the file to the browser without exposing the underlying S3 endpoint.

## Cleanup

- Removing an attachment via `DELETE /api/v1/attachments/{id}` deletes both the
  database record and the object stored in S3.
