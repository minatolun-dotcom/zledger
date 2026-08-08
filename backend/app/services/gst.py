"""GST service: auto-create GST ledgers and calculate GST.

GST ledgers are auto-created when a company is created under hierarchical subgroups:
- GST Output → CGST Output, SGST Output, IGST Output (for sales)
- GST Input → CGST Input, SGST Input, IGST Input (for purchases)
- Reverse Charge → RCM CGST Input, RCM SGST Input, RCM IGST Input

All ledgers use immutable system_codes (e.g., SYS_GST_OUTPUT_CGST) so
business logic never depends on display names. Users can rename display names.

All GST calculations use half-up rounding as per Indian GST rules.
Reverse Charge Mechanism (RCM):
- Under RCM, the recipient pays GST directly to the government
- The supplier does not charge GST on the invoice
- The recipient can claim Input Tax Credit (ITC) for the GST paid under RCM
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import NamedTuple

from sqlalchemy.orm import Session

from app.models.accounting import AccountGroup, HsnSac, Ledger


# GST ledger definitions: (display_name, system_code, parent_group_system_code)
GST_LEDGERS = [
    ("CGST Output", "SYS_GST_OUTPUT_CGST", "GRP_GST_OUTPUT"),
    ("SGST Output", "SYS_GST_OUTPUT_SGST", "GRP_GST_OUTPUT"),
    ("IGST Output", "SYS_GST_OUTPUT_IGST", "GRP_GST_OUTPUT"),
    ("CGST Input", "SYS_GST_INPUT_CGST", "GRP_GST_INPUT"),
    ("SGST Input", "SYS_GST_INPUT_SGST", "GRP_GST_INPUT"),
    ("IGST Input", "SYS_GST_INPUT_IGST", "GRP_GST_INPUT"),
    ("RCM CGST Input", "SYS_RCM_CGST", "GRP_REVERSE_CHARGE"),
    ("RCM SGST Input", "SYS_RCM_SGST", "GRP_REVERSE_CHARGE"),
    ("RCM IGST Input", "SYS_RCM_IGST", "GRP_REVERSE_CHARGE"),
    ("Composition Tax", "SYS_GST_COMPOSITION_TAX", "GRP_GST_OUTPUT"),
]


def seed_gst_ledgers(db: Session, company_id: str) -> None:
    """Insert default GST ledgers for a company. Idempotent.

    Places each ledger under the correct hierarchical subgroup:
    - GST Output ledgers under "GST Output" subgroup
    - GST Input ledgers under "GST Input" subgroup
    - RCM ledgers under "Reverse Charge" subgroup
    """
    existing = db.query(Ledger).filter(
        Ledger.company_id == company_id,
        Ledger.system_code.isnot(None),
    ).filter(
        Ledger.system_code.in_([code for _, code, _ in GST_LEDGERS]),
    ).count()
    if existing > 0:
        return

    # Map group system_codes to group objects
    group_map: dict[str, AccountGroup] = {}
    for ag in db.query(AccountGroup).filter(AccountGroup.company_id == company_id).all():
        if ag.system_code:
            group_map[ag.system_code] = ag

    for ledger_name, system_code, parent_group_code in GST_LEDGERS:
        grp = group_map.get(parent_group_code)
        if not grp:
            continue
        db.add(Ledger(
            company_id=company_id,
            name=ledger_name,
            system_code=system_code,
            group_id=grp.id,
            opening_balance=0,
            opening_balance_type="Cr",
            is_active=True,
            is_protected=True,
        ))

    db.commit()


class GstBreakdown(NamedTuple):
    """GST breakdown for a single line item."""
    taxable_amount: Decimal
    cgst_rate: Decimal
    cgst_amount: Decimal
    sgst_rate: Decimal
    sgst_amount: Decimal
    igst_rate: Decimal
    igst_amount: Decimal
    total_tax: Decimal
    total_amount: Decimal
    hsn_sac_code: str
    gst_rate: Decimal
    is_reverse_charge: bool
    is_inter_state: bool


def calculate_gst(
    db: Session,
    company_id: str,
    amount: Decimal,
    hsn_sac_id: str,
    is_inter_state: bool = False,
    is_reverse_charge: bool = False,
) -> GstBreakdown:
    """Calculate GST for a given amount using half-up rounding.

    Args:
        db: Database session
        company_id: Company ID for scoping
        amount: Taxable amount (excluding GST)
        hsn_sac_id: HSN/SAC code ID
        is_inter_state: True for IGST, False for CGST+SGST
        is_reverse_charge: True if reverse charge applies

    Returns:
        GstBreakdown with all GST amounts
    """
    hsn_sac = db.get(HsnSac, hsn_sac_id)
    if not hsn_sac or hsn_sac.company_id != company_id:
        raise ValueError(f"HSN/SAC {hsn_sac_id} not found")

    gst_rate = Decimal(str(hsn_sac.gst_rate))
    taxable_amount = Decimal(str(amount))

    if is_inter_state:
        # IGST = GST rate (no CGST/SGST split)
        igst_amount = _round_gst(taxable_amount * gst_rate / Decimal("100"))
        cgst_amount = Decimal("0")
        sgst_amount = Decimal("0")
        cgst_rate = Decimal("0")
        sgst_rate = Decimal("0")
        igst_rate = gst_rate
    else:
        # CGST + SGST = GST rate (split equally)
        half_rate = gst_rate / Decimal("2")
        cgst_amount = _round_gst(taxable_amount * half_rate / Decimal("100"))
        sgst_amount = _round_gst(taxable_amount * half_rate / Decimal("100"))
        igst_amount = Decimal("0")
        cgst_rate = half_rate
        sgst_rate = half_rate
        igst_rate = Decimal("0")

    total_tax = cgst_amount + sgst_amount + igst_amount
    total_amount = taxable_amount + total_tax

    return GstBreakdown(
        taxable_amount=taxable_amount,
        cgst_rate=cgst_rate,
        cgst_amount=cgst_amount,
        sgst_rate=sgst_rate,
        sgst_amount=sgst_amount,
        igst_rate=igst_rate,
        igst_amount=igst_amount,
        total_tax=total_tax,
        total_amount=total_amount,
        hsn_sac_code=hsn_sac.code,
        gst_rate=gst_rate,
        is_reverse_charge=is_reverse_charge,
        is_inter_state=is_inter_state,
    )


def _round_gst(amount: Decimal) -> Decimal:
    """Round GST amount using half-up rounding method."""
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def get_gst_ledger_ids(db: Session, company_id: str) -> dict[str, str]:
    """Get GST ledger IDs for a company, keyed by system_code.

    Returns:
        Dictionary mapping system_code to ledger ID
        e.g. {"SYS_GST_OUTPUT_CGST": "uuid...", "SYS_GST_INPUT_CGST": "uuid..."}
    """
    system_codes = [code for _, code, _ in GST_LEDGERS]
    ledgers = db.query(Ledger).filter(
        Ledger.company_id == company_id,
        Ledger.system_code.in_(system_codes),
    ).all()

    return {ledger.system_code: ledger.id for ledger in ledgers if ledger.system_code}


def get_rcm_ledger_mapping() -> dict[str, str]:
    """Get mapping from regular GST ledger system_codes to RCM equivalents.

    Returns:
        Dictionary mapping regular system_code to RCM system_code
    """
    return {
        "SYS_GST_INPUT_CGST": "SYS_RCM_CGST",
        "SYS_GST_INPUT_SGST": "SYS_RCM_SGST",
        "SYS_GST_INPUT_IGST": "SYS_RCM_IGST",
    }


def calculate_gst_from_rate(
    amount: Decimal,
    gst_rate: Decimal,
    is_inter_state: bool = False,
) -> GstBreakdown:
    """Calculate GST for a given amount using a direct gst_rate percentage.

    Used when stock items have a gst_rate field rather than an HsnSac FK.
    """
    taxable_amount = Decimal(str(amount))

    if is_inter_state:
        igst_amount = _round_gst(taxable_amount * gst_rate / Decimal("100"))
        cgst_amount = Decimal("0")
        sgst_amount = Decimal("0")
        cgst_rate = Decimal("0")
        sgst_rate = Decimal("0")
        igst_rate = gst_rate
    else:
        half_rate = gst_rate / Decimal("2")
        cgst_amount = _round_gst(taxable_amount * half_rate / Decimal("100"))
        sgst_amount = _round_gst(taxable_amount * half_rate / Decimal("100"))
        igst_amount = Decimal("0")
        cgst_rate = half_rate
        sgst_rate = half_rate
        igst_rate = Decimal("0")

    total_tax = cgst_amount + sgst_amount + igst_amount
    total_amount = taxable_amount + total_tax

    return GstBreakdown(
        taxable_amount=taxable_amount,
        cgst_rate=cgst_rate,
        cgst_amount=cgst_amount,
        sgst_rate=sgst_rate,
        sgst_amount=sgst_amount,
        igst_rate=igst_rate,
        igst_amount=igst_amount,
        total_tax=total_tax,
        total_amount=total_amount,
        hsn_sac_code="",
        gst_rate=gst_rate,
        is_reverse_charge=False,
        is_inter_state=is_inter_state,
    )
# ─── ITC Reversal Rule 42/43 ──────────────────────────────────────────────────

class ITCReversalResult(NamedTuple):
    """Result of ITC Reversal calculation per Rule 42/43."""
    # Rule 42: ITC attributable to exempt supplies
    rule42_itc_cgst: Decimal
    rule42_itc_sgst: Decimal
    rule42_itc_igst: Decimal
    
    # Rule 43: ITC attributable to exempt/business supplies (capital goods)
    rule43_itc_cgst: Decimal
    rule43_itc_sgst: Decimal
    rule43_itc_igst: Decimal
    
    # Total ITC reversed
    total_itc_cgst: Decimal
    total_itc_sgst: Decimal
    total_itc_igst: Decimal
    
    # Turnover details for transparency
    total_turnover: Decimal
    exempt_turnover: Decimal
    taxable_turnover: Decimal
    capital_goods_value: Decimal
    capital_goods_itc: Decimal


def calculate_itc_reversal(
    db: Session,
    company_id: str,
    financial_year_id: str,
) -> ITCReversalResult:
    """
    Calculate ITC reversal per Rule 42 and Rule 43 of CGST Rules.
    
    Rule 42: Reversal of ITC attributable to exempt supplies
    Formula: (Exempt Turnover / Total Turnover) × Total ITC
    
    Rule 43: Reversal of ITC attributable to exempt/business supplies (capital goods)
    Formula: ITC on capital goods × (Exempt Turnover / Total Turnover)
    
    Args:
        db: Database session
        company_id: Company ID
        financial_year_id: Financial Year ID
        
    Returns:
        ITCReversalResult with detailed breakdown
    """
    from app.models.accounting import AccountGroup, FinancialYear, Ledger, Party
    from app.models.voucher import Voucher, VoucherLine
    # Get financial year dates
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")
    
    start_date = fy.start_date
    end_date = fy.end_date
    
    # Get total ITC claimed during the period (from GST Input ledgers)
    from app.models.accounting import Ledger, AccountGroup
    from sqlalchemy import func
    from sqlalchemy.orm import Session
    
    # Get ITC for the period from GST Input ledgers
    itc_cgst = db.query(
        func.coalesce(func.sum(VoucherLine.debit), Decimal("0"))
    ).join(
        Ledger, Ledger.id == VoucherLine.ledger_id
    ).join(
        AccountGroup, AccountGroup.id == Ledger.group_id
    ).filter(
        Ledger.company_id == company_id,
        Ledger.system_code.in_(["SYS_GST_INPUT_CGST", "SYS_RCM_CGST"]),
        VoucherLine.voucher_id.in_(
            db.query(Voucher.id).filter(
                Voucher.company_id == company_id,
                Voucher.voucher_date >= start_date,
                Voucher.voucher_date <= end_date,
            )
        )
    ).scalar() or Decimal("0")
    
    itc_sgst = db.query(
        func.coalesce(func.sum(VoucherLine.debit), Decimal("0"))
    ).join(
        Ledger, Ledger.id == VoucherLine.ledger_id
    ).join(
        AccountGroup, AccountGroup.id == Ledger.group_id
    ).filter(
        Ledger.company_id == company_id,
        Ledger.system_code.in_(["SYS_GST_INPUT_SGST", "SYS_RCM_SGST"]),
        VoucherLine.voucher_id.in_(
            db.query(Voucher.id).filter(
                Voucher.company_id == company_id,
                Voucher.voucher_date >= start_date,
                Voucher.voucher_date <= end_date,
            )
        )
    ).scalar() or Decimal("0")
    
    itc_igst = db.query(
        func.coalesce(func.sum(VoucherLine.debit), Decimal("0"))
    ).join(
        Ledger, Ledger.id == VoucherLine.ledger_id
    ).join(
        AccountGroup, AccountGroup.id == Ledger.group_id
    ).filter(
        Ledger.company_id == company_id,
        Ledger.system_code.in_(["SYS_GST_INPUT_IGST", "SYS_RCM_IGST"]),
        VoucherLine.voucher_id.in_(
            db.query(Voucher.id).filter(
                Voucher.company_id == company_id,
                Voucher.voucher_date >= start_date,
                Voucher.voucher_date <= end_date,
            )
        )
    ).scalar() or Decimal("0")
    
    total_itc_cgst = itc_cgst
    total_itc_sgst = itc_sgst
    total_itc_igst = itc_igst
    
    # Calculate turnover for the period
    # Taxable turnover (from outward supplies - GSTR-3B outward)
    from app.models.voucher import Voucher, VoucherLine
    from app.models.accounting import AccountGroup
    
    # Taxable turnover (outward supplies with GST)
    outward_taxable = db.query(
        func.coalesce(func.sum(VoucherLine.debit + VoucherLine.credit), Decimal("0"))
    ).join(
        Voucher, Voucher.id == VoucherLine.voucher_id
    ).filter(
        Voucher.company_id == company_id,
        Voucher.voucher_date >= start_date,
        Voucher.voucher_date <= end_date,
        VoucherLine.hsn_sac_id.isnot(None),
        VoucherLine.is_reverse_charge.is_(False),
    ).scalar() or Decimal("0")
    
    # Exempt turnover (from outward supplies without GST / exempt supplies)
    exempt_taxable = db.query(
        func.coalesce(func.sum(VoucherLine.debit + VoucherLine.credit), Decimal("0"))
    ).join(
        Voucher, Voucher.id == VoucherLine.voucher_id
    ).filter(
        Voucher.company_id == company_id,
        Voucher.voucher_date >= start_date,
        Voucher.voucher_date <= end_date,
        VoucherLine.hsn_sac_id.is_(None),  # No HSN = exempt or no GST
        VoucherLine.is_reverse_charge.is_(False),
    ).scalar() or Decimal("0")
    
    total_turnover = outward_taxable + exempt_taxable
    
    # Rule 42: ITC attributable to exempt supplies
    # Formula: (Exempt Turnover / Total Turnover) × Total ITC
    rule42_itc_cgst = Decimal("0")
    rule42_itc_sgst = Decimal("0")
    rule42_itc_igst = Decimal("0")
    
    if total_turnover > 0 and exempt_taxable > 0:
        ratio = exempt_taxable / total_turnover
        rule42_itc_cgst = (total_itc_cgst * ratio).quantize(Decimal("0.01"))
        rule42_itc_sgst = (total_itc_sgst * ratio).quantize(Decimal("0.01"))
        rule42_itc_igst = (total_itc_igst * ratio).quantize(Decimal("0.01"))
    
    # Rule 43: Capital goods ITC attributable to exempt supplies
    # For capital goods, ITC is reversed proportionally over 5 years
    # We need to find capital goods purchased during the year and their ITC
    
    # Find capital goods ITC (ledgers with asset category or capital goods)
    # This is a simplified implementation - in practice, would track capital goods separately
    # For now, we'll use a simplified approach: assume capital goods ITC is in a separate ledger
    capital_goods_itc_cgst = Decimal("0")
    capital_goods_itc_sgst = Decimal("0")
    capital_goods_itc_igst = Decimal("0")
    
    # Try to find capital goods ITC ledgers
    from app.models.accounting import Ledger, AccountGroup
    
    capital_goods_ledgers = db.query(Ledger).join(
        AccountGroup, AccountGroup.id == Ledger.group_id
    ).filter(
        Ledger.company_id == company_id,
        Ledger.system_code.in_(["SYS_CAPITAL_GOODS_CGST", "SYS_CAPITAL_GOODS_SGST", "SYS_CAPITAL_GOODS_IGST"]),
    ).all()
    
    for ledger in capital_goods_ledgers:
        ledger_itc = db.query(
            func.coalesce(func.sum(VoucherLine.debit), Decimal("0"))
        ).filter(
            VoucherLine.ledger_id == ledger.id,
            VoucherLine.voucher_id.in_(
                db.query(Voucher.id).filter(
                    Voucher.company_id == company_id,
                    Voucher.voucher_date >= start_date,
                    Voucher.voucher_date <= end_date,
                )
            )
        ).scalar() or Decimal("0")
        
        if "CGST" in (ledger.system_code or ""):
            capital_goods_itc_cgst += ledger_itc
        elif "SGST" in (ledger.system_code or ""):
            capital_goods_itc_sgst += ledger_itc
        elif "IGST" in (ledger.system_code or ""):
            capital_goods_itc_igst += ledger_itc
    
    capital_goods_itc_total = capital_goods_itc_cgst + capital_goods_itc_sgst + capital_goods_itc_igst
    
    # Rule 43: Capital goods ITC reversal for exempt portion
    rule43_itc_cgst = Decimal("0")
    rule43_itc_sgst = Decimal("0")
    rule43_itc_igst = Decimal("0")
    
    if total_turnover > 0 and exempt_taxable > 0 and capital_goods_itc_total > 0:
        ratio = exempt_taxable / total_turnover
        # Capital goods ITC is reversed proportionally over 5 years
        # Annual reversal = (Capital Goods ITC × Exempt Ratio) / 5
        rule43_itc_cgst = (capital_goods_itc_cgst * ratio / Decimal("5")).quantize(Decimal("0.01"))
        rule43_itc_sgst = (capital_goods_itc_sgst * ratio / Decimal("5")).quantize(Decimal("0.01"))
        rule43_itc_igst = (capital_goods_itc_igst * ratio / Decimal("5")).quantize(Decimal("0.01"))
    
    # Total ITC reversed
    total_itc_cgst = rule42_itc_cgst + rule43_itc_cgst
    total_itc_sgst = rule42_itc_sgst + rule43_itc_sgst
    total_itc_igst = rule42_itc_igst + rule43_itc_igst
    
    return ITCReversalResult(
        rule42_itc_cgst=rule42_itc_cgst,
        rule42_itc_sgst=rule42_itc_sgst,
        rule42_itc_igst=rule42_itc_igst,
        rule43_itc_cgst=rule43_itc_cgst,
        rule43_itc_sgst=rule43_itc_sgst,
        rule43_itc_igst=rule43_itc_igst,
        total_itc_cgst=total_itc_cgst,
        total_itc_sgst=total_itc_sgst,
        total_itc_igst=total_itc_igst,
        total_turnover=total_turnover,
        exempt_turnover=exempt_taxable,
        taxable_turnover=outward_taxable,
        capital_goods_value=Decimal("0"),  # Simplified - would need asset register integration
        capital_goods_itc=capital_goods_itc_cgst + capital_goods_itc_sgst + capital_goods_itc_igst,
    )


# ─── GSTR-2B Lite Reconciliation ───────────────────────────────────────────────

class Gstr2bInvoice(NamedTuple):
    """Single invoice in GSTR-2B."""
    supplier_gstin: str
    supplier_name: str
    invoice_number: str
    invoice_date: str
    invoice_value: Decimal
    taxable_value: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    place_of_supply: str
    reverse_charge: bool
    # Reconciliation status
    matched: bool
    matched_voucher_id: str | None = None
    match_score: float = 0.0
    mismatch_reason: str | None = None


class Gstr2bReconciliationResult(NamedTuple):
    """Result of GSTR-2B reconciliation against books."""
    period: str
    gstin: str
    
    # Summary counts
    total_invoices: int
    matched_invoices: int
    mismatched_invoices: int
    missing_in_books: int
    missing_in_gstr2b: int
    
    # Value summaries
    total_taxable_gstr2b: Decimal
    total_taxable_books: Decimal
    total_cgst_gstr2b: Decimal
    total_cgst_books: Decimal
    total_sgst_gstr2b: Decimal
    total_sgst_books: Decimal
    total_igst_gstr2b: Decimal
    total_igst_books: Decimal
    
    # Detailed invoice list
    invoices: list[Gstr2bInvoice]
    
    # Mismatch analysis
    value_differences: int
    date_mismatches: int
    party_mismatches: int


def generate_gstr2b_lite(
    db: Session,
    company_id: str,
    period: str,
    gstin_id: str | None = None,
    auto_match_threshold: float = 0.85,
) -> Gstr2bReconciliationResult:
    """
    Generate GSTR-2B Lite reconciliation against books.
    
    This function:
    1. Fetches GSTR-2B data (simulated - would come from GSTN API in production)
    2. Fetches book invoices from our records
    3. Attempts to auto-match invoices based on GSTIN, invoice number, date, value
    4. Returns reconciliation result with mismatches highlighted
    
    Args:
        db: Database session
        company_id: Company ID
        period: Period in YYYY-MM format
        gstin_id: Optional GSTIN ID
        auto_match_threshold: Minimum match score (0-1) for auto-matching
        
    Returns:
        Gstr2bReconciliationResult with reconciliation details
    """
    from app.models.voucher import Voucher, VoucherLine
    from app.models.accounting import Party, HsnSac
    from sqlalchemy import func
    from sqlalchemy.orm import Session
    from decimal import Decimal
    
    start_date, end_date = _get_period_dates(period)
    
    # Get GSTIN
    gstin = ""
    if gstin_id:
        from app.models.accounting import GstRegistration
        reg = db.get(GstRegistration, gstin_id)
        if reg and reg.company_id == company_id:
            gstin = reg.gstin
    else:
        from app.models.accounting import GstRegistration
        reg = db.query(GstRegistration).filter(
            GstRegistration.company_id == company_id,
            GstRegistration.is_primary.is_(True),
        ).first()
        if reg:
            gstin = reg.gstin
            gstin_id = reg.id
    
    # Fetch book invoices (purchase invoices from our books)
    book_voucher_lines = (
        db.query(VoucherLine, Voucher, Party, HsnSac)
        .join(Voucher, Voucher.id == VoucherLine.voucher_id)
        .outerjoin(Party, Party.ledger_id == VoucherLine.ledger_id)
        .outerjoin(HsnSac, HsnSac.id == VoucherLine.hsn_sac_id)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= start_date,
            Voucher.voucher_date <= end_date,
            VoucherLine.is_reverse_charge.is_(True),  # Purchase invoices are RCM or inward
            VoucherLine.hsn_sac_id.isnot(None),
        )
        .all()
    )
    
    # Build book invoices map keyed by (supplier_gstin, invoice_number, invoice_date)
    book_invoices = {}
    book_totals = {"taxable": Decimal("0"), "cgst": Decimal("0"), "sgst": Decimal("0"), "igst": Decimal("0")}
    
    for vl, voucher, party, hsn in book_voucher_lines:
        cgst = to_money(vl.cgst_amount or 0)
        sgst = to_money(vl.sgst_amount or 0)
        igst = to_money(vl.igst_amount or 0)
        taxable = to_money(vl.debit or vl.credit)
        
        party_gstin = party.gstin if party else ""
        
        key = (party_gstin, voucher.voucher_number, voucher.voucher_date)
        
        if key not in book_invoices:
            book_invoices[key] = Gstr2bInvoice(
                supplier_gstin=party_gstin,
                supplier_name=party.name if party else "Unknown",
                invoice_number=voucher.voucher_number,
                invoice_date=voucher.voucher_date,
                invoice_value=Decimal("0"),
                taxable_value=Decimal("0"),
                cgst=Decimal("0"),
                sgst=Decimal("0"),
                igst=Decimal("0"),
                place_of_supply=voucher.place_of_supply or "",
                reverse_charge=vl.is_reverse_charge,
                matched=False,
                matched_voucher_id=None,
                match_score=0.0,
                mismatch_reason=None,
            )
        
        inv = book_invoices[key]
        inv.taxable_value += taxable
        inv.invoice_value += taxable + cgst + sgst + igst
        inv.cgst += cgst
        inv.sgst += sgst
        inv.igst += igst
        
        book_totals["taxable"] += taxable
        book_totals["cgst"] += cgst
        book_totals["sgst"] += sgst
        book_totals["igst"] += igst
    
    # Simulated GSTR-2B data (in production, would fetch from GSTN API)
    # For now, we'll use the same data as our books but with some variations for testing
    gstr2b_invoices = list(book_invoices.values())
    gstr2b_totals = {"taxable": Decimal("0"), "cgst": Decimal("0"), "sgst": Decimal("0"), "igst": Decimal("0")}
    
    for inv in gstr2b_invoices:
        gstr2b_totals["taxable"] += inv.taxable_value
        gstr2b_totals["cgst"] += inv.cgst
        gstr2b_totals["sgst"] += inv.sgst
        gstr2b_totals["igst"] += inv.igst
    
    # Auto-match invoices
    matched = 0
    mismatched = 0
    missing_in_books = 0
    missing_in_gstr2b = 0
    value_differences = 0
    date_mismatches = 0
    party_mismatches = 0
    
    matched_invoices = []
    
    for gstr_inv in gstr2b_invoices:
        key = (inv.supplier_gstin, inv.invoice_number, inv.invoice_date)
        
        if key in book_invoices:
            book_inv = book_invoices[key]
            
            # Calculate match score
            score = 1.0
            mismatch_reasons = []
            
            # Check value match (allow 1% tolerance)
            gstr_value = gstr_inv.invoice_value
            book_value = book_inv.invoice_value
            if abs(gstr_value - book_value) / max(gstr_value, book_value, Decimal("1")) > Decimal("0.01"):
                score -= 0.3
                value_differences += 1
            
            # Check date match
            if gstr_inv.invoice_date != book_inv.invoice_date:
                score -= 0.2
                date_mismatches += 1
            
            # Check party match
            if gstr_inv.supplier_gstin != book_inv.supplier_gstin:
                score -= 0.2
                party_mismatches += 1
            
            if score >= 0.85:
                matched += 1
                gstr_inv.matched = True
                gstr_inv.matched_voucher_id = book_inv.matched_voucher_id
                gstr_inv.match_score = float(score)
                matched_invoices.append(gstr_inv)
            else:
                mismatched += 1
                gstr_inv.matched = False
                gstr_inv.match_score = float(score)
                gstr_inv.mismatch_reason = "; ".join([
                    f"Value diff: {abs(gstr_value - book_value):.2f}",
                    f"Date mismatch: {gstr_inv.invoice_date} vs {book_inv.invoice_date}",
                    f"Party mismatch: {gstr_inv.supplier_gstin} vs {book_inv.supplier_gstin}",
                ]) if score < 0.85 else None
        else:
            missing_in_books += 1
            gstr_inv.matched = False
            gstr_inv.mismatch_reason = "Missing in books"
    
    # Check for invoices in books but not in GSTR-2B
    gstr_keys = set((inv.supplier_gstin, inv.invoice_number, inv.invoice_date) for inv in gstr2b_invoices)
    book_keys = set((inv.supplier_gstin, inv.invoice_number, inv.invoice_date) for inv in book_invoices.values())
    
    missing_in_gstr2b = len(book_keys - gstr_keys)
    
    # Build invoice list for response
    all_invoices = list(gstr2b_invoices) + [inv for key, inv in book_invoices.items() if key not in gstr_keys]
    
    return Gstr2bReconciliationResult(
        period=period,
        gstin=gstin,
        total_invoices=len(gstr2b_invoices) + missing_in_gstr2b,
        matched_invoices=matched,
        mismatched_invoices=mismatched,
        missing_in_books=missing_in_books,
        missing_in_gstr2b=missing_in_gstr2b,
        total_taxable_gstr2b=gstr2b_totals["taxable"],
        total_taxable_books=book_totals["taxable"],
        total_cgst_gstr2b=gstr2b_totals["cgst"],
        total_cgst_books=book_totals["cgst"],
        total_sgst_gstr2b=gstr2b_totals["sgst"],
        total_sgst_books=book_totals["sgst"],
        total_igst_gstr2b=gstr2b_totals["igst"],
        total_igst_books=book_totals["igst"],
        invoices=all_invoices,
        value_differences=value_differences,
        date_mismatches=date_mismatches,
        party_mismatches=party_mismatches,
    )

def _get_fy_dates(financial_year: str) -> tuple[str, str]:
    """Get start and end dates for a financial year."""
    year = int(financial_year.split("-")[0])
    start = f"{year}-04-01"
    end = f"{year+1}-03-31"
    return start, end


def _get_period_dates(period: str) -> tuple[str, str]:
    """Get start and end dates for a period (YYYY-MM). Returns the actual last
    day of the month as end (inclusive range), matching gstr.py."""
    year, month = map(int, period.split("-"))
    start = f"{year}-{month:02d}-01"
    if month == 12:
        end = f"{year}-12-31"
    else:
        next_month = f"{year}-{month+1:02d}-01"
        from datetime import date, timedelta
        end = (date.fromisoformat(next_month) - timedelta(days=1)).isoformat()
    return start, end
