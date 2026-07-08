"""Voucher numbering schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


class VoucherNumberingOut(BaseModel):
    id: str
    voucher_type: str
    prefix: str
    format_template: str
    next_sequence: int
    fy_start_month: int


class VoucherNumberingUpdate(BaseModel):
    prefix: str = Field(..., min_length=1, max_length=20)
    format_template: str = Field(default="{PREFIX}-{YEAR}-{SEQ}", max_length=50)
    fy_start_month: int = Field(default=4, ge=1, le=12)


class VoucherNumberingReset(BaseModel):
    next_sequence: int = Field(default=1, ge=1)
