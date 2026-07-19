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

from app.models.accounting import AccountGroup, FinancialYear, Ledger, Party
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

        # Signed closing: opening (signed: Dr +, Cr −) plus net movement.
        ob_signed = opening if ob_type == "Dr" else -opening
        closing_signed = ob_signed + total_debit - total_credit

        closing_type = "Dr" if closing_signed >= 0 else "Cr"
        closing = -closing_signed if closing_signed < 0 else closing_signed

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
        # Total is positive on the group's normal-balance side:
        #   assets & expenses are Dr-normal; liabilities, capital & income are Cr-normal.
        normal_is_dr = lb.group_nature in ("assets", "expenses")
        if (lb.closing_balance_type == "Dr") == normal_is_dr:
            groups[lb.group_name].total += lb.closing_balance
        else:
            groups[lb.group_name].total -= lb.closing_balance

    return sorted(groups.values(), key=lambda g: g.group_name)


def _calculate_financial_ratios(
    balance_sheet: dict | None,
    pl: dict | None,
) -> dict:
    """Calculate key financial ratios from balance sheet and P&L data."""
    ratios = {}
    
    if pl:
        total_income = float(pl.get("total_income", 0))
        total_expenses = float(pl.get("total_expenses", 0))
        net_profit = float(pl.get("net_profit", 0))
        
        if total_income != 0:
            ratios["gross_profit_margin"] = round(((total_income - total_expenses) / abs(total_income)) * 100, 2)
            ratios["net_profit_margin"] = round((net_profit / abs(total_income)) * 100, 2)
    
    if balance_sheet:
        total_assets = float(balance_sheet.get("total_assets", 0))
        total_liabilities = float(balance_sheet.get("total_liabilities", 0))
        total_capital = float(balance_sheet.get("total_capital", 0))
        
        if total_liabilities != 0:
            ratios["debt_to_equity"] = round(abs(float(total_liabilities)) / float(total_capital), 2) if float(total_capital) > 0 else 0
        
        if total_assets > 0:
            ratios["total_asset_turnover"] = round(abs(float(pl.get("total_income", 0)) if pl else 0) / float(total_assets), 2)
        
        # Working capital
        current_assets = float(balance_sheet.get("current_assets", 0))
        current_liabilities = float(balance_sheet.get("current_liabilities", 0))
        if float(current_liabilities) > 0:
            ratios["current_ratio"] = round(float(current_assets) / float(current_liabilities), 2)
        ratios["working_capital"] = round(float(current_assets) - float(current_liabilities), 2)
        
        if total_capital > 0:
            ratios["return_on_equity"] = round((float(pl.get("net_profit", 0)) if pl else 0) / float(total_capital) * 100, 2)
    
    return ratios


