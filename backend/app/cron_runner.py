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
    from app.models.voucher import RecurringTemplate
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
    engine = create_engine(database_url, pool_pre_ping=True)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    while True:
        try:
            db = session_factory()
            try:
                processed = process_due_for_all_companies(db)
                if processed > 0:
                    logger.info("Processed %d due templates", processed)
            finally:
                db.close()
        except Exception as e:
            logger.error("Cron run failed: %s", e)

        await asyncio.sleep(interval_minutes * 60)


if __name__ == "__main__":
    asyncio.run(main())
