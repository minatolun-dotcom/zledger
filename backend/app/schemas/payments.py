"""Payment allocation schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


class PaymentAllocationOut(BaseModel):
    id: str
    invoice_voucher_id: str
    payment_voucher_id: str
    amount: float
    allocation_date: str
    remarks: str | None = None
    created_at: str | None = None


class PaymentAllocateRequest(BaseModel):
    invoice_voucher_id: str
    payment_voucher_id: str
    amount: float = Field(..., gt=0)
    allocation_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    remarks: str | None = None


class ReceivableLine(BaseModel):
    voucher_id: str
    voucher_number: str
    voucher_date: str
    due_date: str | None = None
    party_id: str | None = None
    party_name: str | None = None
    grand_total: float = 0
    paid_amount: float = 0
    unpaid_amount: float = 0
    days_overdue: int = 0
    aging_bucket: str = "current"


class PayableLine(BaseModel):
    voucher_id: str
    voucher_number: str
    voucher_date: str
    due_date: str | None = None
    party_id: str | None = None
    party_name: str | None = None
    grand_total: float = 0
    paid_amount: float = 0
    unpaid_amount: float = 0
    days_overdue: int = 0
    aging_bucket: str = "current"


class ReceivablesResponse(BaseModel):
    items: list[ReceivableLine]
    total_unpaid: float = 0
    total_overdue: float = 0
    overdue_count: int = 0


class PayablesResponse(BaseModel):
    items: list[PayableLine]
    total_unpaid: float = 0
    total_overdue: float = 0
    overdue_count: int = 0
