"""Recurring template processing — shared by the cron runner and the API.

Centralizes voucher creation from a template payload, date advancement, and
failure bookkeeping (consecutive-failure counter + auto-pause) so the cron and
the manual "process due" endpoint can't drift.

Design note: after a transaction rollback (or the internal commit made by
``service_create_voucher``) ORM instances loaded earlier can be expired or even
detached — mutating them re-triggers a refresh that fails (DetachedInstanceError
under the test harness, where the app session shares the test transaction).
All bookkeeping therefore snapshots the template fields BEFORE the call and
writes results back with bulk Core ``UPDATE`` statements keyed by id, which
never touch instance state.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.recurring_template import RecurringTemplate
from app.models.user import Company

# A template that fails this many consecutive runs is auto-paused instead of
# retrying silently forever (deleted ledger, date outside all FYs, closed FY,
# unbalanced payload, etc.). The user resumes it after fixing the cause.
MAX_CONSECUTIVE_FAILURES = 3


def _advance_date(current: str, frequency: str) -> str:
    """Calculate next run date based on frequency."""
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


def process_one_template(
    db: Session,
    company: Company,
    tmpl: RecurringTemplate,
    run_date: str,
    user_id: str,
) -> dict[str, Any]:
    """Create the voucher for one due recurring template.

    Success: resets the failure counter, records last_run_date, and advances
    next_run_date.

    Failure: rolls back any partial work, increments ``consecutive_failures``,
    records ``last_error``, and after MAX_CONSECUTIVE_FAILURES sets
    ``is_active = False`` (auto-pause) — a permanently broken template stops
    retrying silently forever.

    Returns:
        {"ok": bool, "consecutive_failures": int, "last_error": str | None,
         "auto_paused": bool, "voucher_number": str | None} — callers must
        read this instead of the ORM instance, which may be detached after
        the transaction churn.
    """
    from datetime import datetime, timezone

    from app.models.recurring_template_log import RecurringTemplateLog
    from app.schemas.voucher import VoucherCreate
    from app.services.voucher_service import create_voucher as service_create_voucher

    # Snapshot everything the failure/success bookkeeping needs BEFORE the
    # call — after create_voucher (commit on success) or the failure cleanup
    # the instance may be expired or detached.
    tmpl_id = tmpl.id
    frequency = tmpl.frequency
    next_run = tmpl.next_run_date
    payload = dict(tmpl.template_payload or {})
    now = datetime.now(timezone.utc)

    # The failed create's partial writes (voucher header, numbering bump) are
    # undone via a SAVEPOINT, never a full Session.rollback() — a full
    # rollback is destructive in the shared-session test harness (it wipes the
    # enclosing test transaction) and unnecessary here.
    nested = None
    voucher_number: str | None = None
    try:
        nested = db.begin_nested()
        voucher_data = VoucherCreate(**payload)
        voucher_data.voucher_date = run_date
        voucher = service_create_voucher(db, company, voucher_data, user_id)
        voucher_number = voucher.voucher_number
        if nested.is_active:
            nested.commit()  # release the savepoint (no-op if create committed)
        nested = None
    except Exception as e:  # noqa: BLE001 — any payload/ledger/FY error is a template failure
        if nested is not None and nested.is_active:
            try:
                nested.rollback()
            except Exception:  # noqa: BLE001 — the savepoint may already be gone
                pass
        msg = str(e)[:500]
        cur = db.execute(
            select(RecurringTemplate.consecutive_failures).where(RecurringTemplate.id == tmpl_id)
        ).scalar() or 0
        new_failures = cur + 1
        vals: dict[str, Any] = {"consecutive_failures": new_failures, "last_error": msg}
        auto_paused = new_failures >= MAX_CONSECUTIVE_FAILURES
        if auto_paused:
            vals["is_active"] = False
        db.execute(update(RecurringTemplate).where(RecurringTemplate.id == tmpl_id).values(**vals))
        db.add(RecurringTemplateLog(
            template_id=tmpl_id, run_at=now, success=False, error=msg,
        ))
        db.commit()
        return {
            "ok": False,
            "consecutive_failures": new_failures,
            "last_error": msg,
            "auto_paused": auto_paused,
            "voucher_number": None,
        }

    db.execute(
        update(RecurringTemplate).where(RecurringTemplate.id == tmpl_id).values(
            last_run_date=run_date,
            next_run_date=_advance_date(next_run, frequency),
            consecutive_failures=0,
            last_error=None,
        )
    )
    db.add(RecurringTemplateLog(
        template_id=tmpl_id, run_at=now, success=True, voucher_number=voucher_number,
    ))
    db.commit()
    return {
        "ok": True,
        "consecutive_failures": 0,
        "last_error": None,
        "auto_paused": False,
        "voucher_number": voucher_number,
    }
