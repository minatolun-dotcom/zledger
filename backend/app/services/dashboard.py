"""Dashboard service: summary aggregation for the dashboard view.

Aggregates P&L, balance sheet, voucher stats, and entity counts
for a given financial year.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from calendar import month_name

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.accounting import AccountGroup, FinancialYear, GstRegistration, Ledger, Party
from app.models.bank_reconciliation import BankStatementLine
from app.models.voucher import Voucher, VoucherLine
from app.services.reports import get_balance_sheet, get_outstanding, get_profit_and_loss
from app.utils.money import to_money


@dataclass
class DashboardSummary:
    financial_year_id: str
    financial_year_name: str
    # P&L
    total_income: float
    total_expenses: float
    net_profit: float
    is_profit: bool
    # Balance Sheet
    total_assets: float
    total_liabilities: float
    # Voucher counts
    voucher_count: int
    sales_count: int
    purchase_count: int
    receipt_count: int
    payment_count: int
    journal_count: int
    # Recent vouchers
    recent_vouchers: list[dict]
    # Entity counts
    ledger_count: int
    party_count: int
    group_count: int
    gst_registration_count: int
    # Trend comparison (vs previous FY)
    income_change_pct: float | None = None
    expense_change_pct: float | None = None
    profit_change_pct: float | None = None
    assets_change_pct: float | None = None


def get_dashboard_summary(
    db: Session,
    company_id: str,
    financial_year_id: str,
) -> DashboardSummary:
    """Get aggregated dashboard data for a financial year."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    # P&L
    pnl = get_profit_and_loss(db, company_id, financial_year_id)

    # Balance Sheet
    bs = get_balance_sheet(db, company_id, financial_year_id)

    # Voucher counts by type
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

    count_map = {vtype: cnt for vtype, cnt in voucher_counts}
    total_vouchers = sum(count_map.values())

    # Recent vouchers (scoped to FY)
    recent = (
        db.query(Voucher)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= fy.start_date,
            Voucher.voucher_date <= fy.end_date,
        )
        .order_by(Voucher.voucher_date.desc(), Voucher.created_at.desc())
        .limit(5)
        .all()
    )
    recent_list = [
        {
            "id": v.id,
            "voucher_type": v.voucher_type,
            "voucher_number": v.voucher_number,
            "voucher_date": v.voucher_date,
            "narration": v.narration,
        }
        for v in recent
    ]

    # Entity counts
    ledger_count = db.query(func.count(Ledger.id)).filter(
        Ledger.company_id == company_id, Ledger.is_active.is_(True)
    ).scalar() or 0

    party_count = db.query(func.count(Party.id)).filter(
        Party.company_id == company_id, Party.is_active.is_(True)
    ).scalar() or 0

    group_count = db.query(func.count(AccountGroup.id)).filter(
        AccountGroup.company_id == company_id
    ).scalar() or 0

    gst_count = db.query(func.count(GstRegistration.id)).filter(
        GstRegistration.company_id == company_id, GstRegistration.is_active.is_(True)
    ).scalar() or 0

    # Trend comparison: find previous FY and compute % changes
    prev_fy = (
        db.query(FinancialYear)
        .filter(
            FinancialYear.company_id == company_id,
            FinancialYear.end_date < fy.start_date,
        )
        .order_by(FinancialYear.end_date.desc())
        .first()
    )

    income_change_pct = None
    expense_change_pct = None
    profit_change_pct = None
    assets_change_pct = None

    if prev_fy:
        prev_pnl = get_profit_and_loss(db, company_id, prev_fy.id)
        prev_bs = get_balance_sheet(db, company_id, prev_fy.id)

        def _pct(current: float, previous: float) -> float | None:
            if previous == 0:
                return None if current == 0 else 100.0
            return round(((current - previous) / abs(previous)) * 100, 1)

        income_change_pct = _pct(float(pnl["total_income"]), float(prev_pnl["total_income"]))
        expense_change_pct = _pct(float(pnl["total_expenses"]), float(prev_pnl["total_expenses"]))
        profit_change_pct = _pct(float(pnl["net_profit"]), float(prev_pnl["net_profit"]))
        assets_change_pct = _pct(float(bs["total_assets"]), float(prev_bs["total_assets"]))

    return DashboardSummary(
        financial_year_id=fy.id,
        financial_year_name=fy.name,
        total_income=float(pnl["total_income"]),
        total_expenses=float(pnl["total_expenses"]),
        net_profit=float(pnl["net_profit"]),
        is_profit=pnl["is_profit"],
        total_assets=float(bs["total_assets"]),
        total_liabilities=float(bs["total_liabilities"]),
        voucher_count=total_vouchers,
        sales_count=count_map.get("sales", 0),
        purchase_count=count_map.get("purchase", 0),
        receipt_count=count_map.get("receipt", 0),
        payment_count=count_map.get("payment", 0),
        journal_count=count_map.get("journal", 0),
        recent_vouchers=recent_list,
        ledger_count=ledger_count,
        party_count=party_count,
        group_count=group_count,
        gst_registration_count=gst_count,
        income_change_pct=income_change_pct,
        expense_change_pct=expense_change_pct,
        profit_change_pct=profit_change_pct,
        assets_change_pct=assets_change_pct,
    )


