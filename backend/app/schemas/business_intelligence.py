"""Pydantic schemas for Business Intelligence and Analytics API responses."""
from __future__ import annotations

from datetime import date
from pydantic import BaseModel, Field
from typing import Optional


# ─── Executive Dashboard ──────────────────────────────────────────


class FinancialSummaryCard(BaseModel):
    revenue: float = 0
    expenses: float = 0
    gross_profit: float = 0
    net_profit: float = 0
    receivables: float = 0
    payables: float = 0
    cash_balance: float = 0
    bank_balance: float = 0


class ExecutiveSummaryResponse(BaseModel):
    success: bool = True
    data: FinancialSummaryCard
    period: str = "financial_year"
    financial_year_id: str


# ─── Revenue Trends ───────────────────────────────────────────────


class RevenueTrendPoint(BaseModel):
    month: str
    revenue: float
    voucher_count: int


class RevenueTrendsResponse(BaseModel):
    success: bool = True
    data: list[RevenueTrendPoint]
    period: str = "monthly"
    months: int


# ─── Expense Trends ────────────────────────────────────────────────


class ExpenseTrendPoint(BaseModel):
    month: str
    expenses: float
    voucher_count: int


class ExpenseTrendsResponse(BaseModel):
    success: bool = True
    data: list[ExpenseTrendPoint]
    period: str = "monthly"
    months: int


# ─── Profit Trends ─────────────────────────────────────────────────


class ProfitTrendPoint(BaseModel):
    month: str
    revenue: float
    expenses: float
    profit: float


class ProfitTrendsResponse(BaseModel):
    success: bool = True
    data: list[ProfitTrendPoint]
    period: str = "monthly"
    months: int


# ─── Customer Analytics ────────────────────────────────────────────


class TopCustomer(BaseModel):
    customer_name: str
    party_id: str
    total_revenue: float
    transaction_count: int


class SlowPayingCustomer(BaseModel):
    customer_name: str
    party_id: str
    outstanding: float


class CustomerAnalyticsResponse(BaseModel):
    success: bool = True
    data: dict
    top_customers_by_revenue: list[TopCustomer] = []
    slow_paying_customers: list[SlowPayingCustomer] = []


# ─── Supplier Analytics ────────────────────────────────────────────


class TopSupplier(BaseModel):
    supplier_name: str
    party_id: str
    total_purchases: float
    transaction_count: int


class SupplierAnalyticsResponse(BaseModel):
    success: bool = True
    data: dict
    top_suppliers_by_purchase: list[TopSupplier] = []


# ─── Expense Analysis ──────────────────────────────────────────────


class ExpenseByGroup(BaseModel):
    group_name: str
    group_id: str
    total_expense: float


class ExpenseAnalysisResponse(BaseModel):
    success: bool = True
    data: dict
    expense_by_group: list[ExpenseByGroup] = []


# ─── Inventory Analytics ───────────────────────────────────────────


class StockItemAnalytics(BaseModel):
    item_name: str
    item_id: str
    quantity: float
    rate: float
    value: float


class InventoryAnalyticsResponse(BaseModel):
    success: bool = True
    data: dict
    stock_valuation: list[StockItemAnalytics] = []
    total_stock_value: float = 0


# ─── Smart Insights ────────────────────────────────────────────────


class SmartInsight(BaseModel):
    type: str  # positive, warning, info
    title: str
    message: str
    impact: str  # high, medium, low


class SmartInsightsResponse(BaseModel):
    success: bool = True
    data: list[SmartInsight]
    insight_count: int


# ─── Comprehensive BI Report ───────────────────────────────────────


class ComprehensiveBIReportResponse(BaseModel):
    success: bool = True
    data: dict