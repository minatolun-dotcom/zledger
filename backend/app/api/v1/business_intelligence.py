"""Business Intelligence and Analytics API endpoints."""
from __future__ import annotations

from datetime import date
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from typing import Optional

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user
from app.models.user import Company, User
from app.services.business_intelligence import (
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

router = APIRouter()


# ─── Executive Dashboard ──────────────────────────────────────────


@router.get("/executive-summary")
def executive_summary(
    financial_year_id: str = Query(..., description="Financial year ID"),
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get executive dashboard summary cards."""
    data = get_executive_summary(db, company.id, financial_year_id)
    return {
        "success": True,
        "data": data,
        "period": "financial_year",
        "financial_year_id": financial_year_id,
    }


# ─── Revenue Analytics ────────────────────────────────────────────


@router.get("/revenue-trends")
def revenue_trends(
    financial_year_id: str = Query(..., description="Financial year ID"),
    months: int = Query(default=12, ge=1, le=36, description="Number of months"),
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get revenue trend data."""
    data = get_revenue_trends(db, company.id, financial_year_id, months)
    return {
        "success": True,
        "data": data,
        "period": "monthly",
        "months": months,
    }


# ─── Expense Analytics ─────────────────────────────────────────────


@router.get("/expense-trends")
def expense_trends(
    financial_year_id: str = Query(..., description="Financial year ID"),
    months: int = Query(default=12, ge=1, le=36, description="Number of months"),
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get expense trend data."""
    data = get_expense_trends(db, company.id, financial_year_id, months)
    return {
        "success": True,
        "data": data,
        "period": "monthly",
        "months": months,
    }


# ─── Profit Trends ─────────────────────────────────────────────────


@router.get("/profit-trends")
def profit_trends(
    financial_year_id: str = Query(..., description="Financial year ID"),
    months: int = Query(default=12, ge=1, le=36, description="Number of months"),
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get profit trend data."""
    data = get_profit_trends(db, company.id, financial_year_id, months)
    return {
        "success": True,
        "data": data,
        "period": "monthly",
        "months": months,
    }


# ─── Customer Analytics ────────────────────────────────────────────


@router.get("/customer-analytics")
def customer_analytics(
    financial_year_id: str = Query(..., description="Financial year ID"),
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get customer intelligence and analytics."""
    data = get_customer_analytics(db, company.id, financial_year_id)
    return {
        "success": True,
        "data": data,
    }


# ─── Supplier Analytics ────────────────────────────────────────────


@router.get("/supplier-analytics")
def supplier_analytics(
    financial_year_id: str = Query(..., description="Financial year ID"),
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get supplier intelligence and analytics."""
    data = get_supplier_analytics(db, company.id, financial_year_id)
    return {
        "success": True,
        "data": data,
    }


# ─── Expense Category Analysis ─────────────────────────────────────


@router.get("/expense-analysis")
def expense_analysis(
    financial_year_id: str = Query(..., description="Financial year ID"),
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get expense category breakdown."""
    data = get_expense_category_analysis(db, company.id, financial_year_id)
    return {
        "success": True,
        "data": data,
    }


# ─── Inventory Analytics ───────────────────────────────────────────


@router.get("/inventory-analytics")
def inventory_analytics(
    financial_year_id: str = Query(..., description="Financial year ID"),
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get inventory performance insights."""
    data = get_inventory_analytics(db, company.id, financial_year_id)
    return {
        "success": True,
        "data": data,
    }


# ─── Smart Insights ────────────────────────────────────────────────


@router.get("/smart-insights")
def smart_insights(
    financial_year_id: str = Query(..., description="Financial year ID"),
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get rule-based business insights and recommendations."""
    data = get_smart_insights(db, company.id, financial_year_id)
    return {
        "success": True,
        "data": data,
        "insight_count": len(data),
    }


# ─── Comprehensive BI Report ───────────────────────────────────────


@router.get("/comprehensive-report")
def comprehensive_bi_report(
    financial_year_id: str = Query(..., description="Financial year ID"),
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get comprehensive business intelligence report combining all analytics."""
    from app.services.business_intelligence import (
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