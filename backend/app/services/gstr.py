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
