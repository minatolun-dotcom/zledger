"""Manufacturing schemas: BOM and Production Order."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


# ── BOM ────────────────────────────────────────────────────────────────

class BomLineCreate(BaseModel):
    stock_item_id: str
    quantity: float = Field(..., gt=0)
    rate: float | None = None
    wastage_pct: float = Field(default=0, ge=0, le=100)
    sub_bom_id: str | None = None


class BomLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    stock_item_id: str
    item_name: str | None = None
    quantity: float
    rate: float | None
    wastage_pct: float
    sub_bom_id: str | None = None
    sub_bom_name: str | None = None


class BomCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    finished_item_id: str
    output_qty: float = Field(default=1, gt=0)
    lines: list[BomLineCreate] = Field(default_factory=list)


class BomUpdate(BaseModel):
    name: str | None = None
    finished_item_id: str | None = None
    output_qty: float | None = Field(default=None, gt=0)
    is_active: bool | None = None
    lines: list[BomLineCreate] | None = None


class BomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    finished_item_id: str
    output_qty: float
    is_active: bool
    lines: list[BomLineOut] = []


# ── Production Order ───────────────────────────────────────────────────

class ProductionOrderLineCreate(BaseModel):
    stock_item_id: str
    actual_qty: float = Field(..., ge=0)


class ProductionOrderLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    stock_item_id: str
    item_name: str | None = None
    planned_qty: float
    actual_qty: float
    rate: float
    wastage_pct: float


class ProductionOrderCreate(BaseModel):
    bom_id: str
    order_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    planned_qty: float = Field(..., gt=0)
    narration: str | None = None


class ProductionOrderUpdate(BaseModel):
    order_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    planned_qty: float | None = Field(default=None, gt=0)
    narration: str | None = None


class ProductionOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    bom_id: str
    order_number: str
    order_date: str
    planned_qty: float
    produced_qty: float
    status: str
    narration: str | None
    voucher_id: str | None
    created_by: str | None
    lines: list[ProductionOrderLineOut] = []


class WastageReportItem(BaseModel):
    stock_item_id: str
    item_name: str
    total_planned_qty: float
    total_actual_qty: float
    total_wastage_qty: float
    wastage_pct: float
    bom_count: int
