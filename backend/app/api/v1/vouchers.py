"""Voucher endpoints with double-entry balance enforcement.

Σ debits == Σ credits enforced at API level.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user
from app.models.user import Company, User
from app.models.voucher import Voucher, VoucherLine
from app.schemas.voucher import VoucherCreate, VoucherListOut, VoucherOut
from app.services.audit import log_action, serialize_voucher
from app.services.voucher_service import create_voucher as service_create_voucher
from pydantic import BaseModel

router = APIRouter()


class NextNumberResponse(BaseModel):
    next_number: str


@router.get("/next-number", response_model=NextNumberResponse)
def get_next_voucher_number(
    voucher_type: str = "sales",
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    from app.services.voucher_service import _next_voucher_number
    number = _next_voucher_number(db, company.id, voucher_type)
    return NextNumberResponse(next_number=number)


def _delete_stock_entries(db: Session, voucher_id: str) -> None:
    from app.models.stock import StockEntry
    db.query(StockEntry).filter(StockEntry.voucher_id == voucher_id).delete()


@router.get("", response_model=list[VoucherListOut])
def list_vouchers(
    voucher_type: str | None = None,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    q = db.query(Voucher).filter(Voucher.company_id == company.id)
    if voucher_type:
        q = q.filter(Voucher.voucher_type == voucher_type)
    return q.order_by(Voucher.created_at.desc()).all()


@router.get("/{voucher_id}", response_model=VoucherOut)
def get_voucher(
    voucher_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    v = db.query(Voucher).options(joinedload(Voucher.lines)).get(voucher_id)
    if not v or v.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    return v


@router.get("/{voucher_id}/pdf")
def voucher_pdf(
    voucher_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Download a single voucher as PDF."""
    from app.services.export import export_voucher_pdf
    v = db.query(Voucher).get(voucher_id)
    if not v or v.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    pdf_bytes = export_voucher_pdf(db, company.id, voucher_id)
    vt = v.voucher_type.replace("_", "-")
    filename = f"{vt}-{v.voucher_number}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("", response_model=VoucherOut, status_code=201)
def create_voucher(
    payload: VoucherCreate,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    voucher = service_create_voucher(db, company, payload, user.id)

    log_action(
        db,
        company_id=company.id,
        user_id=user.id,
        action="CREATE",
        entity_type="voucher",
        entity_id=voucher.id,
        new_value=serialize_voucher(voucher),
        description=f"Created {payload.voucher_type} voucher #{voucher.voucher_number}",
    )
    db.commit()

    return voucher


@router.patch("/{voucher_id}", response_model=VoucherOut)
def update_voucher(
    voucher_id: str,
    payload: VoucherCreate,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.voucher_service import (
        _check_fy_closed, _determine_is_inter_state, _process_voucher_lines,
        _create_stock_entries,
    )
    from app.models.accounting import Party

    voucher = db.get(Voucher, voucher_id)
    if not voucher or voucher.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")

    _check_fy_closed(db, company.id, payload.voucher_date)

    # Delete old lines and stock entries
    db.query(VoucherLine).filter(VoucherLine.voucher_id == voucher_id).delete()
    _delete_stock_entries(db, voucher_id)

    voucher.voucher_type = payload.voucher_type
    voucher.voucher_date = payload.voucher_date
    voucher.narration = payload.narration
    voucher.reference = payload.reference
    voucher.party_id = payload.party_id
    voucher.place_of_supply = payload.place_of_supply
    voucher.document_type = payload.document_type
    voucher.counterparty_gstin = payload.counterparty_gstin
    voucher.counterparty_state_code = payload.counterparty_state_code
    voucher.round_off_to = payload.round_off_to
    voucher.due_date = payload.due_date

    if payload.party_id:
        party = db.get(Party, payload.party_id)
        if not party or party.company_id != company.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Party not found")

    is_inter_state = _determine_is_inter_state(db, company.id, payload.place_of_supply)

    totals = _process_voucher_lines(db, voucher, payload, company, is_inter_state)

    voucher.subtotal = totals["subtotal"]
    voucher.discount_total = totals["discount_total"]
    voucher.tax_total = totals["tax_total"]
    voucher.grand_total = totals["grand_total"]

    db.flush()
    _create_stock_entries(db, company.id, voucher)

    db.commit()
    db.refresh(voucher)

    full_voucher = db.query(Voucher).options(joinedload(Voucher.lines)).get(voucher.id)
    log_action(
        db,
        company_id=company.id,
        user_id=user.id,
        action="UPDATE",
        entity_type="voucher",
        entity_id=voucher.id,
        new_value=serialize_voucher(full_voucher),
        description=f"Updated {payload.voucher_type} voucher #{voucher.voucher_number}",
    )
    db.commit()

    return full_voucher


@router.delete("/{voucher_id}", status_code=204)
def delete_voucher(
    voucher_id: str,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    v = db.get(Voucher, voucher_id)
    if not v or v.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")

    _delete_stock_entries(db, voucher_id)

    old_value = serialize_voucher(v)
    desc_text = f"Deleted {v.voucher_type} voucher #{v.voucher_number}"

    db.delete(v)
    db.commit()

    log_action(
        db,
        company_id=company.id,
        user_id=user.id,
        action="DELETE",
        entity_type="voucher",
        entity_id=voucher_id,
        old_value=old_value,
        description=desc_text,
    )
    db.commit()


