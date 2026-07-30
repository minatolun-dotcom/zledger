"""Public setup endpoints (no auth required)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.user import Company, User

router = APIRouter()


class SetupStatus(BaseModel):
    has_users: bool
    has_companies: bool


@router.get("/status", response_model=SetupStatus)
def get_setup_status(db: Session = Depends(get_db)):
    """Check if this is a fresh instance (no users or companies)."""
    user_count = db.scalar(select(func.count()).select_from(User))
    company_count = db.scalar(select(func.count()).select_from(Company))
    return SetupStatus(
        has_users=user_count > 0,
        has_companies=company_count > 0,
    )

@router.get("/trial-balance-status/{company_id}")
def get_trial_balance_status(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Check if a company's opening balances satisfy the accounting equation.
    Returns Trial Balance status: balanced or imbalanced with details.
    """
    from decimal import Decimal
    from app.models.accounting import Ledger
    
    # Verify user has access to this company
    membership = db.query(CompanyMember).filter(
        CompanyMember.company_id == company_id,
        CompanyMember.user_id == current_user.id
    ).first()
    
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied to this company")
    
    # Calculate opening balance totals
    ledgers = db.query(Ledger).filter(Ledger.company_id == company_id).all()
    
    dr_total = Decimal('0')
    cr_total = Decimal('0')
    
    for ledger in ledgers:
        opening = Decimal(str(ledger.opening_balance or 0))
        opening_type = ledger.opening_balance_type or 'Dr'
        
        if opening_type == 'Dr':
            dr_total += opening
        else:
            cr_total += opening
    
    imbalance = abs(dr_total - cr_total)
    is_balanced = imbalance < Decimal('1')
    
    return {
        "company_id": company_id,
        "is_balanced": is_balanced,
        "dr_total": float(dr_total),
        "cr_total": float(cr_total),
        "imbalance": float(imbalance),
        "status": "balanced" if is_balanced else "imbalanced",
        "message": (
            "Opening balances are balanced" if is_balanced
            else f"Opening balances have an imbalance of ₹{imbalance:,.2f}. "
                 "Please review your Capital Account opening balance."
        )
    }


@router.post("/validate-opening-balances/{company_id}")
def validate_opening_balances(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Validate that a company's opening balances satisfy the accounting equation.
    Raises HTTPException if imbalanced.
    Use this before allowing users to create transactions.
    """
    status = get_trial_balance_status(company_id, db, current_user)
    
    if not status["is_balanced"]:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Opening balances not balanced",
                "dr_total": status["dr_total"],
                "cr_total": status["cr_total"],
                "imbalance": status["imbalance"],
                "help": (
                    "The fundamental accounting equation must be satisfied: "
                    "Assets + Expenses = Liabilities + Income + Capital. "
                    "Please adjust your Capital Account opening balance to balance the books."
                )
            }
        )
    
    return status
