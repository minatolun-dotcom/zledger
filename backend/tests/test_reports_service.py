"""Unit tests for reports service: trial balance, P&L, balance sheet calculations."""
from decimal import Decimal

from app.models.accounting import AccountGroup, FinancialYear, Ledger
from app.models.voucher import Voucher, VoucherLine
from app.services.reports import get_balance_sheet, get_ledger_balances, get_profit_and_loss, get_trial_balance
from tests.conftest import create_db_company


def _create_fy(db, company_id: str) -> FinancialYear:
    fy = FinancialYear(company_id=company_id, name="2025-26", start_date="2025-04-01", end_date="2026-03-31")
    db.add(fy)
    db.commit()
    db.refresh(fy)
    return fy


def _create_group(db, company_id: str, name: str, nature: str) -> AccountGroup:
    g = AccountGroup(company_id=company_id, name=name, nature=nature, group_type="sub", is_system=True)
    db.add(g)
    db.commit()
    db.refresh(g)
    return g


def _create_ledger(db, company_id: str, group_id: str, name: str, ob: Decimal = Decimal("0"), ob_type: str = "Dr") -> Ledger:
    l = Ledger(company_id=company_id, name=name, group_id=group_id, opening_balance=float(ob), opening_balance_type=ob_type)
    db.add(l)
    db.commit()
    db.refresh(l)
    return l


def _create_income_ledger(db, company_id: str, group_id: str, name: str) -> Ledger:
    """Create a ledger with Cr opening balance type (income accounts)."""
    l = Ledger(company_id=company_id, name=name, group_id=group_id, opening_balance=0, opening_balance_type="Cr")
    db.add(l)
    db.commit()
    db.refresh(l)
    return l


def _create_voucher(db, company_id: str, vtype: str, number: str, date: str, lines: list[tuple[str, Decimal, Decimal]]) -> Voucher:
    v = Voucher(company_id=company_id, voucher_type=vtype, voucher_number=number, voucher_date=date)
    db.add(v)
    db.flush()
    for ledger_id, debit, credit in lines:
        db.add(VoucherLine(voucher_id=v.id, ledger_id=ledger_id, debit=float(debit), credit=float(credit)))
    db.commit()
    db.refresh(v)
    return v


class TestGetLedgerBalances:
    def test_no_vouchers(self, db):
        co = create_db_company(db, "RPT Test 1")
        fy = _create_fy(db, co.id)
        group = _create_group(db, co.id, "Assets", "assets")
        ledger = _create_ledger(db, co.id, group.id, "Cash", ob=Decimal("5000"), ob_type="Dr")

        result = get_ledger_balances(db, co.id, fy.start_date, fy.end_date)
        cash_bal = next(r for r in result if r.ledger_name == "Cash")
        assert cash_bal.closing_balance == Decimal("5000.00")
        assert cash_bal.closing_balance_type == "Dr"

    def test_debit_voucher(self, db):
        co = create_db_company(db, "RPT Test 2")
        fy = _create_fy(db, co.id)
        group = _create_group(db, co.id, "Assets", "assets")
        cash = _create_ledger(db, co.id, group.id, "Cash")
        bank = _create_ledger(db, co.id, group.id, "Bank")

        _create_voucher(db, co.id, "journal", "1", "2025-05-01", [
            (cash.id, Decimal("1000"), Decimal("0")),
            (bank.id, Decimal("0"), Decimal("1000")),
        ])

        result = get_ledger_balances(db, co.id, fy.start_date, fy.end_date)
        cash_bal = next(r for r in result if r.ledger_name == "Cash")
        bank_bal = next(r for r in result if r.ledger_name == "Bank")
        assert cash_bal.total_debit == Decimal("1000.00")
        assert bank_bal.total_credit == Decimal("1000.00")

    def test_opening_balance_type_cr(self, db):
        co = create_db_company(db, "RPT Test 3")
        fy = _create_fy(db, co.id)
        group = _create_group(db, co.id, "Liabilities", "liabilities")
        ledger = _create_ledger(db, co.id, group.id, "Loan", ob=Decimal("10000"), ob_type="Cr")

        # Debit of 5000 on a Cr-opening loan account
        _create_voucher(db, co.id, "payment", "1", "2025-05-01", [
            (ledger.id, Decimal("5000"), Decimal("0")),
        ])

        result = get_ledger_balances(db, co.id, fy.start_date, fy.end_date)
        loan = next(r for r in result if r.ledger_name == "Loan")
        # Cr opening: 10000, Dr movement: 5000 → net closing: 5000
        # Code convention: positive closing is labeled "Dr"
        assert loan.closing_balance == Decimal("5000.00")
        assert loan.total_debit == Decimal("5000.00")
        assert loan.total_credit == Decimal("0.00")

    def test_outside_fy_not_counted(self, db):
        co = create_db_company(db, "RPT Test 4")
        fy = _create_fy(db, co.id)
        group = _create_group(db, co.id, "Assets", "assets")
        cash = _create_ledger(db, co.id, group.id, "Cash")

        _create_voucher(db, co.id, "journal", "1", "2024-03-15", [
            (cash.id, Decimal("5000"), Decimal("0")),
        ])

        result = get_ledger_balances(db, co.id, fy.start_date, fy.end_date)
        cash_bal = next(r for r in result if r.ledger_name == "Cash")
        assert cash_bal.total_debit == Decimal("0.00")


