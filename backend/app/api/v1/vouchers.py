"""Voucher endpoints with double-entry balance enforcement.

Σ debits == Σ credits enforced at API level.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user, require_role
from app.models.accounting import FinancialYear
from app.models.user import Company, User
from app.models.voucher import Voucher, VoucherLine
from app.schemas.member import CompanyRole
from app.schemas.voucher import VoucherBulkCancel, VoucherBulkDelete, VoucherCancel, VoucherCreate, VoucherListOut, VoucherOut
from app.services.audit import log_action, serialize_voucher
from app.services.notification import notify
from app.services.voucher_service import create_voucher as service_create_voucher
from app.services.voucher_service import _next_voucher_number
from pydantic import BaseModel

router = APIRouter()


class NextNumberResponse(BaseModel):
    next_number: str
    prefix: str | None = None
    format_template: str | None = None


@router.get("/next-number", response_model=NextNumberResponse)
def get_next_voucher_number(
    voucher_type: str = "sales",
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    from app.models.voucher_numbering import VoucherNumbering
    numbering = db.query(VoucherNumbering).filter(
        VoucherNumbering.company_id == company.id,
        VoucherNumbering.voucher_type == voucher_type,
    ).first()
    number = _next_voucher_number(db, company.id, voucher_type)
    return NextNumberResponse(
        next_number=number,
        prefix=numbering.prefix if numbering else None,
        format_template=numbering.format_template if numbering else None,
    )


def _delete_stock_entries(db: Session, voucher_id: str) -> None:
    from app.models.stock import StockEntry
    db.query(StockEntry).filter(StockEntry.voucher_id == voucher_id).delete()


@router.get("", response_model=dict)
def list_vouchers(
    voucher_type: str | None = None,
    approval_status: str | None = None,
    search: str | None = None,
    financial_year_id: str | None = None,
    sort_by: str = Query(default="voucher_date", description="Sort column"),
    sort_order: str = Query(default="desc", description="Sort direction: asc or desc"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    q = db.query(Voucher).filter(Voucher.company_id == company.id)
    if voucher_type:
        q = q.filter(Voucher.voucher_type == voucher_type)
    if approval_status:
        q = q.filter(Voucher.approval_status == approval_status)
    if financial_year_id:
        fy = db.get(FinancialYear, financial_year_id)
        if not fy or fy.company_id != company.id:
            from fastapi import HTTPException, status as http_status
            raise HTTPException(http_status.HTTP_404_NOT_FOUND, detail="Financial year not found")
        q = q.filter(
            Voucher.voucher_date >= fy.start_date,
            Voucher.voucher_date <= fy.end_date,
        )
    if search:
        search_term = f"%{search}%"
        q = q.filter(
            Voucher.voucher_number.ilike(search_term) |
            Voucher.narration.ilike(search_term)
        )

    # ── Sorting ──────────────────────────────────────────────────────────────
    sort_map = {
        "voucher_date": Voucher.voucher_date,
        "voucher_number": Voucher.voucher_number,
        "voucher_type": Voucher.voucher_type,
        "status": Voucher.status,
        "narration": Voucher.narration,
        "grand_total": Voucher.grand_total,
        "created_at": Voucher.created_at,
    }
    sort_col = sort_map.get(sort_by, Voucher.voucher_date)
    if sort_order == "desc":
        sort_col = sort_col.desc()
    else:
        sort_col = sort_col.asc()
    q = q.order_by(sort_col)

    total = q.count()
    vouchers = q.offset(offset).limit(limit).all()
    # Resolve party names
    from app.models.accounting import Ledger, Party
    from app.models.voucher import VoucherLine
    party_ids = {v.party_id for v in vouchers if v.party_id}
    parties = {p.id: p.name for p in db.query(Party).filter(Party.id.in_(party_ids)).all()} if party_ids else {}

    # Resolve ledger names - load lines for this page only
    voucher_ids = [v.id for v in vouchers]
    all_lines = db.query(VoucherLine).filter(VoucherLine.voucher_id.in_(voucher_ids)).all() if voucher_ids else []
    ledger_ids = {ln.ledger_id for ln in all_lines if ln.ledger_id}
    ledgers = {l.id: l.name for l in db.query(Ledger).filter(Ledger.id.in_(ledger_ids)).all()} if ledger_ids else {}

    # Group lines by voucher_id for efficient lookup
    lines_by_voucher: dict[str, list] = {}
    for ln in all_lines:
        lines_by_voucher.setdefault(ln.voucher_id, []).append(ln)

    result = []
    for v in vouchers:
        d = VoucherListOut.model_validate(v)
        d.party_name = parties.get(v.party_id) if v.party_id else None
        vlines = lines_by_voucher.get(v.id, [])
        d.ledger_names = list({ledgers.get(ln.ledger_id) for ln in vlines if ln.ledger_id and ln.ledger_id in ledgers})
        result.append(d)

    return {"items": result, "total": total, "limit": limit, "offset": offset}


class BulkActionResult(BaseModel):
    processed: int
    errors: list[str] = []


@router.post("/bulk-cancel", response_model=BulkActionResult)
def bulk_cancel_vouchers(
    payload: VoucherBulkCancel,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel multiple vouchers at once. Creates reversal entries and deletes stock entries."""
    from datetime import datetime, timezone

    processed = 0
    errors = []

    for vid in payload.voucher_ids:
        voucher = db.query(Voucher).options(joinedload(Voucher.lines)).get(vid)
        if not voucher or voucher.company_id != company.id:
            errors.append(f"Voucher {vid} not found")
            continue
        if voucher.cancel_reason:
            errors.append(f"Voucher {voucher.voucher_number} is already cancelled")
            continue

        old_value = serialize_voucher(voucher)

        reversal_lines = []
        for line in voucher.lines:
            reversal_lines.append(VoucherLine(
                voucher_id=None,
                ledger_id=line.ledger_id,
                stock_item_id=line.stock_item_id,
                quantity=line.quantity,
                rate=line.rate,
                discount_pct=line.discount_pct,
                discount_amount=line.discount_amount,
                line_total=line.line_total,
                debit=float(line.credit),
                credit=float(line.debit),
                taxable_value=line.taxable_value,
                hsn_sac_id=line.hsn_sac_id,
                is_inter_state=line.is_inter_state,
                is_reverse_charge=line.is_reverse_charge,
                is_rate_inclusive=line.is_rate_inclusive,
                cgst_amount=line.cgst_amount,
                sgst_amount=line.sgst_amount,
                igst_amount=line.igst_amount,
                cost_centre_id=line.cost_centre_id,
            ))

        reversal_number = _next_voucher_number(db, company.id, voucher.voucher_type)
        reversal = Voucher(
            company_id=company.id,
            voucher_type=voucher.voucher_type,
            voucher_number=reversal_number,
            voucher_date=voucher.voucher_date,
            narration=f"Reversal of #{voucher.voucher_number}: {payload.reason}",
            party_id=voucher.party_id,
            place_of_supply=voucher.place_of_supply,
            document_type=voucher.document_type,
            counterparty_gstin=voucher.counterparty_gstin,
            counterparty_state_code=voucher.counterparty_state_code,
            subtotal=voucher.subtotal,
            discount_total=voucher.discount_total,
            tax_total=voucher.tax_total,
            grand_total=voucher.grand_total,
            round_off_to=voucher.round_off_to,
            created_by=user.id,
        )
        db.add(reversal)
        db.flush()

        for line in reversal_lines:
            line.voucher_id = reversal.id
            db.add(line)

        voucher.cancel_reason = payload.reason
        voucher.cancelled_at = datetime.now(timezone.utc).isoformat()
        _delete_stock_entries(db, vid)

        log_action(
            db,
            company_id=company.id,
            user_id=user.id,
            action="CANCEL",
            entity_type="voucher",
            entity_id=vid,
            old_value=old_value,
            new_value=serialize_voucher(reversal),
            description=f"Cancelled {voucher.voucher_type} voucher #{voucher.voucher_number}: {payload.reason}",
        )
        processed += 1

    db.commit()
    return BulkActionResult(processed=processed, errors=errors)