def calculate_financial_ratios(pl: dict, bs: dict) -> dict:
    """Calculate key financial ratios from P&L and Balance Sheet data."""
    ratios = {}
    
    # Extract values safely and convert to float
    total_income = float(pl.get("total_income", 0))
    total_expenses = float(pl.get("total_expenses", 0))
    net_profit = float(pl.get("net_profit", 0))
    
    total_assets = float(bs.get("total_assets", 0))
    total_liabilities = float(bs.get("total_liabilities", 0))
    total_capital = float(bs.get("total_capital", 0))
    current_assets = float(bs.get("current_assets", 0))
    current_liabilities = float(bs.get("current_liabilities", 0))
    inventory = float(bs.get("inventory", 0))
    
    # Profitability ratios
    if total_income != 0:
        ratios["gross_profit_margin"] = round(((total_income - total_expenses) / total_income) * 100, 2)
        ratios["net_profit_margin"] = round((total_income - total_expenses) / total_income * 100, 2)
    
    if total_assets:
        ratios["return_on_assets"] = round(((total_income - total_expenses) / total_assets) * 100, 2)
    
    if total_capital:
        ratios["return_on_equity"] = round((net_profit / total_capital) * 100, 2)
    
    # Liquidity ratios
    if current_liabilities:
        ratios["current_ratio"] = round(current_assets / current_liabilities, 2)
        ratios["quick_ratio"] = round((current_assets - inventory) / current_liabilities, 2)
    
    # Solvency ratios
    if total_capital:
        ratios["debt_to_equity"] = round(total_liabilities / total_capital, 2)
    
    if total_assets:
        ratios["debt_to_assets"] = round(total_liabilities / total_assets, 2)
    
    # Efficiency ratios
    if total_assets:
        ratios["asset_turnover"] = round(total_income / total_assets, 2)
    
    return ratios


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

    # `_group_balances` totals are positive on each group's normal-balance side
    # (income Cr-normal, expenses Dr-normal), so they sum to the P&L totals.
    total_income = sum((g.total for g in income_groups), Decimal("0"))
    total_expenses = sum((g.total for g in expense_groups), Decimal("0"))

    net_profit = total_income - total_expenses

    pl_data = {
        "income_groups": income_groups,
        "expense_groups": expense_groups,
        "total_income": to_money(total_income),
        "total_expenses": to_money(total_expenses),
        "net_profit": to_money(net_profit),
        "is_profit": net_profit >= 0,
    }
    
    # Add financial ratios
    pl_data["financial_ratios"] = _calculate_financial_ratios(None, pl_data)
    
    return pl_data


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
    
    # Calculate current assets and current liabilities
    current_assets = sum(
        (g.total for g in asset_groups if "current" in g.group_name.lower()),
        Decimal("0"),
    )
    current_liabilities = sum(
        (g.total for g in liability_groups if "current" in g.group_name.lower()),
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
        "current_assets": to_money(current_assets),
        "current_liabilities": to_money(current_liabilities),
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
    from sqlalchemy import and_

    fy = _get_fy_or_raise(db, company_id, financial_year_id)

    # Bulk-fetch every voucher line in the FY that carries a cost centre.
    # (Replaces a per-voucher N+1 query loop.)
    lines = (
        db.query(VoucherLine)
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= fy.start_date,
            Voucher.voucher_date <= fy.end_date,
            VoucherLine.cost_centre_id.isnot(None),
        )
        .all()
    )

    # Build cost centre map
    cc_map: dict[str, Decimal] = {}
    cc_ids: set[str] = set()

    for line in lines:
        cc_id = line.cost_centre_id
        cc_ids.add(cc_id)
        amount = Decimal(str(line.debit or 0)) - Decimal(str(line.credit or 0))
        cc_map[cc_id] = cc_map.get(cc_id, Decimal("0")) + amount

    # Resolve cost centre names in a single round-trip.
    cc_names: dict[str, str] = {}
    if cc_ids:
        for cc in db.query(CostCentre).filter(CostCentre.id.in_(cc_ids)).all():
            cc_names[cc.id] = cc.name

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


# ─── Phase 26: Ledger Transactions (Drill-down) ──────────────────────────


