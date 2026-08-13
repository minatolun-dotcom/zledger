"""Voucher endpoints with double-entry balance enforcement.

Σ debits == Σ credits enforced at API level.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user, require_role
from app.models.accounting import FinancialYear, Ledger, Party
from app.models.user import Company, User
from app.models.voucher import Voucher, VoucherLine
from app.schemas.member import CompanyRole
from app.schemas.voucher import VoucherBulkCancel, VoucherBulkDelete, VoucherCancel, VoucherCreate, VoucherListOut, VoucherOut
from app.services.audit import log_action, serialize_voucher
from app.services.notification import notify
from app.services.voucher_service import create_voucher as service_create_voucher
from app.services.voucher_service import update_voucher as service_update_voucher
from app.services.voucher_service import _next_voucher_number, _check_fy_closed
from pydantic import BaseModel, Field

router = APIRouter()


class NextNumberResponse(BaseModel):
    next_number: str


@router.get("/next-number", response_model=NextNumberResponse)
def next_voucher_number(
    voucher_type: str,
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Get next available voucher number for a type."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    num = _next_voucher_number(db, company.id, voucher_type)
    return {"next_number": num}


# -- List vouchers with advanced filtering -----------------------------------

@router.get("", response_model=dict)
def list_vouchers(
    financial_year_id: str | None = None,
    voucher_type: str | None = None,
    status: str | None = None,
    approval_status: str | None = None,
    party_id: str | None = None,
    user_id: str | None = None,
    # Date range filters
    from_date: str | None = None,
    to_date: str | None = None,
    # Amount range filters (new)
    min_amount: float | None = Query(None, ge=0),
    max_amount: float | None = Query(None, ge=0),
    # Ledger filter (new)
    ledger_id: str | None = None,
    # Enhanced search
    search: str | None = None,
    sort_by: str = Query(default="voucher_date", description="Sort column"),
    sort_order: str = Query(default="desc", description="Sort direction: asc or desc"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """List vouchers with advanced filtering.
    
    Enhanced filters:
    - min_amount, max_amount: Filter by grand_total range
    - ledger_id: Find vouchers containing this ledger
    - from_date, to_date: Date range within FY
    - status, party_id, user_id: Filter by status/party/creator
    - search: Searches voucher_number, reference, narration
    """
    q = db.query(Voucher).filter(Voucher.company_id == company.id)
    
    # Financial year filter
    if financial_year_id:
        fy = db.get(FinancialYear, financial_year_id)
        if not fy or fy.company_id != company.id:
            from fastapi import HTTPException, status as http_status
            raise HTTPException(http_status.HTTP_404_NOT_FOUND, detail="Financial year not found")
        q = q.filter(
            Voucher.voucher_date >= fy.start_date,
            Voucher.voucher_date <= fy.end_date,
        )
    
    # Type and status filters
    if voucher_type:
        q = q.filter(Voucher.voucher_type == voucher_type)
    if status:
        q = q.filter(Voucher.status == status)
    if approval_status:
        q = q.filter(Voucher.approval_status == approval_status)
    if party_id:
        q = q.filter(Voucher.party_id == party_id)
    if user_id:
        q = q.filter(Voucher.created_by == user_id)
    
    # Date range filters
    if from_date:
        q = q.filter(Voucher.voucher_date >= from_date)
    if to_date:
        q = q.filter(Voucher.voucher_date <= to_date)
    
    # Amount range filters (new)
    if min_amount is not None:
        q = q.filter(Voucher.grand_total >= min_amount)
    if max_amount is not None:
        q = q.filter(Voucher.grand_total <= max_amount)
    
    # Ledger filter (new) - vouchers containing this ledger
    if ledger_id:
        q = q.join(VoucherLine).filter(VoucherLine.ledger_id == ledger_id)
    
    # Enhanced search
    if search:
        search_term = f"%{search}%"
        q = q.outerjoin(Party, Voucher.party_id == Party.id).filter(
            Voucher.voucher_number.ilike(search_term)
            | Voucher.reference.ilike(search_term)
            | Voucher.narration.ilike(search_term)
            | Party.name.ilike(search_term)
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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Bulk cancel vouchers (accountant+ only)."""
    processed = 0
    errors = []
    for vid in payload.voucher_ids:
        v = db.get(Voucher, vid)
        if not v or v.company_id != company.id:
            errors.append(f"Voucher {vid} not found")
            continue
        if v.status == "cancelled":
            errors.append(f"{v.voucher_number} already cancelled")
            continue
        try:
            _check_fy_closed(db, company.id, v.voucher_date)
        except HTTPException as e:
            errors.append(f"{v.voucher_number}: {e.detail}")
            continue
        # Mark cancelled + reverse stock entries (soft cancel)
        from app.services.voucher_service import _reverse_stock_entries
        old_snapshot = serialize_voucher(v)
        _reverse_stock_entries(db, company.id, v)
        v.status = "cancelled"
        v.cancel_reason = payload.reason
        from datetime import datetime, timezone
        v.cancelled_at = datetime.now(timezone.utc).isoformat()
        db.commit()
        log_action(
            db,
            company_id=company.id,
            user_id=user.id,
            action="CANCEL",
            entity_type="voucher",
            entity_id=v.id,
            old_value=old_snapshot,
            new_value={"reason": payload.reason},
            description=f"Cancelled {v.voucher_number}",
        )
        processed += 1
    return BulkActionResult(processed=processed, errors=errors)


