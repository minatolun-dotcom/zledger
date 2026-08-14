"""Loans & Advances endpoints: CRUD, payments, summary."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user, require_role
from app.models.user import Company, User
from app.schemas.member import CompanyRole
from app.schemas.loan import (
    LoanCreate,
    LoanListResponse,
    LoanOut,
    LoanPaymentCreate,
    LoanPaymentOut,
    LoanSummary,
    LoanUpdate,
)
from app.services.loan import (
    calculate_accrued_interest,
    create_loan,
    delete_loan,
    get_loan,
    get_summary,
    list_loans,
    list_payments,
    record_payment,
    update_loan,
)

router = APIRouter()


@router.get("", response_model=LoanListResponse)
def list_all_loans(
    loan_type: str | None = Query(default=None),
    loan_status: str | None = Query(default=None),
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
    _=Depends(require_role(CompanyRole.owner)),
):
    loans = list_loans(db, company.id, loan_type=loan_type, loan_status=loan_status)
    return LoanListResponse(
        items=[LoanOut.model_validate(l) for l in loans],
        total=len(loans),
    )


@router.get("/summary", response_model=LoanSummary)
def loan_summary(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
    _=Depends(require_role(CompanyRole.owner)),
):
    return get_summary(db, company.id)


@router.get("/{loan_id}", response_model=LoanOut)
def get_loan_detail(
    loan_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
    _=Depends(require_role(CompanyRole.owner)),
):
    loan = get_loan(db, company.id, loan_id)
    return LoanOut.model_validate(loan)


@router.post("", response_model=LoanOut, status_code=201)
def create_new_loan(
    data: LoanCreate,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _=Depends(require_role(CompanyRole.owner)),
):
    loan = create_loan(db, company.id, data, user.id)
    db.commit()
    from app.services.audit import log_action
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="CREATE", entity_type="loan", entity_id=loan.id,
        new_value={"party_name": data.party_name, "loan_type": data.loan_type, "principal_amount": str(data.principal_amount)},
        description=f"Created {data.loan_type} loan for {data.party_name}",
    )
    db.commit()
    return LoanOut.model_validate(loan)


@router.patch("/{loan_id}", response_model=LoanOut)
def update_loan_detail(
    loan_id: str,
    data: LoanUpdate,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _=Depends(require_role(CompanyRole.owner)),
):
    loan = update_loan(db, company.id, loan_id, data)
    db.commit()
    from app.services.audit import log_action
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="UPDATE", entity_type="loan", entity_id=loan_id,
        new_value=data.model_dump(exclude_unset=True, mode="json"),
        description=f"Updated loan {loan.loan_number if hasattr(loan, 'loan_number') else loan_id}",
    )
    db.commit()
    return LoanOut.model_validate(loan)


@router.delete("/{loan_id}", status_code=204)
def delete_loan_detail(
    loan_id: str,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _=Depends(require_role(CompanyRole.owner)),
):
    from app.services.loan import get_loan as _get_loan
    loan_obj = _get_loan(db, company.id, loan_id)
    loan_number = getattr(loan_obj, "loan_number", None) or loan_id
    delete_loan(db, company.id, loan_id, user.id)
    db.commit()
    from app.services.audit import log_action
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="DELETE", entity_type="loan", entity_id=loan_id,
        description=f"Deleted loan {loan_number}",
    )
    db.commit()


@router.post("/{loan_id}/payments", response_model=LoanPaymentOut, status_code=201)
def create_loan_payment(
    loan_id: str,
    data: LoanPaymentCreate,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _=Depends(require_role(CompanyRole.owner)),
):
    payment = record_payment(db, company.id, loan_id, data, user.id)
    db.commit()
    from app.services.audit import log_action
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="CREATE", entity_type="loan_payment", entity_id=payment.id,
        new_value={"loan_id": loan_id, "amount": str(data.total_amount), "payment_date": str(data.payment_date)},
        description=f"Recorded loan payment of {data.total_amount}",
    )
    db.commit()
    return LoanPaymentOut.model_validate(payment)


@router.get("/{loan_id}/payments", response_model=list[LoanPaymentOut])
def get_loan_payments(
    loan_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
    _=Depends(require_role(CompanyRole.owner)),
):
    payments = list_payments(db, company.id, loan_id)
    return [LoanPaymentOut.model_validate(p) for p in payments]


@router.get("/{loan_id}/interest")
def get_loan_interest(
    loan_id: str,
    as_of: str | None = Query(default=None),
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
    _=Depends(require_role(CompanyRole.owner)),
):
    loan = get_loan(db, company.id, loan_id)
    accrued = calculate_accrued_interest(loan, as_of)
    return {
        "loan_id": loan_id,
        "accrued_interest": accrued,
        "as_of": as_of or "today",
    }
