"""Dashboard endpoints: summary aggregation for the dashboard view."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, require_role
from app.models.user import Company
from app.schemas.member import CompanyRole
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
    company: Company = Depends(require_role(CompanyRole.viewer)),
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
    pending_einvoices: int
    failed_einvoices: int
    pending_eway_bills: int
    failed_eway_bills: int

@router.get("/pending-actions", response_model=PendingActionsResponse)
def pending_actions(
    company: Company = Depends(require_role(CompanyRole.viewer)),
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
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Get monthly income vs expenses data for the trend chart."""
    try:
        data = get_chart_data(db, company.id, financial_year_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    return data


# ─── Phase 9: Business Intelligence Analytics ──────────────────────


@router.get("/executive-summary")
def executive_summary(
    financial_year_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Get executive dashboard summary cards."""
    from app.services.dashboard import get_executive_summary
    try:
        data = get_executive_summary(db, company.id, financial_year_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    return {"success": True, "data": data, "period": "financial_year", "financial_year_id": financial_year_id}


@router.get("/revenue-trends")
def revenue_trends(
    financial_year_id: str,
    months: int = Query(default=12, ge=1, le=36),
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Get revenue trend data."""
    from app.services.dashboard import get_revenue_trends
    try:
        data = get_revenue_trends(db, company.id, financial_year_id, months)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    return {"success": True, "data": data, "period": "monthly", "months": months}


@router.get("/expense-trends")
def expense_trends(
    financial_year_id: str,
    months: int = Query(default=12, ge=1, le=36),
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Get expense trend data."""
    from app.services.dashboard import get_expense_trends
    try:
        data = get_expense_trends(db, company.id, financial_year_id, months)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    return {"success": True, "data": data, "period": "monthly", "months": months}


@router.get("/profit-trends")
def profit_trends(
    financial_year_id: str,
    months: int = Query(default=12, ge=1, le=36),
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Get profit trend data."""
    from app.services.dashboard import get_profit_trends
    try:
        data = get_profit_trends(db, company.id, financial_year_id, months)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    return {"success": True, "data": data, "period": "monthly", "months": months}


@router.get("/customer-analytics")
def customer_analytics(
    financial_year_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Get customer intelligence and analytics."""
    from app.services.dashboard import get_customer_analytics
    try:
        data = get_customer_analytics(db, company.id, financial_year_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    return {"success": True, "data": data}


@router.get("/supplier-analytics")
def supplier_analytics(
    financial_year_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Get supplier intelligence and analytics."""
    from app.services.dashboard import get_supplier_analytics
    try:
        data = get_supplier_analytics(db, company.id, financial_year_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    return {"success": True, "data": data}


@router.get("/expense-analysis")
def expense_analysis(
    financial_year_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Get expense category breakdown."""
    from app.services.dashboard import get_expense_category_analysis
    try:
        data = get_expense_category_analysis(db, company.id, financial_year_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    return {"success": True, "data": data}


@router.get("/inventory-analytics")
def inventory_analytics(
    financial_year_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Get inventory performance insights."""
    from app.services.dashboard import get_inventory_analytics
    try:
        data = get_inventory_analytics(db, company.id, financial_year_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    return {"success": True, "data": data}


@router.get("/smart-insights")
def smart_insights(
    financial_year_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Get rule-based business insights and recommendations."""
    from app.services.dashboard import get_smart_insights
    try:
        data = get_smart_insights(db, company.id, financial_year_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    return {"success": True, "data": data, "insight_count": len(data)}


@router.get("/comprehensive-report")
def comprehensive_bi_report(
    financial_year_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Get comprehensive business intelligence report combining all analytics."""
    from app.services.dashboard import (
        get_executive_summary,
        get_revenue_trends,
        get_expense_trends,
        get_profit_trends,
        get_customer_analytics,
        get_supplier_analytics,
        get_expense_category_analysis,
        get_inventory_analytics,
        get_smart_insights,
    )
    try:
        return {
            "success": True,
            "data": {
                "executive_summary": get_executive_summary(db, company.id, financial_year_id),
                "revenue_trends": get_revenue_trends(db, company.id, financial_year_id, 12),
                "expense_trends": get_expense_trends(db, company.id, financial_year_id, 12),
                "profit_trends": get_profit_trends(db, company.id, financial_year_id, 12),
                "customer_analytics": get_customer_analytics(db, company.id, financial_year_id),
                "supplier_analytics": get_supplier_analytics(db, company.id, financial_year_id),
                "expense_analysis": get_expense_category_analysis(db, company.id, financial_year_id),
                "inventory_analytics": get_inventory_analytics(db, company.id, financial_year_id),
                "smart_insights": get_smart_insights(db, company.id, financial_year_id),
            },
        }
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
