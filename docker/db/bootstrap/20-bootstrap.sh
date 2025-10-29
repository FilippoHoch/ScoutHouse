#!/usr/bin/env bash
set -euo pipefail

HOST="${POSTGRES_HOST:-db}"
PORT="${POSTGRES_PORT:-5432}"
CONNECT_DB="${POSTGRES_DB:-postgres}"
SUPERUSER="${POSTGRES_USER:?POSTGRES_USER is required}"
SUPERPASS="${POSTGRES_PASSWORD:-${PGPASSWORD:-}}"
ROLE_NAME="${DB_APP_USER:-${APP_DB_USER:-scout}}"
ROLE_PASSWORD="${DB_APP_PASSWORD:-${APP_DB_PASSWORD:-changeme}}"
TARGET_DB="${DB_APP_NAME:-${APP_DB_NAME:-${CONNECT_DB}}}"

if [[ -z "${SUPERPASS}" ]]; then
  echo "POSTGRES_PASSWORD or PGPASSWORD must be provided for db-bootstrap" >&2
  exit 1
fi

export PGPASSWORD="$SUPERPASS"

until pg_isready -h "$HOST" -p "$PORT" -U "$SUPERUSER" -d "$CONNECT_DB" >/dev/null 2>&1; do
  sleep 1
done

psql -v ON_ERROR_STOP=1 -h "$HOST" -p "$PORT" -U "$SUPERUSER" -d "$CONNECT_DB" \
  -v role_name="$ROLE_NAME" -v role_password="$ROLE_PASSWORD" <<'SQL'
DO $do$
DECLARE
  role_name text := :'role_name';
  role_password text := :'role_password';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
    EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L', role_name, role_password);
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', role_name, role_password);
  END IF;
END
$do$;
SQL

psql -v ON_ERROR_STOP=1 -h "$HOST" -p "$PORT" -U "$SUPERUSER" -d "$CONNECT_DB" \
  -v db_name="$TARGET_DB" -v owner="$ROLE_NAME" <<'SQL'
DO $do$
DECLARE
  target_db text := :'db_name';
  target_owner text := :'owner';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = target_db) THEN
    EXECUTE format('CREATE DATABASE %I OWNER %I', target_db, target_owner);
  ELSE
    EXECUTE format('ALTER DATABASE %I OWNER TO %I', target_db, target_owner);
  END IF;
END
$do$;
SQL

psql -v ON_ERROR_STOP=1 -h "$HOST" -p "$PORT" -U "$SUPERUSER" -d "$TARGET_DB" \
  -c "GRANT ALL PRIVILEGES ON DATABASE \"${TARGET_DB}\" TO \"${ROLE_NAME}\";"