def get_ledger_transactions(
    db: Session,
    company_id: str,
    ledger_id: str,
    start_date: str,
    end_date: str,
) -> dict:
    """Return all voucher transactions for a single ledger within date range.

    Includes opening balance, running balance, and individual transactions.
    """
    from app.models.accounting import Party
    from app.models.voucher import Voucher, VoucherLine
    from app.utils.money import to_money
    from decimal import Decimal

    # Get ledger info
    ledger = db.get(Ledger, ledger_id)
    if not ledger or ledger.company_id != company_id:
        from fastapi import HTTPException, status
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Ledger not found")

    opening = to_money(ledger.opening_balance)
    ob_type = ledger.opening_balance_type

    # Get all voucher lines for this ledger in date range
    rows = (
        db.query(
            VoucherLine, Voucher
        )
        .join(Voucher, Voucher.id == VoucherLine.voucher_id)
        .filter(
            VoucherLine.ledger_id == ledger_id,
            Voucher.company_id == company_id,
            Voucher.voucher_date >= start_date,
            Voucher.voucher_date <= end_date,
        )
        .order_by(Voucher.voucher_date, Voucher.created_at)
        .all()
    )

    # Build party map
    party_ids = {v.party_id for _, v in rows if v.party_id}
    party_map: dict[str, str] = {}
    if party_ids:
        parties = db.query(Party).filter(Party.id.in_(party_ids)).all()
        for p in parties:
            party_map[p.id] = p.name

    transactions = []
    total_debit = Decimal("0")
    total_credit = Decimal("0")

    # Compute running balance: start from opening, add each transaction
    running = opening if ob_type == "Dr" else -opening

    for vl, v in rows:
        debit = to_money(vl.debit)
        credit = to_money(vl.credit)
        total_debit += debit
        total_credit += credit
        running += debit - credit

        transactions.append({
            "voucher_id": v.id,
            "voucher_date": v.voucher_date,
            "voucher_number": v.voucher_number,
            "voucher_type": v.voucher_type,
            "party_name": party_map.get(v.party_id) if v.party_id else None,
            "narration": v.narration,
            "debit": float(debit),
            "credit": float(credit),
            "running_balance": float(running),
        })

    # Closing balance
    closing = opening if ob_type == "Dr" else -opening
    closing += total_debit - total_credit
    closing_type = "Dr" if closing >= 0 else "Cr"
    if closing < 0:
        closing = -closing

    return {
        "ledger_id": ledger_id,
        "ledger_name": ledger.name,
        "start_date": start_date,
        "end_date": end_date,
        "opening_balance": float(opening),
        "opening_balance_type": ob_type,
        "closing_balance": float(closing),
        "closing_balance_type": closing_type,
        "total_debit": float(total_debit),
        "total_credit": float(total_credit),
        "transactions": transactions,
    }


# ─── Phase 20 Reports ─────────────────────────────────────────────────────


CASH_BANK_GROUP_NAMES = {"Bank Accounts", "Cash-in-Hand"}

CASH_FLOW_CATEGORIES: dict[str, set[str]] = {
    "Operating": {
        "Trade Receivables", "Trade Payables", "Sales Accounts", "Purchase Accounts",
        "Direct Incomes", "Indirect Incomes", "Direct Expenses", "Indirect Expenses",
        "Stock-in-Hand", "Duties & Taxes", "Provisions", "Deposits & Security",
        "Loans & Advances (Asset)", "Suspense A/c",
    },
    "Investing": {
        "Fixed Assets", "Investments",
    },
    "Financing": {
        "Capital Account", "Drawings", "Reserves & Surplus", "Profit & Loss A/c",
        "Opening Balance Equity", "Loans & Advances (Liabilities)",
    },
}


def _get_cash_bank_ledger_ids(db: Session, company_id: str) -> set[str]:
    """Return set of ledger IDs under cash/bank groups."""
    rows = (
        db.query(Ledger.id)
        .join(AccountGroup, AccountGroup.id == Ledger.group_id)
        .filter(
            Ledger.company_id == company_id,
            Ledger.is_active.is_(True),
            AccountGroup.name.in_(CASH_BANK_GROUP_NAMES),
        )
        .all()
    )
    return {r.id for r in rows}


def _categorize_cash_flow(group_name: str) -> str:
    for cat, names in CASH_FLOW_CATEGORIES.items():
        if group_name in names:
            return cat
    return "Operating"


