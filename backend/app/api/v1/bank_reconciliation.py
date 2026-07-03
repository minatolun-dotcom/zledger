"""Bank reconciliation endpoints: import statements, match/unmatch, reconcile."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user, require_role
from app.models.bank_reconciliation import BankReconciliation, BankStatementLine
from app.models.user import Company, User
from app.schemas.bank_reconciliation import (
    BankReconciliationCreate,
    BankReconciliationFinalize,
    BankReconciliationOut,
    BankReconcileMatch,
    BankReconcileUnmatch,
    BankStatementLineOut,
)
from app.schemas.member import CompanyRole
from app.services.bank_reconciliation import (
    find_matching_vouchers,
    get_reconciliation_summary,
    import_statement,
    match_statement_to_voucher,
    parse_bank_csv,
    unreconcile_statement_line,
)

router = APIRouter()


# ─── Statement Import ──────────────────────────────────────────────────────


@router.post("/import", response_model=list[BankStatementLineOut], status_code=201)
async def import_bank_statement(
    ledger_id: str,
    file: UploadFile = File(...),
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import a bank statement CSV file.

    Expected CSV columns: date, description, debit, credit, reference (optional), balance (optional).
    """
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except UnicodeDecodeError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unable to decode file. Use UTF-8 or Latin-1.")

    try:
        rows = parse_bank_csv(text)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    if not rows:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No valid rows found in CSV")

    try:
        lines = import_statement(db, company_id=company.id, ledger_id=ledger_id, rows=rows)
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))

    db.commit()

    return [
        BankStatementLineOut(
            id=l.id,
            company_id=l.company_id,
            ledger_id=l.ledger_id,
            transaction_date=l.transaction_date,
            description=l.description,
            reference=l.reference,
            debit=float(l.debit),
            credit=float(l.credit),
            balance=float(l.balance) if l.balance is not None else None,
            is_reconciled=l.is_reconciled,
            voucher_id=l.voucher_id,
            reconciled_at=l.reconciled_at.isoformat() if l.reconciled_at else None,
            created_at=l.created_at.isoformat() if l.created_at else None,
        ).model_dump()
        for l in lines
    ]


# ─── Statement Lines ───────────────────────────────────────────────────────


