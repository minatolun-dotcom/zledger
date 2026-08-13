"""Recurring template API: CRUD + manual run + background processor."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user, require_role
from app.models.user import Company, User
from app.models.recurring_template import RecurringTemplate
from app.schemas.member import CompanyRole
from app.services.recurring_templates import _advance_date, process_one_template

router = APIRouter(tags=["recurring-templates"])


class RecurringTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    voucher_type: str = Field(..., pattern=r"^(sales|purchase|payment|receipt|journal|credit_note|debit_note|contra)$")
    frequency: str = Field(..., pattern=r"^(daily|weekly|monthly|yearly)$")
    next_run_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    template_payload: dict
    round_off_to: int | None = Field(None, ge=0, le=2, description="0=Auto, 1=Round Up, 2=Round Down — merged into template_payload")


class RecurringTemplateUpdate(BaseModel):
    """All fields optional — used for PATCH (e.g. pause/resume toggles is_active)."""
    name: str | None = Field(None, min_length=1, max_length=255)
    voucher_type: str | None = Field(None, pattern=r"^(sales|purchase|payment|receipt|journal|credit_note|debit_note|contra)$")
    frequency: str | None = Field(None, pattern=r"^(daily|weekly|monthly|yearly)$")
    next_run_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    template_payload: dict | None = None
    is_active: bool | None = None
    round_off_to: int | None = Field(None, ge=0, le=2, description="0=Auto, 1=Round Up, 2=Round Down — merged into template_payload")


class RecurringTemplateOut(BaseModel):
    id: str
    name: str
    voucher_type: str
    frequency: str
    next_run_date: str
    last_run_date: str | None
    is_active: bool
    round_off_to: int | None
    consecutive_failures: int = 0
    last_error: str | None = None
    created_at: str | None


class RecurringTemplateDetail(RecurringTemplateOut):
    template_payload: dict


def _normalize_round_off(value) -> int | None:
    """Coerce a stored round_off_to to int (0/1/2) or None."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _tmpl_to_dict(tmpl: RecurringTemplate) -> dict:
    payload = tmpl.template_payload or {}
    return {
        "id": tmpl.id,
        "name": tmpl.name,
        "voucher_type": tmpl.voucher_type,
        "frequency": tmpl.frequency,
        "next_run_date": tmpl.next_run_date,
        "last_run_date": tmpl.last_run_date,
        "is_active": tmpl.is_active,
        "round_off_to": _normalize_round_off(payload.get("round_off_to")),
        "consecutive_failures": tmpl.consecutive_failures or 0,
        "last_error": tmpl.last_error,
        "created_at": tmpl.created_at.isoformat() if tmpl.created_at else None,
        "template_payload": payload,
    }


def _merge_round_off(payload: dict, round_off_to: int | None) -> dict:
    """Merge the round-off mode into the template payload (removed when None)."""
    merged = dict(payload)
    if round_off_to is None:
        merged.pop("round_off_to", None)
    else:
        merged["round_off_to"] = int(round_off_to)
    return merged


