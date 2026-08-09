#!/usr/bin/env bash
# Zledger — Backup script (database + uploads)
# Usage: ./scripts/backup.sh [RETENTION_DAYS]
#
# Creates a timestamped pg_dump of the zledger database
# and a tarball of the uploads directory (logos, attachments).
# Old backups beyond RETENTION_DAYS are automatically deleted.
#
# Environment variables (all have defaults):
#   POSTGRES_HOST      — database host          (default: db)
#   POSTGRES_PORT      — database port          (default: 5432)
#   POSTGRES_USER      — database user          (default: zledger)
#   POSTGRES_PASSWORD  — database password      (default: zledger)
#   POSTGRES_DB        — database name          (default: zledger)
#   BACKUP_DIR         — where to store dumps   (default: /backups)
#   UPLOADS_DIR        — uploads directory       (default: /uploads)

set -euo pipefail

POSTGRES_HOST="${POSTGRES_HOST:-db}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-zledger}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-zledger}"
POSTGRES_DB="${POSTGRES_DB:-zledger}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
UPLOADS_DIR="${UPLOADS_DIR:-/uploads}"
RETENTION_DAYS="${1:-${RETENTION_DAYS:-30}}"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
DUMP_FILE="${BACKUP_DIR}/${POSTGRES_DB}_${TIMESTAMP}.sql.gz"
UPLOADS_FILE="${BACKUP_DIR}/${POSTGRES_DB}_uploads_${TIMESTAMP}.tar.gz"

# ── Progress tracking ──────────────────────────────────────────────────
PROGRESS_FILE="${BACKUP_DIR}/backup-progress.json"

write_progress() {
  step="$1"
  step_label="$2"
  status="${3:-running}"
  error_msg="${4:-}"
  cat > "$PROGRESS_FILE" <<PROGRESS_EOF
{
  "step": "${step}",
  "step_label": "${step_label}",
  "status": "${status}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "dump_file": "$(basename "${DUMP_FILE}")",
  "uploads_file": "$(basename "${UPLOADS_FILE}")"
}
PROGRESS_EOF
}

# The progress file is deliberately KEPT in every terminal state. On failure
# it holds status "error" so the API polling can surface the reason to the
# UI; on success it holds "done" so the API/frontend pollers actually observe
# completion (deleting it on success made the run look like a silent no-op —
# the file vanished mid-sync and the UI never showed a success toast). The
# API trigger removes the file at the start of every new run, so a stale
# "done" never lingers across runs.
BACKUP_STATUS="running"

fail() {
  BACKUP_STATUS="error"
  write_progress "failed" "${2:-Backup failed}" "error" "${1:-Unknown error}"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: $1" >&2
  exit 1
}
# Any unexpected command failure surfaces as a failed backup instead of
# leaving the UI polling a stale "running" progress file.
trap 'fail "Backup failed (unexpected error)" "Backup failed"' ERR

mkdir -p "$BACKUP_DIR"

# ── Database backup ──────────────────────────────────────────────────────
write_progress "db_dump" "Backing up database" "running"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting database backup: ${POSTGRES_DB} -> ${DUMP_FILE}"

PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  -Fc \
  | gzip > "$DUMP_FILE"

# ── Sanity-check the dump ───────────────────────────────────────────────
# A near-empty gzip means pg_dump captured the database mid-reset (schema
# dropped) and produced garbage that would restore as an empty DB. Fail
# loudly instead of silently uploading a useless backup to GDrive.
DUMP_BYTES=$(wc -c < "$DUMP_FILE" 2>/dev/null || echo 0)
if [ "$DUMP_BYTES" -lt 1024 ]; then
  rm -f "$DUMP_FILE"
  fail "Database dump is suspiciously small (${DUMP_BYTES} bytes) — database may be empty or mid-reset. Refusing to keep this backup." "Database backup failed"
fi
if ! gzip -t "$DUMP_FILE" 2>/dev/null; then
  rm -f "$DUMP_FILE"
  fail "Database dump is not valid gzip (${DUMP_BYTES} bytes)" "Database backup failed"
fi

FILESIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Database backup complete: ${DUMP_FILE} (${FILESIZE})"
write_progress "db_dump_done" "Database backup complete" "running"

