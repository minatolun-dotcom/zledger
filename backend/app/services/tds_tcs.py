"""TDS/TCS service: deduction logic, return generation, and reporting."""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.accounting import Party
from app.models.tds_tcs import TdsTcsEntry, TdsTcsReturn, TdsTcsSection
from app.models.voucher import Voucher, VoucherLine


# Common TDS sections for Indian compliance
COMMON_TDS_SECTIONS = [
    {"code": "194C-I", "name": "Payment to Contractors (Individual/HUF)", "type": "tds", "rate": 1.0, "threshold": 30000},
    {"code": "194C-O", "name": "Payment to Contractors (Others)", "type": "tds", "rate": 2.0, "threshold": 30000},
    {"code": "194J", "name": "Professional/Technical Fees", "type": "tds", "rate": 10.0, "threshold": 30000},
    {"code": "194I-M", "name": "Rent - Plant & Machinery", "type": "tds", "rate": 2.0, "threshold": 240000},
    {"code": "194I-R", "name": "Rent - Land/Building/Furniture", "type": "tds", "rate": 10.0, "threshold": 240000},
    {"code": "194H", "name": "Commission/Brokerage", "type": "tds", "rate": 5.0, "threshold": 15000},
    {"code": "194A", "name": "Interest other than Interest on Securities", "type": "tds", "rate": 10.0, "threshold": 40000},
    {"code": "194B", "name": "Winnings from Lottery", "type": "tds", "rate": 30.0, "threshold": 10000},
    {"code": "194D", "name": "Insurance Commission", "type": "tds", "rate": 5.0, "threshold": 15000},
    {"code": "194E", "name": "Payment to Non-Resident Sportsmen", "type": "tds", "rate": 20.0, "threshold": 0},
    {"code": "206C-A", "name": "Collection at Source - Alcohol", "type": "tcs", "rate": 1.0, "threshold": 5000000},
    {"code": "206C-T", "name": "Collection at Source - Timber", "type": "tcs", "rate": 2.5, "threshold": 0},
    {"code": "206C-M", "name": "Collection at Source - Minerals", "type": "tcs", "rate": 1.0, "threshold": 0},
]


def seed_tds_tcs_sections(db: Session, company_id: str) -> None:
    """Insert common TDS/TCS sections for a company. Idempotent."""
    existing = db.query(TdsTcsSection).filter(
        TdsTcsSection.company_id == company_id,
    ).count()
    if existing > 0:
        return

    for section in COMMON_TDS_SECTIONS:
        entry = TdsTcsSection(
            company_id=company_id,
            section_code=section["code"],
            section_name=section["name"],
            tds_tcs_type=section["type"],
            rate=section["rate"],
            threshold_limit=section["threshold"],
        )
        db.add(entry)

    db.commit()


