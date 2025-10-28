#!/usr/bin/env bash
set -euo pipefail

DB="${POSTGRES_DB:-scout}"
USER="${POSTGRES_USER:-postgres}"

if ! psql -U "$USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB}'" | grep -q 1; then
  psql -U "$USER" -d postgres -c "CREATE DATABASE \"${DB}\";"
fi
