#!/bin/sh
# Zledger — Restore script (database + uploads)
# Usage: ./scripts/restore.sh <BACKUP_FILE> [UPLOADS_FILE]
#
# Restores the zledger database from a pg_dump backup.
# Optionally restores uploads (logos, attachments) from a tarball.
# WARNING: This DROPS and recreates the target database.
#
# Environment variables:
#   POSTGRES_HOST      — database host          (default: db)
#   POSTGRES_PORT      — database port          (default: 5432)
#   POSTGRES_USER      — database user          (default: zledger)
#   POSTGRES_PASSWORD  — database password      (default: zledger)
#   POSTGRES_DB        — database name          (default: zledger)
#   UPLOADS_DIR        — uploads directory       (default: /uploads)

set -eu

POSTGRES_HOST="${POSTGRES_HOST:-db}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-zledger}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-zledger}"
POSTGRES_DB="${POSTGRES_DB:-zledger}"
UPLOADS_DIR="${UPLOADS_DIR:-/uploads}"

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <BACKUP_FILE> [UPLOADS_FILE]"
  echo ""
  echo "Available database backups:"
  ls -lh /backups/${POSTGRES_DB}_*.sql.gz 2>/dev/null || echo "  (none)"
  echo ""
  echo "Available uploads backups:"
  ls -lh /backups/${POSTGRES_DB}_uploads_*.tar.gz 2>/dev/null || echo "  (none)"
  exit 1
fi

BACKUP_FILE="$1"
UPLOADS_FILE="${2:-}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "=== Zledger Restore ==="
echo ""
echo "Database backup: ${BACKUP_FILE} (${FILESIZE})"
if [ -n "$UPLOADS_FILE" ] && [ -f "$UPLOADS_FILE" ]; then
  UP_SIZE=$(du -h "$UPLOADS_FILE" | cut -f1)
  echo "Uploads backup:  ${UPLOADS_FILE} (${UP_SIZE})"
elif [ -n "$UPLOADS_FILE" ]; then
  echo "Uploads backup:  ${UPLOADS_FILE} (FILE NOT FOUND - will skip)"
fi
echo ""
echo "WARNING: This will DROP and recreate the database '${POSTGRES_DB}'."
echo ""
read -p "Type 'RESTORE' to confirm: " CONFIRM
if [ "$CONFIRM" != "RESTORE" ]; then
  echo "Aborted."
  exit 1
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Stopping API connections..."
PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();" \
  || true

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Dropping and recreating database..."
PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d postgres \
  -c "DROP DATABASE IF EXISTS ${POSTGRES_DB};" \
  -c "CREATE DATABASE ${POSTGRES_DB};"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Restoring database from backup..."
gunzip -c "$BACKUP_FILE" | PGPASSWORD="$POSTGRES_PASSWORD" pg_restore \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-owner \
  --no-privileges \
  2>&1 || echo "(pg_restore warnings above are normal for some objects)"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Running ANALYZE..."
PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -c "ANALYZE;"

# ── Uploads restore ──────────────────────────────────────────────────────
if [ -n "$UPLOADS_FILE" ] && [ -f "$UPLOADS_FILE" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Restoring uploads..."
  mkdir -p "$UPLOADS_DIR"
  tar xzf "$UPLOADS_FILE" -C "$(dirname "$UPLOADS_DIR")" 2>&1 \
    && echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Uploads restore complete." \
    || echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Warning: uploads restore failed."
else
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Skipping uploads restore (no file specified or file not found)."
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Restore complete."
