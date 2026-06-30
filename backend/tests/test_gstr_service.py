"""Unit tests for GSTR service: GSTR-1 and GSTR-3B generation."""
from decimal import Decimal

from app.models.accounting import AccountGroup, FinancialYear, GstRegistration, HsnSac, Ledger, Party
from app.models.voucher import Voucher, VoucherLine
from app.services.gstr import _get_period_dates, generate_gstr1, generate_gstr3b
from tests.conftest import create_db_company


def _create_fy(db, company_id: str):
    fy = FinancialYear(company_id=company_id, name="2025-26", start_date="2025-04-01", end_date="2026-03-31")
    db.add(fy)
    db.commit()
    db.refresh(fy)
    return fy


def _create_group(db, company_id: str, name: str, nature: str):
    g = AccountGroup(company_id=company_id, name=name, nature=nature, group_type="sub", is_system=True)
    db.add(g)
    db.commit()
    db.refresh(g)
    return g


def _create_ledger(db, company_id: str, group_id: str, name: str):
    l = Ledger(company_id=company_id, name=name, group_id=group_id, opening_balance=0, opening_balance_type="Dr")
    db.add(l)
    db.commit()
    db.refresh(l)
    return l


def _create_hsn(db, company_id: str, code: str = "998314", gst_rate: float = 18.0):
    hsn = HsnSac(company_id=company_id, code=code, description="IT Services", gst_rate=gst_rate, code_type="sac")
    db.add(hsn)
    db.commit()
    db.refresh(hsn)
    return hsn


def _create_gstin(db, company_id: str, gstin: str = "27AABCU9603R1ZM", is_primary: bool = True):
    reg = GstRegistration(company_id=company_id, gstin=gstin, legal_name="Test Corp", state_code="27", is_primary=is_primary)
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return reg


def _create_voucher_with_gst(db, company_id: str, hsn_id: str, party_id: str | None = None,
                              taxable: Decimal = Decimal("1000"), cgst: Decimal = Decimal("90"),
                              sgst: Decimal = Decimal("90"), igst: Decimal = Decimal("0"),
                              is_inter_state: bool = False, is_rc: bool = False,
                              date: str = "2025-06-15"):
    group = _create_group(db, company_id, "Assets", "assets")
    sales_ledger = _create_ledger(db, company_id, group.id, "Sales")
    bank_ledger = _create_ledger(db, company_id, group.id, "Bank")

    # Link party to the bank ledger so the B2B join works
    if party_id:
        party = db.get(Party, party_id)
        if party:
            party.ledger_id = bank_ledger.id
            db.commit()

    v = Voucher(company_id=company_id, voucher_type="sales", voucher_number="1",
                voucher_date=date, place_of_supply="27")
    db.add(v)
    db.flush()

    db.add(VoucherLine(
        voucher_id=v.id, ledger_id=bank_ledger.id, debit=float(taxable), credit=0,
        hsn_sac_id=hsn_id, is_inter_state=is_inter_state, is_reverse_charge=is_rc,
        cgst_amount=float(cgst), sgst_amount=float(sgst), igst_amount=float(igst),
    ))
    db.add(VoucherLine(
        voucher_id=v.id, ledger_id=sales_ledger.id, debit=0, credit=float(taxable),
    ))
    db.commit()
    db.refresh(v)
    return v


class TestGetPeriodDates:
    def test_april(self):
        start, end = _get_period_dates("2025-04")
        assert start == "2025-04-01"
        assert end == "2025-04-30"

    def test_december(self):
        start, end = _get_period_dates("2025-12")
        assert start == "2025-12-01"
        assert end == "2025-12-31"

    def test_january(self):
        start, end = _get_period_dates("2026-01")
        assert start == "2026-01-01"
        assert end == "2026-01-31"

    def test_february(self):
        start, end = _get_period_dates("2025-02")
        assert start == "2025-02-01"
        assert end == "2025-02-28"


