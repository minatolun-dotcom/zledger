"""E-Invoice payload builder.

Converts Zledger voucher data into the GSTN e-invoice v1.1 schema format
for submission to the Invoice Registration Portal (IRP).

Key mappings:
- Voucher → DocDtls
- Company/GstRegistration → SellerDtls
- Party → BuyerDtls
- VoucherLine[] → ItemList[]
- Financial totals → ValDtls
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.models.accounting import GstRegistration, HsnSac, Party
from app.models.user import Company
from app.models.voucher import Voucher, VoucherLine


def _format_date_gstn(iso_date: str) -> str:
    """Convert YYYY-MM-DD to DD/MM/YYYY as required by GSTN."""
    parts = iso_date.split("-")
    if len(parts) != 3:
        raise ValueError(f"Invalid date format: {iso_date}")
    return f"{parts[2]}/{parts[1]}/{parts[0]}"


def _get_pin_code(address: str | None) -> int:
    """Extract 6-digit PIN code from address string."""
    import re
    if not address:
        return 0
    match = re.search(r'\b(\d{6})\b', address)
    return int(match.group(1)) if match else 0


def _get_state_name(code: str) -> str:
    """Map 2-digit GST state code to name."""
    states = {
        "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
        "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
        "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
        "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
        "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
        "16": "Tripura", "17": "Meghalaya", "18": "Assam",
        "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
        "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
        "25": "Daman & Diu", "26": "Dadra & Nagar Haveli",
        "27": "Maharashtra", "28": "Andhra Pradesh (Old)",
        "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
        "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
        "35": "Andaman & Nicobar Islands", "36": "Telangana",
        "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory",
    }
    return states.get(code, "Other Territory")


def _determine_doc_type(voucher: Voucher) -> str:
    """Map voucher type to GSTN document type."""
    mapping = {
        "sales": "INV",
        "purchase": "INV",
        "journal": "INV",
        "receipt": "CRN",
        "payment": "DRN",
    }
    return mapping.get(voucher.voucher_type, "INV")


def _determine_supply_type(voucher: Voucher) -> str:
    """Determine supply type (B2B, SEZ, EXP, etc.)."""
    if voucher.voucher_type in ("sales", "purchase"):
        if voucher.counterparty_gstin:
            return "B2B"
        return "B2C"
    return "B2B"


def build_seller_dtls(
    gst_reg: GstRegistration,
) -> dict[str, Any]:
    """Build SellerDtls section from company GST registration."""
    addr1 = (gst_reg.address or "NA").split(", ", 1)[0]
    loc = addr1 or "NA"

    return {
        "Gstin": gst_reg.gstin,
        "LglNm": gst_reg.legal_name,
        "TrdNm": gst_reg.trade_name or gst_reg.legal_name,
        "Addr1": addr1,
        "Addr2": (gst_reg.address or "").split(", ", 1)[-1] if "," in (gst_reg.address or "") else "",
        "Loc": loc,
        "Pin": _get_pin_code(gst_reg.address),
        "Stcd": gst_reg.state_code,
        "Ph": "",
        "Em": "",
    }


def build_buyer_dtls(
    party: Party | None,
    counterparty_gstin: str | None,
    counterparty_state_code: str | None,
    place_of_supply: str | None,
) -> dict[str, Any]:
    """Build BuyerDtls section from party data or voucher compliance fields."""
    if not party and not counterparty_gstin:
        raise ValueError("E-Invoice requires a buyer with GSTIN (B2B)")

    gstin = counterparty_gstin or (party.gstin if party else None)
    if not gstin:
        raise ValueError("E-Invoice requires buyer GSTIN")

    party_name = party.name if party else "B2B Customer"
    addr1 = (party.address if party else "NA") or "NA"
    loc = addr1.split(", ", 1)[0]
    state_code = counterparty_state_code or (party.state_code if party else None) or "00"
    pin = _get_pin_code(party.address if party else None)

    return {
        "Gstin": gstin,
        "LglNm": party_name,
        "TrdNm": party_name,
        "Addr1": addr1.split(", ", 1)[0],
        "Addr2": addr1.split(", ", 1)[-1] if "," in addr1 else "",
        "Loc": loc,
        "Pin": pin,
        "Stcd": state_code,
        "Pos": place_of_supply or state_code,
        "Ph": party.phone if party else "",
        "Em": party.email if party else "",
    }


def build_item_list(
    voucher_lines: list[VoucherLine],
) -> list[dict[str, Any]]:
    """Build ItemList from voucher lines with GST details."""
    items = []
    for idx, line in enumerate(voucher_lines, start=1):
        taxable = line.taxable_value if line.taxable_value else float(line.debit or line.credit)

        # Fetch HSN code if available
        hsn_code = "998314"  # Default SAC for IT services
        is_service = "Y"
        if line.hsn_sac_id:
            # Note: HsnSac is loaded via relationship or direct query
            hsn_code = getattr(line, '_hsn_code', None) or "998314"

        item = {
            "SlNo": str(idx),
            "PrdDesc": f"Item {idx}",
            "IsServc": is_service,
            "HsnCd": hsn_code,
            "Qty": 1,
            "Unit": "OTH",
            "UnitPrice": taxable,
            "TotAmt": taxable,
            "AssAmt": taxable,
            "GstRt": 18.0,
            "IgstAmt": float(line.igst_amount or 0),
            "CgstAmt": float(line.cgst_rate if hasattr(line, 'cgst_rate') else 0),
            "SgstAmt": float(line.sgst_amount or 0),
            "TotItemVal": taxable + float(line.cgst_amount or 0) + float(line.sgst_amount or 0) + float(line.igst_amount or 0),
        }
        items.append(item)

    return items


def build_einvoice_payload(
    db: Session,
    company_id: str,
    voucher_id: str,
    gstin_id: str,
) -> dict[str, Any]:
    """Build complete e-invoice payload from voucher and company data.

    Returns a dict matching GSTN e-invoice v1.1 schema.
    """
    voucher = db.get(Voucher, voucher_id)
    if not voucher or voucher.company_id != company_id:
        raise ValueError(f"Voucher {voucher_id} not found for company {company_id}")

    if not voucher.counterparty_gstin:
        raise ValueError("E-Invoice requires a B2B voucher with counterparty GSTIN")

    gst_reg = db.get(GstRegistration, gstin_id)
    if not gst_reg or gst_reg.company_id != company_id:
        raise ValueError(f"GST registration {gstin_id} not found for company {company_id}")

    # Fetch party
    party = None
    if voucher.counterparty_gstin:
        party = db.query(Party).filter(
            Party.company_id == company_id,
            Party.gstin == voucher.counterparty_gstin,
        ).first()

    # Load HSN codes for lines
    voucher_lines = db.query(VoucherLine).filter(VoucherLine.voucher_id == voucher_id).all()
    for line in voucher_lines:
        if line.hsn_sac_id:
            hsn = db.get(HsnSac, line.hsn_sac_id)
            if hsn:
                line._hsn_code = hsn.code

    # Calculate totals
    total_assessed = Decimal("0")
    total_cgst = Decimal("0")
    total_sgst = Decimal("0")
    total_igst = Decimal("0")

    for line in voucher_lines:
        taxable = Decimal(str(line.taxable_value or (float(line.debit or line.credit))))
        total_assessed += taxable
        total_cgst += Decimal(str(line.cgst_amount or 0))
        total_sgst += Decimal(str(line.sgst_amount or 0))
        total_igst += Decimal(str(line.igst_amount or 0))

    total_inv_value = total_assessed + total_cgst + total_sgst + total_igst

    items = build_item_list(voucher_lines)

    payload = {
        "Version": "1.1",
        "TranDtls": {
            "TaxSch": "GST",
            "SupTyp": _determine_supply_type(voucher),
            "RegRev": "N",
            "IgstOnIntra": "N",
        },
        "DocDtls": {
            "Typ": _determine_doc_type(voucher),
            "No": voucher.voucher_number,
            "Dt": _format_date_gstn(voucher.voucher_date),
        },
        "SellerDtls": build_seller_dtls(gst_reg),
        "BuyerDtls": build_buyer_dtls(
            party, voucher.counterparty_gstin,
            voucher.counterparty_state_code, voucher.place_of_supply,
        ),
        "ItemList": items,
        "ValDtls": {
            "AssVal": float(total_assessed),
            "CgstVal": float(total_cgst),
            "SgstVal": float(total_sgst),
            "IgstVal": float(total_igst),
            "CessVal": 0,
            "StOthChrg": 0,
            "RndOffAmt": 0,
            "TotInvVal": float(total_inv_value),
        },
    }

    # Add RCM flag if applicable
    if any(line.is_reverse_charge for line in voucher_lines):
        payload["TranDtls"]["RegRev"] = "Y"

    return payload
