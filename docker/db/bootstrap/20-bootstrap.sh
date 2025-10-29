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

psql -v ON_ERROR_STOP=1 \
  -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres \
  -v db_name="$POSTGRES_DB" \
  -v app_user="$DB_APP_USER" \
  -v app_pass="$DB_APP_PASSWORD" <<'SQL'
DO $$
DECLARE
  db_name text := :'db_name';
  app_user text := :'app_user';
  app_pass text := :'app_pass';
BEGIN
  -- Crea o aggiorna ruolo applicativo
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_user) THEN
    EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L', app_user, app_pass);
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', app_user, app_pass);
  END IF;

  -- Crea DB se manca e imposta owner all'app user
  IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = db_name) THEN
    EXECUTE format('CREATE DATABASE %I OWNER %I', db_name, app_user);
  ELSE
    EXECUTE format('ALTER DATABASE %I OWNER TO %I', db_name, app_user);
  END IF;
END$$;
SQL

# Permessi schema public nel DB applicativo
psql -v ON_ERROR_STOP=1 \
  -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v app_user="$DB_APP_USER" <<'SQL'
DO $$
DECLARE
  app_user text := :'app_user';
BEGIN
  -- Riduci PUBLIC e assegna permessi allo user app
  EXECUTE 'REVOKE ALL ON SCHEMA public FROM PUBLIC';
  EXECUTE format('GRANT USAGE, CREATE ON SCHEMA public TO %I', app_user);
  -- Rendi lo schema di proprietà dell'app user (idempotente)
  EXECUTE format('ALTER SCHEMA public OWNER TO %I', app_user);
END$$;
SQL

# Facoltativo: consenti CONNECT al DB se revocato altrove
psql -v ON_ERROR_STOP=1 \
  -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres \
  -v db_name="$POSTGRES_DB" -v app_user="$DB_APP_USER" <<'SQL'
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";
SQL

echo "Bootstrap DB completato."
