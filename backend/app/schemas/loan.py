"""Pydantic schemas for Loans & Advances API."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator


# ── Loan ─────────────────────────────────────────────────────────────────

class LoanCreate(BaseModel):
    loan_type: str = Field(..., pattern=r"^(given|taken|employee_advance)$")
    party_name: str = Field(..., min_length=1, max_length=255)
    party_ledger_id: str | None = None
    principal_amount: float = Field(..., gt=0)
    interest_rate: float = Field(0, ge=0, le=100)
    interest_type: str = Field("none", pattern=r"^(simple|compound|none)$")
    disbursement_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    due_date: str | None = None
    emi_amount: float = Field(0, ge=0)
    tenure_months: int | None = None
    bank_ledger_id: str = Field(..., min_length=1)
    notes: str | None = None


class LoanUpdate(BaseModel):
    party_name: str | None = None
    party_ledger_id: str | None = None
    interest_rate: float | None = None
    interest_type: str | None = None
    due_date: str | None = None
    emi_amount: float | None = None
    tenure_months: int | None = None
    status: str | None = None
    notes: str | None = None


class LoanOut(BaseModel):
    id: str
    company_id: str
    loan_type: str
    party_name: str
    party_ledger_id: str | None = None
    loan_ledger_id: str | None = None
    principal_amount: float
    interest_rate: float
    interest_type: str
    disbursement_date: str
    due_date: str | None = None
    emi_amount: float
    tenure_months: int | None = None
    status: str
    outstanding_balance: float
    accrued_interest: float
    disbursement_voucher_id: str | None = None
    notes: str | None = None
    created_at: str = ""
    updated_at: str = ""

    model_config = {"from_attributes": True}

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _dt_to_str(cls, v: str | datetime) -> str:
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)


# ── Loan Payment ─────────────────────────────────────────────────────────

class LoanPaymentCreate(BaseModel):
    payment_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    total_amount: float = Field(..., gt=0)
    interest_portion: float | None = None
    is_manual_interest: bool = False
    bank_ledger_id: str = Field(..., min_length=1)
    notes: str | None = None


class LoanPaymentOut(BaseModel):
    id: str
    loan_id: str
    company_id: str
    payment_date: str
    total_amount: float
    interest_portion: float
    principal_portion: float
    is_manual_interest: bool
    voucher_id: str | None = None
    notes: str | None = None
    created_at: str = ""

    model_config = {"from_attributes": True}

    @field_validator("created_at", mode="before")
    @classmethod
    def _dt_to_str(cls, v: str | datetime) -> str:
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)


# ── Summary ──────────────────────────────────────────────────────────────

class LoanSummary(BaseModel):
    total_given: float
    total_taken: float
    total_advances: float
    outstanding_given: float
    outstanding_taken: float
    outstanding_advances: float
    overdue_count: int
    accrued_interest_income: float
    accrued_interest_expense: float


# ── List response ────────────────────────────────────────────────────────

class LoanListResponse(BaseModel):
    items: list[LoanOut]
    total: int
