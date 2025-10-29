#!/usr/bin/env bash
set -Eeuo pipefail

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*"; }

: "${DATABASE_URL:?DATABASE_URL non impostata}"

# Attesa DB con errore mostrato
for i in $(seq 1 30); do
  if python - <<'PY'
import os, sys
from sqlalchemy import create_engine, text
url=os.environ['DATABASE_URL']
try:
    eng=create_engine(url, pool_pre_ping=True)
    with eng.connect() as c:
        c.execute(text("select 1")).scalar()
    sys.exit(0)
except Exception as e:
    print("probe_error:", repr(e))
    sys.exit(1)
PY
  then
    log "database raggiungibile"
    break
  else
    delay=$(( i*2 ))
    log "database non pronto (tentativo $i/30). Riprovo tra ${delay}s..."
    sleep "${delay}"
  fi
  if [ "$i" -eq 30 ]; then
     log "database mai pronto. Abort."
     exit 1
  fi
done

log "eseguo alembic upgrade head"
alembic upgrade head
log "migrazioni completate"
