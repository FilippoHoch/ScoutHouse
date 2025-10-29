#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_HOST:=db}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_USER:=postgres}"
: "${POSTGRES_PASSWORD:=postgres}"
: "${POSTGRES_DB:=scouthouse}"
: "${DB_APP_USER:=scout}"
: "${DB_APP_PASSWORD:=changeme}"

export PGPASSWORD="$POSTGRES_PASSWORD"

# Crea/aggiorna ruolo app e DB owner in modo idempotente
psql -v ON_ERROR_STOP=1 \
  -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres \
  -v db_name="$POSTGRES_DB" \
  -v app_user="$DB_APP_USER" \
  -v app_pass="$DB_APP_PASSWORD" <<'SQL'
-- ruolo applicativo
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') THEN
    format('CREATE ROLE %I WITH LOGIN PASSWORD %L', :'app_user', :'app_pass')
  ELSE
    format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'app_user', :'app_pass')
END;
\gexec

-- database + owner
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name') THEN
    format('CREATE DATABASE %I OWNER %I', :'db_name', :'app_user')
  ELSE
    format('ALTER DATABASE %I OWNER TO %I', :'db_name', :'app_user')
END;
\gexec
SQL

# Permessi schema public nel DB applicativo
psql -v ON_ERROR_STOP=1 \
  -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v app_user="$DB_APP_USER" <<'SQL'
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";
ALTER SCHEMA public OWNER TO :"app_user";
SQL

echo "Bootstrap DB completato."
