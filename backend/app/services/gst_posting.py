"""GST posting service: auto-post GST amounts to GST ledgers.

When a voucher line has GST amounts (CGST/SGST/IGST), this service creates
additional voucher lines that post those amounts to the correct GST ledgers.

For sales (Output):
  - CGST/SGST → CGST Output / SGST Output (credit side, liability)
  - IGST → IGST Output (credit side, liability)

For purchases (Input):
  - CGST/SGST → CGST Input / SGST Input (debit side, asset/ITC)
  - IGST → IGST Input (debit side, asset/ITC)

For RCM purchases:
  - CGST/SGST → RCM CGST Input / RCM SGST Input
  - IGST → RCM IGST Input

All ledger lookups use immutable system_codes (e.g., SYS_GST_OUTPUT_CGST).
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.accounting import Ledger
from app.models.voucher import VoucherLine
from app.services.gst import get_gst_ledger_ids


def post_gst_to_ledgers(
    db: Session,
    company_id: str,
    voucher_id: str,
    lines: list,
) -> None:
    """Create GST ledger postings for a voucher's lines.

    Args:
        db: Database session
        company_id: Company ID for scoping
        voucher_id: The voucher these lines belong to
        lines: List of VoucherLineIn objects (from the request payload)
    """
    gst_ledger_ids = get_gst_ledger_ids(db, company_id)
    if not gst_ledger_ids:
        return

    for line in lines:
        if not line.hsn_sac_id:
            continue

        # Determine taxable amount
        taxable = Decimal(str(line.debit)) if line.debit > 0 else Decimal(str(line.credit))

        # Skip if no GST to post
        if not (line.is_reverse_charge or line.hsn_sac_id):
            continue

        is_debit_line = line.debit > 0

        # Determine which GST ledgers to use (by system_code)
        if line.is_reverse_charge:
            cgst_code = "SYS_RCM_CGST" if not line.is_inter_state else None
            sgst_code = "SYS_RCM_SGST" if not line.is_inter_state else None
            igst_code = "SYS_RCM_IGST" if line.is_inter_state else None
        else:
            if is_debit_line:
                cgst_code = "SYS_GST_INPUT_CGST" if not line.is_inter_state else None
                sgst_code = "SYS_GST_INPUT_SGST" if not line.is_inter_state else None
                igst_code = "SYS_GST_INPUT_IGST" if line.is_inter_state else None
            else:
                cgst_code = "SYS_GST_OUTPUT_CGST" if not line.is_inter_state else None
                sgst_code = "SYS_GST_OUTPUT_SGST" if not line.is_inter_state else None
                igst_code = "SYS_GST_OUTPUT_IGST" if line.is_inter_state else None

        cgst = Decimal(str(line.cgst_amount)) if line.cgst_amount else Decimal("0")
        sgst = Decimal(str(line.sgst_amount)) if line.sgst_amount else Decimal("0")
        igst = Decimal(str(line.igst_amount)) if line.igst_amount else Decimal("0")

        # Post CGST
        if cgst > 0 and cgst_code and cgst_code in gst_ledger_ids:
            ledger_id = gst_ledger_ids[cgst_code]
            db.add(VoucherLine(
                voucher_id=voucher_id,
                ledger_id=ledger_id,
                debit=float(cgst) if is_debit_line else 0,
                credit=0 if is_debit_line else float(cgst),
            ))

        # Post SGST
        if sgst > 0 and sgst_code and sgst_code in gst_ledger_ids:
            ledger_id = gst_ledger_ids[sgst_code]
            db.add(VoucherLine(
                voucher_id=voucher_id,
                ledger_id=ledger_id,
                debit=float(sgst) if is_debit_line else 0,
                credit=0 if is_debit_line else float(sgst),
            ))

        # Post IGST
        if igst > 0 and igst_code and igst_code in gst_ledger_ids:
            ledger_id = gst_ledger_ids[igst_code]
            db.add(VoucherLine(
                voucher_id=voucher_id,
                ledger_id=ledger_id,
                debit=float(igst) if is_debit_line else 0,
                credit=0 if is_debit_line else float(igst),
            ))
