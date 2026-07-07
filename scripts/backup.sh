#!/bin/sh
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

set -eu

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

mkdir -p "$BACKUP_DIR"

# ── Database backup ──────────────────────────────────────────────────────
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

FILESIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Database backup complete: ${DUMP_FILE} (${FILESIZE})"

# ── Uploads backup ───────────────────────────────────────────────────────
if [ -d "$UPLOADS_DIR" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting uploads backup: ${UPLOADS_DIR} -> ${UPLOADS_FILE}"
  tar czf "$UPLOADS_FILE" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")" 2>/dev/null \
    || echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Warning: uploads backup failed (directory may be empty)"
  if [ -f "$UPLOADS_FILE" ]; then
    UPLOAD_SIZE=$(du -h "$UPLOADS_FILE" | cut -f1)
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Uploads backup complete: ${UPLOADS_FILE} (${UPLOAD_SIZE})"
  fi
else
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Uploads directory not found, skipping"
fi

# ── Rotate old backups ───────────────────────────────────────────────────
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Removing backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "${POSTGRES_DB}_*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "${POSTGRES_DB}_uploads_*.tar.gz" -type f -mtime +"$RETENTION_DAYS" -delete
REMAINING_DB=$(find "$BACKUP_DIR" -name "${POSTGRES_DB}_*.sql.gz" -type f | wc -l)
REMAINING_UP=$(find "$BACKUP_DIR" -name "${POSTGRES_DB}_uploads_*.tar.gz" -type f | wc -l)
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ${REMAINING_DB} database backup(s), ${REMAINING_UP} uploads backup(s) remaining"
