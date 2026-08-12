"""Day Book schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


class DayBookEntry(BaseModel):
    id: str
    voucher_date: str
    voucher_number: str
    voucher_type: str
    party_name: str | None = None
    ledger_name: str | None = None
    narration: str | None = None
    debit: float = 0
    credit: float = 0
    status: str
    created_by_name: str | None = None
    round_off: float = 0


class DayBookGroup(BaseModel):
    date: str
    entries: list[DayBookEntry]
    day_total_debit: float = 0
    day_total_credit: float = 0


class DayBookSummary(BaseModel):
    total_vouchers: int
    total_debit: float
    total_credit: float
    is_balanced: bool


class DayBookResponse(BaseModel):
    entries: list[DayBookEntry]
    groups: list[DayBookGroup] | None = None
    summary: DayBookSummary
    total: int
    page: int
    page_size: int
