#!/usr/bin/env bash
set -euo pipefail

if [[ -f /etc/backup/env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/backup/env
  set +a
fi

/usr/local/bin/backup.sh
