"""Voucher lifecycle services: version history, restore, duplicate, reversal linking."""
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import desc, select
from sqlalchemy.orm import Session, joinedload

if TYPE_CHECKING:
    from app.models.voucher import Voucher, VoucherLine
    from app.models.user import User


def create_version_snapshot(
    db: Session,
    voucher: "Voucher",
    change_type: str,
    change_reason: str | None,
    modified_by: str | None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Create immutable version snapshot before modifying a voucher.
    
    Args:
        voucher: Voucher to snapshot (must be loaded with lines)
        change_type: update | cancel | restore
        change_reason: Human-readable reason for the change
        modified_by: User ID who made the change
        ip_address: Client IP for audit
        user_agent: Client user agent for audit
    """
    from app.models.voucher_version import VoucherVersion
    from app.services.audit import serialize_voucher
    
    # Get current version count
    version_count = db.execute(
        select(VoucherVersion)
        .where(VoucherVersion.voucher_id == voucher.id)
    ).scalars().all()
    next_version = len(version_count) + 1
    
    # Serialize voucher and lines
    voucher_snapshot = serialize_voucher(voucher)
    lines_snapshot = [
        {
            "id": line.id,
            "ledger_id": line.ledger_id,
            "stock_item_id": line.stock_item_id,
            "quantity": float(line.quantity) if line.quantity else None,
            "rate": float(line.rate) if line.rate else None,
            "discount_pct": float(line.discount_pct),
            "discount_amount": float(line.discount_amount),
            "line_total": float(line.line_total) if line.line_total else None,
            "debit": float(line.debit),
            "credit": float(line.credit),
            "taxable_value": float(line.taxable_value) if line.taxable_value else None,
            "hsn_sac_id": line.hsn_sac_id,
            "is_inter_state": line.is_inter_state,
            "is_reverse_charge": line.is_reverse_charge,
            "is_rate_inclusive": line.is_rate_inclusive,
            "cgst_amount": float(line.cgst_amount) if line.cgst_amount else None,
            "sgst_amount": float(line.sgst_amount) if line.sgst_amount else None,
            "igst_amount": float(line.igst_amount) if line.igst_amount else None,
            "cost_centre_id": line.cost_centre_id,
        }
        for line in voucher.lines
    ]
    
    version = VoucherVersion(
        voucher_id=voucher.id,
        version_number=next_version,
        modified_by=modified_by,
        change_type=change_type,
        change_reason=change_reason,
        voucher_snapshot=voucher_snapshot,
        lines_snapshot=lines_snapshot,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(version)


def get_voucher_history(db: Session, voucher_id: str) -> list[dict]:
    """Retrieve complete version history for a voucher.
    
    Returns list of versions ordered newest-first.
    """
    from app.models.voucher_version import VoucherVersion
    from app.models.user import User
    
    versions = db.execute(
        select(VoucherVersion)
        .where(VoucherVersion.voucher_id == voucher_id)
        .order_by(desc(VoucherVersion.version_number))
    ).scalars().all()
    
    result = []
    for v in versions:
        user = db.get(User, v.modified_by) if v.modified_by else None
        result.append({
            "id": v.id,
            "version_number": v.version_number,
            "change_type": v.change_type,
            "change_reason": v.change_reason,
            "modified_by": v.modified_by,
            "modified_by_name": user.name if user else None,
            "created_at": v.created_at.isoformat() if v.created_at else None,
            "voucher_snapshot": v.voucher_snapshot,
            "lines_snapshot": v.lines_snapshot,
            "ip_address": v.ip_address,
        })
    return result


def restore_cancelled_voucher(
    db: Session,
    voucher: "Voucher",
    user: "User",
    reason: str,
) -> "Voucher":
    """Restore a cancelled voucher.
    
    Reverses cancellation by:
    1. Creating version snapshot
    2. Deleting the linked reversal voucher (if any) and unlinking
    3. Clearing cancellation fields
    4. Recreating stock entries
    5. Logging restore action
    
    Raises:
        ValueError: If voucher is not cancelled or FY is closed
    """
    from app.services.voucher_service import _check_fy_closed, _create_stock_entries
    from app.services.audit import log_action
    from app.models.voucher import Voucher, VoucherLine

    if not voucher.cancel_reason:
        raise ValueError("Voucher is not cancelled")

    _check_fy_closed(db, voucher.company_id, voucher.voucher_date)

    # Create version before restore
    create_version_snapshot(
        db,
        voucher,
        change_type="restore",
        change_reason=reason,
        modified_by=user.id,
    )

    # Delete the explicit reversal voucher (opposite entries) created on cancel
    if voucher.reversed_by_voucher_id:
        rev = db.get(Voucher, voucher.reversed_by_voucher_id)
        if rev:
            for ln in list(rev.lines):
                db.delete(ln)
            db.delete(rev)
        voucher.reversed_by_voucher_id = None

    # Clear cancellation
    voucher.cancel_reason = None
    voucher.cancelled_at = None
    voucher.status = "posted"

    # Recreate stock entries
    _create_stock_entries(db, voucher.company_id, voucher)
    
    db.flush()
    
    # Log restore action
    log_action(
        db,
        company_id=voucher.company_id,
        user_id=user.id,
        action="RESTORE",
        entity_type="voucher",
        entity_id=voucher.id,
        description=f"Restored {voucher.voucher_type} voucher #{voucher.voucher_number}: {reason}",
    )
    
    return voucher


def duplicate_voucher(
    db: Session,
    voucher: "Voucher",
    user: "User",
    new_voucher_date: str,
) -> "Voucher":
    """Create a duplicate of a voucher as a draft.
    
    Copies all fields and lines but assigns new voucher number.
    New voucher is created as draft status for user to review.
    
    Args:
        voucher: Original voucher to duplicate (must be loaded with lines)
        user: User creating the duplicate
        new_voucher_date: Date for the new voucher (YYYY-MM-DD)
    
    Returns:
        New draft voucher
    """
    from app.models.voucher import Voucher, VoucherLine
    from app.services.voucher_service import _next_voucher_number
    from app.services.audit import log_action
    
    # Generate new number
    new_number = _next_voucher_number(db, voucher.company_id, voucher.voucher_type)
    
    # Create new voucher
    new_voucher = Voucher(
        company_id=voucher.company_id,
        voucher_type=voucher.voucher_type,
        voucher_number=new_number,
        voucher_date=new_voucher_date,
        narration=voucher.narration,
        reference=voucher.reference,
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
        due_date=voucher.due_date,
        created_by=user.id,
        status="draft",  # New voucher starts as draft
    )
    db.add(new_voucher)
    db.flush()
    
    # Copy all lines
    for line in voucher.lines:
        new_line = VoucherLine(
            voucher_id=new_voucher.id,
            ledger_id=line.ledger_id,
            stock_item_id=line.stock_item_id,
            quantity=line.quantity,
            rate=line.rate,
            discount_pct=line.discount_pct,
            discount_amount=line.discount_amount,
            line_total=line.line_total,
            debit=line.debit,
            credit=line.credit,
            taxable_value=line.taxable_value,
            hsn_sac_id=line.hsn_sac_id,
            is_inter_state=line.is_inter_state,
            is_reverse_charge=line.is_reverse_charge,
            is_rate_inclusive=line.is_rate_inclusive,
            cgst_amount=line.cgst_amount,
            sgst_amount=line.sgst_amount,
            igst_amount=line.igst_amount,
            cost_centre_id=line.cost_centre_id,
        )
        db.add(new_line)
    
    db.flush()
    
    # Log duplication
    log_action(
        db,
        company_id=voucher.company_id,
        user_id=user.id,
        action="CREATE",
        entity_type="voucher",
        entity_id=new_voucher.id,
        description=f"Duplicated {voucher.voucher_type} #{voucher.voucher_number} → #{new_number}",
    )
    
    return new_voucher


def get_voucher_audit_trail(db: Session, voucher_id: str) -> list[dict]:
    """Retrieve audit trail for a voucher from AuditLog.
    
    Returns all audit entries related to this voucher with user details.
    """
    from app.models.audit import AuditLog
    from app.models.user import User
    
    logs = db.execute(
        select(AuditLog)
        .where(AuditLog.entity_type == "voucher")
        .where(AuditLog.entity_id == voucher_id)
        .order_by(desc(AuditLog.created_at))
    ).scalars().all()
    
    result = []
    for log in logs:
        user = db.get(User, log.user_id) if log.user_id else None
        result.append({
            "id": log.id,
            "action": log.action,
            "user_id": log.user_id,
            "user_name": user.name if user else "System",
            "created_at": log.created_at.isoformat() if log.created_at else None,
            "description": log.description,
            "old_value": log.old_value,
            "new_value": log.new_value,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
        })
    return result
