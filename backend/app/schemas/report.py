"""Report schemas for Trial Balance, P&L, and Balance Sheet."""
from __future__ import annotations

from pydantic import BaseModel


class TrialBalanceLine(BaseModel):
    ledger_id: str
    ledger_name: str
    group_name: str
    group_nature: str
    opening_balance: float
    opening_balance_type: str
    total_debit: float
    total_credit: float
    closing_balance: float
    closing_balance_type: str


class TrialBalanceResponse(BaseModel):
    financial_year_id: str
    financial_year_name: str
    start_date: str
    end_date: str
    lines: list[TrialBalanceLine]
    total_debit: float
    total_credit: float


class ReportLedgerLine(BaseModel):
    ledger_id: str
    ledger_name: str
    opening_balance: float
    opening_balance_type: str
    total_debit: float
    total_credit: float
    closing_balance: float
    closing_balance_type: str


class ReportGroup(BaseModel):
    group_name: str
    group_nature: str
    ledgers: list[ReportLedgerLine]
    total: float


class ProfitAndLossResponse(BaseModel):
    financial_year_id: str
    financial_year_name: str
    start_date: str
    end_date: str
    income_groups: list[ReportGroup]
    expense_groups: list[ReportGroup]
    total_income: float
    total_expenses: float
    net_profit: float
    is_profit: bool


class BalanceSheetResponse(BaseModel):
    financial_year_id: str
    financial_year_name: str
    start_date: str
    end_date: str
    asset_groups: list[ReportGroup]
    liability_groups: list[ReportGroup]
    capital_groups: list[ReportGroup]
    total_assets: float
    total_liabilities: float
    total_capital: float
    total_liabilities_and_capital: float
