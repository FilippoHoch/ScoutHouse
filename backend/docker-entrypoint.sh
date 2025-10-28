#!/bin/bash
set -euo pipefail

if [[ $# -gt 0 ]]; then
    case "$1" in
        alembic)
            exec "$@"
            ;;
    esac
fi

alembic upgrade head

exec "$@"