class TestGenerateGstr1:
    def test_empty_period(self, db):
        co = create_db_company(db, "GSTR1 Test 1")
        _create_fy(db, co.id)
        result = generate_gstr1(db, co.id, "2025-04")
        assert result.period == "2025-04"
        assert result.b2b == []
        assert result.b2cs == []
        assert result.hsn == []

    def test_b2b_invoice(self, db):
        co = create_db_company(db, "GSTR1 Test 2")
        _create_fy(db, co.id)
        hsn = _create_hsn(db, co.id)
        gstin = _create_gstin(db, co.id)
        party = Party(company_id=co.id, name="B2B Customer", party_type="customer",
                      gstin="29AABCU9603R1ZM", state_code="29")
        db.add(party)
        db.commit()
        db.refresh(party)

        _create_voucher_with_gst(db, co.id, hsn.id, party.id,
                                  taxable=Decimal("10000"), cgst=Decimal("900"),
                                  sgst=Decimal("900"), date="2025-06-15")

        result = generate_gstr1(db, co.id, "2025-06")
        assert len(result.b2b) == 1
        assert result.b2b[0].gstin == "29AABCU9603R1ZM"
        assert result.b2b[0].taxable_value == 10000.0
        assert result.total_b2b_taxable == 10000.0

    def test_b2cs_invoice(self, db):
        co = create_db_company(db, "GSTR1 Test 3")
        _create_fy(db, co.id)
        hsn = _create_hsn(db, co.id)
        _create_gstin(db, co.id)

        _create_voucher_with_gst(db, co.id, hsn.id, taxable=Decimal("5000"),
                                  cgst=Decimal("450"), sgst=Decimal("450"), date="2025-06-15")

        result = generate_gstr1(db, co.id, "2025-06")
        assert len(result.b2cs) == 1
        assert result.total_b2cs_taxable == 5000.0

    def test_hsn_summary(self, db):
        co = create_db_company(db, "GSTR1 Test 4")
        _create_fy(db, co.id)
        hsn1 = _create_hsn(db, co.id, code="998314", gst_rate=18.0)
        hsn2 = _create_hsn(db, co.id, code="998312", gst_rate=18.0)
        _create_gstin(db, co.id)

        # Create ledgers once, reuse for both vouchers
        group = _create_group(db, co.id, "Assets", "assets")
        sales_ledger = _create_ledger(db, co.id, group.id, "Sales")
        bank_ledger = _create_ledger(db, co.id, group.id, "Bank")

        v1 = Voucher(company_id=co.id, voucher_type="sales", voucher_number="1",
                     voucher_date="2025-06-01", place_of_supply="27")
        db.add(v1)
        db.flush()
        db.add(VoucherLine(voucher_id=v1.id, ledger_id=bank_ledger.id, debit=5000, credit=0,
                           hsn_sac_id=hsn1.id))
        db.add(VoucherLine(voucher_id=v1.id, ledger_id=sales_ledger.id, debit=0, credit=5000))

        v2 = Voucher(company_id=co.id, voucher_type="sales", voucher_number="2",
                     voucher_date="2025-06-15", place_of_supply="27")
        db.add(v2)
        db.flush()
        db.add(VoucherLine(voucher_id=v2.id, ledger_id=bank_ledger.id, debit=3000, credit=0,
                           hsn_sac_id=hsn2.id))
        db.add(VoucherLine(voucher_id=v2.id, ledger_id=sales_ledger.id, debit=0, credit=3000))
        db.commit()

        result = generate_gstr1(db, co.id, "2025-06")
        assert len(result.hsn) == 2
        hsn_codes = {h.hsn_code for h in result.hsn}
        assert "998314" in hsn_codes
        assert "998312" in hsn_codes

    def test_gstin_from_registration(self, db):
        co = create_db_company(db, "GSTR1 Test 5")
        _create_fy(db, co.id)
        reg = _create_gstin(db, co.id, gstin="33AABCU9603R1ZM")
        result = generate_gstr1(db, co.id, "2025-06")
        assert result.gstin == "33AABCU9603R1ZM"

    def test_inter_state_igst(self, db):
        co = create_db_company(db, "GSTR1 Test 6")
        _create_fy(db, co.id)
        hsn = _create_hsn(db, co.id, gst_rate=18.0)
        _create_gstin(db, co.id)

        _create_voucher_with_gst(db, co.id, hsn.id, taxable=Decimal("10000"),
                                  cgst=Decimal("0"), sgst=Decimal("0"), igst=Decimal("1800"),
                                  is_inter_state=True, date="2025-06-15")

        result = generate_gstr1(db, co.id, "2025-06")
        assert result.total_igst == 1800.0
        assert result.total_cgst == 0.0


class TestGenerateGstr3b:
    def test_empty_period(self, db):
        co = create_db_company(db, "GSTR3B Test 1")
        _create_fy(db, co.id)
        result = generate_gstr3b(db, co.id, "2025-04")
        assert result.period == "2025-04"
        assert result.taxable_value == 0
        assert result.cgst_payable == 0

    def test_outward_supplies(self, db):
        co = create_db_company(db, "GSTR3B Test 2")
        _create_fy(db, co.id)
        hsn = _create_hsn(db, co.id, gst_rate=18.0)
        _create_gstin(db, co.id)

        _create_voucher_with_gst(db, co.id, hsn.id, taxable=Decimal("10000"),
                                  cgst=Decimal("900"), sgst=Decimal("900"), date="2025-06-15")

        result = generate_gstr3b(db, co.id, "2025-06")
        assert result.taxable_value == 10000.0
        assert result.cgst_payable == 900.0
        assert result.sgst_payable == 900.0

    def test_reverse_charge(self, db):
        co = create_db_company(db, "GSTR3B Test 3")
        _create_fy(db, co.id)
        hsn = _create_hsn(db, co.id, gst_rate=18.0)
        _create_gstin(db, co.id)

        _create_voucher_with_gst(db, co.id, hsn.id, taxable=Decimal("5000"),
                                  cgst=Decimal("450"), sgst=Decimal("450"),
                                  is_rc=True, date="2025-06-15")

        result = generate_gstr3b(db, co.id, "2025-06")
        assert result.reverse_charge_taxable == 5000.0
        assert result.reverse_charge_cgst == 450.0
        assert result.reverse_charge_sgst == 450.0

    def test_gstin_from_primary(self, db):
        co = create_db_company(db, "GSTR3B Test 4")
        _create_fy(db, co.id)
        reg = _create_gstin(db, co.id, gstin="09AABCU9603R1ZM")
        result = generate_gstr3b(db, co.id, "2025-06")
        assert result.gstin == "09AABCU9603R1ZM"
