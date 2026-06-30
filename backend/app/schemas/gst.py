"""GST schemas for HSN/SAC and GST Registration."""
from __future__ import annotations

from pydantic import BaseModel, Field


class HsnSacCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=20)
    description: str = Field(..., min_length=1, max_length=512)
    gst_rate: float = Field(..., ge=0, le=100)
    code_type: str = "hsn"


class HsnSacOut(BaseModel):
    id: str
    code: str
    description: str
    gst_rate: float
    code_type: str
    is_active: bool


class GstRegistrationCreate(BaseModel):
    gstin: str = Field(..., min_length=15, max_length=15)
    legal_name: str = Field(..., min_length=1, max_length=255)
    trade_name: str | None = None
    state_code: str = Field(..., min_length=2, max_length=2)
    pan: str | None = None
    address: str | None = None
    is_primary: bool = False


class GstRegistrationOut(BaseModel):
    id: str
    gstin: str
    legal_name: str
    trade_name: str | None
    state_code: str
    pan: str | None
    address: str | None
    is_primary: bool
    is_active: bool


class GstCalculationRequest(BaseModel):
    """Request for GST calculation on a voucher line."""
    amount: float = Field(..., gt=0)
    hsn_sac_id: str
    is_inter_state: bool = False  # True for IGST, False for CGST+SGST
    is_reverse_charge: bool = False


class GstCalculationResponse(BaseModel):
    """Response with GST breakdown."""
    taxable_amount: float
    cgst_rate: float
    cgst_amount: float
    sgst_rate: float
    sgst_amount: float
    igst_rate: float
    igst_amount: float
    total_tax: float
    total_amount: float
    hsn_sac_code: str
    gst_rate: float
    is_reverse_charge: bool
    # RCM ledger names for voucher posting
    cgst_ledger_name: str | None = None
    sgst_ledger_name: str | None = None
    igst_ledger_name: str | None = None


# ─── GST Returns ─────────────────────────────────────────────────────────────


class GstReturnGenerateRequest(BaseModel):
    """Request to generate a GST return."""
    return_type: str = Field(..., pattern=r"^(gstr1|gstr3b)$")
    period: str = Field(..., pattern=r"^\d{4}-\d{2}$")  # YYYY-MM
    gstin_id: str | None = None  # Use specific GSTIN, or primary


class GstReturnOut(BaseModel):
    """GST return listing."""
    id: str
    return_type: str
    period: str
    status: str
    gstin: str | None
    filed_date: str | None
    ack_number: str | None


class GstReturnDetail(GstReturnOut):
    """GST return with full data."""
    data_json: dict | None = None


class B2BInvoiceOut(BaseModel):
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


class B2CSInvoiceOut(BaseModel):
    place_of_supply: str
    rate: float
    taxable_value: float
    cgst: float
    sgst: float
    igst: float


class HsnSummaryOut(BaseModel):
    hsn_code: str
    description: str
    uom: str
    taxable_value: float
    cgst: float
    sgst: float
    igst: float
    total_value: float


class Gstr1Response(BaseModel):
    period: str
    gstin: str
    b2b: list[B2BInvoiceOut]
    b2cs: list[B2CSInvoiceOut]
    hsn: list[HsnSummaryOut]
    total_b2b_taxable: float
    total_b2cs_taxable: float
    total_cgst: float
    total_sgst: float
    total_igst: float


class Gstr3bResponse(BaseModel):
    period: str
    gstin: str
    taxable_value: float
    cgst_payable: float
    sgst_payable: float
    igst_payable: float
    reverse_charge_taxable: float
    reverse_charge_cgst: float
    reverse_charge_sgst: float
    reverse_charge_igst: float
    itc_cgst: float
    itc_sgst: float
    itc_igst: float