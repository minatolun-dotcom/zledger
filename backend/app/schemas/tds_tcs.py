"""TDS/TCS schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


class TdsTcsSectionCreate(BaseModel):
    section_code: str = Field(..., min_length=1, max_length=10)
    section_name: str = Field(..., min_length=1, max_length=255)
    tds_tcs_type: str = Field(..., pattern=r"^(tds|tcs)$")
    rate: float = Field(..., gt=0, le=100)
    threshold_limit: float = Field(default=0, ge=0)


class TdsTcsSectionOut(BaseModel):
    id: str
    company_id: str
    section_code: str
    section_name: str
    tds_tcs_type: str
    rate: float
    threshold_limit: float
    is_active: bool
    created_at: str | None = None


class TdsTcsEntryCreate(BaseModel):
    voucher_id: str
    party_id: str | None = None
    section_id: str
    base_amount: float = Field(..., gt=0)
    entry_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")


class TdsTcsEntryOut(BaseModel):
    id: str
    company_id: str
    voucher_id: str
    party_id: str | None = None
    section_id: str
    tds_tcs_type: str
    base_amount: float
    rate: float
    deducted_amount: float
    entry_date: str
    status: str
    challan_number: str | None = None
    deposition_date: str | None = None
    created_at: str | None = None
    # Enriched
    section_code: str | None = None
    section_name: str | None = None
    party_name: str | None = None
    voucher_number: str | None = None


class TdsTcsDeposit(BaseModel):
    """Mark entries as deposited with challan details."""
    entry_ids: list[str] = Field(..., min_length=1)
    challan_number: str = Field(..., min_length=1, max_length=50)
    deposition_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")


class TdsTcsReturnCreate(BaseModel):
    return_type: str = Field(..., pattern=r"^(tds|tcs)$")
    quarter: str = Field(..., pattern=r"^Q[1-4]$")
    financial_year: str = Field(..., min_length=7, max_length=9)  # e.g., 2025-26


class TdsTcsReturnOut(BaseModel):
    id: str
    company_id: str
    return_type: str
    quarter: str
    financial_year: str
    status: str
    total_entries: int
    total_amount: float
    total_tax: float
    filing_date: str | None = None
    ack_number: str | None = None
    created_at: str | None = None


class TdsTcsReturnFile(BaseModel):
    """Mark a return as filed."""
    ack_number: str = Field(..., min_length=1, max_length=50)
    filing_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
