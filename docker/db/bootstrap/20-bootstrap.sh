#!/usr/bin/env bash
set -euo pipefail

HOST="${POSTGRES_HOST:-db}"
PORT="${POSTGRES_PORT:-5432}"
CONNECT_DB="${POSTGRES_DB:-postgres}"
SUPERUSER="${POSTGRES_USER:?POSTGRES_USER is required}"
SUPERPASS="${POSTGRES_PASSWORD:-${PGPASSWORD:-}}"
ROLE_NAME="${DB_APP_USER:-${APP_DB_USER:-scout}}"
TARGET_DB="${DB_APP_NAME:-${APP_DB_NAME:-${CONNECT_DB}}}"

if [[ -z "${SUPERPASS}" ]]; then
  echo "POSTGRES_PASSWORD or PGPASSWORD must be provided for db-bootstrap" >&2
  exit 1
fi

export PGPASSWORD="$SUPERPASS"

until pg_isready -h "$HOST" -p "$PORT" -U "$SUPERUSER" -d "$CONNECT_DB" >/dev/null 2>&1; do
  sleep 1
done

# Role provisioning is handled during initdb (docker/db/init/10-init.sh).
# This bootstrap script only needs to ensure the application database exists
# and is owned by the expected role.
psql -v ON_ERROR_STOP=1 -h "$HOST" -p "$PORT" -U "$SUPERUSER" -d "$CONNECT_DB" <<SQL
DO \$\$
DECLARE
  target_db text := '${TARGET_DB}';
  target_owner text := '${ROLE_NAME}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = target_db) THEN
    EXECUTE format('CREATE DATABASE %I OWNER %I', target_db, target_owner);
  ELSE
    EXECUTE format('ALTER DATABASE %I OWNER TO %I', target_db, target_owner);
  END IF;
END
\$\$;
SQL

psql -v ON_ERROR_STOP=1 -h "$HOST" -p "$PORT" -U "$SUPERUSER" -d "$TARGET_DB" \
  -c "GRANT ALL PRIVILEGES ON DATABASE \"${TARGET_DB}\" TO \"${ROLE_NAME}\";"

