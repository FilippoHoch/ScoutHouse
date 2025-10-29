#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL environment variable is required" >&2
  exit 1
fi

max_attempts=${DB_MAX_ATTEMPTS:-30}
base_sleep=${DB_RETRY_SLEEP:-2}
attempt=1

while (( attempt <= max_attempts )); do
  if pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; then
    break
  fi
  sleep_duration=$(( base_sleep * attempt ))
  echo "[$(date --iso-8601=seconds)] database not ready yet (attempt ${attempt}/${max_attempts}), retrying in ${sleep_duration}s..."
  sleep "$sleep_duration"
  attempt=$(( attempt + 1 ))
  if (( attempt > max_attempts )); then
    echo "Database did not become ready after ${max_attempts} attempts" >&2
    exit 1
  fi
done

echo "[$(date --iso-8601=seconds)] running alembic upgrade head"
alembic upgrade head
