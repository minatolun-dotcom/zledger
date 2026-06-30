"""Dashboard service: summary aggregation for the dashboard view.

Aggregates P&L, balance sheet, voucher stats, and entity counts
for a given financial year.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.accounting import AccountGroup, FinancialYear, GstRegistration, Ledger, Party
from app.models.voucher import Voucher, VoucherLine
from app.services.reports import get_balance_sheet, get_profit_and_loss
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

    # Recent vouchers
    recent = (
        db.query(Voucher)
        .filter(Voucher.company_id == company_id)
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