@router.post("/bulk-delete", response_model=BulkActionResult)
def bulk_delete_vouchers(
    payload: VoucherBulkDelete,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete multiple vouchers at once."""
    processed = 0
    errors = []

    for vid in payload.voucher_ids:
        v = db.get(Voucher, vid)
        if not v or v.company_id != company.id:
            errors.append(f"Voucher {vid} not found")
            continue

        _delete_stock_entries(db, vid)
        old_value = serialize_voucher(v)
        desc_text = f"Deleted {v.voucher_type} voucher #{v.voucher_number}"
        db.delete(v)

        log_action(
            db,
            company_id=company.id,
            user_id=user.id,
            action="DELETE",
            entity_type="voucher",
            entity_id=vid,
            old_value=old_value,
            description=desc_text,
        )
        processed += 1

    db.commit()
    return BulkActionResult(processed=processed, errors=errors)


@router.get("/{voucher_id}", response_model=VoucherOut)
def get_voucher(
    voucher_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    from app.models.accounting import Ledger
    v = db.query(Voucher).options(joinedload(Voucher.lines)).get(voucher_id)
    if not v or v.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    # Populate ledger_name on each line
    ledger_ids = {l.ledger_id for l in v.lines}
    ledgers = {lg.id: lg.name for lg in db.query(Ledger).filter(Ledger.id.in_(ledger_ids)).all()}
    for l in v.lines:
        l.ledger_name = ledgers.get(l.ledger_id, "")
    return v


@router.get("/{voucher_id}/pdf")
def voucher_pdf(
    voucher_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
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
    company: Company = Depends(require_role(CompanyRole.accountant)),
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
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.voucher_lifecycle import create_version_snapshot

    from app.services.voucher_service import (
        _check_fy_closed, _determine_is_inter_state, _process_voucher_lines,
        _create_stock_entries,
    )
    from app.models.accounting import Party

    voucher = db.query(Voucher).options(joinedload(Voucher.lines)).get(voucher_id)
    if not voucher or voucher.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")

    # Create version snapshot before update
    create_version_snapshot(
        db,
        voucher,
        change_type="update",
        change_reason="Voucher modified",
        modified_by=user.id,
    )

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


@router.post("/{voucher_id}/cancel", response_model=VoucherOut)
def cancel_voucher(
    voucher_id: str,
    payload: VoucherCancel,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel a posted voucher. Creates a reversal entry and deletes stock entries."""
    from datetime import datetime, timezone

    voucher = db.query(Voucher).options(joinedload(Voucher.lines)).get(voucher_id)
    if not voucher or voucher.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    if voucher.cancel_reason:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Voucher is already cancelled")

    old_value = serialize_voucher(voucher)

    # Create reversal voucher: swap debit/credit for all lines
    reversal_lines = []
    for line in voucher.lines:
        reversal_lines.append(VoucherLine(
            voucher_id=None,  # will be set below
            ledger_id=line.ledger_id,
            stock_item_id=line.stock_item_id,
            quantity=line.quantity,
            rate=line.rate,
            discount_pct=line.discount_pct,
            discount_amount=line.discount_amount,
            line_total=line.line_total,
            debit=float(line.credit),
            credit=float(line.debit),
            taxable_value=line.taxable_value,
            hsn_sac_id=line.hsn_sac_id,
            is_inter_state=line.is_inter_state,
            is_reverse_charge=line.is_reverse_charge,
            is_rate_inclusive=line.is_rate_inclusive,
            cgst_amount=line.cgst_amount,
            sgst_amount=line.sgst_amount,
            igst_amount=line.igst_amount,
            cost_centre_id=line.cost_centre_id,
        ))

    reversal_number = _next_voucher_number(db, company.id, voucher.voucher_type)
    reversal = Voucher(
        company_id=company.id,
        voucher_type=voucher.voucher_type,
        voucher_number=reversal_number,
        voucher_date=voucher.voucher_date,
        narration=f"Reversal of #{voucher.voucher_number}: {payload.reason}",
        party_id=voucher.party_id,
        place_of_supply=voucher.place_of_supply,
        document_type=voucher.document_type,
        counterparty_gstin=voucher.counterparty_gstin,
        counterparty_state_code=voucher.counterparty_state_code,
        subtotal=voucher.subtotal,
        discount_total=voucher.discount_total,
        tax_total=voucher.tax_total,
        grand_total=voucher.grand_total,
        round_off_to=voucher.round_off_to,
        created_by=user.id,
        original_voucher_id=voucher.id,  # Link to original
    )
    db.flush()

    for line in reversal_lines:
        line.voucher_id = reversal.id
        db.add(line)

    # Mark original voucher as cancelled
    voucher.cancel_reason = payload.reason
    voucher.cancelled_at = datetime.now(timezone.utc).isoformat()

    # Delete stock entries for the original voucher
    _delete_stock_entries(db, voucher_id)

    db.flush()

    log_action(
        db,
        company_id=company.id,
        user_id=user.id,
        action="CANCEL",
        entity_type="voucher",
        entity_id=voucher.id,
        old_value=old_value,
        new_value=serialize_voucher(reversal),
        description=f"Cancelled {voucher.voucher_type} voucher #{voucher.voucher_number}: {payload.reason}",
    )
    db.commit()
    db.refresh(voucher)

    return db.query(Voucher).options(joinedload(Voucher.lines)).get(voucher.id)


@router.delete("/{voucher_id}", status_code=204)
def delete_voucher(
    voucher_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
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


# ─── Status Transitions ────────────────────────────────────────────────────────

@router.post("/{voucher_id}/post", response_model=VoucherOut)
def post_voucher(
    voucher_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Post a draft voucher (transition draft → posted)."""
    v = db.get(Voucher, voucher_id)
    if not v or v.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    if v.status != "draft":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Only draft vouchers can be posted")

    old_value = serialize_voucher(v)
    v.status = "posted"
    db.commit()
    db.refresh(v)

    log_action(
        db, company_id=company.id, user_id=user.id,
        action="UPDATE", entity_type="voucher", entity_id=voucher_id,
        old_value=old_value, new_value=serialize_voucher(v),
        description=f"Posted {v.voucher_type} voucher #{v.voucher_number}",
    )
    db.commit()

    return VoucherOut(
        id=v.id, voucher_type=v.voucher_type, voucher_number=v.voucher_number,
        voucher_date=v.voucher_date, narration=v.narration, reference=v.reference,
        party_id=v.party_id, place_of_supply=v.place_of_supply,
        document_type=v.document_type, counterparty_gstin=v.counterparty_gstin,
        counterparty_state_code=v.counterparty_state_code,
        subtotal=float(v.subtotal), discount_total=float(v.discount_total),
        tax_total=float(v.tax_total), grand_total=float(v.grand_total),
        round_off_to=float(v.round_off_to) if v.round_off_to else None,
        due_date=v.due_date, status=v.status, approval_status=v.approval_status,
        cancel_reason=v.cancel_reason, cancelled_at=v.cancelled_at,
        lines=[],
    )


@router.post("/{voucher_id}/submit-for-approval", response_model=VoucherOut)
def submit_for_approval(
    voucher_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit a voucher for approval."""
    v = db.get(Voucher, voucher_id)
    if not v or v.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    if v.approval_status is not None and v.approval_status != "rejected":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Voucher already submitted or approved")

    old_value = serialize_voucher(v)
    v.approval_status = "pending"
    db.commit()
    db.refresh(v)

    log_action(
        db, company_id=company.id, user_id=user.id,
        action="UPDATE", entity_type="voucher", entity_id=voucher_id,
        old_value=old_value, new_value=serialize_voucher(v),
        description=f"Submitted {v.voucher_type} voucher #{v.voucher_number} for approval",
    )
    db.commit()

    notify(
        db, company.id,
        title="Voucher Submitted for Approval",
        message=f"{v.voucher_type.title()} voucher #{v.voucher_number} (₹{v.grand_total:,.2f}) submitted by {user.email}",
        category="approval_pending",
        link="/approvals",
        user_id=user.id,
        entity_type="voucher",
        entity_id=voucher_id,
    )
    db.commit()

    return VoucherOut(
        id=v.id, voucher_type=v.voucher_type, voucher_number=v.voucher_number,
        voucher_date=v.voucher_date, narration=v.narration, reference=v.reference,
        party_id=v.party_id, place_of_supply=v.place_of_supply,
        document_type=v.document_type, counterparty_gstin=v.counterparty_gstin,
        counterparty_state_code=v.counterparty_state_code,
        subtotal=float(v.subtotal), discount_total=float(v.discount_total),
        tax_total=float(v.tax_total), grand_total=float(v.grand_total),
        round_off_to=float(v.round_off_to) if v.round_off_to else None,
        due_date=v.due_date, status=v.status, approval_status=v.approval_status,
        cancel_reason=v.cancel_reason, cancelled_at=v.cancelled_at,
        lines=[],
    )


@router.post("/{voucher_id}/approve", response_model=VoucherOut)
def approve_voucher(
    voucher_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Approve a voucher pending approval."""
    v = db.get(Voucher, voucher_id)
    if not v or v.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    if v.approval_status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Voucher is not pending approval")

    old_value = serialize_voucher(v)
    v.approval_status = "approved"
    db.commit()
    db.refresh(v)

    log_action(
        db, company_id=company.id, user_id=user.id,
        action="UPDATE", entity_type="voucher", entity_id=voucher_id,
        old_value=old_value, new_value=serialize_voucher(v),
        description=f"Approved {v.voucher_type} voucher #{v.voucher_number}",
    )
    db.commit()

    notify(
        db, company.id,
        title="Voucher Approved",
        message=f"{v.voucher_type.title()} voucher #{v.voucher_number} (₹{v.grand_total:,.2f}) approved by {user.email}",
        category="success",
        link="/vouchers",
        entity_type="voucher",
        entity_id=voucher_id,
    )
    db.commit()

    return VoucherOut(
        id=v.id, voucher_type=v.voucher_type, voucher_number=v.voucher_number,
        voucher_date=v.voucher_date, narration=v.narration, reference=v.reference,
        party_id=v.party_id, place_of_supply=v.place_of_supply,
        document_type=v.document_type, counterparty_gstin=v.counterparty_gstin,
        counterparty_state_code=v.counterparty_state_code,
        subtotal=float(v.subtotal), discount_total=float(v.discount_total),
        tax_total=float(v.tax_total), grand_total=float(v.grand_total),
        round_off_to=float(v.round_off_to) if v.round_off_to else None,
        due_date=v.due_date, status=v.status, approval_status=v.approval_status,
        cancel_reason=v.cancel_reason, cancelled_at=v.cancelled_at,
        lines=[],
    )


@router.post("/{voucher_id}/reject", response_model=VoucherOut)
def reject_voucher(
    voucher_id: str,
    reason: str = Query(default="", max_length=1024),
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Reject a voucher pending approval."""
    v = db.get(Voucher, voucher_id)
    if not v or v.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    if v.approval_status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Voucher is not pending approval")

    old_value = serialize_voucher(v)
    v.approval_status = "rejected"
    if reason:
        v.narration = (v.narration or "") + f"\n[Rejected] {reason}"
    db.commit()
    db.refresh(v)

    log_action(
        db, company_id=company.id, user_id=user.id,
        action="UPDATE", entity_type="voucher", entity_id=voucher_id,
        old_value=old_value, new_value=serialize_voucher(v),
        description=f"Rejected {v.voucher_type} voucher #{v.voucher_number}: {reason or 'No reason given'}",
    )
    db.commit()

    notify(
        db, company.id,
        title="Voucher Rejected",
        message=f"{v.voucher_type.title()} voucher #{v.voucher_number} rejected by {user.email}" + (f": {reason}" if reason else ""),
        category="error",
        link="/approvals",
        entity_type="voucher",
        entity_id=voucher_id,
    )
    db.commit()

    return VoucherOut(
        id=v.id, voucher_type=v.voucher_type, voucher_number=v.voucher_number,
        voucher_date=v.voucher_date, narration=v.narration, reference=v.reference,
        party_id=v.party_id, place_of_supply=v.place_of_supply,
        document_type=v.document_type, counterparty_gstin=v.counterparty_gstin,
        counterparty_state_code=v.counterparty_state_code,
        subtotal=float(v.subtotal), discount_total=float(v.discount_total),
        tax_total=float(v.tax_total), grand_total=float(v.grand_total),
        round_off_to=float(v.round_off_to) if v.round_off_to else None,
        due_date=v.due_date, status=v.status, approval_status=v.approval_status,
        cancel_reason=v.cancel_reason, cancelled_at=v.cancelled_at,
        lines=[],
    )




@router.post("/{voucher_id}/restore", response_model=VoucherOut)
def restore_voucher(
    voucher_id: str,
    payload: VoucherCancel,  # Reuse for reason field
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Restore a cancelled voucher. Reverses cancellation and recreates stock entries."""
    from app.services.voucher_lifecycle import restore_cancelled_voucher

    voucher = db.query(Voucher).options(joinedload(Voucher.lines)).get(voucher_id)
    if not voucher or voucher.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")

    try:
        restored = restore_cancelled_voucher(db, voucher, user, payload.reason)
        db.commit()
        db.refresh(restored)
        return db.query(Voucher).options(joinedload(Voucher.lines)).get(restored.id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{voucher_id}/duplicate", response_model=VoucherOut)
def duplicate_voucher_endpoint(
    voucher_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a duplicate of a voucher as a draft with today's date."""
    from datetime import date
    from app.services.voucher_lifecycle import duplicate_voucher

    voucher = db.query(Voucher).options(joinedload(Voucher.lines)).get(voucher_id)
    if not voucher or voucher.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")

    new_voucher = duplicate_voucher(db, voucher, user, date.today().isoformat())
    db.commit()
    db.refresh(new_voucher)
    return db.query(Voucher).options(joinedload(Voucher.lines)).get(new_voucher.id)
    voucher = db.query(Voucher).options(joinedload(Voucher.lines)).get(voucher_id)
    if not voucher or voucher.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")

    new_voucher = duplicate_voucher(db, voucher, user, todayIso())
    db.commit()
    db.refresh(new_voucher)
    return db.query(Voucher).options(joinedload(Voucher.lines)).get(new_voucher.id)


@router.get("/{voucher_id}/history")
def get_voucher_history_endpoint(
    voucher_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Retrieve version history for a voucher."""
    from app.services.voucher_lifecycle import get_voucher_history

    voucher = db.get(Voucher, voucher_id)
    if not voucher or voucher.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")

    history = get_voucher_history(db, voucher_id)
    return {"voucher_id": voucher_id, "versions": history}


@router.get("/{voucher_id}/audit")
def get_voucher_audit_endpoint(
    voucher_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Retrieve audit trail for a voucher."""
    from app.services.voucher_lifecycle import get_voucher_audit_trail

    voucher = db.get(Voucher, voucher_id)
    if not voucher or voucher.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")

    audit = get_voucher_audit_trail(db, voucher_id)
    return {"voucher_id": voucher_id, "audit_trail": audit}
