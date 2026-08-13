"""Bill-wise accounting service: bill references, settlements, and statements."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.accounting import Party
from app.models.voucher import Voucher
from app.models.bill_reference import BillReference
from app.models.payment_allocation import PaymentAllocation


def _days_overdue(due_date_str: str | None, today: date | None = None) -> int:
    """Calculate days overdue from due date."""
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
    """Determine aging bucket."""
    if days <= 0:
        return "Current"
    elif days <= 30:
        return "1-30 Days"
    elif days <= 60:
        return "31-60 Days"
    elif days <= 90:
        return "61-90 Days"
    else:
        return "90+"


def create_bill_reference(
    db: Session,
    company_id: str,
    invoice_voucher: Voucher,
    reference_type: str = "new_ref",
) -> BillReference:
    """Auto-create bill reference when invoice is saved.
    
    Called automatically from voucher_service when creating Sales/Purchase vouchers.
    """
    # Calculate outstanding amount (original - already paid)
    paid = db.query(func.coalesce(func.sum(PaymentAllocation.amount), 0)).filter(
        PaymentAllocation.invoice_voucher_id == invoice_voucher.id,
        PaymentAllocation.company_id == company_id,
    ).scalar() or 0
    
    outstanding = Decimal(str(invoice_voucher.grand_total)) - Decimal(str(paid))
    
    # Determine status
    if outstanding <= 0:
        status = "paid"
    elif paid > 0:
        status = "partial"
    else:
        status = "open"
    
    # Create bill reference
    bill_ref = BillReference(
        company_id=company_id,
        invoice_voucher_id=invoice_voucher.id,
        reference_type=reference_type,
        bill_number=invoice_voucher.voucher_number,
        bill_date=invoice_voucher.voucher_date,
        due_date=invoice_voucher.due_date,
        original_amount=float(invoice_voucher.grand_total),
        adjusted_amount=0,
        paid_amount=float(paid),
        outstanding_amount=float(outstanding),
        status=status,
        party_id=invoice_voucher.party_id,
        is_advance=(reference_type == "advance"),
    )
    
    db.add(bill_ref)
    return bill_ref


def get_outstanding_bills(
    db: Session,
    company_id: str,
    party_id: str,
    voucher_type: str = "sales",  # 'sales' or 'purchase'
) -> list[dict]:
    """Get outstanding bills for a party.
    
    Used in Receipt/Payment voucher to show bills available for settlement.
    """
    today = date.today()
    
    # Get all bill references for this party with outstanding amount
    query = (
        select(BillReference, Voucher)
        .join(Voucher, BillReference.invoice_voucher_id == Voucher.id)
        .filter(
            BillReference.company_id == company_id,
            BillReference.party_id == party_id,
            BillReference.status.in_(["open", "partial"]),
            BillReference.outstanding_amount > 0,
            Voucher.voucher_type == voucher_type,
            Voucher.status == "posted",
        )
        .order_by(BillReference.bill_date.asc())
    )
    
    results = []
    for bill_ref, voucher in db.execute(query).all():
        days = _days_overdue(bill_ref.due_date, today)
        bucket = _aging_bucket(days)
        
        results.append({
            "bill_reference_id": bill_ref.id,
            "bill_number": bill_ref.bill_number,
            "bill_date": bill_ref.bill_date,
            "due_date": bill_ref.due_date,
            "invoice_voucher_number": voucher.voucher_number,
            "invoice_date": voucher.voucher_date,
            "original_amount": float(bill_ref.original_amount),
            "paid_amount": float(bill_ref.paid_amount),
            "outstanding_amount": float(bill_ref.outstanding_amount),
            "days_overdue": days,
            "aging_bucket": bucket,
        })
    
    return results


def settle_bills(
    db: Session,
    company_id: str,
    payment_voucher_id: str,
    settlements: list[dict],
    settlement_date: str,
) -> list[dict]:
    """Settle one or more bills with a payment/receipt voucher.
    
    Args:
        settlements: List of {'bill_reference_id': str, 'amount': Decimal, 'remarks': str}
    
    Returns:
        List of settlement results with remaining outstanding amounts.
    
    Raises:
        ValueError: If validation fails (over-allocation, negative amounts, etc.)
    """
    # Validate payment voucher exists and is correct type
    payment_voucher = db.get(Voucher, payment_voucher_id)
    if not payment_voucher or payment_voucher.company_id != company_id:
        raise ValueError("Payment voucher not found")
    
    if payment_voucher.voucher_type not in ("payment", "receipt"):
        raise ValueError("Voucher must be payment or receipt type")
    
    results = []
    total_allocated = Decimal("0")
    
    for settlement in settlements:
        bill_ref_id = settlement["bill_reference_id"]
        amount = Decimal(str(settlement["amount"]))
        remarks = settlement.get("remarks")
        
        # Get bill reference
        bill_ref = db.get(BillReference, bill_ref_id)
        if not bill_ref or bill_ref.company_id != company_id:
            raise ValueError(f"Bill reference {bill_ref_id} not found")
        
        # Validation: Amount must be positive
        if amount <= 0:
            raise ValueError(f"Settlement amount must be positive: {amount}")

        # Validation: Bill must belong to a posted (non-cancelled) invoice
        invoice_voucher = db.get(Voucher, bill_ref.invoice_voucher_id)
        if not invoice_voucher or invoice_voucher.status != "posted":
            raise ValueError(
                f"Cannot settle bill {bill_ref.bill_number}: invoice is not posted"
            )
        
        # Validation: Cannot settle more than outstanding
        if amount > Decimal(str(bill_ref.outstanding_amount)):
            raise ValueError(
                f"Cannot allocate ₹{amount} to bill {bill_ref.bill_number}. "
                f"Outstanding is only ₹{bill_ref.outstanding_amount}"
            )
        
        # Create payment allocation
        allocation = PaymentAllocation(
            company_id=company_id,
            invoice_voucher_id=bill_ref.invoice_voucher_id,
            payment_voucher_id=payment_voucher_id,
            amount=float(amount),
            allocation_date=settlement_date,
            remarks=remarks,
        )
        db.add(allocation)
        db.flush()  # assign allocation.id

        # Update bill reference
        bill_ref.paid_amount = float(Decimal(str(bill_ref.paid_amount)) + amount)
        bill_ref.outstanding_amount = float(Decimal(str(bill_ref.outstanding_amount)) - amount)
        
        # Update status
        if bill_ref.outstanding_amount <= 0:
            bill_ref.status = "paid"
        elif bill_ref.paid_amount > 0:
            bill_ref.status = "partial"
        
        total_allocated += amount
        
        results.append({
            "payment_allocation_id": allocation.id,
            "bill_reference_id": bill_ref.id,
            "amount": float(amount),
            "remaining_outstanding": float(bill_ref.outstanding_amount),
        })
    
    # Validation: Total allocated cannot exceed payment amount
    payment_amount = Decimal(str(payment_voucher.grand_total))
    if total_allocated > payment_amount:
        raise ValueError(
            f"Total settlement (₹{total_allocated}) exceeds payment amount (₹{payment_amount})"
        )
    
    return results


def adjust_bill_for_credit_note(
    db: Session,
    company_id: str,
    credit_note_voucher: Voucher,
    invoice_bill_id: str,
) -> BillReference:
    """Adjust outstanding bill when credit note is issued.
    
    Reduces the outstanding amount of the original invoice.
    """
    bill_ref = db.get(BillReference, invoice_bill_id)
    if not bill_ref or bill_ref.company_id != company_id:
        raise ValueError("Bill reference not found")
    
    # Adjustment amount is the credit note amount (negative for reduction)
    adjustment = Decimal(str(credit_note_voucher.grand_total))
    
    bill_ref.adjusted_amount = float(Decimal(str(bill_ref.adjusted_amount)) + adjustment)
    bill_ref.outstanding_amount = float(
        Decimal(str(bill_ref.original_amount))
        + Decimal(str(bill_ref.adjusted_amount))
        - Decimal(str(bill_ref.paid_amount))
    )
    
    # Update status
    if bill_ref.outstanding_amount <= 0:
        bill_ref.status = "paid"
    elif bill_ref.paid_amount > 0:
        bill_ref.status = "partial"
    else:
        bill_ref.status = "open"
    
    return bill_ref


def get_party_statement(
    db: Session,
    company_id: str,
    party_id: str,
    start_date: str,
    end_date: str,
) -> dict:
    """Generate complete party statement (customer or supplier).
    
    Shows all transactions with running balance.
    """
    party = db.get(Party, party_id)
    if not party or party.company_id != company_id:
        raise ValueError("Party not found")
    
    # Determine party type from group
    from app.models.accounting import AccountGroup, Ledger
    
    party_ledger = db.get(Ledger, party.ledger_id) if party.ledger_id else None
    party_type = "customer"  # Default
    
    if party_ledger:
        group = db.get(AccountGroup, party_ledger.group_id)
        if group and "payable" in group.name.lower():
            party_type = "supplier"
    
    # Get opening balance (sum of transactions before start_date)
    # TODO: Implement ledger balance calculation for opening
    opening_balance = Decimal("0")
    opening_type = "Dr"
    
    # Get all bill references in date range (posted invoices only)
    bills = (
        db.query(BillReference)
        .join(Voucher, BillReference.invoice_voucher_id == Voucher.id)
        .filter(
            BillReference.company_id == company_id,
            BillReference.party_id == party_id,
            BillReference.bill_date >= start_date,
            BillReference.bill_date <= end_date,
            Voucher.status == "posted",
        )
        .order_by(BillReference.bill_date.asc())
        .all()
    )
    
    # Get all payment allocations in date range
    allocations = (
        db.query(PaymentAllocation, BillReference, Voucher)
        .join(BillReference, PaymentAllocation.invoice_voucher_id == BillReference.invoice_voucher_id)
        .join(Voucher, PaymentAllocation.payment_voucher_id == Voucher.id)
        .filter(
            PaymentAllocation.company_id == company_id,
            BillReference.party_id == party_id,
            PaymentAllocation.allocation_date >= start_date,
            PaymentAllocation.allocation_date <= end_date,
            Voucher.status == "posted",
        )
        .order_by(PaymentAllocation.allocation_date.asc())
        .all()
    )
    
    # Build transaction list
    transactions = []
    running_balance = opening_balance
    total_debit = Decimal("0")
    total_credit = Decimal("0")
    
    # Add bills (invoices)
    for bill in bills:
        voucher = db.get(Voucher, bill.invoice_voucher_id)
        amount = Decimal(str(bill.original_amount))
        
        if party_type == "customer":
            # Customer invoice = Debit (they owe us)
            debit = float(amount)
            credit = 0.0
            running_balance += amount
        else:
            # Supplier bill = Credit (we owe them)
            debit = 0.0
            credit = float(amount)
            running_balance -= amount
        
        total_debit += Decimal(str(debit))
        total_credit += Decimal(str(credit))
        
        transactions.append({
            "date": bill.bill_date,
            "voucher_type": voucher.voucher_type if voucher else "invoice",
            "voucher_number": voucher.voucher_number if voucher else bill.bill_number,
            "bill_number": bill.bill_number,
            "debit": debit,
            "credit": credit,
            "balance": float(abs(running_balance)),
            "remarks": None,
        })
    
    # Add payments/receipts
    for alloc, bill_ref, payment_voucher in allocations:
        amount = Decimal(str(alloc.amount))
        
        if party_type == "customer":
            # Receipt from customer = Credit (reduces their debt)
            debit = 0.0
            credit = float(amount)
            running_balance -= amount
        else:
            # Payment to supplier = Debit (reduces our debt)
            debit = float(amount)
            credit = 0.0
            running_balance += amount
        
        total_debit += Decimal(str(debit))
        total_credit += Decimal(str(credit))
        
        transactions.append({
            "date": alloc.allocation_date,
            "voucher_type": payment_voucher.voucher_type,
            "voucher_number": payment_voucher.voucher_number,
            "bill_number": bill_ref.bill_number,
            "debit": debit,
            "credit": credit,
            "balance": float(abs(running_balance)),
            "remarks": alloc.remarks,
        })
    
    # Sort by date
    transactions.sort(key=lambda x: x["date"])
    
    # Determine closing balance type
    closing_type = "Dr" if running_balance >= 0 else "Cr"
    
    return {
        "party_id": party_id,
        "party_name": party.name,
        "party_type": party_type,
        "start_date": start_date,
        "end_date": end_date,
        "opening_balance": float(abs(opening_balance)),
        "opening_balance_type": opening_type,
        "transactions": transactions,
        "closing_balance": float(abs(running_balance)),
        "closing_balance_type": closing_type,
        "total_debit": float(total_debit),
        "total_credit": float(total_credit),
    }