@router.post("/bulk-delete", response_model=BulkActionResult)
def bulk_delete_vouchers(
    payload: VoucherBulkDelete,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Bulk delete vouchers (accountant+ only).
    
    Only draft or cancelled vouchers can be deleted.
    Posted vouchers must be cancelled first.
    """
    processed = 0
    errors = []
    for vid in payload.voucher_ids:
        v = db.get(Voucher, vid)
        if not v or v.company_id != company.id:
            errors.append(f"Voucher {vid} not found")
            continue
        if v.status == "posted":
            errors.append(f"{v.voucher_number} is posted; cancel it first")
            continue
        log_action(
            db,
            company_id=company.id,
            user_id=user.id,
            action="DELETE",
            entity_type="voucher",
            entity_id=v.id,
            old_value=serialize_voucher(v),
            description=f"Deleted {v.voucher_number}",
        )
        db.delete(v)
        db.commit()
        processed += 1
    return BulkActionResult(processed=processed, errors=errors)


@router.delete("/{voucher_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_voucher(
    voucher_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a single voucher (accountant+ only).

    Only draft or cancelled vouchers can be deleted; posted vouchers must be
    cancelled first. Mirrors bulk-delete semantics.
    """
    v = db.get(Voucher, voucher_id)
    if not v or v.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    if v.status == "posted":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"{v.voucher_number} is posted; cancel it first")
    log_action(
        db,
        company_id=company.id,
        user_id=user.id,
        action="DELETE",
        entity_type="voucher",
        entity_id=v.id,
        old_value=serialize_voucher(v),
        description=f"Deleted {v.voucher_number}",
    )
    db.delete(v)
    db.commit()
    return None


# -- Related transactions (new) ----------------------------------------------

class RelatedVoucherOut(BaseModel):
    """Simplified voucher info for related transactions."""
    id: str
    voucher_type: str
    voucher_number: str
    voucher_date: str
    narration: str | None
    grand_total: float
    status: str
    relationship: str  # 'reversal' | 'original' | 'same_party' | 'same_ledger'


