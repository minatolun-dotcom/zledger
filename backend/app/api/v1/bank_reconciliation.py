"""Bank reconciliation endpoints: import statements, match/unmatch, reconcile."""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
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
from app.schemas.common import BulkActionResult, BulkDeleteRequest
from app.schemas.member import CompanyRole
from app.services.bank_reconciliation import (
    auto_reconcile,
    detect_columns,
    find_matching_vouchers,
    get_reconciliation_summary,
    import_statement,
    match_statement_to_voucher,
    parse_bank_csv,
    parse_bank_excel,
    unreconcile_statement_line,
)

router = APIRouter()


# ─── CSV Preview & Column Detection ──────────────────────────────────────────


@router.post("/preview")
async def preview_csv(
    file: UploadFile = File(...),
    company: Company = Depends(require_role(CompanyRole.accountant)),
):
    """Upload a CSV or Excel file and return detected column mapping + first 5 rows for preview.

    Use this endpoint to let users verify/remap columns before importing.
    """
    content = await file.read()
    filename = (file.filename or "").lower()
    is_excel = filename.endswith(".xlsx") or filename.endswith(".xls")

    if is_excel:
        # Excel preview
        import openpyxl
        try:
            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        except Exception:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unable to read Excel file.")
        ws = wb.active
        if ws is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Excel file has no worksheets")
        rows_iter = ws.iter_rows(values_only=True)
        header_row = next(rows_iter, None)
        if not header_row:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Excel file has no header row")
        headers = [str(c).strip() if c else f"col_{i}" for i, c in enumerate(header_row)]
        detected = detect_columns(headers)
        preview_rows = []
        for i, row in enumerate(rows_iter):
            if i >= 5:
                break
            if row and any(c is not None for c in row):
                preview_rows.append({headers[j]: str(row[j]) if row[j] is not None else "" for j in range(min(len(headers), len(row)))})
        wb.close()
        return {
            "raw_columns": headers,
            "detected_mapping": detected,
            "preview_rows": preview_rows,
            "total_columns": len(headers),
        }

    # CSV preview
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except UnicodeDecodeError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unable to decode file. Use UTF-8 or Latin-1.")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="CSV has no header row")

    detected = detect_columns(list(reader.fieldnames))

    preview_rows = []
    for i, row in enumerate(reader):
        if i >= 5:
            break
        preview_rows.append({k: v for k, v in row.items()})

    return {
        "raw_columns": list(reader.fieldnames),
        "detected_mapping": detected,
        "preview_rows": preview_rows,
        "total_columns": len(reader.fieldnames),
    }


# ─── Statement Import ──────────────────────────────────────────────────────


@router.post("/import", response_model=dict, status_code=201)
async def import_bank_statement(
    ledger_id: str,
    skip_duplicates: bool = Query(True),
    date_format: str = Query("%Y-%m-%d"),
    column_map_json: str | None = Query(None, alias="column_map"),
    file: UploadFile = File(...),
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import a bank statement CSV or Excel file.

    Args:
        ledger_id: Bank ledger to import into
        skip_duplicates: Skip rows that match existing records (default: true)
        date_format: Date format string for parsing
        column_map_json: Optional JSON string of column mapping (e.g. {"date":"TxnDate","description":"Details"})
        file: The CSV or Excel file

    Returns:
        Dict with imported lines, duplicates_skipped count, and total_rows.
    """
    content = await file.read()
    filename = (file.filename or "").lower()
    is_excel = filename.endswith(".xlsx") or filename.endswith(".xls")

    # Parse optional column map
    column_map = None
    if column_map_json:
        import json
        try:
            raw_map = json.loads(column_map_json)
            column_map = {}
            for field, col_name in raw_map.items():
                if col_name:
                    column_map[field] = col_name
                else:
                    column_map[field] = None
        except (json.JSONDecodeError, TypeError):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid column_map JSON")

    try:
        if is_excel:
            rows = parse_bank_excel(content, date_format=date_format, column_map=column_map)
        else:
            try:
                text = content.decode("utf-8")
            except UnicodeDecodeError:
                try:
                    text = content.decode("latin-1")
                except UnicodeDecodeError:
                    raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unable to decode file. Use UTF-8 or Latin-1.")
            rows = parse_bank_csv(text, date_format=date_format, column_map=column_map)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    if not rows:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No valid rows found in file")

    try:
        result = import_statement(
            db,
            company_id=company.id,
            ledger_id=ledger_id,
            rows=rows,
            skip_duplicates=skip_duplicates,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))

    db.commit()

    return {
        "imported_count": len(result["lines"]),
        "duplicates_skipped": result["duplicates_skipped"],
        "total_rows": result["total_rows"],
        "lines": [
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
            for l in result["lines"]
        ],
    }


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


@router.post("/lines/bulk-delete", response_model=BulkActionResult)
def bulk_delete_statement_lines(
    req: BulkDeleteRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bulk delete unreconciled bank statement lines."""
    processed = 0
    errors = []
    for lid in req.ids:
        line = db.get(BankStatementLine, lid)
        if not line or line.company_id != company.id:
            errors.append(f"Line {lid} not found")
            continue
        if line.is_reconciled:
            errors.append(f"Cannot delete reconciled line: {line.description}")
            continue
        db.delete(line)
        processed += 1
    db.commit()
    return BulkActionResult(processed=processed, errors=errors)


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
    """Find vouchers that could match a statement line (by amount and bank ledger).

    Returns candidates ranked by fuzzy match score (amount + date proximity + description similarity).
    """
    try:
        candidates = find_matching_vouchers(
            db,
            company_id=company.id,
            statement_line_id=line_id,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))

    return candidates


# ─── Auto-Reconcile ─────────────────────────────────────────────────────────


@router.post("/auto-reconcile")
def reconcile_auto(
    ledger_id: str,
    min_score: float = Query(80.0, ge=0, le=100),
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Automatically match unreconciled statement lines to vouchers.

    Only matches lines where the best candidate score >= min_score (default 80).

    Returns summary of matches made.
    """
    try:
        result = auto_reconcile(
            db,
            company_id=company.id,
            ledger_id=ledger_id,
            user_id=user.id,
            min_score=min_score,
        )
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    db.commit()
    return result


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
