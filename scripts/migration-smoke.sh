#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

docker compose down -v --remove-orphans

docker compose up -d db

docker compose run --rm migrate

docker compose run --rm migrate

if ! docker compose run --rm migrate alembic downgrade -1; then
  echo "Downgrade step failed (expected for empty history). Continuing..."
fi

docker compose run --rm migrate

docker compose down -v --remove-orphans
