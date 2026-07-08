"""Seed Tally-style default account groups and ledgers for a new company.

Called once when a company is created. Groups follow Tally's hierarchy:
- Primary groups (Assets, Liabilities, Income, Expenses, Equity)
- Sub-groups under each primary group.

All built-in groups and system ledgers have immutable system_codes.
Users can rename display names but system_codes never change.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.accounting import AccountGroup, Ledger

# (name, nature, group_type, parent_key_or_None, is_system, system_code)
TALLY_GROUPS: list[tuple[str, str, str, str | None, bool, str]] = [
    # --- Equity (root) ---
    ("Equity", "capital", "primary", None, True, "GRP_EQUITY"),
    ("Capital Account", "capital", "sub", "Equity", True, "GRP_CAPITAL_ACCOUNT"),
    ("Drawings", "capital", "sub", "Equity", True, "GRP_DRAWINGS"),
    ("Reserves & Surplus", "capital", "sub", "Equity", True, "GRP_RESERVES_SURPLUS"),
    ("Profit & Loss A/c", "capital", "sub", "Equity", True, "GRP_PROFIT_LOSS"),
    ("Opening Balance Equity", "capital", "sub", "Equity", True, "GRP_OPENING_BALANCE_EQUITY"),

    # --- Assets ---
    ("Current Assets", "assets", "primary", None, True, "GRP_CURRENT_ASSETS"),
    ("Bank Accounts", "assets", "sub", "Current Assets", True, "GRP_BANK_ACCOUNTS"),
    ("Cash-in-Hand", "assets", "sub", "Current Assets", True, "GRP_CASH_IN_HAND"),
    ("Deposits (Assets)", "assets", "sub", "Current Assets", True, "GRP_DEPOSITS_ASSETS"),
    ("Loans & Advances (Assets)", "assets", "sub", "Current Assets", True, "GRP_LOANS_ADVANCES_ASSETS"),
    ("Stock-in-Hand", "assets", "sub", "Current Assets", True, "GRP_STOCK_IN_HAND"),
    ("Sundry Debtors", "assets", "sub", "Current Assets", True, "GRP_SUNDRY_DEBTORS"),
    ("Suspense A/c", "assets", "sub", "Current Assets", True, "GRP_SUSPENSE"),
    ("Fixed Assets", "assets", "primary", None, True, "GRP_FIXED_ASSETS"),
    ("Investments", "assets", "primary", None, True, "GRP_INVESTMENTS"),

    # --- Liabilities ---
    ("Current Liabilities", "liabilities", "primary", None, True, "GRP_CURRENT_LIABILITIES"),
    ("Duties & Taxes", "liabilities", "sub", "Current Liabilities", True, "GRP_DUTIES_TAXES"),
    ("GST Input", "liabilities", "sub", "Duties & Taxes", True, "GRP_GST_INPUT"),
    ("GST Output", "liabilities", "sub", "Duties & Taxes", True, "GRP_GST_OUTPUT"),
    ("Reverse Charge", "liabilities", "sub", "Duties & Taxes", True, "GRP_REVERSE_CHARGE"),
    ("Provisions", "liabilities", "sub", "Current Liabilities", True, "GRP_PROVISIONS"),
    ("Sundry Creditors", "liabilities", "sub", "Current Liabilities", True, "GRP_SUNDRY_CREDITORS"),
    ("Loans & Advances (Liabilities)", "liabilities", "primary", None, True, "GRP_LOANS_ADVANCES_LIABILITIES"),

    # --- Income ---
    ("Sales Accounts", "income", "primary", None, True, "GRP_SALES_ACCOUNTS"),
    ("Purchase Accounts", "income", "primary", None, True, "GRP_PURCHASE_ACCOUNTS"),
    ("Direct Incomes", "income", "primary", None, True, "GRP_DIRECT_INCOMES"),
    ("Indirect Incomes", "income", "primary", None, True, "GRP_INDIRECT_INCOMES"),

    # --- Expenses ---
    ("Direct Expenses", "expenses", "primary", None, True, "GRP_DIRECT_EXPENSES"),
    ("Indirect Expenses", "expenses", "primary", None, True, "GRP_INDIRECT_EXPENSES"),
]

# (ledger_name, group_name, system_code, is_protected)
DEFAULT_LEDGERS: list[tuple[str, str, str, bool]] = [
    ("Cash", "Cash-in-Hand", "SYS_CASH", True),
    ("Bank Account", "Bank Accounts", "SYS_BANK_ACCOUNT", True),
    ("Capital Account", "Capital Account", "SYS_CAPITAL_ACCOUNT", True),
    ("Sales", "Sales Accounts", "SYS_SALES", True),
    ("Purchases", "Purchase Accounts", "SYS_PURCHASES", True),
]

# System ledgers seeded for every company (non-GST utility ledgers)
SYSTEM_LEDGERS: list[tuple[str, str, str, str]] = [
    # (ledger_name, group_system_code, ledger_system_code, opening_balance_type)
    ("Round Off", "GRP_INDIRECT_INCOMES", "SYS_ROUND_OFF", "Cr"),
    ("Discount Allowed", "GRP_INDIRECT_INCOMES", "SYS_DISCOUNT_ALLOWED", "Cr"),
    ("Discount Received", "GRP_INDIRECT_EXPENSES", "SYS_DISCOUNT_RECEIVED", "Dr"),
    ("Bank Charges", "GRP_INDIRECT_EXPENSES", "SYS_BANK_CHARGES", "Dr"),
    ("Interest Paid", "GRP_INDIRECT_EXPENSES", "SYS_INTEREST_PAID", "Dr"),
    ("Interest Received", "GRP_INDIRECT_INCOMES", "SYS_INTEREST_RECEIVED", "Cr"),
    ("Freight Inward", "GRP_DIRECT_EXPENSES", "SYS_FREIGHT_INWARD", "Dr"),
    ("Inventory Adjustment", "GRP_DIRECT_EXPENSES", "SYS_INVENTORY_ADJUSTMENT", "Dr"),
    ("Miscellaneous Expenses", "GRP_INDIRECT_EXPENSES", "SYS_MISCELLANEOUS_EXPENSES", "Dr"),
    ("Cost of Production", "GRP_DIRECT_EXPENSES", "SYS_COST_OF_PRODUCTION", "Dr"),
    ("Work in Progress", "GRP_STOCK_IN_HAND", "SYS_WORK_IN_PROGRESS", "Dr"),
]


def seed_groups(db: Session, company_id: str) -> None:
    """Insert default Tally-style groups for a company. Idempotent."""
    existing = db.query(AccountGroup).filter(AccountGroup.company_id == company_id).count()
    if existing > 0:
        return

    created: dict[str, AccountGroup] = {}
    # Two-pass: first create all groups (parents first), then set parent_id.
    for name, nature, gtype, parent_key, is_system, system_code in TALLY_GROUPS:
        ag = AccountGroup(
            company_id=company_id,
            name=name,
            system_code=system_code,
            group_type=gtype,
            nature=nature,
            is_system=is_system,
            parent_id=None,
        )
        db.add(ag)
        db.flush()
        created[name] = ag

    # Second pass: link parents
    for name, nature, gtype, parent_key, is_system, system_code in TALLY_GROUPS:
        if parent_key and parent_key in created:
            created[name].parent_id = created[parent_key].id

    db.commit()


def seed_default_ledgers(db: Session, company_id: str) -> None:
    """Insert essential default ledgers for a new company. Idempotent."""
    existing = db.query(Ledger).filter(Ledger.company_id == company_id).count()
    if existing > 0:
        return

    group_map: dict[str, AccountGroup] = {}
    for ag in db.query(AccountGroup).filter(AccountGroup.company_id == company_id).all():
        group_map[ag.name] = ag

    for ledger_name, group_name, system_code, is_protected in DEFAULT_LEDGERS:
        grp = group_map.get(group_name)
        if not grp:
            continue
        db.add(Ledger(
            company_id=company_id,
            name=ledger_name,
            system_code=system_code,
            group_id=grp.id,
            opening_balance=0,
            opening_balance_type="Cr",
            is_active=True,
            is_protected=is_protected,
        ))

    db.commit()


def seed_system_ledgers(db: Session, company_id: str) -> None:
    """Insert system utility ledgers (Round Off, Discount, etc.). Idempotent."""
    existing = db.query(Ledger).filter(
        Ledger.company_id == company_id,
        Ledger.system_code.isnot(None),
    ).count()
    if existing > 0:
        return

    group_by_code: dict[str, AccountGroup] = {}
    for ag in db.query(AccountGroup).filter(AccountGroup.company_id == company_id).all():
        if ag.system_code:
            group_by_code[ag.system_code] = ag

    for ledger_name, group_sys_code, ledger_sys_code, bal_type in SYSTEM_LEDGERS:
        grp = group_by_code.get(group_sys_code)
        if not grp:
            continue
        db.add(Ledger(
            company_id=company_id,
            name=ledger_name,
            system_code=ledger_sys_code,
            group_id=grp.id,
            opening_balance=0,
            opening_balance_type=bal_type,
            is_active=True,
            is_protected=True,
        ))

    db.commit()
