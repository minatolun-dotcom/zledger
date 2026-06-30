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
