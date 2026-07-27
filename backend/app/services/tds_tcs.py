"""TDS/TCS service: deduction logic, return generation, and reporting."""
from __future__ import annotations

from dataclasses import dataclass
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
    {"code": "194Q", "name": "TDS on Purchase of Goods", "type": "tds", "rate": 0.1, "threshold": 5000000, "buyer_turnover_threshold": 100000000},
    {"code": "194S", "name": "TDS on Virtual Digital Assets", "type": "tds", "rate": 1.0, "threshold": 10000},
    {"code": "206C-A", "name": "Collection at Source - Alcohol", "type": "tcs", "rate": 1.0, "threshold": 5000000},
    {"code": "206C-T", "name": "Collection at Source - Timber", "type": "tcs", "rate": 2.5, "threshold": 0},
    {"code": "206C-M", "name": "Collection at Source - Minerals", "type": "tcs", "rate": 1.0, "threshold": 0},
    {"code": "206C-1H", "name": "TCS on Sale of Goods", "type": "tcs", "rate": 0.1, "threshold": 5000000, "seller_turnover_threshold": 100000000},
    {"code": "206AA", "name": "Higher TDS for PAN not provided", "type": "tds", "rate": 20.0, "threshold": 0, "override_rate": True},
    {"code": "206AB", "name": "Higher TDS for Non-filers of ITR", "type": "tds", "rate": 5.0, "threshold": 0, "multiplier": 2, "min_rate": 5.0},
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
            buyer_turnover_threshold=section.get("buyer_turnover_threshold", 100000000),
            seller_turnover_threshold=section.get("seller_turnover_threshold", 100000000),
            override_rate=section.get("override_rate", False),
            multiplier=section.get("multiplier", 2),
            min_rate=section.get("min_rate", 5.0),
        )
        db.add(entry)

    db.commit()
def calculate_tds_tcs(
    db: Session,
    *,
    company_id: str,
    section_id: str,
    base_amount: float,
    pan_available: bool = True,
    # For 194Q: buyer's annual turnover
    buyer_turnover: float | None = None,
    # For 206C-1H: seller's annual turnover
    seller_turnover: float | None = None,
    # For 206AB: non-filer status
    is_non_filer: bool = False,
) -> dict[str, Any]:
    """Calculate TDS/TCS amount based on section rate and threshold.

    Args:
        pan_available: If False, Section 206AA applies — rate is higher of
            the section rate or 20%.
        buyer_turnover: For 194Q (TDS on purchase of goods) — buyer's annual turnover.
            If buyer's turnover exceeds section.buyer_turnover_threshold (default 10 Cr),
            TDS applies.
        seller_turnover: For 206C-1H (TCS on sale of goods) — seller's annual turnover.
            If seller's turnover exceeds section.seller_turnover_threshold (default 10 Cr),
            TCS applies.
        is_non_filer: For Section 206AB — if payee is a non-filer, rate is multiplied
            by section.multiplier (default 2x) with minimum rate of section.min_rate (default 5%).

    Returns:
        Dict with base_amount, rate, calculated_amount, threshold, is_applicable.
    """
    section = db.get(TdsTcsSection, section_id)
    if not section or section.company_id != company_id:
        raise ValueError(f"Section {section_id} not found")

    base = Decimal(str(base_amount))
    threshold = Decimal(str(section.threshold_limit))
    rate = Decimal(str(section.rate))

    # Section 194Q: TDS on purchase of goods - check buyer turnover
    if section.section_code == "194Q":
        if buyer_turnover is not None:
            buyer_turnover_dec = Decimal(str(buyer_turnover))
            if buyer_turnover_dec < section.buyer_turnover_threshold:
                return {
                    "base_amount": float(base),
                    "rate": 0.0,
                    "calculated_amount": 0.0,
                    "threshold": float(threshold),
                    "is_applicable": False,
                    "reason": f"Buyer turnover {buyer_turnover} below threshold {section.buyer_turnover_threshold}",
                    "tds_tcs_type": section.tds_tcs_type,
                    "section_code": section.section_code,
                    "section_name": section.section_name,
                }

    # Section 206C-1H: TCS on sale of goods - check seller turnover
    if section.section_code == "206C-1H":
        if seller_turnover is not None:
            seller_turnover_dec = Decimal(str(seller_turnover))
            if seller_turnover_dec < section.seller_turnover_threshold:
                return {
                    "base_amount": float(base),
                    "rate": 0.0,
                    "calculated_amount": 0.0,
                    "threshold": float(threshold),
                    "is_applicable": False,
                    "reason": f"Seller turnover {seller_turnover} below threshold {section.seller_turnover_threshold}",
                    "tds_tcs_type": section.tds_tcs_type,
                    "section_code": section.section_code,
                    "section_name": section.section_name,
                }

    # Section 206AB: Non-filer - higher TDS rate
    if is_non_filer and section.multiplier:
        rate = rate * Decimal(str(section.multiplier))
        if section.min_rate:
            rate = max(rate, Decimal(str(section.min_rate)))

    # Section 206AA: PAN not provided — rate is higher of section rate or 20%
    if not pan_available:
        rate = max(rate, Decimal("20"))

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


