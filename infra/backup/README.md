# Database backups

The `backup` service runs inside Docker Compose to perform daily `pg_dump`
backups of the PostgreSQL database. By default dumps are compressed and stored
under the shared `backup_data` volume mounted at `/backups` inside the
container.

## Configuration

Environment variables are loaded from the repository `.env` file:

- `DATABASE_URL`: connection string used by `pg_dump`. Compose sets it to the
  in-cluster PostgreSQL instance.
- `BACKUP_CRON`: cron expression controlling execution frequency (default
  `0 2 * * *` for 02:00 UTC daily).
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`,
  `AWS_S3_REGION`, `AWS_ENDPOINT_URL`: when `AWS_S3_BUCKET` is provided the
  dump is uploaded to the bucket instead of being stored locally. The optional
  `AWS_ENDPOINT_URL` enables MinIO or other S3-compatible endpoints. Retention
  for S3 is handled via bucket lifecycle policies (14 days recommended).

Local retention is implemented via `find -mtime +13`, effectively keeping 14
days of compressed dumps in the bind mount.

## Restore

To restore from a dump:

```bash
gunzip -c scouthouse_YYYY-MM-DD_HHMM.sql.gz | psql "$DATABASE_URL"
```

For point-in-time recovery or more advanced scenarios, download the desired
file from the bucket (or copy it from the `backup_data` volume) and feed it to
`psql` or `pg_restore` (for custom formats).