@router.get("/{voucher_id}/related", response_model=list[RelatedVoucherOut])
def get_related_transactions(
    voucher_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Find vouchers related to this one.
    
    Related transactions include:
    - Reversal vouchers (linked via original_voucher_id/reversed_by_voucher_id)
    - Other vouchers for the same party (Sales → Receipts, Purchase → Payments)
    - Vouchers sharing the same ledgers (cross-references)
    """
    voucher = db.get(Voucher, voucher_id)
    if not voucher or voucher.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    
    related = []
    
    # 1. Reversal links
    if voucher.reversed_by_voucher_id:
        rev = db.get(Voucher, voucher.reversed_by_voucher_id)
        if rev:
            related.append(RelatedVoucherOut(
                id=rev.id,
                voucher_type=rev.voucher_type,
                voucher_number=rev.voucher_number,
                voucher_date=rev.voucher_date,
                narration=rev.narration,
                grand_total=float(rev.grand_total),
                status=rev.status,
                relationship="reversal"
            ))
    
    if voucher.original_voucher_id:
        orig = db.get(Voucher, voucher.original_voucher_id)
        if orig:
            related.append(RelatedVoucherOut(
                id=orig.id,
                voucher_type=orig.voucher_type,
                voucher_number=orig.voucher_number,
                voucher_date=orig.voucher_date,
                narration=orig.narration,
                grand_total=float(orig.grand_total),
                status=orig.status,
                relationship="original"
            ))
    
    # 2. Same party vouchers (exclude self, limit to recent 10)
    if voucher.party_id:
        party_vouchers = (
            db.query(Voucher)
            .filter(
                Voucher.company_id == company.id,
                Voucher.party_id == voucher.party_id,
                Voucher.id != voucher_id,
                Voucher.status == "posted"
            )
            .order_by(Voucher.voucher_date.desc())
            .limit(10)
            .all()
        )
        for pv in party_vouchers:
            related.append(RelatedVoucherOut(
                id=pv.id,
                voucher_type=pv.voucher_type,
                voucher_number=pv.voucher_number,
                voucher_date=pv.voucher_date,
                narration=pv.narration,
                grand_total=float(pv.grand_total),
                status=pv.status,
                relationship="same_party"
            ))
    
    # 3. Same ledger vouchers (find common ledgers, then vouchers using them)
    voucher_ledgers = (
        db.query(VoucherLine.ledger_id)
        .filter(VoucherLine.voucher_id == voucher_id)
        .distinct()
        .all()
    )
    ledger_ids = [row[0] for row in voucher_ledgers]
    
    if ledger_ids:
        # Find other vouchers using these ledgers (limit to recent 5 per ledger)
        ledger_vouchers = (
            db.query(Voucher)
            .join(VoucherLine)
            .filter(
                Voucher.company_id == company.id,
                VoucherLine.ledger_id.in_(ledger_ids),
                Voucher.id != voucher_id,
                Voucher.status == "posted"
            )
            .distinct()
            .order_by(Voucher.voucher_date.desc())
            .limit(5)
            .all()
        )
        for lv in ledger_vouchers:
            # Avoid duplicates (already added via party)
            if not any(r.id == lv.id for r in related):
                related.append(RelatedVoucherOut(
                    id=lv.id,
                    voucher_type=lv.voucher_type,
                    voucher_number=lv.voucher_number,
                    voucher_date=lv.voucher_date,
                    narration=lv.narration,
                    grand_total=float(lv.grand_total),
                    status=lv.status,
                    relationship="same_ledger"
                ))
    
    return related


# -- Create, Read, Update, Cancel ---------------------------------------------

@router.post("", response_model=VoucherOut, status_code=status.HTTP_201_CREATED)
def create_voucher(
    payload: VoucherCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new voucher with double-entry validation."""
    try:
        v = service_create_voucher(db, company, payload, user.id)
        db.commit()
        log_action(
            db,
            company_id=company.id,
            user_id=user.id,
            action="CREATE",
            entity_type="voucher",
            entity_id=v.id,
            new_value=serialize_voucher(v),
            description=f"Created {v.voucher_type} #{v.voucher_number}",
        )
        notify(db, company.id, f"Voucher created", f"Voucher {v.voucher_number} created", category="success", link=f"/vouchers/{v.id}", user_id=user.id)
        return VoucherOut.model_validate(v)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{voucher_id}", response_model=VoucherOut)
def get_voucher(
    voucher_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Get voucher by ID with all lines and party info."""
    v = (
        db.query(Voucher)
        .options(joinedload(Voucher.lines), joinedload(Voucher.party))
        .filter(Voucher.id == voucher_id, Voucher.company_id == company.id)
        .first()
    )
    if not v:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    
    # Resolve ledger names
    ledger_ids = {ln.ledger_id for ln in v.lines}
    ledgers = {l.id: l.name for l in db.query(Ledger).filter(Ledger.id.in_(ledger_ids)).all()} if ledger_ids else {}
    
    out = VoucherOut.model_validate(v)
    for idx, ln in enumerate(out.lines):
        ln.ledger_name = ledgers.get(ln.ledger_id)
    return out


@router.patch("/{voucher_id}", response_model=VoucherOut)
@router.put("/{voucher_id}", response_model=VoucherOut)
def update_voucher(
    voucher_id: str,
    payload: VoucherCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update existing voucher (replaces lines) — atomic, no number burn."""
    v = db.get(Voucher, voucher_id)
    if not v or v.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    if v.status == "cancelled":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot edit cancelled voucher")

    # Snapshot the pre-edit state for the version history BEFORE mutating,
    # and capture the audit old_value from the snapshot (not post-mutation).
    from app.services.voucher_lifecycle import create_version_snapshot
    old_snapshot = serialize_voucher(v)
    try:
        create_version_snapshot(db, v, "update", "Edited voucher", user.id)
        v = service_update_voucher(db, company, voucher_id, payload, user.id)
        db.commit()
        log_action(
            db,
            company_id=company.id,
            user_id=user.id,
            action="UPDATE",
            entity_type="voucher",
            entity_id=v.id,
            old_value=old_snapshot,
            new_value=serialize_voucher(v),
            description=f"Updated {v.voucher_number}",
        )
        return VoucherOut.model_validate(v)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{voucher_id}/cancel", response_model=VoucherOut)
def cancel_voucher(
    voucher_id: str,
    payload: VoucherCancel,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cancel a voucher (accountant+ only).

    Soft cancel: flips status, removes the voucher's stock entries (restoring
    inventory), and blocks cancellation inside a closed financial year.
    """
    v = db.get(Voucher, voucher_id)
    if not v or v.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    if v.status == "cancelled":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Already cancelled")
    _check_fy_closed(db, company.id, v.voucher_date)

    old_snapshot = serialize_voucher(v)
    from app.services.voucher_service import _reverse_stock_entries
    _reverse_stock_entries(db, company.id, v)
    v.status = "cancelled"
    v.cancel_reason = payload.reason
    from datetime import datetime, timezone
    v.cancelled_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    log_action(
        db,
        company_id=company.id,
        user_id=user.id,
        action="CANCEL",
        entity_type="voucher",
        entity_id=v.id,
        old_value=old_snapshot,
        new_value={"reason": payload.reason},
        description=f"Cancelled {v.voucher_number}",
    )
    return VoucherOut.model_validate(v)


class VoucherRestoreRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=1024)


class VoucherDuplicateRequest(BaseModel):
    voucher_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")


def _resolve_voucher_out(db: Session, v: Voucher) -> VoucherOut:
    """Build VoucherOut with ledger names resolved (same as get_voucher)."""
    ledger_ids = {ln.ledger_id for ln in v.lines}
    ledgers = {l.id: l.name for l in db.query(Ledger).filter(Ledger.id.in_(ledger_ids)).all()} if ledger_ids else {}
    out = VoucherOut.model_validate(v)
    for ln in out.lines:
        ln.ledger_name = ledgers.get(ln.ledger_id)
    return out


@router.get("/{voucher_id}/audit")
def voucher_audit_trail(
    voucher_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Audit trail for a voucher (create/update/cancel/restore events)."""
    v = db.get(Voucher, voucher_id)
    if not v or v.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    from app.services.voucher_lifecycle import get_voucher_audit_trail
    return {"voucher_id": voucher_id, "audit_trail": get_voucher_audit_trail(db, voucher_id)}


@router.get("/{voucher_id}/history")
def voucher_history(
    voucher_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Version history (immutable snapshots) for a voucher."""
    v = db.get(Voucher, voucher_id)
    if not v or v.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    from app.services.voucher_lifecycle import get_voucher_history
    return get_voucher_history(db, voucher_id)


@router.post("/{voucher_id}/restore", response_model=VoucherOut)
def restore_voucher(
    voucher_id: str,
    payload: VoucherRestoreRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Restore a cancelled voucher (accountant+ only)."""
    v = db.get(Voucher, voucher_id)
    if not v or v.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    if v.status != "cancelled":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Only cancelled vouchers can be restored")
    from app.services.voucher_lifecycle import restore_cancelled_voucher
    try:
        restored = restore_cancelled_voucher(db, v, user, payload.reason)
        db.commit()
        return _resolve_voucher_out(db, restored)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{voucher_id}/duplicate", response_model=VoucherOut)
def duplicate_voucher(
    voucher_id: str,
    payload: VoucherDuplicateRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Duplicate a voucher as a draft (accountant+ only)."""
    v = (
        db.query(Voucher)
        .options(joinedload(Voucher.lines), joinedload(Voucher.party))
        .filter(Voucher.id == voucher_id, Voucher.company_id == company.id)
        .first()
    )
    if not v:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    from app.services.voucher_lifecycle import duplicate_voucher as service_duplicate_voucher
    try:
        dup = service_duplicate_voucher(db, v, user, payload.voucher_date)
        db.commit()
        db.refresh(dup)
        return _resolve_voucher_out(db, dup)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{voucher_id}/pdf")
def voucher_pdf(
    voucher_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Generate PDF for a voucher."""
    v = (
        db.query(Voucher)
        .options(joinedload(Voucher.lines), joinedload(Voucher.party))
        .filter(Voucher.id == voucher_id, Voucher.company_id == company.id)
        .first()
    )
    if not v:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    
    from app.services.pdf import generate_voucher_pdf
    pdf_bytes = generate_voucher_pdf(db, v, company)
    
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={v.voucher_type}-{v.voucher_number}.pdf"}
    )