@router.get("", response_model=list[RecurringTemplateOut])
def list_templates(
    voucher_type: str | None = None,
    is_active: bool | None = None,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    q = db.query(RecurringTemplate).filter(RecurringTemplate.company_id == company.id)
    if voucher_type:
        q = q.filter(RecurringTemplate.voucher_type == voucher_type)
    if is_active is not None:
        q = q.filter(RecurringTemplate.is_active == is_active)
    return [_tmpl_to_dict(t) for t in q.order_by(RecurringTemplate.next_run_date).all()]


@router.post("", response_model=RecurringTemplateDetail, status_code=201)
def create_template(
    payload: RecurringTemplateCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Merge the top-level round-off mode ONLY when explicitly provided
    # (explicit None clears it); otherwise keep the payload as-is — templates
    # saved from voucher forms embed the mode inside template_payload and must
    # not be stripped of it.
    template_payload = (
        _merge_round_off(payload.template_payload, payload.round_off_to)
        if "round_off_to" in payload.model_fields_set
        else payload.template_payload
    )
    tmpl = RecurringTemplate(
        company_id=company.id,
        name=payload.name,
        voucher_type=payload.voucher_type,
        frequency=payload.frequency,
        next_run_date=payload.next_run_date,
        is_active=True,
        template_payload=template_payload,
        created_by=user.id,
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return _tmpl_to_dict(tmpl)


@router.get("/{tmpl_id}", response_model=RecurringTemplateDetail)
def get_template(
    tmpl_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    tmpl = db.get(RecurringTemplate, tmpl_id)
    if not tmpl or tmpl.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Template not found")
    return _tmpl_to_dict(tmpl)


@router.patch("/{tmpl_id}", response_model=RecurringTemplateDetail)
def update_template(
    tmpl_id: str,
    payload: RecurringTemplateUpdate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    tmpl = db.get(RecurringTemplate, tmpl_id)
    if not tmpl or tmpl.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Template not found")
    if payload.name is not None:
        tmpl.name = payload.name
    if payload.voucher_type is not None:
        tmpl.voucher_type = payload.voucher_type
    if payload.frequency is not None:
        tmpl.frequency = payload.frequency
    if payload.next_run_date is not None:
        tmpl.next_run_date = payload.next_run_date
    if payload.template_payload is not None:
        tmpl.template_payload = payload.template_payload
    if "round_off_to" in payload.model_fields_set:
        tmpl.template_payload = _merge_round_off(tmpl.template_payload, payload.round_off_to)
    if payload.is_active is not None:
        tmpl.is_active = payload.is_active
        # Resuming (re-activating) clears the failure bookkeeping so the
        # auto-pause state doesn't linger after the user fixes the cause.
        if payload.is_active:
            tmpl.consecutive_failures = 0
            tmpl.last_error = None
    db.commit()
    db.refresh(tmpl)
    return _tmpl_to_dict(tmpl)


@router.delete("/{tmpl_id}", status_code=204)
def delete_template(
    tmpl_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    tmpl = db.get(RecurringTemplate, tmpl_id)
    if not tmpl or tmpl.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Template not found")
    db.delete(tmpl)
    db.commit()


@router.post("/{tmpl_id}/run", response_model=RecurringTemplateDetail)
def run_template_now(
    tmpl_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually trigger a voucher from this template."""
    tmpl = db.get(RecurringTemplate, tmpl_id)
    if not tmpl or tmpl.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Template not found")

    from sqlalchemy import update
    from app.schemas.voucher import VoucherCreate
    from app.services.voucher_service import create_voucher as service_create_voucher

    # Snapshot before the call — create_voucher commits internally and a
    # rollback may detach the instance, so bookkeeping uses bulk updates.
    tmpl_id = tmpl.id
    frequency = tmpl.frequency
    next_run = tmpl.next_run_date

    from datetime import datetime, timezone
    from app.models.recurring_template_log import RecurringTemplateLog
    now = datetime.now(timezone.utc)

    # Scope the failed create's partial writes to a SAVEPOINT (never a full
    # Session.rollback(), which is destructive under the shared-session test
    # harness and unnecessary here) — the log row must still be writable after
    # the failure cleanup.
    nested = None
    voucher_number: str | None = None
    try:
        nested = db.begin_nested()
        voucher_data = VoucherCreate(**dict(tmpl.template_payload or {}))
        voucher_data.voucher_date = date.today().isoformat()
        voucher = service_create_voucher(db, company, voucher_data, user.id)
        voucher_number = voucher.voucher_number
        if nested.is_active:
            nested.commit()
        nested = None
    except Exception as e:
        # A manual run surfaces the error to the user (re-raise) but records
        # the reason for the status tooltip + run history. Manual failures
        # deliberately do NOT count toward the auto-pause counter — the user
        # is present and sees the error.
        if nested is not None and nested.is_active:
            try:
                nested.rollback()
            except Exception:  # noqa: BLE001
                pass
        msg = str(e)[:500]
        db.execute(
            update(RecurringTemplate).where(RecurringTemplate.id == tmpl_id).values(
                last_error=msg,
            )
        )
        db.add(RecurringTemplateLog(template_id=tmpl_id, run_at=now, success=False, error=msg))
        db.commit()
        raise

    db.execute(
        update(RecurringTemplate).where(RecurringTemplate.id == tmpl_id).values(
            last_run_date=date.today().isoformat(),
            next_run_date=_advance_date(next_run, frequency),
            consecutive_failures=0,
            last_error=None,
        )
    )
    db.add(RecurringTemplateLog(template_id=tmpl_id, run_at=now, success=True, voucher_number=voucher_number))
    db.commit()
    tmpl = db.get(RecurringTemplate, tmpl_id)
    return _tmpl_to_dict(tmpl)


@router.get("/{tmpl_id}/logs")
def template_logs(
    tmpl_id: str,
    limit: int = Query(default=25, ge=1, le=100),
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Recent run history for a template (successes + failures)."""
    tmpl = db.get(RecurringTemplate, tmpl_id)
    if not tmpl or tmpl.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Template not found")
    from app.models.recurring_template_log import RecurringTemplateLog

    logs = (
        db.query(RecurringTemplateLog)
        .filter(RecurringTemplateLog.template_id == tmpl_id)
        .order_by(RecurringTemplateLog.run_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "run_at": log.run_at.isoformat() if log.run_at else None,
            "success": log.success,
            "voucher_number": log.voucher_number,
            "error": log.error,
        }
        for log in logs
    ]


@router.post("/process-due")
def process_due_templates(
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Process all templates due today or earlier. Creates vouchers for each due template.

    Uses the same failure bookkeeping as the cron: a template that fails 3
    consecutive runs is auto-paused with ``last_error`` recorded instead of
    retrying silently forever.
    """
    today = date.today().isoformat()
    due = db.query(RecurringTemplate).filter(
        RecurringTemplate.company_id == company.id,
        RecurringTemplate.is_active.is_(True),
        RecurringTemplate.next_run_date <= today,
    ).all()

    processed = 0
    for tmpl in due:
        if process_one_template(db, company, tmpl, today, user.id)["ok"]:
            processed += 1

    db.commit()
    return {"processed": processed}
