#!/usr/bin/env bash
set -euo pipefail

DB="${APP_DB_NAME:-${DB_APP_NAME:-${POSTGRES_DB:-scouthouse}}}"
DB_USER="${APP_DB_USER:-${DB_APP_USER:-scout}}"
DB_PASSWORD="${APP_DB_PASSWORD:-${DB_APP_PASSWORD:-scout}}"
SUPERUSER="${POSTGRES_USER:-postgres}"

psql -v ON_ERROR_STOP=1 -U "$SUPERUSER" -d postgres \
  -v role_name="$DB_USER" \
  -v role_password="$DB_PASSWORD" <<'SQL'
DO $$
DECLARE
  role_name text := :'role_name';
  role_password text := :'role_password';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
    EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L', role_name, role_password);
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', role_name, role_password);
  END IF;
END;
$$;
SQL

psql -v ON_ERROR_STOP=1 -U "$SUPERUSER" -d postgres \
  -v db_name="$DB" \
  -v owner="$DB_USER" <<'SQL'
DO $$
DECLARE
  target_db text := :'db_name';
  target_owner text := :'owner';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = target_db) THEN
    EXECUTE format('CREATE DATABASE %I OWNER %I', target_db, target_owner);
  ELSE
    EXECUTE format('ALTER DATABASE %I OWNER TO %I', target_db, target_owner);
  END IF;
END;
$$;
SQL

psql -v ON_ERROR_STOP=1 -U "$SUPERUSER" -d "$DB" \
  -c "GRANT ALL PRIVILEGES ON DATABASE \"${DB}\" TO \"${DB_USER}\";"