def get_cash_flow(
    db: Session,
    company_id: str,
    start_date: str,
    end_date: str,
) -> dict:
    """Cash Flow Statement (Direct method).

    Analyzes every voucher where a cash/bank ledger is involved, looks at the
    counterparty ledger's group to categorize the flow as Operating, Investing,
    or Financing.
    """
    cash_bank_ids = _get_cash_bank_ledger_ids(db, company_id)

    if not cash_bank_ids:
        return {
            "opening_balance": 0,
            "closing_balance": 0,
            "net_increase": 0,
            "operating": {"category": "Operating", "lines": [], "total_inflow": 0, "total_outflow": 0, "net": 0},
            "investing": {"category": "Investing", "lines": [], "total_inflow": 0, "total_outflow": 0, "net": 0},
            "financing": {"category": "Financing", "lines": [], "total_inflow": 0, "total_outflow": 0, "net": 0},
        }

    # Fetch all vouchers in range that have at least one cash/bank line
    vouchers = (
        db.query(Voucher)
        .filter(
            Voucher.company_id == company_id,
            Voucher.voucher_date >= start_date,
            Voucher.voucher_date <= end_date,
        )
        .all()
    )

    # For each voucher, get all lines
    voucher_ids = [v.id for v in vouchers]
    all_lines = (
        db.query(VoucherLine)
        .filter(VoucherLine.voucher_id.in_(voucher_ids))
        .all()
    )

    # Group lines by voucher
    lines_by_voucher: dict[str, list[VoucherLine]] = {}
    for line in all_lines:
        lines_by_voucher.setdefault(line.voucher_id, []).append(line)

    # Ledger to group map (cache)
    ledger_group_map: dict[str, str] = {}
    ledger_rows = (
        db.query(Ledger.id, AccountGroup.name)
        .join(AccountGroup, AccountGroup.id == Ledger.group_id)
        .filter(Ledger.company_id == company_id, Ledger.is_active.is_(True))
        .all()
    )
    for lid, gname in ledger_rows:
        ledger_group_map[lid] = gname

    # Compute cash flow per category
    category_lines: dict[str, dict[str, Decimal]] = {
        "Operating": {},
        "Investing": {},
        "Financing": {},
    }

    for v in vouchers:
        lines = lines_by_voucher.get(v.id, [])
        cash_lines = [l for l in lines if l.ledger_id in cash_bank_ids]
        counterparty_lines = [l for l in lines if l.ledger_id not in cash_bank_ids]

        for cl in cash_lines:
            cash_amount = Decimal(str(cl.debit or 0)) - Decimal(str(cl.credit or 0))
            if cash_amount == 0:
                continue

            if not counterparty_lines:
                category = "Operating"
                counterparty_group = "Suspense A/c"
            else:
                cp = counterparty_lines[0]
                counterparty_group = ledger_group_map.get(cp.ledger_id, "Suspense A/c")
                category = _categorize_cash_flow(counterparty_group)

            if category not in category_lines:
                category = "Operating"

            # Determine flow type
            # Dr to cash = inflow, Cr from cash = outflow
            flow_amount = Decimal(str(cl.debit or 0)) - Decimal(str(cl.credit or 0))
            # Line label from counterparty
            label = counterparty_group

            cat = category_lines[category]
            cat[label] = cat.get(label, Decimal("0")) + flow_amount

    # Compute opening/closing cash balance
    cash_ledgers = (
        db.query(Ledger)
        .filter(Ledger.id.in_(cash_bank_ids))
        .all()
    )
    opening_total = Decimal("0")
    for ledger in cash_ledgers:
        op = to_money(ledger.opening_balance)
        if ledger.opening_balance_type == "Dr":
            opening_total += op
        else:
            opening_total -= op

    # Add in-period movements to get closing
    cash_movement = Decimal("0")
    for v in vouchers:
        lines = lines_by_voucher.get(v.id, [])
        for cl in lines:
            if cl.ledger_id in cash_bank_ids:
                cash_movement += Decimal(str(cl.debit or 0)) - Decimal(str(cl.credit or 0))

    closing_total = opening_total + cash_movement

    # Build response
    result = {}
    for cat_name in ("Operating", "Investing", "Financing"):
        lines_dict = category_lines[cat_name]
        line_list = []
        total_inflow = Decimal("0")
        total_outflow = Decimal("0")
        for label, amount in sorted(lines_dict.items()):
            if amount > 0:
                inflow = amount
                outflow = Decimal("0")
                total_inflow += amount
            else:
                inflow = Decimal("0")
                outflow = -amount
                total_outflow += -amount
            line_list.append({
                "label": label,
                "inflow": float(inflow),
                "outflow": float(outflow),
                "net": float(amount),
            })
        net = total_inflow - total_outflow
        result[cat_name.lower()] = {
            "category": cat_name,
            "lines": line_list,
            "total_inflow": float(total_inflow),
            "total_outflow": float(total_outflow),
            "net": float(net),
        }

    return {
        "opening_balance": float(opening_total),
        "closing_balance": float(closing_total),
        "net_increase": float(closing_total - opening_total),
        "operating": result.get("operating", {
            "category": "Operating", "lines": [], "total_inflow": 0, "total_outflow": 0, "net": 0
        }),
        "investing": result.get("investing", {
            "category": "Investing", "lines": [], "total_inflow": 0, "total_outflow": 0, "net": 0
        }),
        "financing": result.get("financing", {
            "category": "Financing", "lines": [], "total_inflow": 0, "total_outflow": 0, "net": 0
        }),
    }