@router.get("/lines", response_model=list[BankStatementLineOut])
def list_statement_lines(
    ledger_id: str,
    reconciled: bool | None = None,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List bank statement lines for a ledger, optionally filtered by reconciliation status."""
    q = db.query(BankStatementLine).filter(
        BankStatementLine.company_id == company.id,
        BankStatementLine.ledger_id == ledger_id,
    )
    if reconciled is not None:
        q = q.filter(BankStatementLine.is_reconciled == reconciled)

    lines = q.order_by(BankStatementLine.transaction_date).all()

    return [
        BankStatementLineOut(
            id=l.id,
            company_id=l.company_id,
            ledger_id=l.ledger_id,
            transaction_date=l.transaction_date,
            description=l.description,
            reference=l.reference,
            debit=float(l.debit),
            credit=float(l.credit),
            balance=float(l.balance) if l.balance is not None else None,
            is_reconciled=l.is_reconciled,
            voucher_id=l.voucher_id,
            reconciled_at=l.reconciled_at.isoformat() if l.reconciled_at else None,
            created_at=l.created_at.isoformat() if l.created_at else None,
        ).model_dump()
        for l in lines
    ]


@router.delete("/lines/{line_id}", status_code=204)
def delete_statement_line(
    line_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an unreconciled bank statement line."""
    line = db.get(BankStatementLine, line_id)
    if not line or line.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Statement line not found")
    if line.is_reconciled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot delete a reconciled line")
    db.delete(line)
    db.commit()


# ─── Matching ──────────────────────────────────────────────────────────────


@router.post("/match", response_model=BankStatementLineOut)
def reconcile_match(
    payload: BankReconcileMatch,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Match a bank statement line to a voucher."""
    try:
        line = match_statement_to_voucher(
            db,
            company_id=company.id,
            statement_line_id=payload.statement_line_id,
            voucher_id=payload.voucher_id,
            user_id=user.id,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    db.commit()
    db.refresh(line)

    return BankStatementLineOut(
        id=line.id,
        company_id=line.company_id,
        ledger_id=line.ledger_id,
        transaction_date=line.transaction_date,
        description=line.description,
        reference=line.reference,
        debit=float(line.debit),
        credit=float(line.credit),
        balance=float(line.balance) if line.balance is not None else None,
        is_reconciled=line.is_reconciled,
        voucher_id=line.voucher_id,
        reconciled_at=line.reconciled_at.isoformat() if line.reconciled_at else None,
        created_at=line.created_at.isoformat() if line.created_at else None,
    ).model_dump()


@router.post("/unmatch", response_model=BankStatementLineOut)
def reconcile_unmatch(
    payload: BankReconcileUnmatch,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove the match between a statement line and its voucher."""
    try:
        line = unreconcile_statement_line(
            db,
            company_id=company.id,
            statement_line_id=payload.statement_line_id,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    db.commit()
    db.refresh(line)

    return BankStatementLineOut(
        id=line.id,
        company_id=line.company_id,
        ledger_id=line.ledger_id,
        transaction_date=line.transaction_date,
        description=line.description,
        reference=line.reference,
        debit=float(line.debit),
        credit=float(line.credit),
        balance=float(line.balance) if line.balance is not None else None,
        is_reconciled=line.is_reconciled,
        voucher_id=line.voucher_id,
        reconciled_at=line.reconciled_at.isoformat() if line.reconciled_at else None,
        created_at=line.created_at.isoformat() if line.created_at else None,
    ).model_dump()


@router.get("/suggest/{line_id}")
def suggest_matches(
    line_id: str,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Find vouchers that could match a statement line (by amount and bank ledger)."""
    try:
        candidates = find_matching_vouchers(
            db,
            company_id=company.id,
            statement_line_id=line_id,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))

    return candidates


# ─── Summary ───────────────────────────────────────────────────────────────


@router.get("/summary")
def reconciliation_summary(
    ledger_id: str,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get reconciliation summary for a bank ledger."""
    return get_reconciliation_summary(
        db,
        company_id=company.id,
        ledger_id=ledger_id,
        statement_date="",
    )


# ─── Reconciliation Sessions ───────────────────────────────────────────────


@router.post("/sessions", response_model=BankReconciliationOut, status_code=201)
def create_reconciliation_session(
    payload: BankReconciliationCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a reconciliation session for a bank statement period."""
    # Check for existing session
    existing = db.query(BankReconciliation).filter(
        BankReconciliation.company_id == company.id,
        BankReconciliation.ledger_id == payload.ledger_id,
        BankReconciliation.statement_date == payload.statement_date,
    ).first()
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Reconciliation session already exists for this date",
        )

    session = BankReconciliation(
        company_id=company.id,
        ledger_id=payload.ledger_id,
        statement_date=payload.statement_date,
        opening_balance=payload.opening_balance,
        closing_balance=payload.closing_balance,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return BankReconciliationOut(
        id=session.id,
        company_id=session.company_id,
        ledger_id=session.ledger_id,
        statement_date=session.statement_date,
        opening_balance=float(session.opening_balance),
        closing_balance=float(session.closing_balance),
        reconciled_count=session.reconciled_count,
        is_finalized=session.is_finalized,
        created_at=session.created_at.isoformat() if session.created_at else None,
    ).model_dump()


@router.get("/sessions", response_model=list[BankReconciliationOut])
def list_reconciliation_sessions(
    ledger_id: str | None = None,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List reconciliation sessions for the company."""
    q = db.query(BankReconciliation).filter(
        BankReconciliation.company_id == company.id,
    )
    if ledger_id:
        q = q.filter(BankReconciliation.ledger_id == ledger_id)

    sessions = q.order_by(desc(BankReconciliation.statement_date)).all()

    return [
        BankReconciliationOut(
            id=s.id,
            company_id=s.company_id,
            ledger_id=s.ledger_id,
            statement_date=s.statement_date,
            opening_balance=float(s.opening_balance),
            closing_balance=float(s.closing_balance),
            reconciled_count=s.reconciled_count,
            is_finalized=s.is_finalized,
            created_at=s.created_at.isoformat() if s.created_at else None,
        ).model_dump()
        for s in sessions
    ]


@router.patch("/sessions/{session_id}/finalize", response_model=BankReconciliationOut)
def finalize_reconciliation_session(
    session_id: str,
    payload: BankReconciliationFinalize,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Finalize a reconciliation session (locks it from further changes)."""
    session = db.get(BankReconciliation, session_id)
    if not session or session.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.is_finalized:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Session is already finalized")

    session.closing_balance = payload.closing_balance
    session.is_finalized = True
    db.commit()
    db.refresh(session)

    return BankReconciliationOut(
        id=session.id,
        company_id=session.company_id,
        ledger_id=session.ledger_id,
        statement_date=session.statement_date,
        opening_balance=float(session.opening_balance),
        closing_balance=float(session.closing_balance),
        reconciled_count=session.reconciled_count,
        is_finalized=session.is_finalized,
        created_at=session.created_at.isoformat() if session.created_at else None,
    ).model_dump()
