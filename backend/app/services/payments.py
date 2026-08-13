"""Payments service: receivables/payables and payment allocation logic."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.accounting import Party
from app.models.bill_reference import BillReference
from app.models.voucher import Voucher
from app.models.payment_allocation import PaymentAllocation


INVOICE_TYPES = ("sales", "purchase")
PAYMENT_TYPES = ("payment", "receipt")


def _days_overdue(due_date_str: str | None, today: date | None = None) -> int:
    if not due_date_str:
        return 0
    try:
        due = date.fromisoformat(due_date_str)
    except (ValueError, TypeError):
        return 0
    today = today or date.today()
    delta = (today - due).days
    return max(delta, 0)


def _aging_bucket(days: int) -> str:
    if days <= 0:
        return "current"
    if days <= 30:
        return "1-30"
    if days <= 60:
        return "31-60"
    if days <= 90:
        return "61-90"
    return "90+"


def _bill_ref_for_invoice(db: Session, company_id: str, invoice_voucher_id: str) -> BillReference | None:
    """The bill reference tracking this invoice (original + adjusted − paid)."""
    return db.query(BillReference).filter(
        BillReference.company_id == company_id,
        BillReference.invoice_voucher_id == invoice_voucher_id,
    ).first()


def _invoice_unpaid(db: Session, company_id: str, invoice: Voucher) -> Decimal:
    """True outstanding for an invoice: bill-ref outstanding when a ref exists
    (it accounts for credit/debit-note adjustments), else grand_total − paid.

    Regression (audit round 7): receivables/payables used grand_total − paid
    and IGNORED bill_references.adjusted_amount — a credit-note-adjusted
    invoice showed fully unpaid while the Outstanding Bills report showed the
    true outstanding. Both surfaces must agree.
    """
    paid = db.query(func.coalesce(func.sum(PaymentAllocation.amount), 0)).filter(
        PaymentAllocation.invoice_voucher_id == invoice.id,
        PaymentAllocation.company_id == company_id,
    ).scalar()
    paid = Decimal(str(paid or 0))

    bill_ref = _bill_ref_for_invoice(db, company_id, invoice.id)
    if bill_ref is not None:
        return Decimal(str(bill_ref.outstanding_amount))

    return Decimal(str(invoice.grand_total or 0)) - paid


def get_receivables(db: Session, company_id: str) -> dict:
    """Get outstanding sales invoices for the company."""
    today = date.today()
    invoices = db.query(Voucher).filter(
        Voucher.company_id == company_id,
        Voucher.voucher_type == "sales",
        Voucher.status == "posted",
    ).order_by(Voucher.voucher_date.asc()).all()

    items = []
    total_unpaid = Decimal("0")
    total_overdue = Decimal("0")
    overdue_count = 0

    for inv in invoices:
        paid = db.query(func.coalesce(func.sum(PaymentAllocation.amount), 0)).filter(
            PaymentAllocation.invoice_voucher_id == inv.id,
            PaymentAllocation.company_id == company_id,
        ).scalar()
        paid = Decimal(str(paid or 0))
        grand_total = Decimal(str(inv.grand_total or 0))
        unpaid = _invoice_unpaid(db, company_id, inv)
        if unpaid <= 0:
            continue

        days = _days_overdue(inv.due_date, today)
        bucket = _aging_bucket(days)

        # Resolve party name
        party_name = None
        if inv.party_id:
            party = db.get(Party, inv.party_id)
            party_name = party.name if party else None

        total_unpaid += unpaid
        if days > 0:
            total_overdue += unpaid
            overdue_count += 1

        items.append({
            "voucher_id": inv.id,
            "voucher_number": inv.voucher_number,
            "voucher_date": inv.voucher_date,
            "due_date": inv.due_date,
            "party_id": inv.party_id,
            "party_name": party_name,
            "grand_total": float(grand_total),
            "paid_amount": float(paid),
            "unpaid_amount": float(unpaid),
            "days_overdue": days,
            "aging_bucket": bucket,
        })

    return {
        "items": items,
        "total_unpaid": float(total_unpaid),
        "total_overdue": float(total_overdue),
        "overdue_count": overdue_count,
    }


def get_payables(db: Session, company_id: str) -> dict:
    """Get outstanding purchase invoices (bills) for the company."""
    today = date.today()
    invoices = db.query(Voucher).filter(
        Voucher.company_id == company_id,
        Voucher.voucher_type == "purchase",
        Voucher.status == "posted",
    ).order_by(Voucher.voucher_date.asc()).all()

    items = []
    total_unpaid = Decimal("0")
    total_overdue = Decimal("0")
    overdue_count = 0

    for inv in invoices:
        paid = db.query(func.coalesce(func.sum(PaymentAllocation.amount), 0)).filter(
            PaymentAllocation.invoice_voucher_id == inv.id,
            PaymentAllocation.company_id == company_id,
        ).scalar()
        paid = Decimal(str(paid or 0))
        grand_total = Decimal(str(inv.grand_total or 0))
        unpaid = _invoice_unpaid(db, company_id, inv)
        if unpaid <= 0:
            continue

        days = _days_overdue(inv.due_date, today)
        bucket = _aging_bucket(days)

        party_name = None
        if inv.party_id:
            party = db.get(Party, inv.party_id)
            party_name = party.name if party else None

        total_unpaid += unpaid
        if days > 0:
            total_overdue += unpaid
            overdue_count += 1

        items.append({
            "voucher_id": inv.id,
            "voucher_number": inv.voucher_number,
            "voucher_date": inv.voucher_date,
            "due_date": inv.due_date,
            "party_id": inv.party_id,
            "party_name": party_name,
            "grand_total": float(grand_total),
            "paid_amount": float(paid),
            "unpaid_amount": float(unpaid),
            "days_overdue": days,
            "aging_bucket": bucket,
        })

    return {
        "items": items,
        "total_unpaid": float(total_unpaid),
        "total_overdue": float(total_overdue),
        "overdue_count": overdue_count,
    }


def get_invoice_allocations(db: Session, company_id: str, invoice_voucher_id: str) -> list[dict]:
    """Get all payment allocations for a specific invoice."""
    allocs = db.query(PaymentAllocation).filter(
        PaymentAllocation.invoice_voucher_id == invoice_voucher_id,
        PaymentAllocation.company_id == company_id,
    ).order_by(PaymentAllocation.allocation_date.asc()).all()

    results = []
    for a in allocs:
        # Get payment voucher info
        pay_voucher = db.get(Voucher, a.payment_voucher_id)
        results.append({
            "id": a.id,
            "invoice_voucher_id": a.invoice_voucher_id,
            "payment_voucher_id": a.payment_voucher_id,
            "payment_voucher_number": pay_voucher.voucher_number if pay_voucher else None,
            "payment_voucher_type": pay_voucher.voucher_type if pay_voucher else None,
            "amount": float(a.amount),
            "allocation_date": a.allocation_date,
            "remarks": a.remarks,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })
    return results


def _recompute_bill_ref(db: Session, bill_ref: BillReference) -> None:
    """Recompute paid/outstanding/status from the surviving allocations.

    Shared by allocate/delete so the manual allocation API (PaymentsPage) and
    the voucher-form settlement path (`settle_bills`) can never diverge:
    allocations made outside a voucher must still move the bill reference the
    Outstanding Bills report and aging read.
    """
    paid = db.query(func.coalesce(func.sum(PaymentAllocation.amount), 0)).filter(
        PaymentAllocation.invoice_voucher_id == bill_ref.invoice_voucher_id,
        PaymentAllocation.company_id == bill_ref.company_id,
    ).scalar()
    paid = Decimal(str(paid or 0))
    bill_ref.paid_amount = float(paid)
    bill_ref.outstanding_amount = float(
        Decimal(str(bill_ref.original_amount))
        + Decimal(str(bill_ref.adjusted_amount))
        - paid
    )
    if bill_ref.outstanding_amount <= 0:
        bill_ref.status = "paid"
    elif paid > 0:
        bill_ref.status = "partial"
    else:
        bill_ref.status = "open"


def allocate_payment(
    db: Session,
    company_id: str,
    invoice_voucher_id: str,
    payment_voucher_id: str,
    amount: float,
    allocation_date: str,
    remarks: str | None = None,
) -> PaymentAllocation:
    """Allocate a payment voucher to an invoice. Validates the payment voucher type.

    The allocation is capped against the BILL REFERENCE's outstanding (which
    already accounts for credit/debit-note adjustments) — never against
    grand_total alone (audit round 7: over-allocation after a credit note).
    The bill reference is updated in the same step so the Outstanding Bills
    report and aging see the payment immediately.
    """
    invoice = db.get(Voucher, invoice_voucher_id)
    if not invoice or invoice.company_id != company_id:
        raise ValueError("Invoice not found")
    if invoice.voucher_type not in INVOICE_TYPES:
        raise ValueError("Can only allocate against sales or purchase invoices")
    if invoice.status != "posted":
        raise ValueError("Cannot allocate against a cancelled invoice")

    payment = db.get(Voucher, payment_voucher_id)
    if not payment or payment.company_id != company_id:
        raise ValueError("Payment voucher not found")
    if payment.voucher_type not in PAYMENT_TYPES:
        raise ValueError("Payment voucher must be a receipt or payment")
    if payment.status != "posted":
        raise ValueError("Cannot allocate a cancelled payment voucher")

    bill_ref = _bill_ref_for_invoice(db, company_id, invoice_voucher_id)
    outstanding = (
        Decimal(str(bill_ref.outstanding_amount))
        if bill_ref is not None
        else Decimal(str(invoice.grand_total or 0))
        - Decimal(str(
            db.query(func.coalesce(func.sum(PaymentAllocation.amount), 0)).filter(
                PaymentAllocation.invoice_voucher_id == invoice_voucher_id,
                PaymentAllocation.company_id == company_id,
            ).scalar() or 0
        ))
    )
    if amount > float(outstanding) + 0.01:
        raise ValueError(f"Allocation amount {amount} exceeds remaining {float(outstanding):.2f}")

    alloc = PaymentAllocation(
        company_id=company_id,
        invoice_voucher_id=invoice_voucher_id,
        payment_voucher_id=payment_voucher_id,
        amount=amount,
        allocation_date=allocation_date,
        remarks=remarks,
    )
    db.add(alloc)
    db.flush()
    db.refresh(alloc)

    # Keep the bill reference in sync — the same truth the Outstanding Bills
    # report and aging read. (Regression: this path used to skip the ref, so
    # PaymentsPage allocations never showed up in outstanding/aging.)
    if bill_ref is not None:
        _recompute_bill_ref(db, bill_ref)
        db.flush()

    return alloc


def delete_allocation(db: Session, company_id: str, allocation_id: str) -> bool:
    """Delete a payment allocation and recompute the affected bill reference."""
    alloc = db.get(PaymentAllocation, allocation_id)
    if not alloc or alloc.company_id != company_id:
        return False
    invoice_voucher_id = alloc.invoice_voucher_id
    db.delete(alloc)
    db.flush()

    bill_ref = _bill_ref_for_invoice(db, company_id, invoice_voucher_id)
    if bill_ref is not None:
        _recompute_bill_ref(db, bill_ref)
        db.flush()
    return True