def calculate_tds_tcs(
    db: Session,
    *,
    company_id: str,
    section_id: str,
    base_amount: float,
) -> dict[str, Any]:
    """Calculate TDS/TCS amount based on section rate and threshold.

    Returns:
        Dict with base_amount, rate, calculated_amount, threshold, is_applicable.
    """
    section = db.get(TdsTcsSection, section_id)
    if not section or section.company_id != company_id:
        raise ValueError(f"Section {section_id} not found")

    base = Decimal(str(base_amount))
    threshold = Decimal(str(section.threshold_limit))
    rate = Decimal(str(section.rate))

    is_applicable = base >= threshold
    calculated = (base * rate / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if is_applicable else Decimal("0")

    return {
        "base_amount": float(base),
        "rate": float(rate),
        "calculated_amount": float(calculated),
        "threshold": float(threshold),
        "is_applicable": is_applicable,
        "tds_tcs_type": section.tds_tcs_type,
        "section_code": section.section_code,
        "section_name": section.section_name,
    }


def create_tds_tcs_entry(
    db: Session,
    *,
    company_id: str,
    voucher_id: str,
    party_id: str | None,
    section_id: str,
    base_amount: float,
    entry_date: str,
) -> TdsTcsEntry:
    """Create a TDS/TCS entry and auto-calculate the deducted amount."""
    section = db.get(TdsTcsSection, section_id)
    if not section or section.company_id != company_id:
        raise ValueError(f"Section {section_id} not found")

    voucher = db.get(Voucher, voucher_id)
    if not voucher or voucher.company_id != company_id:
        raise ValueError(f"Voucher {voucher_id} not found")

    calc = calculate_tds_tcs(
        db,
        company_id=company_id,
        section_id=section_id,
        base_amount=base_amount,
    )

    entry = TdsTcsEntry(
        company_id=company_id,
        voucher_id=voucher_id,
        party_id=party_id,
        section_id=section_id,
        tds_tcs_type=section.tds_tcs_type,
        base_amount=base_amount,
        rate=section.rate,
        deducted_amount=calc["calculated_amount"],
        entry_date=entry_date,
    )
    db.add(entry)
    db.flush()
    return entry


def deposit_entries(
    db: Session,
    *,
    company_id: str,
    entry_ids: list[str],
    challan_number: str,
    deposition_date: str,
) -> list[TdsTcsEntry]:
    """Mark TDS/TCS entries as deposited with challan details."""
    entries = []
    for eid in entry_ids:
        entry = db.get(TdsTcsEntry, eid)
        if not entry or entry.company_id != company_id:
            raise ValueError(f"Entry {eid} not found")
        if entry.status != "pending":
            raise ValueError(f"Entry {eid} is already {entry.status}")

        entry.status = "deposited"
        entry.challan_number = challan_number
        entry.deposition_date = deposition_date
        entries.append(entry)

    db.flush()
    return entries


def generate_return(
    db: Session,
    *,
    company_id: str,
    return_type: str,
    quarter: str,
    financial_year: str,
) -> TdsTcsReturn:
    """Generate a quarterly TDS/TCS return from deposited entries."""
    # Check for existing return
    existing = db.query(TdsTcsReturn).filter(
        TdsTcsReturn.company_id == company_id,
        TdsTcsReturn.return_type == return_type,
        TdsTcsReturn.quarter == quarter,
        TdsTcsReturn.financial_year == financial_year,
    ).first()
    if existing:
        raise ValueError(f"Return already exists for {quarter} {financial_year}")

    # Determine quarter date range
    fy_start = int(financial_year.split("-")[0])
    quarter_months = {
        "Q1": (f"{fy_start}-04-01", f"{fy_start}-06-30"),
        "Q2": (f"{fy_start}-07-01", f"{fy_start}-09-30"),
        "Q3": (f"{fy_start}-10-01", f"{fy_start}-12-31"),
        "Q4": (f"{fy_start + 1}-01-01", f"{fy_start + 1}-03-31"),
    }
    start_date, end_date = quarter_months[quarter]

    # Get deposited entries in the quarter
    entries = db.query(TdsTcsEntry).filter(
        TdsTcsEntry.company_id == company_id,
        TdsTcsEntry.tds_tcs_type == return_type,
        TdsTcsEntry.status == "deposited",
        TdsTcsEntry.entry_date >= start_date,
        TdsTcsEntry.entry_date <= end_date,
    ).all()

    total_amount = sum(float(e.base_amount) for e in entries)
    total_tax = sum(float(e.deducted_amount) for e in entries)

    ret = TdsTcsReturn(
        company_id=company_id,
        return_type=return_type,
        quarter=quarter,
        financial_year=financial_year,
        total_entries=len(entries),
        total_amount=total_amount,
        total_tax=total_tax,
    )
    db.add(ret)
    db.flush()

    # Mark entries as filed
    for entry in entries:
        entry.status = "filed"

    db.flush()
    return ret


def get_tds_tcs_summary(
    db: Session,
    *,
    company_id: str,
    tds_tcs_type: str | None = None,
) -> dict[str, Any]:
    """Get summary of TDS/TCS entries for a company."""
    q = db.query(TdsTcsEntry).filter(TdsTcsEntry.company_id == company_id)
    if tds_tcs_type:
        q = q.filter(TdsTcsEntry.tds_tcs_type == tds_tcs_type)

    entries = q.all()

    pending = [e for e in entries if e.status == "pending"]
    deposited = [e for e in entries if e.status == "deposited"]
    filed = [e for e in entries if e.status == "filed"]

    return {
        "total_entries": len(entries),
        "pending_count": len(pending),
        "deposited_count": len(deposited),
        "filed_count": len(filed),
        "pending_amount": sum(float(e.deducted_amount) for e in pending),
        "deposited_amount": sum(float(e.deducted_amount) for e in deposited),
        "filed_amount": sum(float(e.deducted_amount) for e in filed),
        "total_base_amount": sum(float(e.base_amount) for e in entries),
        "total_tax_amount": sum(float(e.deducted_amount) for e in entries),
    }
