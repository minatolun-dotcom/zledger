"""Chart of Accounts schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


class FinancialYearCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=20)
    start_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")


class FinancialYearUpdate(BaseModel):
    name: str | None = None
    start_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class FinancialYearOut(BaseModel):
    id: str
    name: str
    start_date: str
    end_date: str
    is_closed: bool


class AccountGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    parent_id: str | None = None
    group_type: str = "sub"
    nature: str | None = None
    created_from: str | None = None


class AccountGroupOut(BaseModel):
    id: str
    name: str
    description: str | None = None
    system_code: str | None = None
    parent_id: str | None
    group_type: str
    nature: str
    is_system: bool


class LedgerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    group_id: str
    opening_balance: float = 0.0
    opening_balance_type: str = "Dr"
    gstin: str | None = None
    alias: str | None = None
    bank_name: str | None = None
    bank_account_number: str | None = None
    bank_ifsc: str | None = None
    bank_branch: str | None = None
    created_from: str | None = None


class LedgerOut(BaseModel):
    id: str
    name: str
    system_code: str | None = None
    group_id: str
    opening_balance: float
    opening_balance_type: str
    gstin: str | None
    alias: str | None
    bank_name: str | None = None
    bank_account_number: str | None = None
    bank_ifsc: str | None = None
    bank_branch: str | None = None
    closing_balance: float = 0
    closing_balance_type: str = "Dr"
    is_active: bool
    is_protected: bool = False


class PartyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    party_type: str
    ledger_id: str | None = None
    gstin: str | None = None
    state_code: str | None = None
    pan: str | None = None
    address: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    # Accounting details (Tally-prime party master)
    credit_limit: float | None = None
    maintain_bill_wise: bool = True
    # Opening balance lives on the party's linked ledger; accepted here so the
    # party master screen can set it in one place (create + edit).
    opening_balance: float | None = None
    opening_balance_type: str | None = None
    created_from: str | None = None


class PartyOut(BaseModel):
    id: str
    name: str
    party_type: str
    ledger_id: str | None
    gstin: str | None
    state_code: str | None
    pan: str | None
    address: str | None
    contact_person: str | None
    phone: str | None
    email: str | None
    is_active: bool
    credit_limit: float | None = None
    maintain_bill_wise: bool = True
    # From the linked ledger, so the master screen round-trips the account
    # details without a second call.
    opening_balance: float | None = None
    opening_balance_type: str | None = None