class TestTrialBalance:
    def test_empty_trial_balance(self, db):
        co = create_db_company(db, "RPT Test 5")
        fy = _create_fy(db, co.id)
        result = get_trial_balance(db, co.id, fy.id)
        # Will have seeded ledgers (if any), but no voucher activity
        assert all(r.total_debit == Decimal("0") for r in result)

    def test_trial_balance_with_vouchers(self, db):
        co = create_db_company(db, "RPT Test 6")
        fy = _create_fy(db, co.id)
        income_group = _create_group(db, co.id, "Income", "income")
        asset_group = _create_group(db, co.id, "Assets", "assets")
        sales = _create_ledger(db, co.id, income_group.id, "Sales")
        bank = _create_ledger(db, co.id, asset_group.id, "Bank")

        _create_voucher(db, co.id, "sales", "1", "2025-06-01", [
            (bank.id, Decimal("11800"), Decimal("0")),
            (sales.id, Decimal("0"), Decimal("10000")),
        ])

        result = get_trial_balance(db, co.id, fy.id)
        assert len(result) >= 2


class TestProfitAndLoss:
    def test_profit(self, db):
        co = create_db_company(db, "RPT Test 7")
        fy = _create_fy(db, co.id)
        income_group = _create_group(db, co.id, "Direct Income", "income")
        expense_group = _create_group(db, co.id, "Direct Expenses", "expenses")
        sales = _create_income_ledger(db, co.id, income_group.id, "Sales")
        purchase = _create_ledger(db, co.id, expense_group.id, "Purchases")

        _create_voucher(db, co.id, "sales", "1", "2025-05-01", [
            (purchase.id, Decimal("30000"), Decimal("0")),
            (sales.id, Decimal("0"), Decimal("50000")),
        ])

        result = get_profit_and_loss(db, co.id, fy.id)
        assert result["total_income"] == Decimal("50000.00")
        assert result["total_expenses"] == Decimal("30000.00")
        assert result["net_profit"] == Decimal("20000.00")
        assert result["is_profit"] is True

    def test_loss(self, db):
        co = create_db_company(db, "RPT Test 8")
        fy = _create_fy(db, co.id)
        income_group = _create_group(db, co.id, "Income", "income")
        expense_group = _create_group(db, co.id, "Expenses", "expenses")
        sales = _create_income_ledger(db, co.id, income_group.id, "Sales")
        salary = _create_ledger(db, co.id, expense_group.id, "Salary")

        _create_voucher(db, co.id, "journal", "1", "2025-05-01", [
            (salary.id, Decimal("60000"), Decimal("0")),
            (sales.id, Decimal("0"), Decimal("40000")),
        ])

        result = get_profit_and_loss(db, co.id, fy.id)
        assert result["net_profit"] == Decimal("-20000.00")
        assert result["is_profit"] is False

    def test_no_income_or_expenses(self, db):
        co = create_db_company(db, "RPT Test 9")
        fy = _create_fy(db, co.id)
        result = get_profit_and_loss(db, co.id, fy.id)
        assert result["total_income"] == Decimal("0.00")
        assert result["total_expenses"] == Decimal("0.00")
        assert result["net_profit"] == Decimal("0.00")


class TestBalanceSheet:
    def test_balanced(self, db):
        co = create_db_company(db, "RPT Test 10")
        fy = _create_fy(db, co.id)
        asset_group = _create_group(db, co.id, "Current Assets", "assets")
        liab_group = _create_group(db, co.id, "Current Liabilities", "liabilities")
        capital_group = _create_group(db, co.id, "Capital", "capital")

        cash = _create_ledger(db, co.id, asset_group.id, "Cash", ob=Decimal("100000"), ob_type="Dr")
        loan = _create_ledger(db, co.id, liab_group.id, "Loan", ob=Decimal("50000"), ob_type="Cr")
        capital = _create_ledger(db, co.id, capital_group.id, "Capital", ob=Decimal("50000"), ob_type="Cr")

        result = get_balance_sheet(db, co.id, fy.id)
        assert result["total_assets"] == Decimal("100000.00")
        assert result["total_liabilities"] == Decimal("50000.00")
        assert result["total_capital"] == Decimal("50000.00")
        assert result["total_liabilities_and_capital"] == Decimal("100000.00")

    def test_with_voucher_movements(self, db):
        co = create_db_company(db, "RPT Test 11")
        fy = _create_fy(db, co.id)
        asset_group = _create_group(db, co.id, "Assets", "assets")
        liab_group = _create_group(db, co.id, "Liabilities", "liabilities")

        cash = _create_ledger(db, co.id, asset_group.id, "Cash", ob=Decimal("0"), ob_type="Dr")
        loan = _create_ledger(db, co.id, liab_group.id, "Loan", ob=Decimal("0"), ob_type="Cr")

        _create_voucher(db, co.id, "journal", "1", "2025-05-01", [
            (cash.id, Decimal("50000"), Decimal("0")),
            (loan.id, Decimal("0"), Decimal("50000")),
        ])

        result = get_balance_sheet(db, co.id, fy.id)
        assert result["total_assets"] == Decimal("50000.00")
        assert result["total_liabilities"] == Decimal("50000.00")

    def test_empty_balance_sheet(self, db):
        co = create_db_company(db, "RPT Test 12")
        fy = _create_fy(db, co.id)
        result = get_balance_sheet(db, co.id, fy.id)
        assert result["total_assets"] == Decimal("0.00")
        assert result["total_liabilities"] == Decimal("0.00")
        assert result["total_capital"] == Decimal("0.00")
