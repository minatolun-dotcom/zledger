"""E-Invoice schemas for API request/response models."""
from __future__ import annotations

from pydantic import BaseModel, Field


class EInvoiceGenerateRequest(BaseModel):
    """Request to generate an IRN for a voucher."""
    voucher_id: str
    gstin_id: str = Field(..., description="GST registration ID for the seller")


class EInvoiceCancelRequest(BaseModel):
    """Request to cancel an IRN."""
    cancel_reason: str = Field(
        ...,
        min_length=1,
        max_length=1,
        description="1=Duplicate, 2=Data Entry Mistake, 3=Order Cancelled, 4=Other",
    )
    cancel_remark: str = Field(..., min_length=1, max_length=255)


class EInvoiceOut(BaseModel):
    """E-Invoice response model."""
    id: str
    voucher_id: str
    gstin_id: str
    irn: str | None = None
    ack_no: str | None = None
    ack_dt: str | None = None
    signed_qr_code: str | None = None
    signed_invoice: str | None = None
    status: str
    error_message: str | None = None
    submitted_at: str | None = None
    generated_at: str | None = None
    cancelled_at: str | None = None
    cancel_reason: str | None = None
    cancel_remark: str | None = None
    created_at: str | None = None

    model_config = {"from_attributes": True}


class EInvoiceListOut(BaseModel):
    """E-Invoice list item (lighter payload)."""
    id: str
    voucher_id: str
    voucher_number: str | None = None
    gstin: str | None = None
    irn: str | None = None
    ack_no: str | None = None
    status: str
    error_message: str | None = None
    created_at: str | None = None
