"""Pydantic schemas for the Fixed Asset Register."""
from __future__ import annotations

from pydantic import BaseModel, Field


class AssetCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    depreciation_method: str = Field("wdv", pattern=r"^(wdv|slm)$")
    rate_pct: float = Field(0, ge=0, le=100)
    useful_life_years: int | None = Field(None, ge=1, le=100)
    schedule_ii_class: str | None = Field(None, description="Schedule II asset class for auto-rate computation")
    is_active: bool = True


class AssetCategoryOut(BaseModel):
    id: str
    name: str
    depreciation_method: str
    rate_pct: float
    useful_life_years: int | None
    schedule_ii_class: str | None
    is_active: bool


class AssetRegisterCreate(BaseModel):
    category_id: str
    asset_code: str | None = None
    name: str = Field(..., min_length=1, max_length=255)
    purchase_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    cost: float = Field(0, ge=0)
    salvage_value: float = Field(0, ge=0)
    put_to_use_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    is_active: bool = True


class AssetCategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    depreciation_method: str | None = Field(None, pattern=r"^(wdv|slm)$")
    rate_pct: float | None = Field(None, ge=0, le=100)
    useful_life_years: int | None = Field(None, ge=1, le=100)
    schedule_ii_class: str | None = None
    is_active: bool | None = None


class AssetRegisterUpdate(BaseModel):
    category_id: str | None = None
    asset_code: str | None = None
    name: str | None = Field(None, min_length=1, max_length=255)
    purchase_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    cost: float | None = Field(None, ge=0)
    salvage_value: float | None = Field(None, ge=0)
    put_to_use_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    is_active: bool | None = None


class AssetRegisterOut(BaseModel):
    id: str
    category_id: str
    asset_code: str | None
    name: str
    purchase_date: str
    cost: float
    salvage_value: float
    accumulated_depreciation: float
    wdv: float
    put_to_use_date: str | None
    is_active: bool


class DepreciationScheduleLine(BaseModel):
    asset_id: str
    asset_code: str | None
    name: str
    category: str
    method: str
    opening_wdv: float
    depreciation: float
    closing_wdv: float


class DepreciationScheduleResponse(BaseModel):
    financial_year_id: str
    total_depreciation: float
    lines: list[DepreciationScheduleLine]


class DepreciationRunRequest(BaseModel):
    financial_year_id: str
    force: bool = False


class DepreciationRunResponse(BaseModel):
    financial_year_id: str
    voucher_id: str | None
    total_depreciation: float
    lines: list[DepreciationScheduleLine]
    message: str


class AssetDisposalRequest(BaseModel):
    disposal_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    disposal_amount: float = Field(..., ge=0)


class AssetDisposalOut(BaseModel):
    id: str
    name: str
    asset_status: str
    disposal_date: str | None
    disposal_amount: float | None
    disposal_pnl: float | None
