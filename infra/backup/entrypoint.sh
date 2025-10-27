#!/bin/bash
set -euo pipefail

: "${BACKUP_CRON:=0 2 * * *}"
: "${BACKUP_DIR:=/backups}"

mkdir -p /etc/backup
printenv > /etc/backup/env

cat <<EOF >/etc/cron.d/database-backup
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
${BACKUP_CRON} root /usr/local/bin/backup-cron-wrapper.sh >> /var/log/backup.log 2>&1
EOF

chmod 0644 /etc/cron.d/database-backup
touch /var/log/backup.log

echo "[*] Starting backup scheduler with cron expression '${BACKUP_CRON}'"
cron -f