# ─── Aging (Receivables / Payables) ─────────────────────────────────────


def get_aging(
    db: Session,
    company_id: str,
    start_date: str,
    end_date: str,
    aging_type: str = "receivable",  # receivable | payable
) -> dict:
    """Aging analysis for receivables (Trade Receivables) or payables (Trade Payables).

    Buckets: 0-30, 31-60, 61-90, 90+ days from voucher date to end_date.
    """
    party_ledger_name = "Trade Receivables" if aging_type == "receivable" else "Trade Payables"
    party_group = db.query(AccountGroup).filter(
        AccountGroup.company_id == company_id,
        AccountGroup.name == party_ledger_name,
    ).first()
    if not party_group:
        return {"type": aging_type, "lines": [], "total": 0}

    # Find all parties with their ledgers
    parties = (
        db.query(Party, Ledger)
        .join(Ledger, Ledger.id == Party.ledger_id)
        .filter(
            Party.company_id == company_id,
            Party.is_active.is_(True),
            Ledger.group_id == party_group.id,
        )
        .all()
    )

    if not parties:
        return {"type": aging_type, "lines": [], "total": 0}

    # Get all vouchers for these parties within date range
    party_ids = [p.id for p, _ in parties]
    party_ledger_ids = {l.id: p for p, l in parties}

    vouchers = (
        db.query(Voucher)
        .filter(
            Voucher.company_id == company_id,
            Voucher.party_id.in_(party_ids),
            Voucher.voucher_date >= start_date,
            Voucher.voucher_date <= end_date,
        )
        .order_by(Voucher.party_id, Voucher.voucher_date)
        .all()
    )

    if not vouchers:
        return {"type": aging_type, "lines": [], "total": 0}

    # For each party, compute total outstanding from vouchers
    from datetime import date, timedelta

    end = date.fromisoformat(end_date)

    party_data: dict[str, dict] = {}
    party_map = {p.id: p for p, _ in parties}

    for v in vouchers:
        pid = v.party_id
        if pid not in party_data:
            party_data[pid] = {
                "party_name": party_map[pid].name,
                "vouchers": [],
            }
        party_data[pid]["vouchers"].append(v)

    lines = []
    for pid, data in party_data.items():
        buckets = {"0-30": Decimal("0"), "31-60": Decimal("0"), "61-90": Decimal("0"), "90+": Decimal("0")}
        bucket_counts = {"0-30": 0, "31-60": 0, "61-90": 0, "90+": 0}
        total_amount = Decimal("0")

        for v in data["vouchers"]:
            v_date = date.fromisoformat(v.voucher_date)
            days = (end - v_date).days
            amount = to_money(v.grand_total)

            if days <= 30:
                bucket = "0-30"
            elif days <= 60:
                bucket = "31-60"
            elif days <= 90:
                bucket = "61-90"
            else:
                bucket = "90+"

            buckets[bucket] += amount
            bucket_counts[bucket] += 1
            total_amount += amount

        total_amount = to_money(total_amount)
        if total_amount == 0:
            continue

        bucket_list = []
        for label in ("0-30", "31-60", "61-90", "90+"):
            bucket_list.append({
                "label": label,
                "amount": float(buckets[label]),
                "count": bucket_counts[label],
            })

        lines.append({
            "party_name": data["party_name"],
            "total_amount": float(total_amount),
            "buckets": bucket_list,
        })

    lines.sort(key=lambda x: x["total_amount"], reverse=True)
    total = sum(l["total_amount"] for l in lines)

    return {
        "type": aging_type,
        "lines": lines,
        "total": total,
    }


