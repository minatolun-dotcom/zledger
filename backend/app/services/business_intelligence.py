"""Business Intelligence and Analytics service for comprehensive business insights."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import func, and_, or_, desc
from sqlalchemy.orm import Session

from app.models.accounting import FinancialYear, Ledger, Party
from app.models.voucher import Voucher, VoucherLine
from app.models.budget import Budget, BudgetAllocation, BudgetPeriod
from app.models.masters import CostCentre
from app.models.stock import StockItem, StockBalance
from app.models.user import Company


def get_executive_summary(db: Session, company_id: str, fy_id: str) -> Dict[str, Any]:
    """Get executive dashboard summary cards."""
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    # P&L aggregates
    income = db.query(func.coalesce(func.sum(VoucherLine.debit), 0)).join(
        Voucher, VoucherLine.voucher_id == Voucher.id
    ).filter(
        Voucher.company_id == company_id,
        Voucher.voucher_date >= fy.start_date,
        Voucher.voucher_date <= fy.end_date,
        VoucherLine.ledger_id == None,
    ).scalar() or 0

    expenses = db.query(func.coalesce(func.sum(VoucherLine.credit), 0)).join(
        Voucher, VoucherLine.voucher_id == Voucher.id
    ).filter(
        Voucher.company_id == company_id,
        Voucher.voucher_date >= fy.start_date,
        Voucher.voucher_date <= fy.end_date,
        VoucherLine.ledger_id == None,
    ).scalar() or 0

    gross_profit = float(income) - float(expenses)

    # Receivables (debtors)
    receivables = db.query(func.coalesce(func.sum(VoucherLine.debit), 0)).join(
        Voucher, VoucherLine.voucher_id == Voucher.id
    ).filter(
        Voucher.company_id == company_id,
        Voucher.voucher_date >= fy.start_date,
        Voucher.voucher_date <= fy.end_date,
    ).scalar() or 0

    # Payables (creditors)
    payables = db.query(func.coalesce(func.sum(VoucherLine.credit), 0)).join(
        Voucher, VoucherLine.voucher_id == Voucher.id
    ).filter(
        Voucher.company_id == company_id,
        Voucher.voucher_date >= fy.start_date,
        Voucher.voucher_date <= fy.end_date,
    ).scalar() or 0

    # Bank balance
    bank_ledger = db.query(Ledger).filter(
        Ledger.company_id == company_id,
        Ledger.name.ilike("%bank%"),
    ).first()
    bank_balance = float(bank_ledger.opening_balance) if bank_ledger else 0.0

    # Cash balance
    cash_ledger = db.query(Ledger).filter(
        Ledger.company_id == company_id,
        Ledger.name.ilike("%cash%"),
    ).first()
    cash_balance = float(cash_ledger.opening_balance) if cash_ledger else 0.0

    # Voucher counts
    voucher_counts = (
        db.query(Voucher.voucher_type, func.count(Voucher.id))
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= fy.start_date,
            Voucher.voucher_date <= fy.end_date,
        )
        .group_by(Voucher.voucher_type)
        .all()
    )

    return {
        "revenue": float(income),
        "expenses": float(expenses),
        "gross_profit": float(gross_profit),
        "net_profit": float(gross_profit),
        "receivables": float(receivables),
        "payables": float(payables),
        "cash_balance": cash_balance,
        "bank_balance": bank_balance,
        "voucher_counts": {vtype: cnt for vtype, cnt in voucher_counts},
        "total_vouchers": sum(cnt for _, cnt in voucher_counts),
    }


def get_revenue_trends(db: Session, company_id: str, fy_id: str, months: int = 12) -> List[Dict[str, Any]]:
    """Get monthly revenue trends."""
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    results = (
        db.query(
            func.strftime("%Y-%m", Voucher.voucher_date).label("month"),
            func.sum(VoucherLine.debit).label("revenue"),
            func.count(Voucher.id).label("voucher_count"),
        )
        .join(VoucherLine, Voucher.id == VoucherLine.voucher_id)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= fy.start_date,
            Voucher.voucher_date <= fy.end_date,
        )
        .group_by("month")
        .order_by("month")
        .limit(months)
        .all()
    )

    return [
        {
            "month": r.month,
            "revenue": float(r.revenue or 0),
            "voucher_count": r.voucher_count,
        }
        for r in results
    ]


def get_expense_trends(db: Session, company_id: str, fy_id: str, months: int = 12) -> List[Dict[str, Any]]:
    """Get monthly expense trends."""
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    results = (
        db.query(
            func.strftime("%Y-%m", Voucher.voucher_date).label("month"),
            func.sum(VoucherLine.credit).label("expenses"),
            func.count(Voucher.id).label("voucher_count"),
        )
        .join(VoucherLine, Voucher.id == VoucherLine.voucher_id)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= fy.start_date,
            Voucher.voucher_date <= fy.end_date,
        )
        .group_by("month")
        .order_by("month")
        .limit(months)
        .all()
    )

    return [
        {
            "month": r.month,
            "expenses": float(r.expenses or 0),
            "voucher_count": r.voucher_count,
        }
        for r in results
    ]


def get_profit_trends(db: Session, company_id: str, fy_id: str, months: int = 12) -> List[Dict[str, Any]]:
    """Get monthly profit trends."""
    revenue = get_revenue_trends(db, company_id, fy_id, months)
    expenses = get_expense_trends(db, company_id, fy_id, months)

    rev_map = {r["month"]: r["revenue"] for r in revenue}
    exp_map = {r["month"]: r["expenses"] for r in expenses}

    all_months = sorted(set(list(rev_map.keys()) + list(exp_map.keys())))

    return [
        {
            "month": m,
            "revenue": rev_map.get(m, 0),
            "expenses": exp_map.get(m, 0),
            "profit": rev_map.get(m, 0) - exp_map.get(m, 0),
        }
        for m in all_months
    ]


def get_customer_analytics(db: Session, company_id: str, fy_id: str) -> Dict[str, Any]:
    """Get customer revenue and profitability analysis."""
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    # Top customers by revenue
    top_customers = (
        db.query(
            Party.name.label("customer_name"),
            Party.id.label("party_id"),
            func.sum(VoucherLine.debit).label("total_revenue"),
            func.count(Voucher.id).label("transaction_count"),
        )
        .join(Voucher, Party.id == Voucher.party_id)
        .join(VoucherLine, Voucher.id == VoucherLine.voucher_id)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= fy.start_date,
            Voucher.voucher_date <= fy.end_date,
            Party.party_type == "customer",
        )
        .group_by(Party.id, Party.name)
        .order_by(desc(func.sum(VoucherLine.debit)))
        .limit(10)
        .all()
    )

    # Top customers by profit (revenue minus cost of goods sold)
    # For simplicity, use revenue as proxy for profitability
    profitable_customers = [
        {
            "customer_name": c.customer_name,
            "party_id": c.party_id,
            "total_revenue": float(c.total_revenue or 0),
            "transaction_count": c.transaction_count,
        }
        for c in top_customers
    ]

    # Slow paying customers (high receivables)
    slow_payers = (
        db.query(
            Party.name.label("customer_name"),
            Party.id.label("party_id"),
            func.sum(VoucherLine.debit).label("outstanding"),
        )
        .join(Voucher, Party.id == Voucher.party_id)
        .join(VoucherLine, Voucher.id == VoucherLine.voucher_id)
        .filter(
            Voucher.company_id == company_id,
            Party.party_type == "customer",
        )
        .group_by(Party.id, Party.name)
        .having(func.sum(VoucherLine.debit) > 0)
        .order_by(desc(func.sum(VoucherLine.debit)))
        .limit(10)
        .all()
    )

    return {
        "top_customers_by_revenue": profitable_customers,
        "slow_paying_customers": [
            {
                "customer_name": s.customer_name,
                "party_id": s.party_id,
                "outstanding": float(s.outstanding or 0),
            }
            for s in slow_payers
        ],
    }


def get_supplier_analytics(db: Session, company_id: str, fy_id: str) -> Dict[str, Any]:
    """Get supplier purchase and payment analysis."""
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    top_suppliers = (
        db.query(
            Party.name.label("supplier_name"),
            Party.id.label("party_id"),
            func.sum(VoucherLine.credit).label("total_purchases"),
            func.count(Voucher.id).label("transaction_count"),
        )
        .join(Voucher, Party.id == Voucher.party_id)
        .join(VoucherLine, Voucher.id == VoucherLine.voucher_id)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= fy.start_date,
            Voucher.voucher_date <= fy.end_date,
            Party.party_type == "supplier",
        )
        .group_by(Party.id, Party.name)
        .order_by(desc(func.sum(VoucherLine.credit)))
        .limit(10)
        .all()
    )

    return {
        "top_suppliers_by_purchase": [
            {
                "supplier_name": s.supplier_name,
                "party_id": s.party_id,
                "total_purchases": float(s.total_purchases or 0),
                "transaction_count": s.transaction_count,
            }
            for s in top_suppliers
        ],
    }


def get_expense_category_analysis(db: Session, company_id: str, fy_id: str) -> Dict[str, Any]:
    """Get expense breakdown by category/group."""
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    # Group expenses by account group
    group_expenses = (
        db.query(
            AccountGroup.name.label("group_name"),
            AccountGroup.id.label("group_id"),
            func.sum(VoucherLine.credit).label("total_expense"),
        )
        .join(Ledger, AccountGroup.id == Ledger.group_id)
        .join(VoucherLine, Ledger.id == VoucherLine.ledger_id)
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= fy.start_date,
            Voucher.voucher_date <= fy.end_date,
            AccountGroup.nature == "Expense",
        )
        .group_by(AccountGroup.id, AccountGroup.name)
        .order_by(desc(func.sum(VoucherLine.credit)))
        .all()
    )

    return {
        "expense_by_group": [
            {
                "group_name": g.group_name,
                "group_id": g.group_id,
                "total_expense": float(g.total_expense or 0),
            }
            for g in group_expenses
        ],
    }


def get_inventory_analytics(db: Session, company_id: str, fy_id: str) -> Dict[str, Any]:
    """Get inventory performance insights."""
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    # Stock valuation
    stock_valuation = (
        db.query(
            StockItem.name.label("item_name"),
            StockItem.id.label("item_id"),
            func.coalesce(func.sum(StockBalance.quantity), 0).label("total_quantity"),
            StockItem.opening_rate.label("rate"),
        )
        .join(StockBalance, StockItem.id == StockBalance.stock_item_id)
        .filter(StockItem.company_id == company_id)
        .group_by(StockItem.id, StockItem.name, StockItem.opening_rate)
        .order_by(desc(func.sum(StockBalance.quantity)))
        .limit(20)
        .all()
    )

    total_stock_value = sum(
        float(s.total_quantity) * float(s.rate or 0) for s in stock_valuation
    )

    return {
        "stock_valuation": [
            {
                "item_name": s.item_name,
                "item_id": s.item_id,
                "quantity": float(s.total_quantity),
                "rate": float(s.rate or 0),
                "value": float(s.total_quantity) * float(s.rate or 0),
            }
            for s in stock_valuation
        ],
        "total_stock_value": total_stock_value,
    }


def get_smart_insights(db: Session, company_id: str, fy_id: str) -> List[Dict[str, Any]]:
    """Generate rule-based business insights."""
    insights = []
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        return insights

    # 1. Revenue growth insight
    trends = get_revenue_trends(db, company_id, fy_id, 3)
    if len(trends) >= 2:
        latest = trends[-1].get("revenue", 0)
        previous = trends[-2].get("revenue", 0)
        if previous > 0:
            growth = ((latest - previous) / previous) * 100
            if growth > 20:
                insights.append({
                    "type": "positive",
                    "title": "Strong Revenue Growth",
                    "message": f"Revenue increased by {growth:.1f}% compared to the previous month.",
                    "impact": "high",
                })
            elif growth < -20:
                insights.append({
                    "type": "warning",
                    "title": "Revenue Decline Detected",
                    "message": f"Revenue decreased by {abs(growth):.1f}% compared to the previous month. Review sales strategy.",
                    "impact": "high",
                })

    # 2. Expense spike insight
    exp_trends = get_expense_trends(db, company_id, fy_id, 3)
    if len(exp_trends) >= 2:
        latest_exp = exp_trends[-1].get("expenses", 0)
        previous_exp = exp_trends[-2].get("expenses", 0)
        if previous_exp > 0:
            exp_growth = ((latest_exp - previous_exp) / previous_exp) * 100
            if exp_growth > 30:
                insights.append({
                    "type": "warning",
                    "title": "Expense Spike Detected",
                    "message": f"Expenses increased by {exp_growth:.1f}% compared to the previous month. Review cost control.",
                    "impact": "medium",
                })

    # 3. Cash position insight
    summary = get_executive_summary(db, company_id, fy_id)
    if summary["cash_balance"] < 10000:
        insights.append({
            "type": "warning",
            "title": "Low Cash Balance",
            "message": f"Cash balance is ₹{summary['cash_balance']:,.2f}. Consider arranging additional funding.",
            "impact": "high",
        })

    # 4. Overdue receivables insight
    customer_analytics = get_customer_analytics(db, company_id, fy_id)
    if customer_analytics.get("slow_paying_customers"):
        total_outstanding = sum(
            c["outstanding"] for c in customer_analytics["slow_paying_customers"]
        )
        if total_outstanding > 100000:
            insights.append({
                "type": "warning",
                "title": "High Outstanding Receivables",
                "message": f"Total overdue receivables of ₹{total_outstanding:,.2f} need attention.",
                "impact": "medium",
            })

    # 5. Budget variance insight
    budgets = db.query(Budget).filter(
        Budget.company_id == company_id,
        Budget.financial_year == fy.name,
    ).all()
    for budget in budgets:
        allocations = db.query(BudgetAllocation).filter(
            BudgetAllocation.budget_id == budget.id,
        ).all()
        total_budget = sum(float(a.budget_amount) for a in allocations)
        if total_budget > 0:
            # Compare with actuals from executive summary
            actual = summary.get("expenses", 0)
            if actual > total_budget * 0.8:
                insights.append({
                    "type": "info",
                    "title": f"Budget Utilization Alert: {budget.name}",
                    "message": f"Budget of ₹{total_budget:,.2f} is {actual/total_budget*100:.1f}% utilized.",
                    "impact": "low",
                })

    return sorted(insights, key=lambda x: {"high": 0, "medium": 1, "low": 2}.get(x.get("impact", "low"), 2))