"""Voucher schemas."""
from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from decimal import Decimal


class VoucherLineIn(BaseModel):
    ledger_id: str | None = None
    stock_item_id: str | None = None
    quantity: Decimal | None = None
    rate: Decimal | None = None
    discount_pct: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    debit: Decimal = Decimal("0")
    credit: Decimal = Decimal("0")
    hsn_sac_id: str | None = None
    is_inter_state: bool = False
    is_reverse_charge: bool = False
    is_rate_inclusive: bool = False
    gst_rate: Decimal | None = None
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
    round_off_to: Decimal | None = None
    due_date: str | None = None
    status: str = Field("posted", pattern=r"^(draft|posted)$", description="draft = saved but not yet posted (excluded from reports); posted = affects the books")
    lines: list[VoucherLineIn] = Field(..., min_length=1)

    @field_validator("counterparty_gstin")
    @classmethod
    def validate_counterparty_gstin(cls, v):
        if v is None or v == "":
            return None
        v = v.strip()
        if not re.match(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{3}$", v):
            raise ValueError("Invalid counterparty GSTIN format")
        return v


class VoucherLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    ledger_id: str
    ledger_name: str | None = None
    stock_item_id: str | None
    quantity: Decimal | None
    rate: Decimal | None
    discount_pct: Decimal
    discount_amount: Decimal
    line_total: Decimal | None
    debit: Decimal
    credit: Decimal
    taxable_value: Decimal | None
    hsn_sac_id: str | None
    is_inter_state: bool
    is_reverse_charge: bool
    is_rate_inclusive: bool
    cgst_amount: Decimal | None
    sgst_amount: Decimal | None
    igst_amount: Decimal | None
    cost_centre_id: str | None = None


class VoucherOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    grand_total: Decimal
    round_off_to: Decimal | None = None
    due_date: str | None = None
    status: str = "posted"
    approval_status: str | None = None
    original_voucher_id: str | None = None
    reversed_by_voucher_id: str | None = None
    cancel_reason: str | None = None
    cancelled_at: str | None = None
    lines: list[VoucherLineOut]


class VoucherApprove(BaseModel):
    reason: str | None = Field(None, max_length=1024)


class VoucherCancel(BaseModel):
    reason: str = Field(..., min_length=1, max_length=1024)


class VoucherBulkCancel(BaseModel):
    voucher_ids: list[str] = Field(..., min_length=1, max_length=100)
    reason: str = Field(..., min_length=1, max_length=1024)


class VoucherBulkDelete(BaseModel):
    voucher_ids: list[str] = Field(..., min_length=1, max_length=100)


class VoucherListOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    voucher_type: str
    voucher_number: str
    voucher_date: str
    narration: str | None
    party_id: str | None
    party_name: str | None = None
    ledger_names: list[str] = []
    place_of_supply: str | None
    document_type: str
    counterparty_gstin: str | None
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    grand_total: Decimal
    round_off_to: Decimal | None = None
    due_date: str | None = None
    status: str = "posted"
    approval_status: str | None = None
    original_voucher_id: str | None = None
    reversed_by_voucher_id: str | None = None
    cancel_reason: str | None = None
    cancelled_at: str | None = None
    created_by: str | None = None
