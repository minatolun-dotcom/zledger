"""Bank reconciliation service: CSV import, matching, and reconciliation logic."""
from __future__ import annotations

import csv
import io
import re
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from difflib import SequenceMatcher
from typing import Any

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models.accounting import Ledger
from app.models.bank_reconciliation import BankReconciliation, BankStatementLine
from app.models.voucher import Voucher, VoucherLine


# ── CSV Parsing ───────────────────────────────────────────────────────────────


# Canonical field → accepted column names
COLUMN_ALIASES: dict[str, set[str]] = {
    "date": {"date", "transaction_date", "txn_date", "value_date", "post_date", "booking_date"},
    "description": {"description", "narration", "particulars", "details", "payee", "memo", "remarks"},
    "debit": {"debit", "withdrawal", "dr", "amount_dr", "debit_amount"},
    "credit": {"credit", "deposit", "cr", "amount_cr", "credit_amount"},
    "reference": {"reference", "ref", "cheque_no", "cheque_number", "chq_no", "utr", "transaction_id", "check_number"},
    "balance": {"balance", "running_balance", "avail_balance", "closing_balance"},
}


def detect_columns(header: list[str]) -> dict[str, str | None]:
    """Detect CSV column mapping from header row.

    Returns dict mapping canonical field name → actual CSV column name (or None if not found).
    """
    col_map: dict[str, str | None] = {field: None for field in COLUMN_ALIASES}
    for col in header:
        normalized = col.strip().lower().replace(" ", "_").replace("-", "_")
        for field, aliases in COLUMN_ALIASES.items():
            if normalized in aliases:
                col_map[field] = col
                break
    return col_map


def parse_bank_csv(
    file_content: str,
    date_format: str = "%Y-%m-%d",
    column_map: dict[str, str | None] | None = None,
) -> list[dict[str, Any]]:
    """Parse a bank statement CSV file.

    Args:
        file_content: Raw CSV text
        date_format: Expected date format
        column_map: Optional custom column mapping. If None, auto-detects.

    Returns:
        List of dicts with normalized keys.
    """
    reader = csv.DictReader(io.StringIO(file_content))
    if not reader.fieldnames:
        return []

    # Use provided mapping or auto-detect
    if column_map is None:
        col_map = detect_columns(list(reader.fieldnames))
    else:
        col_map = column_map

    if col_map.get("date") is None or col_map.get("description") is None:
        raise ValueError("CSV must have at least 'date' and 'description' columns")

    rows = []
    for row in reader:
        date_str = row.get(col_map.get("date") or "", "").strip()
        desc = row.get(col_map.get("description") or "", "").strip()
        if not date_str or not desc:
            continue

        # Parse date
        txn_date = _parse_date(date_str, date_format)
        if txn_date is None:
            continue

        debit = _parse_amount(row.get(col_map.get("debit") or "", "0"))
        credit = _parse_amount(row.get(col_map.get("credit") or "", "0"))
        balance_str = row.get(col_map.get("balance") or "", "")
        balance = _parse_amount(balance_str) if balance_str.strip() else None
        reference = row.get(col_map.get("reference") or "", "").strip() or None

        rows.append({
            "transaction_date": txn_date,
            "description": desc,
            "debit": float(debit),
            "credit": float(credit),
            "balance": float(balance) if balance is not None else None,
            "reference": reference,
        })

    return rows


