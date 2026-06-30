"""Bank reconciliation service: CSV import, matching, and reconciliation logic."""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy.orm import Session

from app.models.accounting import Ledger
from app.models.bank_reconciliation import BankReconciliation, BankStatementLine
from app.models.voucher import Voucher, VoucherLine


def parse_bank_csv(file_content: str, date_format: str = "%Y-%m-%d") -> list[dict[str, Any]]:
    """Parse a bank statement CSV file.

    Expected columns (case-insensitive, flexible naming):
    - date / transaction_date
    - description / narration / particulars
    - debit / withdrawal / dr
    - credit / deposit / cr
    - reference / ref / cheque_no (optional)
    - balance (optional)

    Returns:
        List of dicts with normalized keys.
    """
    reader = csv.DictReader(io.StringIO(file_content))
    if not reader.fieldnames:
        return []

    # Normalize column names
    col_map = {}
    for col in reader.fieldnames:
        normalized = col.strip().lower().replace(" ", "_")
        if normalized in ("date", "transaction_date", "txn_date", "value_date"):
            col_map["date"] = col
        elif normalized in ("description", "narration", "particulars", "details", "payee"):
            col_map["description"] = col
        elif normalized in ("debit", "withdrawal", "dr", "amount_dr"):
            col_map["debit"] = col
        elif normalized in ("credit", "deposit", "cr", "amount_cr"):
            col_map["credit"] = col
        elif normalized in ("reference", "ref", "cheque_no", "cheque_number", "chq_no", "utr", "transaction_id"):
            col_map["reference"] = col
        elif normalized in ("balance", "running_balance", "avail_balance"):
            col_map["balance"] = col

    if "date" not in col_map or "description" not in col_map:
        raise ValueError("CSV must have at least 'date' and 'description' columns")

    rows = []
    for row in reader:
        date_str = row.get(col_map.get("date", ""), "").strip()
        desc = row.get(col_map.get("description", ""), "").strip()
        if not date_str or not desc:
            continue

        # Parse date
        try:
            parsed_date = datetime.strptime(date_str, date_format)
            txn_date = parsed_date.strftime("%Y-%m-%d")
        except ValueError:
            # Try common formats
            for fmt in ("%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d %b %Y"):
                try:
                    parsed_date = datetime.strptime(date_str, fmt)
                    txn_date = parsed_date.strftime("%Y-%m-%d")
                    break
                except ValueError:
                    continue
            else:
                continue  # Skip rows with unparseable dates

        debit = _parse_amount(row.get(col_map.get("debit", ""), "0"))
        credit = _parse_amount(row.get(col_map.get("credit", ""), "0"))
        balance_str = row.get(col_map.get("balance", ""), "")
        balance = _parse_amount(balance_str) if balance_str.strip() else None
        reference = row.get(col_map.get("reference", ""), "").strip() or None

        rows.append({
            "transaction_date": txn_date,
            "description": desc,
            "debit": float(debit),
            "credit": float(credit),
            "balance": float(balance) if balance is not None else None,
            "reference": reference,
        })

    return rows


def _parse_amount(value: str) -> Decimal:
    """Parse a monetary amount string, handling commas and spaces."""
    cleaned = value.strip().replace(",", "").replace(" ", "")
    if not cleaned or cleaned == "-":
        return Decimal("0")
    # Handle parentheses for negative values: (1,234.56) -> -1234.56
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = "-" + cleaned[1:-1]
    return Decimal(cleaned).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def import_statement(
    db: Session,
    *,
    company_id: str,
    ledger_id: str,
    rows: list[dict[str, Any]],
) -> list[BankStatementLine]:
    """Import parsed bank statement rows into BankStatementLine records.

    Args:
        db: Database session
        company_id: Company scope
        ledger_id: Bank ledger ID
        rows: Parsed rows from parse_bank_csv()

    Returns:
        List of created BankStatementLine records.
    """
    # Validate ledger exists and belongs to company
    ledger = db.get(Ledger, ledger_id)
    if not ledger or ledger.company_id != company_id:
        raise ValueError(f"Bank ledger {ledger_id} not found")

    lines = []
    for row in rows:
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
    return lines


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


def find_matching_vouchers(
    db: Session,
    *,
    company_id: str,
    statement_line_id: str,
) -> list[dict[str, Any]]:
    """Find vouchers that could match a statement line (by amount and bank ledger).

    Returns a list of candidate vouchers with their matching line details.
    """
    line = db.get(BankStatementLine, statement_line_id)
    if not line or line.company_id != company_id:
        raise ValueError(f"Statement line {statement_line_id} not found")

    stmt_amount = Decimal(str(line.credit)) if line.credit > 0 else Decimal(str(line.debit))
    if stmt_amount == 0:
        return []

    # Find vouchers with lines that touch the same ledger and have matching amounts
    candidates = []
    voucher_lines = db.query(VoucherLine).join(Voucher).filter(
        Voucher.company_id == company_id,
        VoucherLine.ledger_id == line.ledger_id,
    ).all()

    seen_voucher_ids = set()
    for vl in voucher_lines:
        if vl.voucher_id in seen_voucher_ids:
            continue
        vch_amount = Decimal(str(vl.debit)) if vl.debit > 0 else Decimal(str(vl.credit))
        if vch_amount == stmt_amount:
            voucher = db.get(Voucher, vl.voucher_id)
            if voucher:
                seen_voucher_ids.add(vl.voucher_id)
                candidates.append({
                    "voucher_id": voucher.id,
                    "voucher_number": voucher.voucher_number,
                    "voucher_type": voucher.voucher_type,
                    "voucher_date": voucher.voucher_date,
                    "narration": voucher.narration,
                    "amount": float(vch_amount),
                    "direction": "debit" if vl.debit > 0 else "credit",
                })

    return candidates
