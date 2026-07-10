"""Inventory schemas."""
from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StockGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class StockGroupOut(BaseModel):
    id: str
    company_id: str
    name: str
    description: str | None
    is_active: bool


class StockItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    stock_group_id: str | None = None
    sku: str | None = None
    hsn_sac_code: str | None = None
    unit_of_measure: str = "Nos"
    opening_qty: float = 0
    opening_rate: float = 0
    valuation_method: str = "weighted_avg"
    gst_rate: float = 0
    reorder_level: float = 0

    @field_validator("hsn_sac_code")
    @classmethod
    def validate_hsn(cls, v):
        if v is None or v == "":
            return None
        v = v.strip()
        if not re.match(r"^\d{4,8}$", v):
            raise ValueError("HSN/SAC code must be 4-8 digits")
        return v


class StockItemOut(BaseModel):
    id: str
    company_id: str
    stock_group_id: str | None
    name: str
    sku: str | None
    hsn_sac_code: str | None
    unit_of_measure: str
    opening_qty: float
    opening_rate: float
    valuation_method: str
    gst_rate: float
    is_active: bool
    reorder_level: float = 0


class StockEntryCreate(BaseModel):
    stock_item_id: str
    entry_type: str = Field(..., pattern=r"^(inward|outward)$")
    quantity: float = Field(..., gt=0)
    rate: float = Field(..., ge=0)
    entry_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    reference: str | None = None
    narration: str | None = None
    voucher_id: str | None = None


class StockEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    stock_item_id: str
    entry_type: str
    quantity: float
    rate: float
    total_amount: float
    entry_date: str
    reference: str | None
    narration: str | None
    voucher_id: str | None
