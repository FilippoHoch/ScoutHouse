#!/usr/bin/env sh
set -eu

# opzionale: attesa DB se serve
# python -c "import socket, time, os; h=os.getenv('POSTGRES_HOST','db'); p=int(os.getenv('POSTGRES_PORT','5432')); \
#           [socket.create_connection((h,p)) or exit for _ in[0]]" || true

if [ "${RUN_DB_MIGRATIONS:-false}" = "true" ]; then
  alembic upgrade head
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
