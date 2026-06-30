"""Unit tests for dashboard service: get_dashboard_summary."""
from decimal import Decimal

import pytest

from app.models.accounting import AccountGroup, FinancialYear, GstRegistration, Ledger, Party
from app.models.voucher import Voucher, VoucherLine
from app.services.dashboard import get_dashboard_summary
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


def _create_ledger(db, company_id: str, group_id: str, name: str) -> Ledger:
    l = Ledger(company_id=company_id, name=name, group_id=group_id, opening_balance=0, opening_balance_type="Dr")
    db.add(l)
    db.commit()
    db.refresh(l)
    return l


def _create_voucher(db, company_id: str, vtype: str, number: str, date: str, lines: list) -> Voucher:
    v = Voucher(company_id=company_id, voucher_type=vtype, voucher_number=number, voucher_date=date)
    db.add(v)
    db.flush()
    for ledger_id, debit, credit in lines:
        db.add(VoucherLine(voucher_id=v.id, ledger_id=ledger_id, debit=float(debit), credit=float(credit)))
    db.commit()
    db.refresh(v)
    return v


def _create_income_ledger(db, company_id: str, group_id: str, name: str) -> Ledger:
    l = Ledger(company_id=company_id, name=name, group_id=group_id, opening_balance=0, opening_balance_type="Cr")
    db.add(l)
    db.commit()
    db.refresh(l)
    return l


class TestDashboardSummary:
    def test_empty_dashboard(self, db):
        co = create_db_company(db, "Dash Test 1")
        fy = _create_fy(db, co.id)
        result = get_dashboard_summary(db, co.id, fy.id)
        assert result.financial_year_name == "2025-26"
        assert result.total_income == 0.0
        assert result.total_expenses == 0.0
        assert result.voucher_count == 0
        assert result.recent_vouchers == []

    def test_voucher_counts(self, db):
        co = create_db_company(db, "Dash Test 2")
        fy = _create_fy(db, co.id)
        income_group = _create_group(db, co.id, "Income", "income")
        asset_group = _create_group(db, co.id, "Assets", "assets")
        sales_ledger = _create_income_ledger(db, co.id, income_group.id, "Sales")
        bank_ledger = _create_ledger(db, co.id, asset_group.id, "Bank")

        lines = [(bank_ledger.id, Decimal("1000"), Decimal("0")), (sales_ledger.id, Decimal("0"), Decimal("1000"))]
        _create_voucher(db, co.id, "sales", "1", "2025-06-01", lines)
        _create_voucher(db, co.id, "sales", "2", "2025-06-02", lines)
        _create_voucher(db, co.id, "receipt", "1", "2025-06-03", lines)

        result = get_dashboard_summary(db, co.id, fy.id)
        assert result.voucher_count == 3
        assert result.sales_count == 2
        assert result.receipt_count == 1
        assert result.purchase_count == 0

    def test_entity_counts(self, db):
        co = create_db_company(db, "Dash Test 3")
        fy = _create_fy(db, co.id)
        group = _create_group(db, co.id, "Assets", "assets")
        _create_ledger(db, co.id, group.id, "Cash")
        _create_ledger(db, co.id, group.id, "Bank")

        party = Party(company_id=co.id, name="Customer A", party_type="customer")
        db.add(party)
        gstin = GstRegistration(company_id=co.id, gstin="27AABCU9603R1ZM", legal_name="Corp", state_code="27")
        db.add(gstin)
        db.commit()

        result = get_dashboard_summary(db, co.id, fy.id)
        assert result.ledger_count == 2
        assert result.party_count == 1
        assert result.group_count >= 1
        assert result.gst_registration_count == 1

    def test_recent_vouchers(self, db):
        co = create_db_company(db, "Dash Test 4")
        fy = _create_fy(db, co.id)
        income_group = _create_group(db, co.id, "Income", "income")
        asset_group = _create_group(db, co.id, "Assets", "assets")
        sales = _create_income_ledger(db, co.id, income_group.id, "Sales")
        bank = _create_ledger(db, co.id, asset_group.id, "Bank")

        lines = [(bank.id, Decimal("100"), Decimal("0")), (sales.id, Decimal("0"), Decimal("100"))]
        for i in range(1, 6):
            _create_voucher(db, co.id, "sales", str(i), f"2025-06-{i:02d}", lines)

        result = get_dashboard_summary(db, co.id, fy.id)
        assert len(result.recent_vouchers) == 5
        assert result.recent_vouchers[0]["voucher_date"] == "2025-06-05"

    def test_invalid_fy_raises(self, db):
        co = create_db_company(db, "Dash Test 5")
        with pytest.raises(ValueError, match="not found"):
            get_dashboard_summary(db, co.id, "nonexistent-fy")

    def test_fy_wrong_company_raises(self, db):
        co1 = create_db_company(db, "Dash Test 6a")
        co2 = create_db_company(db, "Dash Test 6b")
        fy = _create_fy(db, co1.id)
        with pytest.raises(ValueError, match="not found"):
            get_dashboard_summary(db, co2.id, fy.id)

    def test_pnl_and_bs_in_summary(self, db):
        co = create_db_company(db, "Dash Test 7")
        fy = _create_fy(db, co.id)
        income_group = _create_group(db, co.id, "Income", "income")
        expense_group = _create_group(db, co.id, "Expenses", "expenses")
        asset_group = _create_group(db, co.id, "Assets", "assets")

        sales = _create_income_ledger(db, co.id, income_group.id, "Sales")
        salary = _create_ledger(db, co.id, expense_group.id, "Salary")
        bank = _create_ledger(db, co.id, asset_group.id, "Bank")

        _create_voucher(db, co.id, "sales", "1", "2025-06-01", [
            (bank.id, Decimal("50000"), Decimal("0")),
            (sales.id, Decimal("0"), Decimal("50000")),
        ])
        _create_voucher(db, co.id, "payment", "1", "2025-06-02", [
            (salary.id, Decimal("30000"), Decimal("0")),
            (bank.id, Decimal("0"), Decimal("30000")),
        ])

        result = get_dashboard_summary(db, co.id, fy.id)
        assert result.total_income > 0
        assert result.total_expenses > 0
        assert result.total_assets > 0
        assert result.is_profit is True
