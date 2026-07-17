"""Loans & Advances service: CRUD, interest calculation, voucher creation."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.accounting import AccountGroup, Ledger
from app.models.loan import Loan, LoanPayment
from app.models.user import Company
from app.models.voucher import Voucher, VoucherLine
from app.schemas.loan import LoanCreate, LoanPaymentCreate, LoanUpdate


# ── Helpers ──────────────────────────────────────────────────────────────

def _today_str() -> str:
    return date.today().isoformat()


def _parse_date(d: str) -> date:
    return date.fromisoformat(d)


def _days_between(d1: str, d2: str) -> int:
    return max((_parse_date(d2) - _parse_date(d1)).days, 0)


def _next_voucher_number(db: Session, company_id: str, voucher_type: str) -> str:
    """Reuse the same numbering logic as the voucher service."""
    import re
    from app.models.voucher_numbering import VoucherNumbering

    numbering = db.query(VoucherNumbering).filter(
        VoucherNumbering.company_id == company_id,
        VoucherNumbering.voucher_type == voucher_type,
    ).with_for_update().first()

    company = db.get(Company, company_id)
    today = date.today()
    fy_year = str(today.year) if today.month >= 4 else str(today.year - 1)

    if numbering:
        prefix = numbering.prefix
        fy_prefix = f"{prefix}-{fy_year}"
        all_numbers = db.query(Voucher.voucher_number).filter(
            Voucher.company_id == company_id,
            Voucher.voucher_type == voucher_type,
        ).all()
        max_seq = 0
        for (num,) in all_numbers:
            if num and num.startswith(fy_prefix):
                match = re.search(r'(\d+)$', num)
                if match:
                    max_seq = max(max_seq, int(match.group(1)))
        seq = max(numbering.next_sequence, max_seq + 1)
        numbering.next_sequence = seq + 1
        padding = max(4, len(str(seq)))
        return f"{fy_prefix}-{seq:0{padding}d}"

    # Fallback: no numbering config
    count = db.query(func.count(Voucher.id)).filter(
        Voucher.company_id == company_id,
        Voucher.voucher_type == voucher_type,
    ).scalar() or 0
    return f"{voucher_type.upper()[:3]}-{fy_year}-{count + 1:04d}"


def _create_voucher(
    db: Session,
    company_id: str,
    voucher_type: str,
    voucher_date: str,
    narration: str,
    debit_ledger_id: str,
    credit_ledger_id: str,
    amount: float,
) -> Voucher:
    """Create a simple two-line voucher (Dr one ledger, Cr another)."""
    vnum = _next_voucher_number(db, company_id, voucher_type)
    voucher = Voucher(
        company_id=company_id,
        voucher_type=voucher_type,
        voucher_number=vnum,
        voucher_date=voucher_date,
        narration=narration,
        subtotal=amount,
        grand_total=amount,
        status="posted",
    )
    db.add(voucher)
    db.flush()

    db.add(VoucherLine(
        voucher_id=voucher.id,
        ledger_id=debit_ledger_id,
        debit=amount,
        credit=0,
    ))
    db.add(VoucherLine(
        voucher_id=voucher.id,
        ledger_id=credit_ledger_id,
        debit=0,
        credit=amount,
    ))
    db.flush()
    return voucher


def _get_or_create_loan_ledger(
    db: Session, company_id: str, party_name: str, loan_type: str
) -> Ledger:
    """Find or create a ledger under the appropriate group for this loan."""
    if loan_type == "taken":
        # Loans (Liability) group
        group_name = "Loans (Liability)"
    else:
        # Loans & Advances (Asset) group
        group_name = "Loans & Advances (Asset)"

    group = db.query(AccountGroup).filter(
        AccountGroup.company_id == company_id,
        AccountGroup.name == group_name,
    ).first()

    if not group:
        # Create the group if it doesn't exist
        nature = "liabilities" if loan_type == "taken" else "assets"
        group = AccountGroup(
            company_id=company_id,
            name=group_name,
            nature=nature,
            group_type="sub",
            is_system=False,
        )
        db.add(group)
        db.flush()

    ledger_name = f"Loan {party_name}" if loan_type == "given" else f"Loan from {party_name}"
    if loan_type == "employee_advance":
        ledger_name = f"Advance — {party_name}"

    existing = db.query(Ledger).filter(
        Ledger.company_id == company_id,
        Ledger.name == ledger_name,
    ).first()
    if existing:
        return existing

    ledger = Ledger(
        company_id=company_id,
        name=ledger_name,
        group_id=group.id,
        opening_balance=0,
        opening_balance_type="Dr",
    )
    db.add(ledger)
    db.flush()
    return ledger


def _get_bank_ledger(db: Session, company_id: str, bank_ledger_id: str) -> Ledger:
    ledger = db.get(Ledger, bank_ledger_id)
    if not ledger or ledger.company_id != company_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid bank/cash ledger")
    return ledger


# ── Interest calculation ─────────────────────────────────────────────────

def calculate_accrued_interest(loan: Loan, as_of_date: str | None = None) -> float:
    """Calculate accrued interest on a loan as of a given date."""
    if loan.interest_type == "none" or loan.interest_rate <= 0:
        return 0.0

    effective_date = as_of_date or _today_str()
    days = _days_between(loan.disbursement_date, effective_date)
    if days <= 0:
        return 0.0

    principal = float(loan.outstanding_balance)
    rate = loan.interest_rate / 100

    if loan.interest_type == "simple":
        return round(principal * rate * days / 365, 2)
    else:  # compound
        years = days / 365
        return round(principal * ((1 + rate) ** years - 1), 2)


def split_payment_interest_first(
    loan: Loan, total_amount: float, payment_date: str
) -> tuple[float, float]:
    """Split a payment into interest and principal portions.
    Interest is paid first, remainder reduces principal.
    Returns (interest_portion, principal_portion).
    """
    accrued = calculate_accrued_interest(loan, payment_date)
    interest_portion = min(total_amount, accrued)
    principal_portion = total_amount - interest_portion
    return round(interest_portion, 2), round(principal_portion, 2)


# ── CRUD ─────────────────────────────────────────────────────────────────

def create_loan(db: Session, company_id: str, data: LoanCreate) -> Loan:
    # Validate bank ledger
    _get_bank_ledger(db, company_id, data.bank_ledger_id)

    # Create or find the loan ledger
    loan_ledger = _get_or_create_loan_ledger(db, company_id, data.party_name, data.loan_type)

    loan = Loan(
        company_id=company_id,
        loan_type=data.loan_type,
        party_name=data.party_name,
        party_ledger_id=data.party_ledger_id,
        loan_ledger_id=loan_ledger.id,
        principal_amount=data.principal_amount,
        interest_rate=data.interest_rate,
        interest_type=data.interest_type,
        disbursement_date=data.disbursement_date,
        due_date=data.due_date,
        emi_amount=data.emi_amount,
        tenure_months=data.tenure_months,
        status="active",
        outstanding_balance=data.principal_amount,
        accrued_interest=0,
        notes=data.notes,
    )
    db.add(loan)
    db.flush()

    # Auto-create disbursement voucher
    if data.loan_type == "given" or data.loan_type == "employee_advance":
        # Dr Loan Ledger, Cr Bank
        v = _create_voucher(
            db, company_id, "payment", data.disbursement_date,
            f"Loan disbursement — {data.party_name}",
            loan_ledger.id, data.bank_ledger_id, data.principal_amount,
        )
    else:
        # Dr Bank, Cr Loan Ledger
        v = _create_voucher(
            db, company_id, "receipt", data.disbursement_date,
            f"Loan received — {data.party_name}",
            data.bank_ledger_id, loan_ledger.id, data.principal_amount,
        )

    loan.disbursement_voucher_id = v.id
    db.flush()
    return loan


def get_loan(db: Session, company_id: str, loan_id: str) -> Loan:
    loan = db.get(Loan, loan_id)
    if not loan or loan.company_id != company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Loan not found")
    # Update accrued interest
    loan.accrued_interest = calculate_accrued_interest(loan)
    # Check overdue
    if loan.status == "active" and loan.due_date and loan.due_date < _today_str():
        loan.status = "overdue"
    return loan


def list_loans(
    db: Session, company_id: str, loan_type: str | None = None,
    loan_status: str | None = None,
) -> list[Loan]:
    q = db.query(Loan).filter(Loan.company_id == company_id)
    if loan_type:
        q = q.filter(Loan.loan_type == loan_type)
    if loan_status:
        q = q.filter(Loan.status == loan_status)
    loans = q.order_by(Loan.disbursement_date.desc()).all()
    # Update accrued interest + overdue status
    for loan in loans:
        loan.accrued_interest = calculate_accrued_interest(loan)
        if loan.status == "active" and loan.due_date and loan.due_date < _today_str():
            loan.status = "overdue"
    return loans


def update_loan(db: Session, company_id: str, loan_id: str, data: LoanUpdate) -> Loan:
    loan = get_loan(db, company_id, loan_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(loan, field, value)
    db.flush()
    return loan


def delete_loan(db: Session, company_id: str, loan_id: str) -> None:
    loan = get_loan(db, company_id, loan_id)
    if loan.payments:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot delete loan with existing payments")
    # Reverse disbursement voucher
    if loan.disbursement_voucher_id:
        voucher = db.get(Voucher, loan.disbursement_voucher_id)
        if voucher:
            voucher.status = "cancelled"
            voucher.cancel_reason = "Loan deleted"
            voucher.cancelled_at = datetime.utcnow().isoformat()
    db.delete(loan)
    db.flush()


def record_payment(db: Session, company_id: str, loan_id: str, data: LoanPaymentCreate) -> LoanPayment:
    loan = get_loan(db, company_id, loan_id)
    if loan.status == "closed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Loan is already closed")

    _get_bank_ledger(db, company_id, data.bank_ledger_id)

    # Calculate interest
    if data.is_manual_interest and data.interest_portion is not None:
        interest_portion = data.interest_portion
        principal_portion = data.total_amount - interest_portion
    else:
        interest_portion, principal_portion = split_payment_interest_first(
            loan, data.total_amount, data.payment_date
        )

    # Validate
    if principal_portion < 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Interest portion exceeds total amount")

    payment = LoanPayment(
        company_id=company_id,
        loan_id=loan_id,
        payment_date=data.payment_date,
        total_amount=data.total_amount,
        interest_portion=interest_portion,
        principal_portion=principal_portion,
        is_manual_interest=data.is_manual_interest,
        notes=data.notes,
    )
    db.add(payment)
    db.flush()

    # Update loan
    loan.outstanding_balance = max(float(loan.outstanding_balance) - principal_portion, 0)
    loan.accrued_interest = max(calculate_accrued_interest(loan, data.payment_date) - interest_portion, 0)

    if float(loan.outstanding_balance) <= 0:
        loan.status = "closed"

    # Auto-create voucher
    if loan.loan_type == "taken":
        # Repaying loan: Dr Loan Ledger, Cr Bank
        v = _create_voucher(
            db, company_id, "payment", data.payment_date,
            f"Loan repayment — {loan.party_name}",
            loan.loan_ledger_id, data.bank_ledger_id, data.total_amount,
        )
    else:
        # Receiving repayment: Dr Bank, Cr Loan Ledger
        v = _create_voucher(
            db, company_id, "receipt", data.payment_date,
            f"Loan repayment — {loan.party_name}",
            data.bank_ledger_id, loan.loan_ledger_id, data.total_amount,
        )

    payment.voucher_id = v.id
    db.flush()
    return payment


def list_payments(db: Session, company_id: str, loan_id: str) -> list[LoanPayment]:
    loan = get_loan(db, company_id, loan_id)
    return db.query(LoanPayment).filter(
        LoanPayment.loan_id == loan.id
    ).order_by(LoanPayment.payment_date.desc()).all()


def get_summary(db: Session, company_id: str) -> dict[str, Any]:
    loans = db.query(Loan).filter(Loan.company_id == company_id).all()

    total_given = sum(float(l.principal_amount) for l in loans if l.loan_type == "given")
    total_taken = sum(float(l.principal_amount) for l in loans if l.loan_type == "taken")
    total_advances = sum(float(l.principal_amount) for l in loans if l.loan_type == "employee_advance")

    outstanding_given = sum(float(l.outstanding_balance) for l in loans if l.loan_type == "given")
    outstanding_taken = sum(float(l.outstanding_balance) for l in loans if l.loan_type == "taken")
    outstanding_advances = sum(float(l.outstanding_balance) for l in loans if l.loan_type == "employee_advance")

    today = _today_str()
    overdue_count = sum(1 for l in loans if l.status == "active" and l.due_date and l.due_date < today)

    accrued_income = sum(calculate_accrued_interest(l) for l in loans if l.loan_type in ("given", "employee_advance"))
    accrued_expense = sum(calculate_accrued_interest(l) for l in loans if l.loan_type == "taken")

    return {
        "total_given": total_given,
        "total_taken": total_taken,
        "total_advances": total_advances,
        "outstanding_given": outstanding_given,
        "outstanding_taken": outstanding_taken,
        "outstanding_advances": outstanding_advances,
        "overdue_count": overdue_count,
        "accrued_interest_income": round(accrued_income, 2),
        "accrued_interest_expense": round(accrued_expense, 2),
    }