@dataclass
class PendingActions:
    unreconciled_bank_entries: int
    outstanding_receivables: float
    upcoming_gst_returns: int
    draft_vouchers: int
    pending_approvals: int
    pending_einvoices: int
    failed_einvoices: int
    pending_eway_bills: int
    failed_eway_bills: int


def get_pending_actions(
    db: Session,
    company_id: str,
) -> PendingActions:
    """Get pending actions requiring user attention."""
    from datetime import date, timedelta
    from app.models.accounting import GstReturn
    from app.models.voucher import Voucher
    from app.models.einvoice import EInvoice
    from app.models.eway_bill import EwayBill

    # Unreconciled bank statement lines
    unreconciled = db.query(func.count(BankStatementLine.id)).filter(
        BankStatementLine.company_id == company_id,
        BankStatementLine.is_reconciled.is_(False),
    ).scalar() or 0

    # Outstanding receivables: sum of positive party balances
    current_fy = (
        db.query(FinancialYear)
        .filter(FinancialYear.company_id == company_id)
        .order_by(FinancialYear.start_date.desc())
        .first()
    )
    outstanding = 0.0
    if current_fy:
        result = get_outstanding(db, company_id, current_fy.start_date, current_fy.end_date)
        outstanding = sum(d["balance"] for d in result.get("debtors", []))

    # GST returns due: draft returns with due_date within 30 days or overdue
    today = date.today().isoformat()
    upcoming_cutoff = (date.today() + timedelta(days=30)).isoformat()
    upcoming_gst = db.query(func.count(GstReturn.id)).filter(
        GstReturn.company_id == company_id,
        GstReturn.status == "draft",
        GstReturn.due_date.isnot(None),
        GstReturn.due_date <= upcoming_cutoff,
    ).scalar() or 0

    # Draft vouchers
    draft_count = db.query(func.count(Voucher.id)).filter(
        Voucher.company_id == company_id,
        Voucher.status == "draft",
    ).scalar() or 0

    # Pending approvals (purchase vouchers awaiting approval)
    pending_appr = db.query(func.count(Voucher.id)).filter(
        Voucher.company_id == company_id,
        Voucher.approval_status == "pending",
    ).scalar() or 0

    # Pending E-Invoices (draft or submitted but not generated)
    pending_einv = db.query(func.count(EInvoice.id)).filter(
        EInvoice.company_id == company_id,
        EInvoice.status.in_(["draft", "submitted"]),
    ).scalar() or 0

    # Failed E-Invoices
    failed_einv = db.query(func.count(EInvoice.id)).filter(
        EInvoice.company_id == company_id,
        EInvoice.status == "failed",
    ).scalar() or 0

    # Pending E-Way Bills (draft)
    pending_eway = db.query(func.count(EwayBill.id)).filter(
        EwayBill.company_id == company_id,
        EwayBill.status == "draft",
    ).scalar() or 0

    # Failed E-Way Bills
    failed_eway = db.query(func.count(EwayBill.id)).filter(
        EwayBill.company_id == company_id,
        EwayBill.status == "failed",
    ).scalar() or 0

    return PendingActions(
        unreconciled_bank_entries=unreconciled,
        outstanding_receivables=outstanding,
        upcoming_gst_returns=upcoming_gst,
        draft_vouchers=draft_count,
        pending_approvals=pending_appr,
        pending_einvoices=pending_einv,
        failed_einvoices=failed_einv,
        pending_eway_bills=pending_eway,
        failed_eway_bills=failed_eway,
    )


@dataclass
class ChartDataPoint:
    month: str
    income: float
    expenses: float