def parse_bank_excel(
    file_content: bytes,
    date_format: str = "%Y-%m-%d",
    column_map: dict[str, str | None] | None = None,
) -> list[dict[str, Any]]:
    """Parse a bank statement Excel (.xlsx) file.

    Args:
        file_content: Raw Excel bytes
        date_format: Expected date format (used as fallback for string dates)
        column_map: Optional custom column mapping. If None, auto-detects.

    Returns:
        List of dicts with normalized keys.
    """
    import openpyxl

    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_content), read_only=True, data_only=True)
    except Exception:
        raise ValueError("Unable to read Excel file. Ensure it is a valid .xlsx file.")

    ws = wb.active
    if ws is None:
        raise ValueError("Excel file has no worksheets")

    # Read header row
    rows_iter = ws.iter_rows(values_only=True)
    header_row = next(rows_iter, None)
    if not header_row:
        raise ValueError("Excel file has no header row")

    headers = [str(c).strip() if c else f"col_{i}" for i, c in enumerate(header_row)]

    # Use provided mapping or auto-detect
    if column_map is None:
        col_map = detect_columns(headers)
    else:
        col_map = column_map

    if col_map.get("date") is None or col_map.get("description") is None:
        raise ValueError("Excel must have at least 'date' and 'description' columns")

    # Build column index lookup
    col_indices = {}
    for field, csv_col in col_map.items():
        if csv_col and csv_col in headers:
            col_indices[field] = headers.index(csv_col)

    rows = []
    for row in rows_iter:
        if not row or all(c is None for c in row):
            continue

        # Extract values by column index
        date_val = row[col_indices["date"]] if "date" in col_indices else None
        desc_val = row[col_indices["description"]] if "description" in col_indices else None

        if date_val is None or desc_val is None:
            continue

        desc = str(desc_val).strip()
        if not desc:
            continue

        # Parse date — handle datetime objects from openpyxl
        if isinstance(date_val, datetime):
            txn_date = date_val.strftime("%Y-%m-%d")
        elif hasattr(date_val, "strftime"):
            txn_date = date_val.strftime("%Y-%m-%d")
        else:
            txn_date = _parse_date(str(date_val).strip(), date_format)
            if txn_date is None:
                continue

        # Parse amounts
        debit_val = row[col_indices["debit"]] if "debit" in col_indices else None
        credit_val = row[col_indices["credit"]] if "credit" in col_indices else None
        balance_val = row[col_indices["balance"]] if "balance" in col_indices else None
        ref_val = row[col_indices["reference"]] if "reference" in col_indices else None

        debit = _parse_excel_amount(debit_val)
        credit = _parse_excel_amount(credit_val)
        balance = _parse_excel_amount(balance_val) if balance_val is not None else None
        reference = str(ref_val).strip() if ref_val is not None else None

        rows.append({
            "transaction_date": txn_date,
            "description": desc,
            "debit": float(debit),
            "credit": float(credit),
            "balance": float(balance) if balance is not None else None,
            "reference": reference,
        })

    wb.close()
    return rows


def _parse_excel_amount(value: Any) -> Decimal:
    """Parse an amount from an Excel cell (may be int, float, or string)."""
    if value is None:
        return Decimal("0")
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    if isinstance(value, Decimal):
        return value
    return _parse_amount(str(value))


