"""Dashboard endpoints: summary aggregation for the dashboard view."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company
from app.models.user import Company
from app.services.dashboard import (
    get_dashboard_summary,
    get_pending_actions,
    get_chart_data,
)

router = APIRouter()


class DashboardSummaryResponse(BaseModel):
    financial_year_id: str
    financial_year_name: str
    total_income: float
    total_expenses: float
    net_profit: float
    is_profit: bool
    total_assets: float
    total_liabilities: float
    voucher_count: int
    sales_count: int
    purchase_count: int
    receipt_count: int
    payment_count: int
    journal_count: int
    recent_vouchers: list[dict]
    ledger_count: int
    party_count: int
    group_count: int
    gst_registration_count: int
    income_change_pct: float | None = None
    expense_change_pct: float | None = None
    profit_change_pct: float | None = None
    assets_change_pct: float | None = None


@router.get("/summary", response_model=DashboardSummaryResponse)
def dashboard_summary(
    financial_year_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Get aggregated dashboard data for a financial year."""
    try:
        data = get_dashboard_summary(db, company.id, financial_year_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    return DashboardSummaryResponse(
        financial_year_id=data.financial_year_id,
        financial_year_name=data.financial_year_name,
        total_income=data.total_income,
        total_expenses=data.total_expenses,
        net_profit=data.net_profit,
        is_profit=data.is_profit,
        total_assets=data.total_assets,
        total_liabilities=data.total_liabilities,
        voucher_count=data.voucher_count,
        sales_count=data.sales_count,
        purchase_count=data.purchase_count,
        receipt_count=data.receipt_count,
        payment_count=data.payment_count,
        journal_count=data.journal_count,
        recent_vouchers=data.recent_vouchers,
        ledger_count=data.ledger_count,
        party_count=data.party_count,
        group_count=data.group_count,
        gst_registration_count=data.gst_registration_count,
        income_change_pct=data.income_change_pct,
        expense_change_pct=data.expense_change_pct,
        profit_change_pct=data.profit_change_pct,
        assets_change_pct=data.assets_change_pct,
    )


class PendingActionsResponse(BaseModel):
    unreconciled_bank_entries: int
    outstanding_receivables: float
    upcoming_gst_returns: int
    draft_vouchers: int
    pending_approvals: int


@router.get("/pending-actions", response_model=PendingActionsResponse)
def pending_actions(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Get pending actions requiring user attention."""
    return get_pending_actions(db, company.id)


class ChartDataPoint(BaseModel):
    month: str
    income: float
    expenses: float


@router.get("/chart-data", response_model=list[ChartDataPoint])
def chart_data(
    financial_year_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Get monthly income vs expenses data for the trend chart."""
    try:
        data = get_chart_data(db, company.id, financial_year_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    return data