@dataclass
class TdsTcsPartyLine:
    party_name: str
    section_code: str
    section_name: str
    entry_count: int
    total_base_amount: float
    total_tax_amount: float


def get_tds_tcs_party_summary(
    db: Session,
    *,
    company_id: str,
    start_date: str,
    end_date: str,
    tds_tcs_type: str = "tds",
) -> dict[str, Any]:
    """Party-wise TDS/TCS summary for a date range."""
    entries = db.query(TdsTcsEntry).filter(
        TdsTcsEntry.company_id == company_id,
        TdsTcsEntry.tds_tcs_type == tds_tcs_type,
        TdsTcsEntry.entry_date >= start_date,
        TdsTcsEntry.entry_date <= end_date,
    ).all()

    # Group by (party_id, section_id)
    groups: dict[tuple[str | None, str], list[TdsTcsEntry]] = {}
    for e in entries:
        key = (e.party_id, e.section_id)
        groups.setdefault(key, []).append(e)

    # Bulk-resolve sections / partied once (avoids per-group N+1 queries).
    section_ids = {k[1] for k in groups}
    party_ids = {k[0] for k in groups if k[0]}
    section_map = {
        s.id: s
        for s in db.query(TdsTcsSection).filter(TdsTcsSection.id.in_(section_ids)).all()
    }
    party_map = {
        p.id: p
        for p in db.query(Party).filter(Party.id.in_(party_ids)).all()
    }

    party_lines = []
    for (party_id, section_id), group_entries in groups.items():
        section = section_map.get(section_id)
        party = party_map.get(party_id) if party_id else None
        party_lines.append(TdsTcsPartyLine(
            party_name=party.name if party else "—",
            section_code=section.section_code if section else "—",
            section_name=section.section_name if section else "—",
            entry_count=len(group_entries),
            total_base_amount=sum(float(e.base_amount) for e in group_entries),
            total_tax_amount=sum(float(e.deducted_amount) for e in group_entries),
        ))

    party_lines.sort(key=lambda x: (-x.total_tax_amount, x.party_name))

    pending = [e for e in entries if e.status == "pending"]
    deposited = [e for e in entries if e.status == "deposited"]
    filed = [e for e in entries if e.status == "filed"]

    return {
        "party_lines": party_lines,
        "total_entries": len(entries),
        "total_base_amount": sum(float(e.base_amount) for e in entries),
        "total_tax_amount": sum(float(e.deducted_amount) for e in entries),
        "pending_count": len(pending),
        "deposited_count": len(deposited),
        "filed_count": len(filed),
    }


