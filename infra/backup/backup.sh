#!/bin/bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for backups" >&2
  exit 1
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
