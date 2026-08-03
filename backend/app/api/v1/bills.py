"""Bill-wise accounting API endpoints."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user
from app.models.user import User, Company
from app.models.accounting import Ledger, Party, FinancialYear
from app.models.bill_reference import BillReference
from app.models.voucher import Voucher
from app.schemas.bill import (
    BillSettlementRequest,
    BillSettlementOut,
    OutstandingBillLine,
    OutstandingBillsResponse,
    PartyStatementResponse,
    BillReferenceOut,
)
from app.services.bill_wise import (
    get_outstanding_bills,
    settle_bills,
    get_party_statement,
    adjust_bill_for_credit_note,
    _days_overdue,
)

router = APIRouter()


@router.get("/aging", response_model=list[OutstandingBillLine])
def get_aging_analysis(
    financial_year_id: str = Query(..., description="Financial Year UUID"),
    db: Session = Depends(get_db),
    company: Company = Depends(get_active_company),
):
    """Get aging analysis of outstanding bills across all parties."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        return []

    today = None  # _days_overdue handles None

    query = (
        select(BillReference, Voucher)
        .join(Voucher, BillReference.invoice_voucher_id == Voucher.id)
        .filter(
            BillReference.company_id == company.id,
            BillReference.status.in_(["open", "partial"]),
            BillReference.outstanding_amount > 0,
            Voucher.status == "posted",
            Voucher.voucher_date >= fy.start_date,
            Voucher.voucher_date <= fy.end_date,
        )
    )

    results = []
    for bill_ref, voucher in db.execute(query).all():
        days = _days_overdue(bill_ref.due_date, today)
        bucket = "current" if days <= 30 else "31-60" if days <= 60 else "61-90" if days <= 90 else "90+"

        results.append({
            "bill_reference_id": str(bill_ref.id),
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

    return sorted(results, key=lambda x: x["days_overdue"], reverse=True)


@router.get("/summary", response_model=dict)
def get_outstanding_summary(
    financial_year_id: str = Query(..., description="Financial Year UUID"),
    db: Session = Depends(get_db),
    company: Company = Depends(get_active_company),
):
    """Get summary of outstanding bills across all parties."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        return {"error": "Financial year not found"}

    today = None

    # Get total outstanding
    query = (
        select(func.sum(BillReference.outstanding_amount))
        .join(Voucher, BillReference.invoice_voucher_id == Voucher.id)
        .filter(
            BillReference.company_id == company.id,
            BillReference.status.in_(["open", "partial"]),
            BillReference.outstanding_amount > 0,
            Voucher.status == "posted",
            Voucher.voucher_date >= fy.start_date,
            Voucher.voucher_date <= fy.end_date,
        )
    )
    total = db.execute(query).scalar() or 0

    # Get by aging bucket
    aging_query = (
        select(
            BillReference.outstanding_amount,
            BillReference.due_date,
        )
        .join(Voucher, BillReference.invoice_voucher_id == Voucher.id)
        .filter(
            BillReference.company_id == company.id,
            BillReference.status.in_(["open", "partial"]),
            BillReference.outstanding_amount > 0,
            Voucher.status == "posted",
            Voucher.voucher_date >= fy.start_date,
            Voucher.voucher_date <= fy.end_date,
        )
    )

    aging_buckets = {"current": 0, "31-60": 0, "61-90": 0, "90+": 0}
    for row in db.execute(aging_query).all():
        days = _days_overdue(row.due_date, today)
        if days <= 30:
            aging_buckets["current"] += float(row.outstanding_amount)
        elif days <= 60:
            aging_buckets["31-60"] += float(row.outstanding_amount)
        elif days <= 90:
            aging_buckets["61-90"] += float(row.outstanding_amount)
        else:
            aging_buckets["90+"] += float(row.outstanding_amount)

    return {
        "total_outstanding": float(total),
        "aging_buckets": aging_buckets,
        "total_bills": len(list(db.execute(aging_query).all())),
    }


@router.get("/outstanding-by-party", response_model=list[dict])
def get_outstanding_by_party(
    financial_year_id: str = Query(..., description="Financial Year UUID"),
    db: Session = Depends(get_db),
    company: Company = Depends(get_active_company),
):
    """Get outstanding bills grouped by party."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        return []

    query = (
        select(
            Party.id.label("party_id"),
            Party.name.label("party_name"),
            Party.party_type.label("party_type"),
            func.sum(BillReference.outstanding_amount).label("total_outstanding"),
            func.count(BillReference.id).label("bill_count"),
        )
        .join(BillReference, BillReference.party_id == Party.id)
        .join(Voucher, BillReference.invoice_voucher_id == Voucher.id)
        .filter(
            Party.company_id == company.id,
            BillReference.company_id == company.id,
            BillReference.status.in_(["open", "partial"]),
            BillReference.outstanding_amount > 0,
            Voucher.status == "posted",
            Voucher.voucher_date >= fy.start_date,
            Voucher.voucher_date <= fy.end_date,
        )
        .group_by(Party.id, Party.name, Party.party_type)
        .order_by(func.sum(BillReference.outstanding_amount).desc())
    )

    results = []
    for row in db.execute(query).all():
        results.append({
            "party_id": row.party_id,
            "party_name": row.party_name,
            "party_type": row.party_type,
            "total_outstanding": float(row.total_outstanding),
            "bill_count": row.bill_count,
        })

    return results


@router.get("/outstanding-by-ledger", response_model=list[OutstandingBillLine])
def get_outstanding_bills_by_ledger(
    ledger_id: str = Query(..., description="Ledger UUID"),
    financial_year_id: str = Query(..., description="Financial Year UUID"),
    db: Session = Depends(get_db),
    company: Company = Depends(get_active_company),
):
    """Get outstanding bills for a party via ledger ID."""
    # Find party linked to this ledger
    party = db.query(Party).filter(Party.ledger_id == ledger_id).first()
    if not party or party.company_id != company.id:
        return []

    # Determine voucher_type from ledger group
    ledger = db.get(Ledger, ledger_id)
    if not ledger:
        return []

    # Customer ledgers are sales, supplier ledgers are purchase
    voucher_type = "sales" if ledger.group.name in ["Sundry Debtors", "Receivables"] else "purchase"

    bills = get_outstanding_bills(db, company.id, party.id, voucher_type)

    return [OutstandingBillLine(**b) for b in bills]


@router.get("/all", response_model=list[BillReferenceOut])
def list_bill_references(
    party_id: str | None = None,
    status: str | None = Query(None, regex="^(open|partial|paid|cancelled)$"),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    company: Company = Depends(get_active_company),
):
    """List all bill references with optional filters."""
    query = select(BillReference).filter(BillReference.company_id == company.id)

    if party_id:
        query = query.filter(BillReference.party_id == party_id)

    if status:
        query = query.filter(BillReference.status == status)

    query = query.order_by(BillReference.bill_date.desc()).limit(limit)

    results = []
    for bill_ref in db.execute(query).scalars().all():
        party = db.get(Party, bill_ref.party_id) if bill_ref.party_id else None
        results.append(
            BillReferenceOut(
                id=bill_ref.id,
                company_id=bill_ref.company_id,
                invoice_voucher_id=bill_ref.invoice_voucher_id,
                reference_type=bill_ref.reference_type,
                bill_number=bill_ref.bill_number,
                bill_date=bill_ref.bill_date,
                due_date=bill_ref.due_date,
                original_amount=bill_ref.original_amount,
                adjusted_amount=bill_ref.adjusted_amount,
                paid_amount=bill_ref.paid_amount,
                outstanding_amount=bill_ref.outstanding_amount,
                status=bill_ref.status,
                party_id=bill_ref.party_id,
                party_name=party.name if party else None,
                is_advance=bill_ref.is_advance,
                created_at=bill_ref.created_at.isoformat() if bill_ref.created_at else None,
                updated_at=bill_ref.updated_at.isoformat() if bill_ref.updated_at else None,
            )
        )

    return results

@router.get("/{bill_id}", response_model=BillReferenceOut)
def get_bill_reference(
    bill_id: str,
    db: Session = Depends(get_db),
    company: Company = Depends(get_active_company),
):
    """Get single bill reference by ID."""
    bill_ref = db.get(BillReference, bill_id)
    if not bill_ref or bill_ref.company_id != company.id:
        raise HTTPException(404, "Bill reference not found")

    party = db.get(Party, bill_ref.party_id) if bill_ref.party_id else None

    return BillReferenceOut(
        id=bill_ref.id,
        company_id=bill_ref.company_id,
        invoice_voucher_id=bill_ref.invoice_voucher_id,
        reference_type=bill_ref.reference_type,
        bill_number=bill_ref.bill_number,
        bill_date=bill_ref.bill_date,
        due_date=bill_ref.due_date,
        original_amount=bill_ref.original_amount,
        adjusted_amount=bill_ref.adjusted_amount,
        paid_amount=bill_ref.paid_amount,
        outstanding_amount=bill_ref.outstanding_amount,
        status=bill_ref.status,
        party_id=bill_ref.party_id,
        party_name=party.name if party else None,
        is_advance=bill_ref.is_advance,
        created_at=bill_ref.created_at.isoformat() if bill_ref.created_at else None,
        updated_at=bill_ref.updated_at.isoformat() if bill_ref.updated_at else None,
    )


@router.get("/outstanding/{party_id}", response_model=OutstandingBillsResponse)
def get_party_outstanding_bills(
    party_id: str,
    voucher_type: str = Query("sales", regex="^(sales|purchase)$"),
    db: Session = Depends(get_db),
    company: Company = Depends(get_active_company),
):
    """Get outstanding bills for a party (customer or supplier)."""
    party = db.get(Party, party_id)
    if not party or party.company_id != company.id:
        raise HTTPException(404, "Party not found")

    bills = get_outstanding_bills(db, company.id, party_id, voucher_type)

    total_outstanding = sum(b["outstanding_amount"] for b in bills)
    oldest_bill_date = bills[0]["bill_date"] if bills else None
    max_days_overdue = max((b["days_overdue"] for b in bills), default=0)

    return OutstandingBillsResponse(
        party_id=party_id,
        party_name=party.name,
        bills=[OutstandingBillLine(**b) for b in bills],
        total_outstanding=total_outstanding,
        oldest_bill_date=oldest_bill_date,
        max_days_overdue=max_days_overdue,
    )


@router.post("/settle", response_model=list[BillSettlementOut])
def settle_outstanding_bills(
    request: BillSettlementRequest,
    db: Session = Depends(get_db),
    company: Company = Depends(get_active_company),
):
    """Settle one or more outstanding bills with a payment/receipt voucher."""
    try:
        results = settle_bills(
            db, company.id, request.payment_voucher_id,
            [s.model_dump() for s in request.settlements], request.settlement_date,
        )
        db.commit()
        return results
    except ValueError as e:
        db.rollback()
        raise HTTPException(400, str(e))


@router.get("/statement/{party_id}", response_model=PartyStatementResponse)
def generate_party_statement(
    party_id: str,
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    company: Company = Depends(get_active_company),
):
    """Generate customer or supplier statement for a date range."""
    party = db.get(Party, party_id)
    if not party or party.company_id != company.id:
        raise HTTPException(404, "Party not found")

    try:
        statement = get_party_statement(db, company.id, party_id, start_date, end_date)
        return statement
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/credit-note/{credit_note_id}/adjust/{invoice_bill_id}")
def adjust_invoice_with_credit_note(
    credit_note_id: str,
    invoice_bill_id: str,
    db: Session = Depends(get_db),
    company: Company = Depends(get_active_company),
):
    """Adjust outstanding bill when credit note is issued."""
    credit_note = db.get(Voucher, credit_note_id)
    if not credit_note or credit_note.company_id != company.id:
        raise HTTPException(404, "Credit note voucher not found")

    try:
        bill_ref = adjust_bill_for_credit_note(db, company.id, credit_note, invoice_bill_id)
        db.commit()
        return {
            "bill_reference_id": bill_ref.id,
            "adjusted_amount": bill_ref.adjusted_amount,
            "outstanding_amount": bill_ref.outstanding_amount,
            "status": bill_ref.status,
        }
    except ValueError as e:
        db.rollback()
        raise HTTPException(400, str(e))