# ── Uploads backup ───────────────────────────────────────────────────────
if [ -d "$UPLOADS_DIR" ]; then
  write_progress "uploads" "Backing up uploads" "running"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting uploads backup: ${UPLOADS_DIR} -> ${UPLOADS_FILE}"
  tar czf "$UPLOADS_FILE" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")" 2>/dev/null \
    || echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Warning: uploads backup failed (directory may be empty)"
  if [ -f "$UPLOADS_FILE" ]; then
    UPLOAD_SIZE=$(du -h "$UPLOADS_FILE" | cut -f1)
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Uploads backup complete: ${UPLOADS_FILE} (${UPLOAD_SIZE})"
    write_progress "uploads_done" "Uploads backup complete" "running"
  fi
else
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Uploads directory not found, skipping"
  write_progress "uploads_done" "Uploads backup skipped (not found)" "running"
fi

# ── Rotate old backups ───────────────────────────────────────────────────
write_progress "rotation" "Rotating old backups" "running"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Removing backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "${POSTGRES_DB}_*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "${POSTGRES_DB}_uploads_*.tar.gz" -type f -mtime +"$RETENTION_DAYS" -delete
REMAINING_DB=$(find "$BACKUP_DIR" -name "${POSTGRES_DB}_*.sql.gz" -type f | wc -l)
REMAINING_UP=$(find "$BACKUP_DIR" -name "${POSTGRES_DB}_uploads_*.tar.gz" -type f | wc -l)
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ${REMAINING_DB} database backup(s), ${REMAINING_UP} uploads backup(s) remaining"
write_progress "rotation_done" "Rotation complete" "running"

# ── Google Drive upload ─────────────────────────────────────────────────
if [ -f "${BACKUP_DIR}/gdrive-enabled" ]; then
  GDRIVE_ENABLED="true"
else
  GDRIVE_ENABLED="false"
fi

if [ "${GDRIVE_ENABLED}" = "true" ]; then
  SYNC_START=$(date +%s)
  STATUS_FILE="${BACKUP_DIR}/sync-status.json"
  SYNC_ERROR=""

  write_progress "gdrive" "Uploading to Google Drive" "running"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting Google Drive upload..."

  # Upload database dump
  if [ -f "$DUMP_FILE" ]; then
    echo "  Uploading $(basename "$DUMP_FILE")..."
    if ! rclone copy "$DUMP_FILE" "gdrive:${GDRIVE_REMOTE_PATH:-zledger-backups}/" \
        --fast-list --stats 30s 2>&1; then
      SYNC_ERROR="Failed to upload database dump"
      echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: $SYNC_ERROR"
    fi
  fi

  # Upload uploads tarball
  if [ -f "$UPLOADS_FILE" ]; then
    echo "  Uploading $(basename "$UPLOADS_FILE")..."
    if ! rclone copy "$UPLOADS_FILE" "gdrive:${GDRIVE_REMOTE_PATH:-zledger-backups}/" \
        --fast-list --stats 30s 2>&1; then
      SYNC_ERROR="${SYNC_ERROR:+$SYNC_ERROR; }Failed to upload uploads tarball"
      echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: Failed to upload uploads tarball"
    fi
  fi

  SYNC_END=$(date +%s)
  SYNC_DURATION=$((SYNC_END - SYNC_START))
  SYNC_STATUS="success"
  [ -n "$SYNC_ERROR" ] && SYNC_STATUS="error"

  # Write sync status for API endpoint
  cat > "$STATUS_FILE" <<STATUS_EOF
{
  "gdrive_enabled": true,
  "last_sync_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "last_sync_status": "${SYNC_STATUS}",
  "last_sync_files": ["$(basename "${DUMP_FILE}")", "$(basename "${UPLOADS_FILE}")"],
  "last_sync_duration_seconds": ${SYNC_DURATION},
  "last_error": "${SYNC_ERROR}"
}
STATUS_EOF

  # Prune remote backups older than the retention period so Drive storage
  # stays bounded — the local rotation above only touches the volume, so
  # without this the copies synced to Google Drive grow forever. Only run
  # after a successful sync (a failed upload means we shouldn't compound
  # the error with a delete pass); failures here are non-fatal warnings.
  if [ "${SYNC_STATUS}" = "success" ]; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Pruning remote backups older than ${RETENTION_DAYS} days..."
    if ! rclone delete "gdrive:${GDRIVE_REMOTE_PATH:-zledger-backups}/" \
        --min-age "${RETENTION_DAYS}d" --fast-list 2>&1; then
      echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] WARNING: remote prune failed (non-fatal)"
    fi
  fi

  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Google Drive sync ${SYNC_STATUS} (${SYNC_DURATION}s)"
fi

# ── Complete ─────────────────────────────────────────────────────────────
BACKUP_STATUS="ok"
write_progress "done" "Backup complete" "done"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup completed successfully"
