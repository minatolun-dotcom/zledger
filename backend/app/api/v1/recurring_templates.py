"""Recurring template API: CRUD + manual run + background processor."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user
from app.models.user import Company, User
from app.models.voucher import RecurringTemplate

router = APIRouter(tags=["recurring-templates"])


class RecurringTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    voucher_type: str = Field(..., pattern=r"^(sales|purchase|payment|receipt|journal|credit_note|debit_note|contra)$")
    frequency: str = Field(..., pattern=r"^(daily|weekly|monthly|yearly)$")
    next_run_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    template_payload: dict


class RecurringTemplateOut(BaseModel):
    id: str
    name: str
    voucher_type: str
    frequency: str
    next_run_date: str
    last_run_date: str | None
    is_active: bool
    created_at: str | None


class RecurringTemplateDetail(RecurringTemplateOut):
    template_payload: dict


def _tmpl_to_dict(tmpl: RecurringTemplate) -> dict:
    return {
        "id": tmpl.id,
        "name": tmpl.name,
        "voucher_type": tmpl.voucher_type,
        "frequency": tmpl.frequency,
        "next_run_date": tmpl.next_run_date,
        "last_run_date": tmpl.last_run_date,
        "is_active": tmpl.is_active,
        "created_at": tmpl.created_at.isoformat() if tmpl.created_at else None,
        "template_payload": tmpl.template_payload,
    }


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


@router.get("", response_model=list[RecurringTemplateOut])
def list_templates(
    voucher_type: str | None = None,
    is_active: bool | None = None,
    company: Company = Depends(get_active_company),
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
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tmpl = RecurringTemplate(
        company_id=company.id,
        name=payload.name,
        voucher_type=payload.voucher_type,
        frequency=payload.frequency,
        next_run_date=payload.next_run_date,
        is_active=True,
        template_payload=payload.template_payload,
        created_by=user.id,
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return _tmpl_to_dict(tmpl)


@router.get("/{tmpl_id}", response_model=RecurringTemplateDetail)
def get_template(
    tmpl_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    tmpl = db.get(RecurringTemplate, tmpl_id)
    if not tmpl or tmpl.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Template not found")
    return _tmpl_to_dict(tmpl)


@router.patch("/{tmpl_id}", response_model=RecurringTemplateDetail)
def update_template(
    tmpl_id: str,
    payload: RecurringTemplateCreate,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    tmpl = db.get(RecurringTemplate, tmpl_id)
    if not tmpl or tmpl.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Template not found")
    tmpl.name = payload.name
    tmpl.voucher_type = payload.voucher_type
    tmpl.frequency = payload.frequency
    tmpl.next_run_date = payload.next_run_date
    tmpl.template_payload = payload.template_payload
    db.commit()
    db.refresh(tmpl)
    return _tmpl_to_dict(tmpl)


@router.delete("/{tmpl_id}", status_code=204)
def delete_template(
    tmpl_id: str,
    company: Company = Depends(get_active_company),
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
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually trigger a voucher from this template."""
    tmpl = db.get(RecurringTemplate, tmpl_id)
    if not tmpl or tmpl.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Template not found")

    from app.schemas.voucher import VoucherCreate
    from app.services.voucher_service import create_voucher as service_create_voucher

    voucher_data = VoucherCreate(**tmpl.template_payload)
    voucher_data.voucher_date = date.today().isoformat()

    voucher = service_create_voucher(db, company, voucher_data, user.id)

    tmpl.last_run_date = date.today().isoformat()
    tmpl.next_run_date = _advance_date(tmpl.next_run_date, tmpl.frequency)
    db.commit()
    db.refresh(tmpl)
    return _tmpl_to_dict(tmpl)


@router.post("/process-due")
def process_due_templates(
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Process all templates due today or earlier. Creates vouchers for each due template."""
    from app.schemas.voucher import VoucherCreate
    from app.services.voucher_service import create_voucher as service_create_voucher

    today = date.today().isoformat()
    due = db.query(RecurringTemplate).filter(
        RecurringTemplate.company_id == company.id,
        RecurringTemplate.is_active.is_(True),
        RecurringTemplate.next_run_date <= today,
    ).all()

    processed = 0
    for tmpl in due:
        try:
            voucher_data = VoucherCreate(**tmpl.template_payload)
            voucher_data.voucher_date = today
            service_create_voucher(db, company, voucher_data, user.id)
            tmpl.last_run_date = today
            tmpl.next_run_date = _advance_date(tmpl.next_run_date, tmpl.frequency)
            processed += 1
        except Exception:
            db.rollback()
            continue

    db.commit()
    return {"processed": processed}
