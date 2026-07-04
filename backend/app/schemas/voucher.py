"""Voucher schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class VoucherLineIn(BaseModel):
    ledger_id: str
    stock_item_id: str | None = None
    quantity: float | None = None
    rate: float | None = None
    discount_pct: float = 0
    discount_amount: float = 0
    debit: float = 0.0
    credit: float = 0.0
    hsn_sac_id: str | None = None
    is_inter_state: bool = False
    is_reverse_charge: bool = False
    is_rate_inclusive: bool = False
    gst_rate: float | None = None
    cost_centre_id: str | None = None


class VoucherCreate(BaseModel):
    voucher_type: str
    voucher_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    narration: str | None = None
    reference: str | None = None
    party_id: str | None = None
    place_of_supply: str | None = None
    document_type: str = "regular"
    counterparty_gstin: str | None = None
    counterparty_state_code: str | None = None
    round_off_to: float | None = None
    due_date: str | None = None
    lines: list[VoucherLineIn] = Field(..., min_length=1)


class VoucherLineOut(BaseModel):
    id: str
    ledger_id: str
    stock_item_id: str | None
    quantity: float | None
    rate: float | None
    discount_pct: float
    discount_amount: float
    line_total: float | None
    debit: float
    credit: float
    taxable_value: float | None
    hsn_sac_id: str | None
    is_inter_state: bool
    is_reverse_charge: bool
    is_rate_inclusive: bool
    cgst_amount: float | None
    sgst_amount: float | None
    igst_amount: float | None
    cost_centre_id: str | None = None


class VoucherOut(BaseModel):
    id: str
    voucher_type: str
    voucher_number: str
    voucher_date: str
    narration: str | None
    reference: str | None
    party_id: str | None
    place_of_supply: str | None
    document_type: str
    counterparty_gstin: str | None
    counterparty_state_code: str | None
    subtotal: float
    discount_total: float
    tax_total: float
    grand_total: float
    round_off_to: float | None = None
    due_date: str | None = None
    cancel_reason: str | None = None
    cancelled_at: str | None = None
    lines: list[VoucherLineOut]


class VoucherCancel(BaseModel):
    reason: str = Field(..., min_length=1, max_length=1024)


class VoucherBulkCancel(BaseModel):
    voucher_ids: list[str] = Field(..., min_length=1, max_length=100)
    reason: str = Field(..., min_length=1, max_length=1024)


class VoucherBulkDelete(BaseModel):
    voucher_ids: list[str] = Field(..., min_length=1, max_length=100)


class VoucherListOut(BaseModel):
    id: str
    voucher_type: str
    voucher_number: str
    voucher_date: str
    narration: str | None
    party_id: str | None
    place_of_supply: str | None
    document_type: str
    counterparty_gstin: str | None
    subtotal: float
    discount_total: float
    tax_total: float
    grand_total: float
    round_off_to: float | None = None
    due_date: str | None = None
    cancel_reason: str | None = None
    cancelled_at: str | None = None
    created_by: str | None = None