def get_chart_data(
    db: Session,
    company_id: str,
    financial_year_id: str,
) -> list[ChartDataPoint]:
    """Get monthly income vs expenses data for the trend chart."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    # Parse FY start/end dates
    fy_start = fy.start_date  # YYYY-MM-DD
    fy_end = fy.end_date

    # Build monthly buckets for the FY
    start_year = int(fy_start[:4])
    start_month = int(fy_start[5:7])

    months = []
    for i in range(12):
        m = ((start_month - 1 + i) % 12) + 1
        y = start_year + ((start_month - 1 + i) // 12)
        months.append((y, m))

    # Get all vouchers in FY
    vouchers = (
        db.query(Voucher)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= fy_start,
            Voucher.voucher_date <= fy_end,
        )
        .all()
    )

    # Build income/expense maps by month
    # Income: sales, receipt, credit_note → positive
    # Expenses: purchase, payment, debit_note → positive
    income_map = {i: 0.0 for i in range(12)}
    expense_map = {i: 0.0 for i in range(12)}

    income_types = {"sales", "receipt", "credit_note"}
    expense_types = {"purchase", "payment", "debit_note"}

    for v in vouchers:
        v_date = v.voucher_date
        vy = int(v_date[:4])
        vm = int(v_date[5:7])
        # Find which FY month index this belongs to
        for idx, (my, mm) in enumerate(months):
            if vy == my and vm == mm:
                grand_total = float(v.grand_total)
                if v.voucher_type in income_types:
                    income_map[idx] += grand_total
                elif v.voucher_type in expense_types:
                    expense_map[idx] += grand_total
                break

    result = []
    for idx, (y, m) in enumerate(months):
        label = f"{month_name[m]} {y}"
        result.append(ChartDataPoint(
            month=label,
            income=round(income_map[idx], 2),
            expenses=round(expense_map[idx], 2),
        ))

    return result
def get_executive_summary(db: Session, company_id: str, fy_id: str) -> dict:
    """Get executive dashboard summary cards."""
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    # Get P&L and balance sheet data
    pnl = get_profit_and_loss(db, company_id, fy_id)
    balance_sheet = get_balance_sheet(db, company_id, fy_id)

    # Count vouchers in FY
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
    count_map = {vtype: cnt for vtype, cnt in voucher_counts}

    # Get recent vouchers
    recent = (
        db.query(Voucher)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= fy.start_date,
            Voucher.voucher_date <= fy.end_date,
        )
        .order_by(Voucher.voucher_date.desc(), Voucher.created_at.desc())
        .limit(5)
        .all()
    )

    return {
        "financial_year": fy.name,
        "summary_cards": [
            {
                "title": "Total Income",
                "value": f"₹{pnl.get('total_income', 0):,.2f}",
                "trend": "up" if pnl.get('net_profit', 0) > 0 else "down",
            },
            {
                "title": "Total Expenses",
                "value": f"₹{pnl.get('total_expenses', 0):,.2f}",
                "trend": "up",
            },
            {
                "title": "Net Profit",
                "value": f"₹{pnl.get('net_profit', 0):,.2f}",
                "trend": "up" if pnl.get('net_profit', 0) > 0 else "down",
            },
            {
                "title": "Total Assets",
                "value": f"₹{balance_sheet.get('total_assets', 0):,.2f}",
                "trend": "up",
            },
            {
                "title": "Total Liabilities",
                "value": f"₹{balance_sheet.get('total_liabilities', 0):,.2f}",
                "trend": "up",
            },
            {
                "title": "Total Vouchers",
                "value": str(sum(count_map.values())),
                "trend": "up",
            },
        ],
        "recent_activity": [
            {
                "voucher_type": v.voucher_type,
                "voucher_number": v.voucher_number,
                "date": v.voucher_date,
                "amount": sum(float(l.debit or 0) for l in v.lines),
            }
            for v in recent
        ],
    }
def get_revenue_trends(db: Session, company_id: str, fy_id: str, months: int = 12) -> list[dict]:
    """Get monthly revenue trends for BI analytics."""
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    from app.models.voucher import Voucher, VoucherLine
    from sqlalchemy import text

    # Use raw SQL with explicit date casting for PostgreSQL TO_CHAR compatibility
    sql = text("""
        SELECT TO_CHAR(v.voucher_date::DATE, 'YYYY-MM') AS month,
               COALESCE(SUM(vl.debit), 0) AS revenue,
               COUNT(v.id) AS voucher_count
        FROM vouchers v
        JOIN voucher_lines vl ON v.id = vl.voucher_id
        WHERE v.company_id = :company_id
          AND v.voucher_date >= :start_date
          AND v.voucher_date <= :end_date
        GROUP BY month
        ORDER BY month
        LIMIT :months
    """)
    results = db.execute(
        sql,
        {"company_id": company_id, "start_date": fy.start_date, "end_date": fy.end_date, "months": months}
    ).fetchall()

    return [
        {"month": r[0], "revenue": float(r[1]), "voucher_count": r[2]}
        for r in results
    ]


def get_expense_trends(db: Session, company_id: str, fy_id: str, months: int = 12) -> list[dict]:
    """Get monthly expense trends for BI analytics."""
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    from app.models.voucher import Voucher, VoucherLine
    from sqlalchemy import text

    # Use raw SQL with explicit date casting for PostgreSQL TO_CHAR compatibility
    sql = text("""
        SELECT TO_CHAR(v.voucher_date::DATE, 'YYYY-MM') AS month,
               COALESCE(SUM(vl.credit), 0) AS expenses,
               COUNT(v.id) AS voucher_count
        FROM vouchers v
        JOIN voucher_lines vl ON v.id = vl.voucher_id
        WHERE v.company_id = :company_id
          AND v.voucher_date >= :start_date
          AND v.voucher_date <= :end_date
        GROUP BY month
        ORDER BY month
        LIMIT :months
    """)
    results = db.execute(
        sql,
        {"company_id": company_id, "start_date": fy.start_date, "end_date": fy.end_date, "months": months}
    ).fetchall()

    return [
        {"month": r[0], "expenses": float(r[1]), "voucher_count": r[2]}
        for r in results
    ]


def get_profit_trends(db: Session, company_id: str, fy_id: str, months: int = 12) -> list[dict]:
    """Get monthly profit trends for BI analytics."""
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


def get_customer_analytics(db: Session, company_id: str, fy_id: str) -> dict:
    """Get customer revenue and profitability analysis."""
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")
    from app.models.accounting import Party
    from app.models.voucher import Voucher, VoucherLine

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
        .order_by(func.sum(VoucherLine.debit).desc())
        .limit(10)
        .all()
    )

    return {
        "top_customers_by_revenue": [
            {
                "customer_name": c.customer_name,
                "party_id": c.party_id,
                "total_revenue": float(c.total_revenue or 0),
                "transaction_count": c.transaction_count,
            }
            for c in top_customers
        ],
    }


def get_supplier_analytics(db: Session, company_id: str, fy_id: str) -> dict:
    """Get supplier purchase and payment analysis."""
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")
    from app.models.accounting import Party
    from app.models.voucher import Voucher, VoucherLine

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
        .order_by(func.sum(VoucherLine.credit).desc())
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


def get_expense_category_analysis(db: Session, company_id: str, fy_id: str) -> dict:
    """Get expense breakdown by account group."""
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")
    from app.models.accounting import AccountGroup, Ledger
    from app.models.voucher import Voucher, VoucherLine

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
        .order_by(func.sum(VoucherLine.credit).desc())
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


def get_inventory_analytics(db: Session, company_id: str, fy_id: str) -> dict:
    """Get inventory performance insights."""
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")
    from app.models.stock import StockItem, StockBalance
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
        .order_by(func.sum(StockBalance.quantity).desc())
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


def get_smart_insights(db: Session, company_id: str, fy_id: str) -> list[dict]:
    """Generate rule-based business insights."""
    from app.models.voucher import Voucher, VoucherLine
    from app.models.budget import Budget, BudgetAllocation
    from app.services.dashboard import get_revenue_trends, get_expense_trends
    
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        return []

    revenue = get_revenue_trends(db, company_id, fy_id, 3)
    expenses = get_expense_trends(db, company_id, fy_id, 3)

    insights = []

    # Revenue growth insight
    if len(revenue) >= 2:
        latest_rev = revenue[-1].get("revenue", 0)
        previous_rev = revenue[-2].get("revenue", 0)
        if previous_rev > 0:
            growth = ((latest_rev - previous_rev) / previous_rev) * 100
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

    # Expense spike insight
    if len(expenses) >= 2:
        latest_exp = expenses[-1].get("expenses", 0)
        previous_exp = expenses[-2].get("expenses", 0)
        if previous_exp > 0:
            exp_growth = ((latest_exp - previous_exp) / previous_exp) * 100
            if exp_growth > 30:
                insights.append({
                    "type": "warning",
                    "title": "Expense Spike Detected",
                    "message": f"Expenses increased by {exp_growth:.1f}% compared to the previous month. Review cost control.",
                    "impact": "medium",
                })

    # Budget variance insight (handle gracefully if budgets table doesn't exist)
    try:
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
                actual_expenses = sum(float(e["expenses"]) for e in expenses)
                if actual_expenses > total_budget * 0.8:
                    insights.append({
                        "type": "info",
                        "title": f"Budget Utilization Alert: {budget.name}",
                        "message": f"Budget of ₹{total_budget:,.2f} is {actual_expenses/total_budget*100:.1f}% utilized.",
                        "impact": "low",
                    })
    except Exception:
        pass  # Budget table may not exist

    return sorted(insights, key=lambda x: {"high": 0, "medium": 1, "low": 2}.get(x.get("impact", "low"), 2))
