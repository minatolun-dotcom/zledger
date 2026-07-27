#!/bin/sh
# Entrypoint for backup service with optional rclone GDrive support.
# Generates rclone config at startup if GDRIVE_ENABLED=true,
# then runs the backup loop.
set -eu

# ── Generate rclone config if GDrive is enabled (env var OR flag file) ──
# The API writes /backups/gdrive-enabled when the user toggles GDrive on,
# so the backup container picks it up without a restart.
GDRIVE_FLAG="${BACKUP_DIR:-/backups}/gdrive-enabled"

_ensure_rclone_config() {
  TOKEN_FILE="${GDRIVE_TOKEN_FILE:-/backups/gdrive-token.json}"
  if [ ! -f "$TOKEN_FILE" ]; then
    echo "ERROR: GDrive enabled but token file not found: $TOKEN_FILE"
    echo "Run 'rclone authorize drive' on your local machine, then save the token."
    return 1
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
  return 0
}

if [ "${GDRIVE_ENABLED:-false}" = "true" ] || [ -f "$GDRIVE_FLAG" ]; then
  GDRIVE_ENABLED="true"
  _ensure_rclone_config || GDRIVE_ENABLED="false"
else
  echo "Google Drive sync: DISABLED"
fi

# ── Backup loop ──────────────────────────────────────────────────────────
echo "Backup service started. Interval: ${BACKUP_INTERVAL_HOURS}h, Retention: ${RETENTION_DAYS}d"
while true; do
  # Re-check GDrive flag before each backup (user may have enabled it via API)
  if [ -f "$GDRIVE_FLAG" ] && [ "${GDRIVE_ENABLED:-false}" != "true" ]; then
    echo "GDrive flag detected, enabling sync..."
    GDRIVE_ENABLED="true"
    _ensure_rclone_config || GDRIVE_ENABLED="false"
  fi
  /usr/local/bin/backup.sh || echo "Backup failed, will retry next cycle"
  echo "Next backup in ${BACKUP_INTERVAL_HOURS} hours"
  sleep "${BACKUP_INTERVAL_HOURS}h"
done