def _parse_date(date_str: str, date_format: str) -> str | None:
    """Parse a date string, trying the given format then common fallbacks."""
    try:
        return datetime.strptime(date_str, date_format).strftime("%Y-%m-%d")
    except ValueError:
        pass
    for fmt in ("%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d %b %Y", "%d %B %Y",
                "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _parse_amount(value: str) -> Decimal:
    """Parse a monetary amount string, handling commas and spaces."""
    cleaned = value.strip().replace(",", "").replace(" ", "")
    if not cleaned or cleaned == "-":
        return Decimal("0")
    # Handle parentheses for negative values: (1,234.56) -> -1234.56
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = "-" + cleaned[1:-1]
    return Decimal(cleaned).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ── Duplicate Detection ───────────────────────────────────────────────────────


def _is_duplicate(db: Session, *, company_id: str, ledger_id: str, row: dict[str, Any]) -> bool:
    """Check if a statement line already exists (date + description + amount)."""
    amount = row["debit"] if row["debit"] > 0 else row["credit"]
    existing = db.query(BankStatementLine).filter(
        BankStatementLine.company_id == company_id,
        BankStatementLine.ledger_id == ledger_id,
        BankStatementLine.transaction_date == row["transaction_date"],
        BankStatementLine.description == row["description"],
    ).first()
    if not existing:
        return False
    existing_amount = float(existing.debit) if existing.debit > 0 else float(existing.credit)
    return abs(existing_amount - amount) < 0.01


def check_duplicates(
    db: Session,
    *,
    company_id: str,
    ledger_id: str,
    rows: list[dict[str, Any]],
) -> list[int]:
    """Return indices of rows that are duplicates of existing records."""
    return [
        i for i, row in enumerate(rows)
        if _is_duplicate(db, company_id=company_id, ledger_id=ledger_id, row=row)
    ]


# ── Fuzzy Matching ────────────────────────────────────────────────────────────


def _text_similarity(a: str, b: str) -> float:
    """Compute text similarity between two strings (0.0 to 1.0)."""
    if not a or not b:
        return 0.0
    a_clean = re.sub(r'\s+', ' ', a.lower().strip())
    b_clean = re.sub(r'\s+', ' ', b.lower().strip())
    return SequenceMatcher(None, a_clean, b_clean).ratio()


def _date_proximity_score(stmt_date: str, vch_date: str, max_days: int = 30) -> float:
    """Score based on date proximity (0.0 to 1.0). Exact match = 1.0, beyond max_days = 0.0."""
    try:
        d1 = datetime.strptime(stmt_date, "%Y-%m-%d")
        d2 = datetime.strptime(vch_date, "%Y-%m-%d")
        diff = abs((d1 - d2).days)
        if diff == 0:
            return 1.0
        if diff > max_days:
            return 0.0
        return max(0.0, 1.0 - (diff / max_days))
    except ValueError:
        return 0.0


def _compute_match_score(
    stmt_amount: Decimal,
    stmt_date: str,
    stmt_description: str,
    stmt_reference: str | None,
    vch_amount: Decimal,
    vch_date: str,
    vch_narration: str | None,
    vch_number: str | None,
) -> dict[str, Any]:
    """Compute a match score between a statement line and a voucher.

    Returns dict with 'score' (0-100), 'breakdown' details, and 'match_quality'.
    Score components:
        - Amount match: 40 points (exact) or 0
        - Date proximity: 25 points (scales with distance)
        - Description similarity: 20 points
        - Reference match: 15 points (if reference exists)
    """
    score = 0.0
    breakdown = {}

    # 1. Amount match (40 points) — must be exact
    amount_match = stmt_amount == vch_amount
    if amount_match:
        score += 40.0
    breakdown["amount"] = 40.0 if amount_match else 0.0

    # 2. Date proximity (25 points)
    date_score = _date_proximity_score(stmt_date, vch_date) * 25.0
    score += date_score
    breakdown["date"] = round(date_score, 1)

    # 3. Description/narration similarity (20 points)
    desc_score = _text_similarity(stmt_description, vch_narration or "") * 20.0
    score += desc_score
    breakdown["description"] = round(desc_score, 1)

    # 4. Reference match (15 points)
    ref_score = 0.0
    if stmt_reference and vch_number:
        if stmt_reference.lower() in (vch_number or "").lower():
            ref_score = 15.0
        elif _text_similarity(stmt_reference, vch_number or "") > 0.6:
            ref_score = 10.0
    score += ref_score
    breakdown["reference"] = ref_score

    # Determine quality
    if score >= 80:
        quality = "high"
    elif score >= 50:
        quality = "medium"
    elif score > 0:
        quality = "low"
    else:
        quality = "none"

    return {
        "score": round(score, 1),
        "breakdown": breakdown,
        "match_quality": quality,
    }


def find_matching_vouchers(
    db: Session,
    *,
    company_id: str,
    statement_line_id: str,
) -> list[dict[str, Any]]:
    """Find vouchers that could match a statement line with fuzzy scoring.

    Returns a list of candidate vouchers ranked by match score.
    Only exact amount matches are included (amount is a hard requirement).
    """
    line = db.get(BankStatementLine, statement_line_id)
    if not line or line.company_id != company_id:
        raise ValueError(f"Statement line {statement_line_id} not found")

    stmt_amount = Decimal(str(line.credit)) if line.credit > 0 else Decimal(str(line.debit))
    if stmt_amount == 0:
        return []

    # Find vouchers with lines that touch the same ledger
    voucher_lines = db.query(VoucherLine).join(Voucher).filter(
        Voucher.company_id == company_id,
        VoucherLine.ledger_id == line.ledger_id,
    ).all()

    candidates = []
    seen_voucher_ids = set()

    for vl in voucher_lines:
        if vl.voucher_id in seen_voucher_ids:
            continue
        vch_amount = Decimal(str(vl.debit)) if vl.debit > 0 else Decimal(str(vl.credit))

        # Hard filter: amount must match exactly
        if vch_amount != stmt_amount:
            continue

        voucher = db.get(Voucher, vl.voucher_id)
        if not voucher:
            continue

        seen_voucher_ids.add(vl.voucher_id)

        # Compute fuzzy score
        scoring = _compute_match_score(
            stmt_amount=stmt_amount,
            stmt_date=line.transaction_date,
            stmt_description=line.description,
            stmt_reference=line.reference,
            vch_amount=vch_amount,
            vch_date=voucher.voucher_date,
            vch_narration=voucher.narration,
            vch_number=voucher.voucher_number,
        )

        candidates.append({
            "voucher_id": voucher.id,
            "voucher_number": voucher.voucher_number,
            "voucher_type": voucher.voucher_type,
            "voucher_date": voucher.voucher_date,
            "narration": voucher.narration,
            "amount": float(vch_amount),
            "direction": "debit" if vl.debit > 0 else "credit",
            "score": scoring["score"],
            "match_quality": scoring["match_quality"],
            "score_breakdown": scoring["breakdown"],
        })

    # Sort by score descending
    candidates.sort(key=lambda c: c["score"], reverse=True)

    return candidates


# ── Auto-Reconcile ────────────────────────────────────────────────────────────


def auto_reconcile(
    db: Session,
    *,
    company_id: str,
    ledger_id: str,
    user_id: str,
    min_score: float = 80.0,
) -> dict[str, Any]:
    """Automatically match unreconciled statement lines to vouchers.

    Only matches lines where the best candidate score >= min_score.

    Returns summary of matches made.
    """
    lines = db.query(BankStatementLine).filter(
        BankStatementLine.company_id == company_id,
        BankStatementLine.ledger_id == ledger_id,
        BankStatementLine.is_reconciled.is_(False),
    ).all()

    matched = 0
    skipped = 0
    results = []

    for line in lines:
        stmt_amount = Decimal(str(line.credit)) if line.credit > 0 else Decimal(str(line.debit))
        if stmt_amount == 0:
            skipped += 1
            continue

        # Find best candidate
        candidates = find_matching_vouchers(
            db,
            company_id=company_id,
            statement_line_id=line.id,
        )

        if not candidates:
            skipped += 1
            results.append({
                "line_id": line.id,
                "status": "no_match",
                "description": line.description,
            })
            continue

        best = candidates[0]
        if best["score"] < min_score:
            skipped += 1
            results.append({
                "line_id": line.id,
                "status": "below_threshold",
                "description": line.description,
                "best_score": best["score"],
            })
            continue

        # Auto-match
        line.is_reconciled = True
        line.voucher_id = best["voucher_id"]
        line.reconciled_at = datetime.now(timezone.utc)
        line.reconciled_by = user_id
        matched += 1
        results.append({
            "line_id": line.id,
            "status": "matched",
            "description": line.description,
            "voucher_id": best["voucher_id"],
            "voucher_number": best["voucher_number"],
            "score": best["score"],
        })

    db.flush()

    return {
        "total_unreconciled": len(lines),
        "matched": matched,
        "skipped": skipped,
        "results": results,
    }


# ── Import Statement ──────────────────────────────────────────────────────────


def import_statement(
    db: Session,
    *,
    company_id: str,
    ledger_id: str,
    rows: list[dict[str, Any]],
    skip_duplicates: bool = True,
) -> dict[str, Any]:
    """Import parsed bank statement rows into BankStatementLine records.

    Args:
        db: Database session
        company_id: Company scope
        ledger_id: Bank ledger ID
        rows: Parsed rows from parse_bank_csv()
        skip_duplicates: If True, skip rows that match existing records

    Returns:
        Dict with 'lines' (created records), 'duplicates_skipped' (count), 'total_rows' (count).
    """
    # Validate ledger exists and belongs to company
    ledger = db.get(Ledger, ledger_id)
    if not ledger or ledger.company_id != company_id:
        raise ValueError(f"Bank ledger {ledger_id} not found")

    # Check for duplicates if enabled
    duplicate_indices: set[int] = set()
    if skip_duplicates:
        duplicate_indices = set(check_duplicates(
            db, company_id=company_id, ledger_id=ledger_id, rows=rows,
        ))

    lines = []
    skipped = 0
    for i, row in enumerate(rows):
        if i in duplicate_indices:
            skipped += 1
            continue

        line = BankStatementLine(
            company_id=company_id,
            ledger_id=ledger_id,
            transaction_date=row["transaction_date"],
            description=row["description"],
            reference=row.get("reference"),
            debit=row["debit"],
            credit=row["credit"],
            balance=row.get("balance"),
        )
        db.add(line)
        lines.append(line)

    db.flush()
    return {
        "lines": lines,
        "duplicates_skipped": skipped,
        "total_rows": len(rows),
    }


def match_statement_to_voucher(
    db: Session,
    *,
    company_id: str,
    statement_line_id: str,
    voucher_id: str,
    user_id: str,
) -> BankStatementLine:
    """Match a bank statement line to an existing voucher.

    The voucher must:
    - Belong to the same company
    - Have a line that debits or credits the bank ledger
    - The amount must match (debit or credit)

    Args:
        db: Database session
        company_id: Company scope
        statement_line_id: Statement line to match
        voucher_id: Voucher to match against
        user_id: User performing the reconciliation

    Returns:
        Updated BankStatementLine
    """
    line = db.get(BankStatementLine, statement_line_id)
    if not line or line.company_id != company_id:
        raise ValueError(f"Statement line {statement_line_id} not found")
    if line.is_reconciled:
        raise ValueError("Statement line is already reconciled")

    voucher = db.get(Voucher, voucher_id)
    if not voucher or voucher.company_id != company_id:
        raise ValueError(f"Voucher {voucher_id} not found")

    # Find the voucher line that touches the bank ledger
    bank_line = None
    for vl in voucher.lines:
        if vl.ledger_id == line.ledger_id:
            bank_line = vl
            break

    if not bank_line:
        raise ValueError(f"Voucher {voucher_id} has no line for ledger {line.ledger_id}")

    # Verify amount matches
    stmt_amount = Decimal(str(line.credit)) if line.credit > 0 else Decimal(str(line.debit))
    vch_amount = Decimal(str(bank_line.debit)) if bank_line.debit > 0 else Decimal(str(bank_line.credit))

    if stmt_amount != vch_amount:
        raise ValueError(
            f"Amount mismatch: statement={stmt_amount}, voucher={vch_amount}"
        )

    # Match
    line.is_reconciled = True
    line.voucher_id = voucher_id
    line.reconciled_at = datetime.now(timezone.utc)
    line.reconciled_by = user_id
    db.flush()

    return line


def unreconcile_statement_line(
    db: Session,
    *,
    company_id: str,
    statement_line_id: str,
) -> BankStatementLine:
    """Remove the match between a statement line and a voucher.

    Args:
        db: Database session
        company_id: Company scope
        statement_line_id: Statement line to unmatch

    Returns:
        Updated BankStatementLine
    """
    line = db.get(BankStatementLine, statement_line_id)
    if not line or line.company_id != company_id:
        raise ValueError(f"Statement line {statement_line_id} not found")
    if not line.is_reconciled:
        raise ValueError("Statement line is not reconciled")

    line.is_reconciled = False
    line.voucher_id = None
    line.reconciled_at = None
    line.reconciled_by = None
    db.flush()

    return line


def get_reconciliation_summary(
    db: Session,
    *,
    company_id: str,
    ledger_id: str,
    statement_date: str,
) -> dict[str, Any]:
    """Get a summary of reconciliation status for a bank ledger.

    Returns:
        Dict with total_lines, reconciled_count, unreconciled_count,
        total_debit, total_credit, matched_amount.
    """
    lines = db.query(BankStatementLine).filter(
        BankStatementLine.company_id == company_id,
        BankStatementLine.ledger_id == ledger_id,
    ).all()

    total = len(lines)
    reconciled = sum(1 for l in lines if l.is_reconciled)
    total_debit = sum(float(l.debit) for l in lines)
    total_credit = sum(float(l.credit) for l in lines)
    matched_debit = sum(float(l.debit) for l in lines if l.is_reconciled)
    matched_credit = sum(float(l.credit) for l in lines if l.is_reconciled)

    return {
        "total_lines": total,
        "reconciled_count": reconciled,
        "unreconciled_count": total - reconciled,
        "total_debit": total_debit,
        "total_credit": total_credit,
        "matched_debit": matched_debit,
        "matched_credit": matched_credit,
    }



