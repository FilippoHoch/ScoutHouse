#!/usr/bin/env bash
set -euo pipefail

HOST="${POSTGRES_HOST:-db}"
PORT="${POSTGRES_PORT:-5432}"
DB="${APP_DB_NAME:-${POSTGRES_DB:-scouthouse}}"
DB_USER="${APP_DB_USER:-scout}"
DB_PASSWORD="${APP_DB_PASSWORD:-scout}"
SUPERUSER="${POSTGRES_USER:-postgres}"
SUPERPASS="${POSTGRES_PASSWORD:-postgres}"

export PGPASSWORD="$SUPERPASS"

until pg_isready -h "$HOST" -p "$PORT" -U "$SUPERUSER" >/dev/null 2>&1; do
  echo "Waiting for database $HOST:$PORT to become ready..."
  sleep 1
done

echo "Ensuring role \"$DB_USER\" exists..."
ROLE_EXISTS=$(psql -h "$HOST" -p "$PORT" -U "$SUPERUSER" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" || true)
if [[ "$ROLE_EXISTS" != "1" ]]; then
  psql -h "$HOST" -p "$PORT" -U "$SUPERUSER" -d postgres -c "CREATE ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${DB_PASSWORD}';"
else
  psql -h "$HOST" -p "$PORT" -U "$SUPERUSER" -d postgres -c "ALTER ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${DB_PASSWORD}';"
fi

echo "Ensuring database \"$DB\" exists and is owned by \"$DB_USER\"..."
DB_EXISTS=$(psql -h "$HOST" -p "$PORT" -U "$SUPERUSER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB}'" || true)
if [[ "$DB_EXISTS" != "1" ]]; then
  psql -h "$HOST" -p "$PORT" -U "$SUPERUSER" -d postgres -c "CREATE DATABASE \"${DB}\" OWNER \"${DB_USER}\";"
else
  psql -h "$HOST" -p "$PORT" -U "$SUPERUSER" -d postgres -c "ALTER DATABASE \"${DB}\" OWNER TO \"${DB_USER}\";"
fi

echo "Granting privileges on database \"$DB\" to \"$DB_USER\"..."
psql -h "$HOST" -p "$PORT" -U "$SUPERUSER" -d "$DB" -c "GRANT ALL PRIVILEGES ON DATABASE \"${DB}\" TO \"${DB_USER}\";"

echo "Database bootstrap complete."
