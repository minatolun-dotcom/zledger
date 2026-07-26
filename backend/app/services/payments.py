"""Payments service: receivables/payables and payment allocation logic."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.accounting import Party
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


def get_receivables(db: Session, company_id: str) -> dict:
    """Get outstanding sales invoices for the company."""
    today = date.today()
    invoices = db.query(Voucher).filter(
        Voucher.company_id == company_id,
        Voucher.voucher_type == "sales",
        Voucher.cancel_reason.is_(None),
    ).order_by(Voucher.voucher_date.asc()).all()

    items = []
    total_unpaid = Decimal("0")
    total_overdue = Decimal("0")
    overdue_count = 0

    for inv in invoices:
        # Sum allocations for this invoice
        paid = db.query(func.coalesce(func.sum(PaymentAllocation.amount), 0)).filter(
            PaymentAllocation.invoice_voucher_id == inv.id,
            PaymentAllocation.company_id == company_id,
        ).scalar()
        paid = Decimal(str(paid))
        grand_total = Decimal(str(inv.grand_total))
        unpaid = grand_total - paid
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
        Voucher.cancel_reason.is_(None),
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
        paid = Decimal(str(paid))
        grand_total = Decimal(str(inv.grand_total))
        unpaid = grand_total - paid
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


def allocate_payment(
    db: Session,
    company_id: str,
    invoice_voucher_id: str,
    payment_voucher_id: str,
    amount: float,
    allocation_date: str,
    remarks: str | None = None,
) -> PaymentAllocation:
    """Allocate a payment voucher to an invoice. Validates the payment voucher type."""
    invoice = db.get(Voucher, invoice_voucher_id)
    if not invoice or invoice.company_id != company_id:
        raise ValueError("Invoice not found")
    if invoice.voucher_type not in INVOICE_TYPES:
        raise ValueError("Can only allocate against sales or purchase invoices")

    payment = db.get(Voucher, payment_voucher_id)
    if not payment or payment.company_id != company_id:
        raise ValueError("Payment voucher not found")
    if payment.voucher_type not in PAYMENT_TYPES:
        raise ValueError("Payment voucher must be a receipt or payment")

    # Check allocation doesn't exceed unpaid
    existing_paid = db.query(func.coalesce(func.sum(PaymentAllocation.amount), 0)).filter(
        PaymentAllocation.invoice_voucher_id == invoice_voucher_id,
        PaymentAllocation.company_id == company_id,
    ).scalar()
    remaining = float(invoice.grand_total) - float(existing_paid)
    if amount > remaining + 0.01:
        raise ValueError(f"Allocation amount {amount} exceeds remaining {remaining:.2f}")

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
    return alloc


def delete_allocation(db: Session, company_id: str, allocation_id: str) -> bool:
    """Delete a payment allocation."""
    alloc = db.get(PaymentAllocation, allocation_id)
    if not alloc or alloc.company_id != company_id:
        return False
    db.delete(alloc)
    db.flush()
    return True
