#!/usr/bin/env bash
set -euo pipefail

DB="${APP_DB_NAME:-${POSTGRES_DB:-scouthouse}}"
DB_USER="${APP_DB_USER:-scout}"
DB_PASSWORD="${APP_DB_PASSWORD:-scout}"
SUPERUSER="${POSTGRES_USER:-postgres}"

# Create application role if it does not exist
if ! psql -U "$SUPERUSER" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  psql -U "$SUPERUSER" -d postgres -c "CREATE ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${DB_PASSWORD}';"
else
  psql -U "$SUPERUSER" -d postgres -c "ALTER ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${DB_PASSWORD}';"
fi

# Create database if it does not exist and ensure ownership
if ! psql -U "$SUPERUSER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB}'" | grep -q 1; then
  psql -U "$SUPERUSER" -d postgres -c "CREATE DATABASE \"${DB}\" OWNER \"${DB_USER}\";"
else
  psql -U "$SUPERUSER" -d postgres -c "ALTER DATABASE \"${DB}\" OWNER TO \"${DB_USER}\";"
fi

# Ensure privileges on the database
psql -U "$SUPERUSER" -d "$DB" -c "GRANT ALL PRIVILEGES ON DATABASE \"${DB}\" TO \"${DB_USER}\";"
