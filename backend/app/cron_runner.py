"""Standalone cron runner for recurring template processing.

Runs as a separate Docker service. Loops indefinitely, checking for due
recurring templates across all companies every N minutes.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("cron_runner")


def get_database_url() -> str:
    """Build database URL from environment, matching config.py logic."""
    return os.getenv(
        "DATABASE_URL",
        f"postgresql+psycopg://{os.getenv('POSTGRES_USER', 'zledger')}:"
        f"{os.getenv('POSTGRES_PASSWORD', 'zledger')}@"
        f"{os.getenv('POSTGRES_HOST', 'db')}:"
        f"{os.getenv('POSTGRES_PORT', '5432')}/"
        f"{os.getenv('POSTGRES_DB', 'zledger')}",
    )


def get_interval_minutes() -> int:
    return int(os.getenv("CRON_INTERVAL_MINUTES", "15"))


def get_system_user_id(db: Session) -> str | None:
    """Get the admin user ID to use as 'created_by' for cron-generated vouchers."""
    from app.models.user import User

    email = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "admin@zledger.com")
    user = db.query(User).filter(User.email == email).first()
    return user.id if user else None


def process_due_for_all_companies(db: Session) -> int:
    """Process due recurring templates for all companies."""
    from app.models.user import Company
    from app.models.recurring_template import RecurringTemplate
    from app.schemas.voucher import VoucherCreate
    from app.services.voucher_service import create_voucher as service_create_voucher

    from datetime import date

    today = date.today().isoformat()
    system_user_id = get_system_user_id(db)
    if not system_user_id:
        logger.warning("No system user found — skipping cron run")
        return 0

    companies = db.query(Company).filter(Company.is_active.is_(True)).all()
    total_processed = 0

    for company in companies:
        due = db.query(RecurringTemplate).filter(
            RecurringTemplate.company_id == company.id,
            RecurringTemplate.is_active.is_(True),
            RecurringTemplate.next_run_date <= today,
        ).all()

        for tmpl in due:
            try:
                voucher_data = VoucherCreate(**tmpl.template_payload)
                voucher_data.voucher_date = today
                service_create_voucher(db, company, voucher_data, system_user_id)
                tmpl.last_run_date = today
                tmpl.next_run_date = _advance_date(tmpl.next_run_date, tmpl.frequency)
                db.commit()
                total_processed += 1
                logger.info(
                    "Created %s voucher from template '%s' for company %s",
                    tmpl.voucher_type, tmpl.name, company.id,
                )
            except Exception as e:
                db.rollback()
                logger.error(
                    "Failed to process template '%s' for company %s: %s",
                    tmpl.name, company.id, e,
                )

    return total_processed


def check_gst_due_dates(db: Session) -> int:
    """Create GST due date reminders. Returns number of notifications created."""
    from datetime import date, timedelta
    from app.models.user import Company
    from app.services.notification import notify

    today = date.today()
    companies = db.query(Company).filter(Company.is_active.is_(True)).all()
    created = 0

    # GST returns due on 20th of each month for previous month
    due_day = 20
    days_until_due = (due_day - today.day) % 30

    # Only notify on day 7, 3, 1 before due date (or on due date itself)
    if today.day == due_day:
        msg = "GST returns are due TODAY!"
        category = "warning"
    elif days_until_due == 1:
        msg = "GST returns are due tomorrow (20th)."
        category = "warning"
    elif days_until_due == 3:
        msg = "GST returns are due in 3 days (20th)."
        category = "gst_due"
    elif days_until_due == 7:
        msg = "GST returns are due in 7 days (20th)."
        category = "gst_due"
    else:
        return 0

    for company in companies:
        # Check if we already sent a notification today for this company
        from app.models.notification import Notification
        existing = db.query(Notification).filter(
            Notification.company_id == company.id,
            Notification.category == "gst_due",
            Notification.title == "GST Filing Reminder",
        ).order_by(Notification.created_at.desc()).first()

        if existing and existing.created_at and existing.created_at.date() == today:
            continue

        notify(
            db, company.id,
            title="GST Filing Reminder",
            message=msg,
            category=category,
            link="/daybook",
        )
        created += 1

    if created > 0:
        db.commit()
        logger.info("Created %d GST due date notifications", created)

    return created


def check_backup_health(db: Session) -> int:
    """Detect failed backups / GDrive sync errors and raise in-app alerts.

    Reads the backup container's progress + sync-status files (written by
    backup.sh) and creates a notification for every active company when the
    last run failed or the GDrive upload errored. Deduped per failure via
    the notification entity_id.
    """
    import json
    import os
    from app.models.notification import Notification
    from app.services.notification import backup_health_alert

    backup_dir = os.environ.get("BACKUP_DIR", "/backups")
    created = 0

    # 1) Failed backup run — backup.sh writes status="error"/"failed" on error.
    prog_path = os.path.join(backup_dir, "backup-progress.json")
    try:
        with open(prog_path) as f:
            prog = json.load(f)
    except (OSError, json.JSONDecodeError):
        prog = {}
    if prog.get("status") in ("error", "failed"):
        label = prog.get("step_label") or "Backup failed"
        ts = prog.get("timestamp") or ""
        created += backup_health_alert(
            db,
            title="Backup failed",
            message=f"The last backup did not complete: {label}. Check Backup Management for details.",
            entity_id=f"prog-{ts}",
        )

    # 2) GDrive sync error — sync-status.json carries last_sync_status.
    sync_path = os.path.join(backup_dir, "sync-status.json")
    try:
        with open(sync_path) as f:
            sync = json.load(f)
    except (OSError, json.JSONDecodeError):
        sync = {}
    if sync.get("last_sync_status") == "error":
        err = sync.get("last_error") or "unknown error"
        ts = sync.get("last_sync_at") or ""
        created += backup_health_alert(
            db,
            title="Google Drive sync error",
            message=f"Uploading backups to Google Drive failed: {err}",
            entity_id=f"sync-{ts}",
        )

    if created:
        db.commit()
        logger.info("Created %d backup health alert(s)", created)
    return created


# Memoizes the last (path, mtime) that was fully verified, so the expensive
# full-file `gunzip -t` read only runs when the newest dump actually changes.
# In-memory is deliberate: the scheduler's /backups mount is read-only, and a
# scheduler restart simply re-checks once.
_last_integrity_check: tuple[str, int] | None = None


def check_backup_integrity(db: Session) -> int:
    """Validate the newest database backup is actually restorable.

    A "successful" backup only means pg_dump exited 0 — a truncated file
    (e.g. disk full mid-dump) still passes that. This check verifies the
    newest *.sql.gz with:
      1. `gunzip -t` — full gzip CRC check, catches truncation
      2. PGDMP magic — catches gzip files that are not pg_dump archives

    Raises a backup-health alert (superadmin-company scoped) when the newest
    dump fails, deduped per (filename, mtime) so a persistent corruption
    alerts once instead of spamming the bell every cron pass.
    """
    global _last_integrity_check
    import glob
    import json
    import os
    import subprocess
    import time
    from app.services.notification import backup_health_alert

    backup_dir = os.environ.get("BACKUP_DIR", "/backups")

    # If a backup is mid-run its dump may legitimately be incomplete — skip.
    # But a crashed run leaves status="running" forever (nothing clears it
    # until the next trigger), so only treat a *recent* running state as
    # active: progress files older than an hour are stale and must not block
    # the check — that is exactly the corruption scenario we need to catch.
    try:
        prog_path = os.path.join(backup_dir, "backup-progress.json")
        prog_mtime = os.path.getmtime(prog_path)
        with open(prog_path) as f:
            prog = json.load(f)
        if prog.get("status") == "running" and (time.time() - prog_mtime) < 3600:
            return 0
    except (OSError, json.JSONDecodeError, ValueError):
        pass

    try:
        dumps = sorted(
            glob.glob(os.path.join(backup_dir, "*.sql.gz")),
            key=os.path.getmtime,
            reverse=True,
        )
    except OSError:
        return 0
    if not dumps:
        return 0
    newest = dumps[0]
    filename = os.path.basename(newest)
    mtime = int(os.path.getmtime(newest))

    # Skip re-verifying an unchanged newest dump between cron passes.
    if _last_integrity_check == (newest, mtime):
        return 0

    # 1) Full gzip CRC check — the definitive truncation test.
    gzip_ok = True
    try:
        res = subprocess.run(
            ["gunzip", "-t", newest], capture_output=True, timeout=120,
        )
        gzip_ok = res.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        pass  # gunzip unavailable/timed out — fall through to the magic check

    # 2) PGDMP magic — reject gzip files that aren't pg_dump archives.
    magic_ok = False
    if gzip_ok:
        try:
            import gzip as gzip_mod
            with gzip_mod.open(newest, "rb") as f:
                magic_ok = f.read(5) == b"PGDMP"
        except (OSError, gzip_mod.BadGzipFile, EOFError):
            magic_ok = False

    _last_integrity_check = (newest, mtime)
    if gzip_ok and magic_ok:
        return 0

    reason = (
        "gzip integrity check failed (file may be truncated)"
        if not gzip_ok
        else "not a valid pg_dump archive (PGDMP magic missing)"
    )
    # The notification entity_id column is VARCHAR(36) — use a short hash of
    # (filename, mtime) so each corrupt file+mtime alerts exactly once.
    import hashlib
    sig = hashlib.md5(f"{filename}:{mtime}".encode()).hexdigest()[:16]
    created = backup_health_alert(
        db,
        title="Backup integrity check failed",
        message=f"The newest database backup ({filename}) is corrupt: {reason}. "
        f"Trigger a fresh backup or restore from an older one.",
        entity_id=f"verify-{sig}",
    )
    if created:
        db.commit()
        logger.info("Backup integrity check failed for %s (%s)", filename, reason)
    return created


def _advance_date(current: str, frequency: str) -> str:
    from datetime import date, timedelta

    d = date.fromisoformat(current)
    if frequency == "daily":
        d += timedelta(days=1)
    elif frequency == "weekly":
        d += timedelta(weeks=1)
    elif frequency == "monthly":
        m = d.month + 1
        y = d.year
        if m > 12:
            m = 1
            y += 1
        d = d.replace(year=y, month=m)
    elif frequency == "yearly":
        d = d.replace(year=d.year + 1)
    return d.isoformat()


async def main():
    CRON_ENABLED = os.getenv("CRON_ENABLED", "true").lower() in ("true", "1", "yes")
    if not CRON_ENABLED:
        logger.info("Cron runner is disabled (CRON_ENABLED=false)")
        return

    interval_minutes = get_interval_minutes()
    logger.info("Cron runner starting (interval=%d min)", interval_minutes)

    database_url = get_database_url()
    pool_size = int(os.getenv("DB_POOL_SIZE", "10"))
    max_overflow = int(os.getenv("DB_MAX_OVERFLOW", "20"))
    engine = create_engine(
        database_url,
        pool_pre_ping=True,
        pool_size=pool_size,
        max_overflow=max_overflow,
    )
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    while True:
        try:
            db = session_factory()
            try:
                processed = process_due_for_all_companies(db)
                if processed > 0:
                    logger.info("Processed %d due templates", processed)
                check_gst_due_dates(db)
                check_backup_health(db)
                check_backup_integrity(db)
            finally:
                db.close()
        except Exception as e:
            logger.error("Cron run failed: %s", e)

        await asyncio.sleep(interval_minutes * 60)


if __name__ == "__main__":
    asyncio.run(main())
