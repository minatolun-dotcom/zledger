"""E-Way Bill schemas."""
from __future__ import annotations

from pydantic import BaseModel


class EwayBillGenerateRequest(BaseModel):
    voucher_id: str
    gstin_id: str
    transport_mode: str | None = "Road"
    transporter_id: str | None = None
    transporter_name: str | None = None
    vehicle_number: str | None = None
    distance_km: int = 0


class EwayBillCancelRequest(BaseModel):
    cancel_reason: str  # 1=Duplicate, 2=Data Entry, 3=Order Cancelled, 4=Other
    cancel_remark: str


class EwayBillVehicleUpdateRequest(BaseModel):
    vehicle_number: str
    transport_mode: str | None = "Road"
    transporter_id: str | None = None
    transporter_name: str | None = None
    from_place: str | None = None
    from_state: str | None = None
    to_place: str | None = None
    to_state: str | None = None


class EwayBillOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    voucher_id: str
    gstin_id: str
    eway_bill_number: str | None
    eway_bill_date: str | None
    valid_until: str | None
    irn: str | None
    supply_type: str
    sub_supply_type: str
    document_type: str
    document_number: str | None
    document_date: str | None
    from_gstin: str | None
    from_trd_name: str | None
    from_state: str | None
    to_gstin: str | None
    to_trd_name: str | None
    to_state: str | None
    hsn_code: str | None
    item_description: str | None
    quantity: float | None
    unit: str | None
    taxable_amount: float
    cgst_amount: float
    sgst_amount: float
    igst_amount: float
    cess_amount: float
    total_value: float
    transport_mode: str | None
    transporter_id: str | None
    transporter_name: str | None
    transport_doc_number: str | None
    transport_doc_date: str | None
    vehicle_number: str | None
    vehicle_type: str | None
    distance_km: int
    status: str
    error_message: str | None
    generated_at: str | None
    cancelled_at: str | None
    cancel_reason: str | None
    cancel_remark: str | None
    created_at: str | None


class EwayBillListOut(BaseModel):
    id: str
    voucher_id: str
    voucher_number: str | None
    gstin: str | None
    eway_bill_number: str | None
    eway_bill_date: str | None
    valid_until: str | None
    vehicle_number: str | None
    status: str
    total_value: float
    error_message: str | None
    created_at: str | None
