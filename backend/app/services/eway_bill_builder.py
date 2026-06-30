"""E-Way Bill payload builder.

Converts Zledger voucher data into the GSTN E-Way Bill schema format.
E-Way Bill is required for movement of goods exceeding ₹50,000 in value.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

import re

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
    if not address:
        return 0
    match = re.search(r'\b(\d{6})\b', address)
    return int(match.group(1)) if match else 0


def _get_place(address: str | None) -> str:
    """Extract place/city from address (first part before comma)."""
    if not address:
        return "NA"
    parts = address.split(", ", 1)
    return parts[0] or "NA"


def _determine_doc_type(voucher: Voucher) -> str:
    """Map voucher type to E-Way Bill document type."""
    mapping = {
        "sales": "INV",
        "purchase": "INV",
        "credit_note": "DNB",
        "debit_note": "DNB",
        "journal": "INV",
        "receipt": "INV",
        "payment": "INV",
    }
    return mapping.get(voucher.voucher_type, "INV")


def _determine_supply_type(voucher: Voucher) -> tuple[str, str]:
    """Determine supply type and sub-supply type."""
    if voucher.voucher_type == "sales":
        if voucher.place_of_supply and voucher.counterparty_gstin:
            return "O", "0"
        return "O", "0"
    elif voucher.voucher_type == "purchase":
        return "INW", "0"
    return "O", "0"


def build_eway_bill_payload(
    db: Session,
    company_id: str,
    voucher_id: str,
    gstin_id: str,
    transport_mode: str | None = "Road",
    transporter_id: str | None = None,
    transporter_name: str | None = None,
    vehicle_number: str | None = None,
    distance_km: int = 0,
) -> dict[str, Any]:
    """Build complete E-Way Bill payload from voucher and company data.

    Returns a dict matching GSTN E-Way Bill schema.
    """
    voucher = db.get(Voucher, voucher_id)
    if not voucher or voucher.company_id != company_id:
        raise ValueError(f"Voucher {voucher_id} not found for company {company_id}")

    gst_reg = db.get(GstRegistration, gstin_id)
    if not gst_reg or gst_reg.company_id != company_id:
        raise ValueError(f"GST registration {gstin_id} not found for company {company_id}")

    # Fetch party
    party = None
    if voucher.party_id:
        party = db.get(Party, voucher.party_id)

    # Load voucher lines with HSN codes
    voucher_lines = db.query(VoucherLine).filter(VoucherLine.voucher_id == voucher_id).all()
    hsn_code = None
    item_desc = None
    total_quantity = 0.0
    unit = "NOS"

    for line in voucher_lines:
        if line.hsn_sac_id:
            hsn = db.get(HsnSac, line.hsn_sac_id)
            if hsn:
                hsn_code = hsn.code
                item_desc = hsn.description
        if line.quantity:
            total_quantity += float(line.quantity)

    # Calculate totals
    total_taxable = Decimal("0")
    total_cgst = Decimal("0")
    total_sgst = Decimal("0")
    total_igst = Decimal("0")

    for line in voucher_lines:
        taxable = Decimal(str(line.taxable_value or (float(line.debit or line.credit))))
        total_taxable += taxable
        total_cgst += Decimal(str(line.cgst_amount or 0))
        total_sgst += Decimal(str(line.sgst_amount or 0))
        total_igst += Decimal(str(line.igst_amount or 0))

    total_value = total_taxable + total_cgst + total_sgst + total_igst

    supply_type, sub_supply_type = _determine_supply_type(voucher)

    payload = {
        "supplyType": supply_type,
        "subSupplyType": sub_supply_type,
        "docType": _determine_doc_type(voucher),
        "docNo": voucher.voucher_number,
        "docDate": _format_date_gstn(voucher.voucher_date),
        "fromGstin": gst_reg.gstin,
        "fromTrdName": gst_reg.legal_name,
        "fromAddr1": (gst_reg.address or "NA").split(", ", 1)[0],
        "fromAddr2": (gst_reg.address or "").split(", ", 1)[-1] if "," in (gst_reg.address or "") else "",
        "fromPlace": _get_place(gst_reg.address),
        "fromStateCode": gst_reg.state_code,
        "fromPincode": _get_pin_code(gst_reg.address),
        "toGstin": voucher.counterparty_gstin or (party.gstin if party else None) or "",
        "toTrdName": party.name if party else "",
        "toAddr1": (party.address if party else "NA") or "NA",
        "toAddr2": "",
        "toPlace": _get_place(party.address if party else None),
        "toStateCode": voucher.counterparty_state_code or (party.state_code if party else "00") or "00",
        "toPincode": _get_pin_code(party.address if party else None),
        "hsnCode": hsn_code or "",
        "hsnDesc": item_desc or "",
        "uqc": unit,
        "qty": total_quantity or 1,
        "taxableAmount": float(total_taxable),
        "cgstAmount": float(total_cgst),
        "sgstAmount": float(total_sgst),
        "igstAmount": float(total_igst),
        "cessAmount": 0,
        "totInvValue": float(total_value),
        "transportMode": transport_mode or "Road",
        "transporterId": transporter_id or "",
        "transporterName": transporter_name or "",
        "transportDocNo": "",
        "transportDocDate": "",
        "vehicleNo": vehicle_number or "",
        "vehicleType": "R",
        "distanceKm": distance_km,
    }

    return payload
