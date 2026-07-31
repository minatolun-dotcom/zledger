"""Bill-wise accounting API endpoints."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
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
)
from app.models.bill_reference import BillReference
from app.models.voucher import Voucher
from app.models.accounting import Party

router = APIRouter()


@router.get("/outstanding/{party_id}", response_model=OutstandingBillsResponse)
def get_party_outstanding_bills(
    party_id: str,
    voucher_type: str = Query("sales", regex="^(sales|purchase)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get outstanding bills for a party (customer or supplier).
    
    Used in Receipt/Payment voucher to show bills available for settlement.
    
    Args:
        party_id: Party UUID
        voucher_type: 'sales' (for receipts) or 'purchase' (for payments)
    """
    company_id = current_user.active_company_id
    if not company_id:
        raise HTTPException(400, "No active company")
    
    # Verify party exists
    party = db.get(Party, party_id)
    if not party or party.company_id != company_id:
        raise HTTPException(404, "Party not found")
    
    bills = get_outstanding_bills(db, company_id, party_id, voucher_type)
    
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
    current_user: User = Depends(get_current_user),
):
    """Settle one or more outstanding bills with a payment/receipt voucher.
    
    This is called when creating a Receipt (customer payment) or Payment (supplier payment)
    to allocate the payment amount across specific bills.
    
    Validations:
    - Payment voucher must exist and be receipt/payment type
    - Each settlement amount must be > 0
    - Cannot allocate more than outstanding amount per bill
    - Total allocated cannot exceed payment amount
    """
    company_id = current_user.active_company_id
    if not company_id:
        raise HTTPException(400, "No active company")
    
    try:
        results = settle_bills(
            db,
            company_id,
            request.payment_voucher_id,
            [s.dict() for s in request.settlements],
            request.settlement_date,
        )
        db.commit()
        return [BillSettlementOut(**r) for r in results]
    except ValueError as e:
        db.rollback()
        raise HTTPException(400, str(e))


@router.get("/statement/{party_id}", response_model=PartyStatementResponse)
def generate_party_statement(
    party_id: str,
    start_date: str = Query(..., regex=r"^\d{4}-\d{2}-\d{2}$"),
    end_date: str = Query(..., regex=r"^\d{4}-\d{2}-\d{2}$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate customer or supplier statement for a date range.
    
    Shows all transactions (invoices, payments, credit notes) with running balance.
    """
    company_id = current_user.active_company_id
    if not company_id:
        raise HTTPException(400, "No active company")
    
    # Verify party exists
    party = db.get(Party, party_id)
    if not party or party.company_id != company_id:
        raise HTTPException(404, "Party not found")
    
    try:
        statement = get_party_statement(db, company_id, party_id, start_date, end_date)
        return PartyStatementResponse(**statement)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/credit-note/{credit_note_id}/adjust/{invoice_bill_id}")
def adjust_invoice_with_credit_note(
    credit_note_id: str,
    invoice_bill_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Adjust outstanding bill when credit note is issued.
    
    Reduces the outstanding amount of the original invoice.
    """
    company_id = current_user.active_company_id
    if not company_id:
        raise HTTPException(400, "No active company")
    
    # Verify credit note voucher exists
    credit_note = db.get(Voucher, credit_note_id)
    if not credit_note or credit_note.company_id != company_id:
        raise HTTPException(404, "Credit note voucher not found")
    
    try:
        bill_ref = adjust_bill_for_credit_note(db, company_id, credit_note, invoice_bill_id)
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


@router.get("/all", response_model=list[BillReferenceOut])
def list_bill_references(
    party_id: str | None = None,
    status: str | None = Query(None, regex="^(open|partial|paid|cancelled)$"),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all bill references with optional filters."""
    company_id = current_user.active_company_id
    if not company_id:
        raise HTTPException(400, "No active company")
    
    query = db.query(BillReference).filter(BillReference.company_id == company_id)
    
    if party_id:
        query = query.filter(BillReference.party_id == party_id)
    if status:
        query = query.filter(BillReference.status == status)
    
    query = query.order_by(BillReference.bill_date.desc()).limit(limit)
    
    results = []
    for bill_ref in query.all():
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
    current_user: User = Depends(get_current_user),
):
    """Get single bill reference by ID."""
    company_id = current_user.active_company_id
    if not company_id:
        raise HTTPException(400, "No active company")
    
    bill_ref = db.get(BillReference, bill_id)
    if not bill_ref or bill_ref.company_id != company_id:
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
