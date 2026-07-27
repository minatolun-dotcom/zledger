"""Compliance API schemas (Ind-AS / Income Tax / ICAI NCE / GST status)."""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class RegimeElection(BaseModel):
    regime: str = Field(..., pattern="^(old|new)$")
    financial_year: str
    presumptive_section: str | None = Field(default=None, pattern="^(44AD|44ADA|44AE)$")
    vehicle_count: int | None = Field(default=None, ge=1, description="44AE: number of heavy goods vehicles")
    months_used: int | None = Field(default=None, ge=1, le=12, description="44AE: months vehicle used (1-12)")


class IncomeTaxResponse(BaseModel):
    regime: str
    financial_year: str
    gross_receipts: str
    business_profit: str
    presumptive_section: str | None
    taxable_income: str
    tax: str
    surcharge: str
    cess: str
    total_tax: str
    rebate_87a: str = "0"
    notes: list[str] = []


class ScheduleIIIResponse(BaseModel):
    financial_year: str
    part_i: dict[str, Any]
    part_ii: dict[str, Any]
    total_equity_liabilities: Decimal
    total_assets: Decimal
    balanced: bool


class IndASPLResponse(BaseModel):
    financial_year: str
    revenue_from_operations: Decimal
    other_income: Decimal
    total_income: Decimal
    expenses: dict[str, Any]
    total_expenses: Decimal
    net_profit: Decimal
    is_profit: bool


class IcaiNceResponse(BaseModel):
    balance_sheet: dict[str, Any]
    profit_and_loss: dict[str, Any]
    notes: dict[str, Any]


class GstStatusResponse(BaseModel):
    financial_year: str
    returns: dict[str, Any]


class TimingDifference(BaseModel):
    description: str
    accounting_amount: float
    tax_amount: float
    difference: float
    type: str


class DeferredTaxResponse(BaseModel):
    deferred_tax_asset: str
    deferred_tax_liability: str
    net_dta: str
    net_dtl: str
    timing_differences: list[TimingDifference]
    notes: list[str]


class GratuityResponse(BaseModel):
    present_value_obligation: str
    current_service_cost: str
    interest_cost: str
    actuarial_gain_loss: str
    provision_opening: str
    provision_closing: str
    expense_recognized: str
    assumptions: dict[str, Any]
    notes: list[str]


class ComplianceReportOut(BaseModel):
    id: str
    company_id: str
    report_type: str
    regime: str | None = None
    financial_year: str | None = None
    format: str = "json"
