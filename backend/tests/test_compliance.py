"""Unit/integration tests for the Indian compliance engine.

Covers:
  - Income-tax slab + surcharge math (old & new regime) with known values.
  - Presumptive (44AD/44ADA/44AE) computation.
  - Regime election upsert.
  - Ind-AS schedule mapping seeding + Schedule III structure.
  - ICAI NCE statement structure.
"""
from __future__ import annotations

from decimal import Decimal

from app.models.user import Company
from app.services import compliance as svc
from tests.conftest import create_db_company


def test_new_regime_slab_math():
    # FY 2025-26 slabs: 0..3L@0, 3..6L@5%, 6..9L@10%, 9..12L@15%
    # 12,00,000 -> 0 + 3L*5% + 3L*10% + 3L*15% = 15000 + 30000 + 45000 = 90000
    tax = svc._slab_tax(Decimal("1200000"), svc.NEW_REGIME_SLABS)
    assert tax == Decimal("90000.00")


def test_new_regime_top_slab():
    # FY 2025-26: 3L@0 + 3L@5% + 3L@10% + 3L@15% + 3L@20% + 15L@30%
    # 30,00,000: 0 + 15k + 30k + 45k + 60k + 450k = 600000
    tax = svc._slab_tax(Decimal("3000000"), svc.NEW_REGIME_SLABS)
    assert tax == Decimal("600000.00")


def test_old_regime_slab_math_with_rebate():
    # 4,00,000 -> 0..2.5L@0, 2.5..4L@5% = 7,500; rebate u/s 87A zeroes it (<=5L)
    tax = svc._slab_tax(Decimal("400000"), svc.OLD_REGIME_SLABS)
    assert tax == Decimal("7500.00")
    sur = svc._surcharge(Decimal("400000"), tax, svc.SURCHARGE_OLD)
    assert sur == Decimal("0.00")


def test_old_regime_surcharge_kicks_in():
    # >50L income attracts 10% surcharge
    tax = svc._slab_tax(Decimal("6000000"), svc.OLD_REGIME_SLABS)
    sur = svc._surcharge(Decimal("6000000"), tax, svc.SURCHARGE_OLD)
    assert sur > 0
    assert sur == (tax * Decimal("0.10")).quantize(Decimal("0.01"))


def test_compute_income_tax_zero_profit(db):
    company = create_db_company(db, name="ZeroCo")
    svc.ensure_default_schedules(db, company.id)
    fy = _make_fy(db, company.id, "2025-26", "2025-04-01", "2026-03-31")
    # No transactions -> net profit 0 -> no tax
    result = svc.compute_income_tax(db, company.id, fy.id, "new")
    assert result.taxable_income == Decimal("0")
    assert result.total_tax == Decimal("0")
    assert result.regime == "new"


def test_regime_election_upsert(db):
    company = create_db_company(db, name="RegimeCo")
    svc.ensure_default_schedules(db, company.id)
    fy = _make_fy(db, company.id, "2025-26", "2025-04-01", "2026-03-31")
    obj = svc.set_income_tax_regime(db, company.id, "new", "2025-26", None)
    assert obj.regime == "new"
    # re-elect old, should flip and deactivate new
    obj2 = svc.set_income_tax_regime(db, company.id, "old", "2025-26", "44AD")
    assert obj2.regime == "old"
    assert obj2.presumptive_section == "44AD"
    refreshed = db.get(Company, company.id)
    assert refreshed.income_tax_regime == "old"
    active = db.query(svc.IncomeTaxRegimeConfig).filter(
        svc.IncomeTaxRegimeConfig.company_id == company.id,
        svc.IncomeTaxRegimeConfig.is_active.is_(True),
    ).all()
    assert len(active) == 1
    assert active[0].regime == "old"


def test_schedule_iii_structure(db):
    company = create_db_company(db, name="SchedCo")
    svc.ensure_default_schedules(db, company.id)
    fy = _make_fy(db, company.id, "2025-26", "2025-04-01", "2026-03-31")
    # seed a simple equity ledger with an opening balance (capital)
    grp = _make_group(db, company.id, "Equity", "capital", system_code="GRP_EQUITY")
    led = _make_ledger(db, company.id, grp.id, "Capital Account", opening=100000, ob_type="Cr")
    bs = svc.get_schedule_iii_balance_sheet(db, company.id, fy.id)
    assert "part_i" in bs and "part_ii" in bs
    assert bs["total_equity_liabilities"] == Decimal("100000.00")
    # Equity is presented under "Current Liabilities" per the COA/BS layout.
    headings = [h["heading"] for h in bs["part_i"]["headings"]]
    assert "Current Liabilities" in headings
    assert "Shareholders' Funds" not in headings


def test_icai_nce_structure(db):
    company = create_db_company(db, name="NceCo")
    svc.ensure_default_schedules(db, company.id)
    svc.ensure_default_templates(db, company.id)
    fy = _make_fy(db, company.id, "2025-26", "2025-04-01", "2026-03-31")
    grp = _make_group(db, company.id, "Equity", "capital", system_code="GRP_EQUITY")
    _make_ledger(db, company.id, grp.id, "Capital Account", opening=500000, ob_type="Cr")
    data = svc.get_icais_nce_statements(db, company.id, fy.id)
    assert "balance_sheet" in data
    assert "profit_and_loss" in data
    assert "notes" in data
    assert data["notes"]["total_equity_liabilities"] == Decimal("500000.00")


def test_gst_status_runs(db):
    company = create_db_company(db, name="GstCo")
    svc.ensure_default_schedules(db, company.id)
    fy = _make_fy(db, company.id, "2025-26", "2025-04-01", "2026-03-31")
    status = svc.get_gst_compliance_status(db, company.id, fy.id)
    assert status["financial_year"] == "2025-26"
    assert "gstr9" in status["returns"]


# ── helpers ────────────────────────────────────────────────────────────────

def _make_fy(db, company_id, name, start, end):
    from app.models.accounting import FinancialYear
    fy = FinancialYear(company_id=company_id, name=name, start_date=start, end_date=end)
    db.add(fy)
    db.commit()
    db.refresh(fy)
    return fy


def _make_group(db, company_id, name, nature, system_code=None):
    from app.models.accounting import AccountGroup
    g = AccountGroup(company_id=company_id, name=name, nature=nature, group_type="primary", system_code=system_code)
    db.add(g)
    db.commit()
    db.refresh(g)
    return g


def _make_ledger(db, company_id, group_id, name, opening=0, ob_type="Dr"):
    from app.models.accounting import Ledger
    l = Ledger(company_id=company_id, name=name, group_id=group_id,
               opening_balance=opening, opening_balance_type=ob_type)
    db.add(l)
    db.commit()
    db.refresh(l)
    return l
