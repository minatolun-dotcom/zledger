#!/bin/sh
# Entrypoint for backup service with optional rclone GDrive support.
# Generates rclone config at startup if GDRIVE_ENABLED=true,
# then runs the backup loop.
set -eu

# ── Generate rclone config if GDrive is enabled ──────────────────────────
if [ "${GDRIVE_ENABLED:-false}" = "true" ]; then
  TOKEN_FILE="${GDRIVE_TOKEN_FILE:-/run/secrets/gdrive-token.json}"

  if [ ! -f "$TOKEN_FILE" ]; then
    echo "ERROR: GDRIVE_ENABLED=true but token file not found: $TOKEN_FILE"
    echo "Run 'rclone authorize gdrive' on your local machine, then save the output to config/rclone/token.json"
    exit 1
  fi

  mkdir -p /root/.config/rclone
  cat > /root/.config/rclone/rclone.conf <<RCLONE_EOF
[gdrive]
type = drive
scope = drive
token = $(cat "$TOKEN_FILE")
RCLONE_EOF

  echo "rclone config generated. Google Drive sync: ENABLED"
  echo "  Remote folder: ${GDRIVE_REMOTE_PATH:-zledger-backups}"
else
  echo "Google Drive sync: DISABLED"
fi

# ── Backup loop ──────────────────────────────────────────────────────────
echo "Backup service started. Interval: ${BACKUP_INTERVAL_HOURS}h, Retention: ${RETENTION_DAYS}d"
while true; do
  /usr/local/bin/backup.sh || echo "Backup failed, will retry next cycle"
  echo "Next backup in ${BACKUP_INTERVAL_HOURS} hours"
  sleep "${BACKUP_INTERVAL_HOURS}h"
done
