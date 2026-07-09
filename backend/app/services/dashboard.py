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
    )


@dataclass
class PendingActions:
    unreconciled_bank_entries: int
    outstanding_receivables: float
    upcoming_gst_returns: int
    draft_vouchers: int
    pending_approvals: int


def get_pending_actions(
    db: Session,
    company_id: str,
) -> PendingActions:
    """Get pending actions requiring user attention."""
    from datetime import date, timedelta
    from app.models.accounting import GstReturn
    from app.models.voucher import Voucher

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

    return PendingActions(
        unreconciled_bank_entries=unreconciled,
        outstanding_receivables=outstanding,
        upcoming_gst_returns=upcoming_gst,
        draft_vouchers=draft_count,
        pending_approvals=pending_appr,
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