def generate_certificate(
    db: Session,
    *,
    company_id: str,
    period_type: str,  # "quarter" or "year"
    period_value: str,  # e.g., "Q1", "2024"
    form_type: str,  # "form_16a" or "form_27d"
    party_id: str | None = None,
    section_id: str | None = None,
) -> dict[str, Any]:
    """Generate TDS/TCS certificate (Form 16A for TDS, Form 27D for TCS).
    
    Args:
        db: Database session
        company_id: Company ID
        period_type: 'quarter' or 'year'
        period_value: Period value (e.g., 'Q1', '2024')
        form_type: 'form_16a' (TDS) or 'form_27d' (TCS)
        party_id: Optional party filter
        section_id: Optional section filter
        
    Returns:
        Dict with certificate details
    """
    from app.models.tds_tcs import TdsTcsCertificate, TdsTcsEntry, TdsTcsSection
    from app.models.accounting import Party
    from datetime import date
    
    tds_tcs_type = "TDS" if form_type == "form_16a" else "TCS"
    # Note: stored values are 'TDS'/'TCS' for sections but 'tds'/'tcs' for entries
    # Use case-insensitive comparison
    
    # Build query for deposited/filed entries in the period
    if period_type == "quarter":
        quarter_map = {
            "Q1": ("04-01", "06-30"),
            "Q2": ("07-01", "09-30"),
            "Q3": ("10-01", "12-31"),
            "Q4": ("01-01", "03-31"),
        }
        start_md, end_md = quarter_map.get(period_value, ("04-01", "06-30"))
        fy_year = int(period_value[-4:]) if period_value[-4:].isdigit() else 2024
        start_date = f"{fy_year}-{start_md}"
        if period_value == "Q4":
            end_date = f"{fy_year + 1}-{end_md}"
        else:
            end_date = f"{fy_year}-{end_md}"
    else:
        # Annual
        fy_year = int(period_value)
        start_date = f"{fy_year}-04-01"
        end_date = f"{fy_year + 1}-03-31"
    q = db.query(TdsTcsEntry).filter(
        TdsTcsEntry.company_id == company_id,
        TdsTcsEntry.tds_tcs_type.ilike(tds_tcs_type),
        TdsTcsEntry.status.in_(["deposited", "filed"]),
        TdsTcsEntry.entry_date >= start_date,
        TdsTcsEntry.entry_date <= end_date,
    )
    if party_id:
        q = q.filter(TdsTcsEntry.party_id == party_id)
    if section_id:
        q = q.filter(TdsTcsEntry.section_id == section_id)
    
    entries = q.all()
    
    # Group by party and section
    groups: dict[tuple[str | None, str], list] = {}
    for e in entries:
        key = (e.party_id, e.section_id)
        groups.setdefault(key, []).append(e)
    
    # Resolve sections and parties
    section_ids = {k[1] for k in groups}
    party_ids = {k[0] for k in groups if k[0]}
    section_map = {s.id: s for s in db.query(TdsTcsSection).filter(TdsTcsSection.id.in_(section_ids)).all()}
    party_map = {p.id: p for p in db.query(Party).filter(Party.id.in_(party_ids)).all()}
    
    certificates = []
    for (pid, sid), group_entries in groups.items():
        section = section_map.get(sid)
        party = party_map.get(pid) if pid else None
        
        total_base = sum(float(e.base_amount) for e in group_entries)
        total_deducted = sum(float(e.deducted_amount) for e in group_entries)
        
        # Generate certificate number
        cert_num = f"{form_type.upper()}/{company_id[:8]}/{period_value}/{sid[:8]}"
        
        cert = TdsTcsCertificate(
            company_id=company_id,
            period_type=period_type,
            period_value=period_value,
            form_type=form_type,
            party_id=pid,
            section_id=sid,
            total_base_amount=total_base,
            total_deducted_amount=total_deducted,
            certificate_number=cert_num,
            generated_date=date.today().isoformat(),
            is_issued=False,
        )
        db.add(cert)
        certificates.append({
            "id": cert.id,
            "certificate_number": cert_num,
            "party_name": party.name if party else "—",
            "section_code": section.section_code if section else "—",
            "section_name": section.section_name if section else "—",
            "total_base_amount": total_base,
            "total_deducted_amount": total_deducted,
            "generated_date": cert.generated_date,
        })
    
    db.commit()
    return {"certificates": certificates, "count": len(certificates)}


def issue_certificate(db: Session, certificate_id: str) -> dict[str, Any]:
    """Mark a certificate as issued."""
    from app.models.tds_tcs import TdsTcsCertificate
    from datetime import date
    
    cert = db.get(TdsTcsCertificate, certificate_id)
    if not cert:
        raise ValueError(f"Certificate {certificate_id} not found")
    cert.is_issued = True
    cert.issued_date = date.today().isoformat()
    db.commit()
    return {"id": cert.id, "certificate_number": cert.certificate_number, "issued_date": cert.issued_date}
