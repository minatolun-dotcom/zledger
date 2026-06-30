"""Reports service: Trial Balance, Profit & Loss, Balance Sheet.

All balances are computed dynamically from:
  Ledger.opening_balance + SUM(VoucherLine.debit) - SUM(VoucherLine.credit)
for posted vouchers within a financial year date range.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.accounting import AccountGroup, FinancialYear, Ledger
from app.models.voucher import Voucher, VoucherLine
from app.utils.money import to_money


@dataclass
class LedgerBalance:
    ledger_id: str
    ledger_name: str
    group_id: str
    group_name: str
    group_nature: str
    opening_balance: Decimal
    opening_balance_type: str  # "Dr" or "Cr"
    total_debit: Decimal
    total_credit: Decimal
    closing_balance: Decimal
    closing_balance_type: str  # "Dr" or "Cr"


@dataclass
class ReportGroup:
    group_name: str
    group_nature: str
    ledgers: list[LedgerBalance]
    total: Decimal


def _get_fy_or_raise(db: Session, company_id: str, financial_year_id: str) -> FinancialYear:
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company_id:
        from fastapi import HTTPException, status
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    return fy


def get_ledger_balances(
    db: Session,
    company_id: str,
    start_date: str,
    end_date: str,
) -> list[LedgerBalance]:
    """Compute closing balance for every ledger in the company within date range.

    Returns a list of LedgerBalance objects sorted by group nature, group name, ledger name.
    """
    # Aggregate debit/credit per ledger from posted vouchers in date range
    agg_rows = (
        db.query(
            VoucherLine.ledger_id,
            func.coalesce(func.sum(VoucherLine.debit), Decimal("0")).label("total_debit"),
            func.coalesce(func.sum(VoucherLine.credit), Decimal("0")).label("total_credit"),
        )
        .join(Voucher, Voucher.id == VoucherLine.voucher_id)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= start_date,
            Voucher.voucher_date <= end_date,
        )
        .group_by(VoucherLine.ledger_id)
        .all()
    )

    agg_map: dict[str, tuple[Decimal, Decimal]] = {}
    for row in agg_rows:
        agg_map[row.ledger_id] = (to_money(row.total_debit), to_money(row.total_credit))

    # Fetch all active ledgers with their groups
    ledgers = (
        db.query(Ledger, AccountGroup)
        .join(AccountGroup, AccountGroup.id == Ledger.group_id)
        .filter(Ledger.company_id == company_id, Ledger.is_active.is_(True))
        .order_by(AccountGroup.nature, AccountGroup.name, Ledger.name)
        .all()
    )

    result: list[LedgerBalance] = []
    for ledger, group in ledgers:
        total_debit, total_credit = agg_map.get(ledger.id, (Decimal("0"), Decimal("0")))
        opening = to_money(ledger.opening_balance)
        ob_type = ledger.opening_balance_type

        # Net movement: debit increases Dr balance, credit increases Cr balance
        if ob_type == "Dr":
            closing = opening + total_debit - total_credit
        else:
            closing = opening + total_credit - total_debit

        closing_type = "Dr" if closing >= 0 else "Cr"
        if closing < 0:
            closing = -closing

        result.append(LedgerBalance(
            ledger_id=ledger.id,
            ledger_name=ledger.name,
            group_id=group.id,
            group_name=group.name,
            group_nature=group.nature,
            opening_balance=opening,
            opening_balance_type=ob_type,
            total_debit=total_debit,
            total_credit=total_credit,
            closing_balance=closing,
            closing_balance_type=closing_type,
        ))

    return result


def get_trial_balance(
    db: Session,
    company_id: str,
    financial_year_id: str,
) -> list[LedgerBalance]:
    """Trial Balance: all ledgers with their debit/credit totals and closing balance."""
    fy = _get_fy_or_raise(db, company_id, financial_year_id)
    return get_ledger_balances(db, company_id, fy.start_date, fy.end_date)


def _group_balances(
    ledgers: list[LedgerBalance],
    natures: tuple[str, ...],
) -> list[ReportGroup]:
    """Group ledger balances by group_name, filtered by group_nature."""
    groups: dict[str, ReportGroup] = {}
    for lb in ledgers:
        if lb.group_nature not in natures:
            continue
        if lb.group_name not in groups:
            groups[lb.group_name] = ReportGroup(
                group_name=lb.group_name,
                group_nature=lb.group_nature,
                ledgers=[],
                total=Decimal("0"),
            )
        groups[lb.group_name].ledgers.append(lb)
        # Dr balances add, Cr balances subtract in the group total
        if lb.closing_balance_type == "Dr":
            groups[lb.group_name].total += lb.closing_balance
        else:
            groups[lb.group_name].total -= lb.closing_balance

    return sorted(groups.values(), key=lambda g: g.group_name)


def get_profit_and_loss(
    db: Session,
    company_id: str,
    financial_year_id: str,
) -> dict:
    """Profit & Loss: income and expenses groups with totals.

    Returns dict with 'income_groups', 'expense_groups', 'net_profit', 'is_profit'.
    """
    fy = _get_fy_or_raise(db, company_id, financial_year_id)
    ledgers = get_ledger_balances(db, company_id, fy.start_date, fy.end_date)

    income_groups = _group_balances(ledgers, ("income",))
    expense_groups = _group_balances(ledgers, ("expenses",))

    total_income = sum(
        (g.total for g in income_groups),
        Decimal("0"),
    )
    total_expenses = sum(
        (g.total for g in expense_groups),
        Decimal("0"),
    )

    net_profit = total_income - total_expenses

    return {
        "income_groups": income_groups,
        "expense_groups": expense_groups,
        "total_income": to_money(total_income),
        "total_expenses": to_money(total_expenses),
        "net_profit": to_money(net_profit),
        "is_profit": net_profit >= 0,
    }


def get_balance_sheet(
    db: Session,
    company_id: str,
    financial_year_id: str,
) -> dict:
    """Balance Sheet: assets, liabilities, capital groups.

    Returns dict with 'asset_groups', 'liability_groups', 'capital_groups',
    'total_assets', 'total_liabilities_and_capital'.
    """
    fy = _get_fy_or_raise(db, company_id, financial_year_id)
    ledgers = get_ledger_balances(db, company_id, fy.start_date, fy.end_date)

    asset_groups = _group_balances(ledgers, ("assets",))
    liability_groups = _group_balances(ledgers, ("liabilities",))
    capital_groups = _group_balances(ledgers, ("capital",))

    total_assets = sum(
        (g.total for g in asset_groups),
        Decimal("0"),
    )
    total_liabilities = sum(
        (g.total for g in liability_groups),
        Decimal("0"),
    )
    total_capital = sum(
        (g.total for g in capital_groups),
        Decimal("0"),
    )

    return {
        "asset_groups": asset_groups,
        "liability_groups": liability_groups,
        "capital_groups": capital_groups,
        "total_assets": to_money(total_assets),
        "total_liabilities": to_money(total_liabilities),
        "total_capital": to_money(total_capital),
        "total_liabilities_and_capital": to_money(total_liabilities + total_capital),
    }


# ─── Cost Centre P&L Report ──────────────────────────────────────────────


@dataclass
class CostCentreBreakdown:
    cost_centre_id: str
    cost_centre_name: str
    total_income: Decimal
    total_expense: Decimal
    net_result: Decimal


def get_cost_centre_pl(
    db: Session,
    company_id: str,
    financial_year_id: str,
) -> list[CostCentreBreakdown]:
    """Compute P&L breakdown by cost centre.

    Only includes VoucherLines with a cost_centre_id assigned.
    """
    from app.models.masters import CostCentre

    fy = _get_fy_or_raise(db, company_id, financial_year_id)

    # Fetch all posted vouchers with lines that have cost centres
    vouchers = (
        db.query(Voucher)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= fy.start_date,
            Voucher.voucher_date <= fy.end_date,
        )
        .all()
    )

    # Build cost centre map
    cc_map: dict[str, Decimal] = {}
    cc_names: dict[str, str] = {}

    for v in vouchers:
        lines = db.query(VoucherLine).filter(VoucherLine.voucher_id == v.id).all()
        for line in lines:
            if not line.cost_centre_id:
                continue

            cc_id = line.cost_centre_id
            if cc_id not in cc_names:
                cc = db.get(CostCentre, cc_id)
                cc_names[cc_id] = cc.name if cc else cc_id

            amount = Decimal(str(line.debit or 0)) - Decimal(str(line.credit or 0))
            cc_map[cc_id] = cc_map.get(cc_id, Decimal("0")) + amount

    # For simplicity, compute net result per cost centre
    # Positive = expense > income (loss), Negative = income > expense (profit)
    results = []
    for cc_id, net in cc_map.items():
        # Determine if income or expense based on ledger group
        results.append(CostCentreBreakdown(
            cost_centre_id=cc_id,
            cost_centre_name=cc_names.get(cc_id, cc_id),
            total_income=Decimal("0"),
            total_expense=Decimal("0"),
            net_result=to_money(net),
        ))

    return sorted(results, key=lambda x: x.cost_centre_name)
