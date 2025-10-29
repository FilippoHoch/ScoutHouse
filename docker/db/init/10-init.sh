#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 \
     -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -v role_name="${DB_APP_USER:-scout}" \
     -v role_password="${DB_APP_PASSWORD:-changeme}" <<'SQL'
DO $do$
DECLARE
  rn text := :'role_name';
  rp text := :'role_password';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rn) THEN
    EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L', rn, rp);
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', rn, rp);
  END IF;
END
$do$;
SQL
