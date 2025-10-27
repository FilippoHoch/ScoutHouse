#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  missing_vars=()
  for var in POSTGRES_HOST POSTGRES_DB POSTGRES_USER; do
    if [[ -z "${!var:-}" ]]; then
      missing_vars+=("$var")
    fi
  done

  if (( ${#missing_vars[@]} > 0 )); then
    echo "DATABASE_URL or POSTGRES_* variables are required (missing: ${missing_vars[*]})" >&2
    exit 1
  fi

  : "${POSTGRES_PORT:=5432}"
  if [[ -n "${POSTGRES_PASSWORD:-}" ]]; then
    DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
  else
    DATABASE_URL="postgresql://${POSTGRES_USER}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
  fi
fi

timestamp="$(date '+%Y-%m-%d_%H%M')"
filename="scouthouse_${timestamp}.sql.gz"
tmpfile="/tmp/${filename}"

pg_dump "${DATABASE_URL}" | gzip >"${tmpfile}"

if [[ -n "${AWS_S3_BUCKET:-}" ]]; then
  args=()
  if [[ -n "${AWS_S3_REGION:-}" ]]; then
    args+=(--region "${AWS_S3_REGION}")
  fi
  if [[ -n "${AWS_ENDPOINT_URL:-}" ]]; then
    args+=(--endpoint-url "${AWS_ENDPOINT_URL}")
  fi
  aws s3 cp "${tmpfile}" "s3://${AWS_S3_BUCKET}/${filename}" "${args[@]}"
else
  dest_dir="${BACKUP_DIR:-/backups}"
  mkdir -p "${dest_dir}"
  cp "${tmpfile}" "${dest_dir}/${filename}"
  find "${dest_dir}" -type f -name 'scouthouse_*.sql.gz' -mtime +13 -delete
fi

rm -f "${tmpfile}"