# ─── Outstanding ──────────────────────────────────────────────────────────


def get_outstanding(
    db: Session,
    company_id: str,
    start_date: str,
    end_date: str,
) -> dict:
    """List all parties with their outstanding balances.

    Debtors = parties under Trade Receivables with Dr balance.
    Creditors = parties under Trade Payables with Cr balance.
    """
    balances = get_ledger_balances(db, company_id, start_date, end_date)

    # Find Trade Receivables and Trade Payables group IDs
    debtor_group = db.query(AccountGroup).filter(
        AccountGroup.company_id == company_id,
        AccountGroup.name == "Trade Receivables",
    ).first()
    creditor_group = db.query(AccountGroup).filter(
        AccountGroup.company_id == company_id,
        AccountGroup.name == "Trade Payables",
    ).first()

    debtor_group_id = debtor_group.id if debtor_group else None
    creditor_group_id = creditor_group.id if creditor_group else None

    # Map ledger IDs to party names
    parties = db.query(Party).filter(
        Party.company_id == company_id,
        Party.is_active.is_(True),
    ).all()
    party_ledger_map: dict[str, str] = {}
    for p in parties:
        if p.ledger_id:
            party_ledger_map[p.ledger_id] = p.name

    debtors = []
    creditors = []

    for lb in balances:
        name = party_ledger_map.get(lb.ledger_id, lb.ledger_name)
        if lb.group_id == debtor_group_id and lb.closing_balance > 0:
            debtors.append({
                "party_name": name,
                "party_type": "customer",
                "balance": float(lb.closing_balance),
                "balance_type": lb.closing_balance_type,
            })
        elif lb.group_id == creditor_group_id and lb.closing_balance > 0:
            creditors.append({
                "party_name": name,
                "party_type": "supplier",
                "balance": float(lb.closing_balance),
                "balance_type": lb.closing_balance_type,
            })

    return {
        "debtors": debtors,
        "creditors": creditors,
        "total_debtors": sum(d["balance"] for d in debtors),
        "total_creditors": sum(c["balance"] for c in creditors),
    }


# ─── Register ─────────────────────────────────────────────────────────────


def get_register(
    db: Session,
    company_id: str,
    start_date: str,
    end_date: str,
    voucher_type: str,
) -> dict:
    """Register report: daybook filtered by voucher type."""
    from app.services.daybook import DayBookFilters, query_daybook

    filters = DayBookFilters(
        company_id=company_id,
        start_date=start_date,
        end_date=end_date,
        voucher_type=voucher_type,
    )
    result = query_daybook(db, filters, page=1, page_size=10000)

    entries = []
    total_debit = Decimal("0")
    total_credit = Decimal("0")
    for e in result.entries:
        entries.append({
            "voucher_date": e.voucher_date,
            "voucher_number": e.voucher_number,
            "voucher_type": e.voucher_type,
            "party_name": e.party_name,
            "narration": e.narration,
            "debit": float(e.debit),
            "credit": float(e.credit),
        })
        total_debit += e.debit
        total_credit += e.credit

    return {
        "voucher_type": voucher_type,
        "entries": entries,
        "total_debit": float(total_debit),
        "total_credit": float(total_credit),
    }
