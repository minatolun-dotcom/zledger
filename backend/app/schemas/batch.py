"""Batch tracking schemas."""
from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class BatchCreate(BaseModel):
    stock_item_id: str
    batch_number: str = Field(..., min_length=1, max_length=100)
    manufacturing_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    expiry_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    quantity: float = Field(default=0, ge=0)


class BatchUpdate(BaseModel):
    batch_number: str | None = Field(default=None, min_length=1, max_length=100)
    manufacturing_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    expiry_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    status: str | None = Field(default=None, pattern=r"^(active|exhausted|expired)$")


class BatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    stock_item_id: str
    item_name: str | None = None
    batch_number: str
    manufacturing_date: str | None
    expiry_date: str | None
    quantity: float
    status: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class BatchLedgerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    batch_id: str
    stock_entry_id: str | None
    production_order_id: str | None
    entry_type: str
    quantity: float
    rate: float
    reference: str | None
    created_at: datetime | None = None


class BatchSummary(BaseModel):
    stock_item_id: str
    item_name: str | None = None
    total_batches: int
    total_quantity: float
    batches: list[BatchOut]


class BatchTraceResult(BaseModel):
    batch_number: str
    stock_item_id: str
    item_name: str | None = None
    current_quantity: float
    status: str
    ledger: list[BatchLedgerOut]


class BatchAllocation(BaseModel):
    """Allocates a specific batch for a material line in production confirmation."""
    stock_item_id: str
    batch_id: str
    quantity: float = Field(..., gt=0)


class SerialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    stock_item_id: str
    item_name: str | None = None
    serial_number: str
    status: str
    stock_entry_id: str | None
    production_order_id: str | None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SerialBulkCreate(BaseModel):
    """Create serial numbers for a serial-tracked item.

    Either pass explicit serial_numbers, or count + optional prefix for
    auto-generated numbers (prefix + zero-padded sequence).
    """
    stock_item_id: str
    serial_numbers: list[str] | None = None
    count: int | None = Field(default=None, gt=0, le=10000)
    prefix: str | None = Field(default=None, max_length=50)


class SerialAllocation(BaseModel):
    """Allocates serial numbers for a serial-tracked material line."""
    stock_item_id: str
    serial_numbers: list[str] = Field(default_factory=list)


class BatchLedgerCreate(BaseModel):
    """Create a ledger entry for a batch."""
    entry_type: str = Field(..., pattern=r"^(inward|outward)$")
    quantity: float = Field(..., gt=0)
    rate: float = Field(default=0, ge=0)
    reference: str | None = None
