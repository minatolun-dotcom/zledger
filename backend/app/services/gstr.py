"""GSTR service: GSTR-1 and GSTR-3B return generation.

Aggregates voucher data for GST return filing periods.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.accounting import GstRegistration, HsnSac, Party
from app.models.voucher import Voucher, VoucherLine
from app.utils.money import to_money


@dataclass
class B2BInvoice:
    gstin: str
    place_of_supply: str
    invoice_number: str
    invoice_date: str
    invoice_value: float
    taxable_value: float
    cgst: float
    sgst: float
    igst: float
    reverse_charge: bool


@dataclass
class B2CSInvoice:
    place_of_supply: str
    rate: float
    taxable_value: float
    cgst: float
    sgst: float
    igst: float


@dataclass
class HsnSummary:
    hsn_code: str
    description: str
    uom: str
    quantity: float
    taxable_value: float
    cgst: float
    sgst: float
    igst: float
    total_value: float


@dataclass
class Gstr1Data:
    period: str
    gstin: str
    b2b: list[B2BInvoice] = field(default_factory=list)
    b2cs: list[B2CSInvoice] = field(default_factory=list)
    hsn: list[HsnSummary] = field(default_factory=list)
    total_b2b_taxable: float = 0
    total_b2cs_taxable: float = 0
    total_cgst: float = 0
    total_sgst: float = 0
    total_igst: float = 0


@dataclass
class Gstr3bData:
    period: str
    gstin: str
    # Table 3.1: Outward supplies
    taxable_value: float = 0
    cgst_payable: float = 0
    sgst_payable: float = 0
    igst_payable: float = 0
    # Table 3.1(c): Inward supplies liable to reverse charge
    reverse_charge_taxable: float = 0
    reverse_charge_cgst: float = 0
    reverse_charge_sgst: float = 0
    reverse_charge_igst: float = 0
    # Table 4: Eligible ITC
    itc_cgst: float = 0
    itc_sgst: float = 0
    itc_igst: float = 0


@dataclass
class Gstr9Data:
    """GSTR-9 Annual Return data — full financial year aggregation."""
    financial_year: str
    gstin: str
    legal_name: str = ""
    trade_name: str = ""
    # Table 4A — Taxable outward supplies
    taxable_outward: float = 0
    nil_rated_outward: float = 0
    zero_rated_outward: float = 0
    # Table 4G — Reverse charge inward supplies
    reverse_charge_inward: float = 0
    # Table 4 totals
    total_outward_taxable: float = 0
    total_outward_cgst: float = 0
    total_outward_sgst: float = 0
    total_outward_igst: float = 0
    # Table 6A — ITC from regular purchases
    itc_from_purchases_cgst: float = 0
    itc_from_purchases_sgst: float = 0
    itc_from_purchases_igst: float = 0
    # Table 6C — ITC from reverse charge
    itc_from_reverse_charge_cgst: float = 0
    itc_from_reverse_charge_sgst: float = 0
    itc_from_reverse_charge_igst: float = 0
    # Table 6 totals
    total_itc_cgst: float = 0
    total_itc_sgst: float = 0
    total_itc_igst: float = 0
    # Table 8 — Net tax payable
    net_cgst_payable: float = 0
    net_sgst_payable: float = 0
    net_igst_payable: float = 0
    total_tax_payable: float = 0


def _get_fy_dates(financial_year: str) -> tuple[str, str]:
    """Convert FY format YYYY-YY to start and end dates (April to March)."""
    start_year_str, end_year_short = financial_year.split("-")
    start_year = int(start_year_str)
    end_year = 2000 + int(end_year_short) if len(end_year_short) == 2 else int(end_year_short)
    return f"{start_year}-04-01", f"{end_year}-03-31"


def _get_period_dates(period: str) -> tuple[str, str]:
    """Convert YYYY-MM to start and end dates."""
    year, month = period.split("-")
    start = f"{year}-{month}-01"
    if month == "12":
        end = f"{year}-12-31"
    else:
        next_month = int(month) + 1
        end = f"{year}-{next_month:02d}-01"
        # Last day of month: go back one day from first of next month
        from datetime import date, timedelta
        end_date = date.fromisoformat(end) - timedelta(days=1)
        end = end_date.isoformat()
    return start, end


def generate_gstr1(
    db: Session,
    company_id: str,
    period: str,
    gstin_id: str | None = None,
) -> Gstr1Data:
    """Generate GSTR-1 data for a period.

    Aggregates outward supply invoices into B2B, B2CS, and HSN summaries.
    """
    start_date, end_date = _get_period_dates(period)

    # Get GSTIN
    gstin = ""
    if gstin_id:
        reg = db.get(GstRegistration, gstin_id)
        if reg and reg.company_id == company_id:
            gstin = reg.gstin
    else:
        reg = db.query(GstRegistration).filter(
            GstRegistration.company_id == company_id,
            GstRegistration.is_primary.is_(True),
        ).first()
        if reg:
            gstin = reg.gstin
            gstin_id = reg.id

    # Fetch all posted vouchers with GST lines in the period
    voucher_lines = (
        db.query(VoucherLine, Voucher, Party, HsnSac)
        .join(Voucher, Voucher.id == VoucherLine.voucher_id)
        .outerjoin(Party, Party.ledger_id == VoucherLine.ledger_id)
        .outerjoin(HsnSac, HsnSac.id == VoucherLine.hsn_sac_id)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= start_date,
            Voucher.voucher_date <= end_date,
            VoucherLine.hsn_sac_id.isnot(None),
        )
        .all()
    )

    b2b_invoices: dict[str, B2BInvoice] = {}
    b2cs_list: list[B2CSInvoice] = []
    hsn_map: dict[str, HsnSummary] = {}

    total_cgst = Decimal("0")
    total_sgst = Decimal("0")
    total_igst = Decimal("0")
    total_b2b_taxable = Decimal("0")
    total_b2cs_taxable = Decimal("0")

    for vl, voucher, party, hsn in voucher_lines:
        cgst = to_money(vl.cgst_amount or 0)
        sgst = to_money(vl.sgst_amount or 0)
        igst = to_money(vl.igst_amount or 0)
        taxable = to_money(vl.debit or vl.credit)

        total_cgst += cgst
        total_sgst += sgst
        total_igst += igst

        # B2B vs B2CS classification
        party_gstin = party.gstin if party else None
        pos = voucher.place_of_supply or voucher.counterparty_state_code or ""

        if party_gstin:
            # B2B: Invoices to registered persons
            inv_key = voucher.id
            if inv_key not in b2b_invoices:
                b2b_invoices[inv_key] = B2BInvoice(
                    gstin=party_gstin,
                    place_of_supply=pos,
                    invoice_number=voucher.voucher_number,
                    invoice_date=voucher.voucher_date,
                    invoice_value=0,
                    taxable_value=0,
                    cgst=0,
                    sgst=0,
                    igst=0,
                    reverse_charge=voucher_lines[0][0].is_reverse_charge if voucher_lines else False,
                )
            inv = b2b_invoices[inv_key]
            inv.taxable_value += float(taxable)
            inv.invoice_value += float(taxable + cgst + sgst + igst)
            inv.cgst += float(cgst)
            inv.sgst += float(sgst)
            inv.igst += float(igst)
            total_b2b_taxable += taxable
        else:
            # B2CS: Small value unregistered
            b2cs_list.append(B2CSInvoice(
                place_of_supply=pos,
                rate=float(hsn.gst_rate) if hsn else 0,
                taxable_value=float(taxable),
                cgst=float(cgst),
                sgst=float(sgst),
                igst=float(igst),
            ))
            total_b2cs_taxable += taxable

        # HSN summary
        if hsn:
            hsn_key = hsn.code
            if hsn_key not in hsn_map:
                hsn_map[hsn_key] = HsnSummary(
                    hsn_code=hsn.code,
                    description=hsn.description,
                    uom="NOS",
                    quantity=0,
                    taxable_value=0,
                    cgst=0,
                    sgst=0,
                    igst=0,
                    total_value=0,
                )
            h = hsn_map[hsn_key]
            h.taxable_value += float(taxable)
            h.cgst += float(cgst)
            h.sgst += float(sgst)
            h.igst += float(igst)
            h.total_value += float(taxable + cgst + sgst + igst)

    return Gstr1Data(
        period=period,
        gstin=gstin,
        b2b=list(b2b_invoices.values()),
        b2cs=b2cs_list,
        hsn=list(hsn_map.values()),
        total_b2b_taxable=float(total_b2b_taxable),
        total_b2cs_taxable=float(total_b2cs_taxable),
        total_cgst=float(total_cgst),
        total_sgst=float(total_sgst),
        total_igst=float(total_igst),
    )


def generate_gstr3b(
    db: Session,
    company_id: str,
    period: str,
    gstin_id: str | None = None,
) -> Gstr3bData:
    """Generate GSTR-3B data for a period.

    Aggregates outward supplies, reverse charge, and ITC.
    """
    start_date, end_date = _get_period_dates(period)

    # Get GSTIN
    gstin = ""
    if gstin_id:
        reg = db.get(GstRegistration, gstin_id)
        if reg and reg.company_id == company_id:
            gstin = reg.gstin
    else:
        reg = db.query(GstRegistration).filter(
            GstRegistration.company_id == company_id,
            GstRegistration.is_primary.is_(True),
        ).first()
        if reg:
            gstin = reg.gstin

    # Outward supplies (sales with GST)
    outward = (
        db.query(
            func.coalesce(func.sum(VoucherLine.debit + VoucherLine.credit), Decimal("0")).label("taxable"),
            func.coalesce(func.sum(VoucherLine.cgst_amount), Decimal("0")).label("cgst"),
            func.coalesce(func.sum(VoucherLine.sgst_amount), Decimal("0")).label("sgst"),
            func.coalesce(func.sum(VoucherLine.igst_amount), Decimal("0")).label("igst"),
        )
        .join(Voucher, Voucher.id == VoucherLine.voucher_id)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= start_date,
            Voucher.voucher_date <= end_date,
            VoucherLine.hsn_sac_id.isnot(None),
            VoucherLine.is_reverse_charge.is_(False),
        )
        .first()
    )

    # Reverse charge inward supplies
    rc = (
        db.query(
            func.coalesce(func.sum(VoucherLine.debit + VoucherLine.credit), Decimal("0")).label("taxable"),
            func.coalesce(func.sum(VoucherLine.cgst_amount), Decimal("0")).label("cgst"),
            func.coalesce(func.sum(VoucherLine.sgst_amount), Decimal("0")).label("sgst"),
            func.coalesce(func.sum(VoucherLine.igst_amount), Decimal("0")).label("igst"),
        )
        .join(Voucher, Voucher.id == VoucherLine.voucher_id)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= start_date,
            Voucher.voucher_date <= end_date,
            VoucherLine.is_reverse_charge.is_(True),
        )
        .first()
    )

    # ITC from GST Input ledgers (CGST Input, SGST Input, IGST Input, RCM Input)
    from app.models.accounting import AccountGroup, Ledger
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
    ).scalar()

    itc_sgst = db.query(
        func.coalesce(func.sum(VoucherLine.debit), Decimal("0"))
    ).join(
        Ledger, Ledger.id == VoucherLine.ledger_id
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
    ).scalar()

    itc_igst = db.query(
        func.coalesce(func.sum(VoucherLine.debit), Decimal("0"))
    ).join(
        Ledger, Ledger.id == VoucherLine.ledger_id
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
    ).scalar()

    return Gstr3bData(
        period=period,
        gstin=gstin,
        taxable_value=float(to_money(outward.taxable)) if outward else 0,
        cgst_payable=float(to_money(outward.cgst)) if outward else 0,
        sgst_payable=float(to_money(outward.sgst)) if outward else 0,
        igst_payable=float(to_money(outward.igst)) if outward else 0,
        reverse_charge_taxable=float(to_money(rc.taxable)) if rc else 0,
        reverse_charge_cgst=float(to_money(rc.cgst)) if rc else 0,
        reverse_charge_sgst=float(to_money(rc.sgst)) if rc else 0,
        reverse_charge_igst=float(to_money(rc.igst)) if rc else 0,
        itc_cgst=float(to_money(itc_cgst)),
        itc_sgst=float(to_money(itc_sgst)),
        itc_igst=float(to_money(itc_igst)),
    )


def generate_gstr9(
    db: Session,
    company_id: str,
    financial_year: str,
    gstin_id: str | None = None,
) -> Gstr9Data:
    """Generate GSTR-9 annual return data for a financial year.

    Aggregates outward supplies, reverse charge, and ITC across April-March.
    """
    start_date, end_date = _get_fy_dates(financial_year)

    # Get GSTIN
    gstin = ""
    legal_name = ""
    trade_name = ""
    if gstin_id:
        reg = db.get(GstRegistration, gstin_id)
        if reg and reg.company_id == company_id:
            gstin = reg.gstin
            legal_name = reg.legal_name
            trade_name = reg.trade_name or ""
    else:
        reg = db.query(GstRegistration).filter(
            GstRegistration.company_id == company_id,
            GstRegistration.is_primary.is_(True),
        ).first()
        if reg:
            gstin = reg.gstin
            gstin_id = reg.id
            legal_name = reg.legal_name
            trade_name = reg.trade_name or ""

    # Table 4: Outward supplies (sales with GST, not reverse charge)
    outward = (
        db.query(
            func.coalesce(func.sum(VoucherLine.debit + VoucherLine.credit), Decimal("0")).label("taxable"),
            func.coalesce(func.sum(VoucherLine.cgst_amount), Decimal("0")).label("cgst"),
            func.coalesce(func.sum(VoucherLine.sgst_amount), Decimal("0")).label("sgst"),
            func.coalesce(func.sum(VoucherLine.igst_amount), Decimal("0")).label("igst"),
        )
        .join(Voucher, Voucher.id == VoucherLine.voucher_id)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= start_date,
            Voucher.voucher_date <= end_date,
            VoucherLine.hsn_sac_id.isnot(None),
            VoucherLine.is_reverse_charge.is_(False),
        )
        .first()
    )

    # Table 4G: Reverse charge inward supplies
    rc = (
        db.query(
            func.coalesce(func.sum(VoucherLine.debit + VoucherLine.credit), Decimal("0")).label("taxable"),
            func.coalesce(func.sum(VoucherLine.cgst_amount), Decimal("0")).label("cgst"),
            func.coalesce(func.sum(VoucherLine.sgst_amount), Decimal("0")).label("sgst"),
            func.coalesce(func.sum(VoucherLine.igst_amount), Decimal("0")).label("igst"),
        )
        .join(Voucher, Voucher.id == VoucherLine.voucher_id)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= start_date,
            Voucher.voucher_date <= end_date,
            VoucherLine.is_reverse_charge.is_(True),
        )
        .first()
    )

    # Table 6: ITC from input GST ledgers
    from app.models.accounting import AccountGroup, Ledger

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
    ).scalar()

    itc_sgst = db.query(
        func.coalesce(func.sum(VoucherLine.debit), Decimal("0"))
    ).join(
        Ledger, Ledger.id == VoucherLine.ledger_id
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
    ).scalar()

    itc_igst = db.query(
        func.coalesce(func.sum(VoucherLine.debit), Decimal("0"))
    ).join(
        Ledger, Ledger.id == VoucherLine.ledger_id
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
    ).scalar()

    # Break out reverse-charge ITC
    itc_rc_cgst = db.query(
        func.coalesce(func.sum(VoucherLine.debit), Decimal("0"))
    ).join(
        Ledger, Ledger.id == VoucherLine.ledger_id
    ).filter(
        Ledger.company_id == company_id,
        Ledger.system_code == "SYS_RCM_CGST",
        VoucherLine.voucher_id.in_(
            db.query(Voucher.id).filter(
                Voucher.company_id == company_id,
                Voucher.voucher_date >= start_date,
                Voucher.voucher_date <= end_date,
            )
        )
    ).scalar()

    itc_rc_sgst = db.query(
        func.coalesce(func.sum(VoucherLine.debit), Decimal("0"))
    ).join(
        Ledger, Ledger.id == VoucherLine.ledger_id
    ).filter(
        Ledger.company_id == company_id,
        Ledger.system_code == "SYS_RCM_SGST",
        VoucherLine.voucher_id.in_(
            db.query(Voucher.id).filter(
                Voucher.company_id == company_id,
                Voucher.voucher_date >= start_date,
                Voucher.voucher_date <= end_date,
            )
        )
    ).scalar()

    itc_rc_igst = db.query(
        func.coalesce(func.sum(VoucherLine.debit), Decimal("0"))
    ).join(
        Ledger, Ledger.id == VoucherLine.ledger_id
    ).filter(
        Ledger.company_id == company_id,
        Ledger.system_code == "SYS_RCM_IGST",
        VoucherLine.voucher_id.in_(
            db.query(Voucher.id).filter(
                Voucher.company_id == company_id,
                Voucher.voucher_date >= start_date,
                Voucher.voucher_date <= end_date,
            )
        )
    ).scalar()

    itc_cgst_val = to_money(itc_cgst) if itc_cgst else Decimal("0")
    itc_sgst_val = to_money(itc_sgst) if itc_sgst else Decimal("0")
    itc_igst_val = to_money(itc_igst) if itc_igst else Decimal("0")
    itc_rc_cgst_val = to_money(itc_rc_cgst) if itc_rc_cgst else Decimal("0")
    itc_rc_sgst_val = to_money(itc_rc_sgst) if itc_rc_sgst else Decimal("0")
    itc_rc_igst_val = to_money(itc_rc_igst) if itc_rc_igst else Decimal("0")

    itc_reg_cgst = max(Decimal("0"), itc_cgst_val - itc_rc_cgst_val)
    itc_reg_sgst = max(Decimal("0"), itc_sgst_val - itc_rc_sgst_val)
    itc_reg_igst = max(Decimal("0"), itc_igst_val - itc_rc_igst_val)

    taxable_outward = to_money(outward.taxable) if outward else Decimal("0")
    outward_cgst = to_money(outward.cgst) if outward else Decimal("0")
    outward_sgst = to_money(outward.sgst) if outward else Decimal("0")
    outward_igst = to_money(outward.igst) if outward else Decimal("0")
    rc_taxable = to_money(rc.taxable) if rc else Decimal("0")
    rc_cgst = to_money(rc.cgst) if rc else Decimal("0")
    rc_sgst = to_money(rc.sgst) if rc else Decimal("0")
    rc_igst = to_money(rc.igst) if rc else Decimal("0")

    total_cgst = outward_cgst + rc_cgst
    total_sgst = outward_sgst + rc_sgst
    total_igst = outward_igst + rc_igst

    net_cgst = max(Decimal("0"), total_cgst - itc_cgst_val)
    net_sgst = max(Decimal("0"), total_sgst - itc_sgst_val)
    net_igst = max(Decimal("0"), total_igst - itc_igst_val)

    return Gstr9Data(
        financial_year=financial_year,
        gstin=gstin,
        legal_name=legal_name,
        trade_name=trade_name,
        taxable_outward=float(taxable_outward),
        nil_rated_outward=0,
        zero_rated_outward=0,
        reverse_charge_inward=float(rc_taxable),
        total_outward_taxable=float(taxable_outward + rc_taxable),
        total_outward_cgst=float(outward_cgst),
        total_outward_sgst=float(outward_sgst),
        total_outward_igst=float(outward_igst),
        itc_from_purchases_cgst=float(itc_reg_cgst),
        itc_from_purchases_sgst=float(itc_reg_sgst),
        itc_from_purchases_igst=float(itc_reg_igst),
        itc_from_reverse_charge_cgst=float(itc_rc_cgst_val),
        itc_from_reverse_charge_sgst=float(itc_rc_sgst_val),
        itc_from_reverse_charge_igst=float(itc_rc_igst_val),
        total_itc_cgst=float(itc_cgst_val),
        total_itc_sgst=float(itc_sgst_val),
        total_itc_igst=float(itc_igst_val),
        net_cgst_payable=float(net_cgst),
        net_sgst_payable=float(net_sgst),
        net_igst_payable=float(net_igst),
        total_tax_payable=float(net_cgst + net_sgst + net_igst),
    )


# ─── GSTR-4 (Composition Scheme Quarterly Return) ──────────────────────────


def _get_quarter_dates(period: str) -> tuple[str, str]:
    """Convert YYYY-MM to quarter start/end dates.

    Q1: Apr-Jun, Q2: Jul-Sep, Q3: Oct-Dec, Q4: Jan-Mar.
    The period string should be any month within the quarter.
    """
    year, month = period.split("-")
    m = int(month)
    if m in (4, 5, 6):
        return f"{year}-04-01", f"{year}-06-30"
    elif m in (7, 8, 9):
        return f"{year}-07-01", f"{year}-09-30"
    elif m in (10, 11, 12):
        return f"{year}-10-01", f"{year}-12-31"
    else:  # 1, 2, 3
        prev = int(year) - 1
        return f"{prev}-01-01" if m == 1 else f"{year}-01-01", f"{year}-03-31"


@dataclass
class Gstr4Data:
    """GSTR-4 Quarterly Return data for composition dealers."""
    period: str
    gstin: str
    legal_name: str = ""
    trade_name: str = ""
    # Table 3 — Outward supplies (turnover)
    outward_turnover: float = 0
    # Table 5 — Composition tax paid
    composition_tax_rate: float = 0
    composition_tax_payable: float = 0
    # Interest and late fees
    interest: float = 0
    late_fee: float = 0
    # Total payable
    total_payable: float = 0


def generate_gstr4(
    db: Session,
    company_id: str,
    period: str,
    gstin_id: str | None = None,
) -> Gstr4Data:
    """Generate GSTR-4 quarterly return for composition dealers.

    Aggregates outward supply turnover and composition tax paid for the quarter.
    """
    from app.models.accounting import GstRegistration, Ledger
    from app.models.voucher import Voucher, VoucherLine

    start_date, end_date = _get_quarter_dates(period)

    # Get GSTIN
    if gstin_id:
        gst_reg = db.get(GstRegistration, gstin_id)
    else:
        gst_reg = db.query(GstRegistration).filter(
            GstRegistration.company_id == company_id,
            GSTRegistration.is_primary.is_(True),
        ).first()

    if not gst_reg:
        return Gstr4Data(period=period, gstin="")

    gstin = gst_reg.gstin
    legal_name = gst_reg.legal_name or ""
    trade_name = gst_reg.trade_name or ""
    comp_rate = float(gst_reg.composition_rate or 0)

    # Outward supplies: sum of sales voucher line totals in the quarter
    outward_turnover = db.query(
        func.coalesce(func.sum(VoucherLine.line_total), Decimal("0"))
    ).join(
        Voucher, Voucher.id == VoucherLine.voucher_id
    ).filter(
        Voucher.company_id == company_id,
        Voucher.voucher_type == "sales",
        Voucher.voucher_date >= start_date,
        Voucher.voucher_date <= end_date,
    ).scalar()

    # Composition tax paid: sum of credits to composition tax ledger
    comp_tax_paid = db.query(
        func.coalesce(func.sum(VoucherLine.credit), Decimal("0"))
    ).join(
        Ledger, Ledger.id == VoucherLine.ledger_id
    ).filter(
        Ledger.company_id == company_id,
        Ledger.system_code == "SYS_GST_COMPOSITION_TAX",
        VoucherLine.voucher_id.in_(
            db.query(Voucher.id).filter(
                Voucher.company_id == company_id,
                Voucher.voucher_date >= start_date,
                Voucher.voucher_date <= end_date,
            )
        )
    ).scalar()

    outward_val = to_money(outward_turnover) if outward_turnover else Decimal("0")
    comp_tax = to_money(comp_tax_paid) if comp_tax_paid else Decimal("0")

    return Gstr4Data(
        period=period,
        gstin=gstin,
        legal_name=legal_name,
        trade_name=trade_name,
        outward_turnover=float(outward_val),
        composition_tax_rate=comp_rate,
        composition_tax_payable=float(comp_tax),
        total_payable=float(comp_tax),
    )
