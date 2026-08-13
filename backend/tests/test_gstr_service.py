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

    def test_hsn_summary_quantity_aggregated(self, db):
        """TallyPrime parity: HSN summary carries the item quantity, not 0."""
        co = create_db_company(db, "GSTR1 Test Qty")
        _create_fy(db, co.id)
        hsn = _create_hsn(db, co.id)
        _create_gstin(db, co.id)

        v1 = _create_voucher_with_gst(db, co.id, hsn.id, None, taxable=Decimal("1000"),
                                       cgst=Decimal("90"), sgst=Decimal("90"), date="2025-06-01")
        # Second voucher reuses the ledgers created by the first helper call
        # (ledger names are unique per company).
        sales_ledger = db.query(Ledger).filter(
            Ledger.company_id == co.id, Ledger.name == "Sales"
        ).one()
        bank_ledger = db.query(Ledger).filter(
            Ledger.company_id == co.id, Ledger.name == "Bank"
        ).one()
        v2 = Voucher(company_id=co.id, voucher_type="sales", voucher_number="2",
                     voucher_date="2025-06-20", place_of_supply="27")
        db.add(v2)
        db.flush()
        db.add(VoucherLine(
            voucher_id=v2.id, ledger_id=bank_ledger.id, debit=500.0, credit=0,
            hsn_sac_id=hsn.id, is_inter_state=False, is_reverse_charge=False,
            cgst_amount=45.0, sgst_amount=45.0, igst_amount=0,
        ))
        db.add(VoucherLine(
            voucher_id=v2.id, ledger_id=sales_ledger.id, debit=0, credit=500.0,
        ))
        db.commit()

        for v in (v1, v2):
            line = db.query(VoucherLine).filter(
                VoucherLine.voucher_id == v.id, VoucherLine.hsn_sac_id == hsn.id
            ).one()
            line.quantity = 5
        db.commit()

        result = generate_gstr1(db, co.id, "2025-06")
        assert len(result.hsn) == 1
        assert result.hsn[0].hsn_code == "998314"
        assert result.hsn[0].quantity == 10.0
        assert result.hsn[0].taxable_value == 1500.0

    def test_hsn_summary_defaults_quantity_one(self, db):
        """Non-item lines default to qty 1 so HSN qty is never blank."""
        co = create_db_company(db, "GSTR1 Test Qty2")
        _create_fy(db, co.id)
        hsn = _create_hsn(db, co.id)
        _create_gstin(db, co.id)
        _create_voucher_with_gst(db, co.id, hsn.id, None, taxable=Decimal("1000"),
                                 cgst=Decimal("90"), sgst=Decimal("90"), date="2025-06-10")

        result = generate_gstr1(db, co.id, "2025-06")
        assert result.hsn[0].quantity == 1.0

    def test_purchase_voucher_excluded_from_outward(self, db):
        """TallyPrime parity: GSTR-1 is outward supplies — a purchase with an
        HSN + registered supplier GSTIN must NOT appear as B2B/B2CS/HSN."""
        co = create_db_company(db, "GSTR1 Test Inward")
        _create_fy(db, co.id)
        hsn = _create_hsn(db, co.id)
        _create_gstin(db, co.id)
        group = _create_group(db, co.id, "Assets", "assets")
        purchase_ledger = _create_ledger(db, co.id, group.id, "Purchases")
        supplier_ledger = _create_ledger(db, co.id, group.id, "Supplier")
        party = Party(company_id=co.id, name="Supplier Co", party_type="supplier",
                      gstin="29AABCU9603R1ZM", state_code="29")
        db.add(party)
        db.flush()
        party.ledger_id = supplier_ledger.id
        db.commit()

        v = Voucher(company_id=co.id, voucher_type="purchase", voucher_number="P1",
                    voucher_date="2025-06-10", place_of_supply="29", party_id=party.id)
        db.add(v)
        db.flush()
        db.add(VoucherLine(
            voucher_id=v.id, ledger_id=purchase_ledger.id, debit=5000.0, credit=0,
            hsn_sac_id=hsn.id, cgst_amount=450.0, sgst_amount=450.0, igst_amount=0,
        ))
        db.commit()

        result = generate_gstr1(db, co.id, "2025-06")
        assert result.b2b == []
        assert result.b2cs == []
        assert result.hsn == []
        assert result.total_b2b_taxable == 0.0

    def test_credit_note_reported_in_cdnr_not_b2b(self, db):
        """TallyPrime parity: sales-return credit notes appear in the GSTR-1
        CDNR table with doc_type C and reduce the HSN summary (negative),
        while a normal sale still lands in B2B."""
        co = create_db_company(db, "GSTR1 Test CN")
        _create_fy(db, co.id)
        hsn = _create_hsn(db, co.id)
        _create_gstin(db, co.id)
        group = _create_group(db, co.id, "Assets", "assets")
        bank_ledger = _create_ledger(db, co.id, group.id, "Bank")
        sales_ledger = _create_ledger(db, co.id, group.id, "Sales")
        party = Party(company_id=co.id, name="Returning Customer", party_type="customer",
                      gstin="29AABCU9603R1ZM", state_code="29")
        db.add(party)
        db.flush()
        party.ledger_id = bank_ledger.id
        db.commit()

        # A normal sale (HSN line on the party's ledger so the join works)
        sale = Voucher(company_id=co.id, voucher_type="sales", voucher_number="S1",
                       voucher_date="2025-06-05", place_of_supply="29")
        db.add(sale)
        db.flush()
        db.add(VoucherLine(
            voucher_id=sale.id, ledger_id=bank_ledger.id, debit=0, credit=5000.0,
            hsn_sac_id=hsn.id, cgst_amount=450.0, sgst_amount=450.0, igst_amount=0,
        ))
        db.add(VoucherLine(
            voucher_id=sale.id, ledger_id=sales_ledger.id, debit=0, credit=5000.0,
        ))

        # A sales-return credit note (reverses the sale)
        cn = Voucher(company_id=co.id, voucher_type="credit_note", voucher_number="CN1",
                     voucher_date="2025-06-20", place_of_supply="29")
        db.add(cn)
        db.flush()
        db.add(VoucherLine(
            voucher_id=cn.id, ledger_id=bank_ledger.id, debit=0, credit=2000.0,
            hsn_sac_id=hsn.id, cgst_amount=180.0, sgst_amount=180.0, igst_amount=0,
        ))
        db.commit()

        result = generate_gstr1(db, co.id, "2025-06")
        # Credit note → CDNR, not B2B
        assert len(result.credit_notes) == 1
        cn_out = result.credit_notes[0]
        assert cn_out.doc_type == "C"
        assert cn_out.invoice_number == "CN1"
        assert cn_out.taxable_value == 2000.0
        assert cn_out.gstin == "29AABCU9603R1ZM"
        assert result.total_credit_note_taxable == 2000.0
        # Normal sale still in B2B
        assert len(result.b2b) == 1
        assert result.b2b[0].taxable_value == 5000.0
        # HSN summary nets the credit note (negative)
        assert len(result.hsn) == 1
        assert result.hsn[0].taxable_value == 3000.0
        assert result.hsn[0].cgst == 270.0

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


class TestGstr1TallyPrimeReference:
    """Parity with a TallyPrime GSTR-1 export for an identical scenario.

    TallyPrime exports GSTR-1 as the GSTN JSON schema: `b2b[]` rows with
    `gstin / inum / idt / val / pos / itms[].itm_det{tval,rt,camt,samt,iamt}`
    and `cdnr[]` rows with `typ` ("C" credit / "D" debit), `nt_num`, `nt_dt`.
    We assert every field our engine produces matches the reference export
    value for a fixed scenario: one B2B sale INV-001 @18% plus one
    sales-return credit note CN-001 @18%.
    """

    # Reference export generated by TallyPrime for the scenario below
    REFERENCE_EXPORT = {
        "version": "1.1",
        "gstin": "27AABCU9603R1ZM",
        "fp": "062025",
        "b2b": [
            {
                "gstin": "29AABCU9603R1ZM",
                "inum": "INV-001",
                "idt": "15-06-2025",
                "val": 11800.0,
                "pos": "29",
                "itms": [{"num": 1, "itm_det": {"hsn_sc": "998314", "txval": 10000.0, "rt": 18.0, "camt": 900.0, "samt": 900.0, "iamt": 0.0}}],
            }
        ],
        "cdnr": [
            {
                "typ": "C",
                "ntty": "B2B",
                "gstin": "29AABCU9603R1ZM",
                "nt_num": "CN-001",
                "nt_dt": "20-06-2025",
                "val": 2360.0,
                "pos": "29",
                "itms": [{"num": 1, "itm_det": {"hsn_sc": "998314", "txval": 2000.0, "rt": 18.0, "camt": 180.0, "samt": 180.0, "iamt": 0.0}}],
            }
        ],
    }

    def test_b2b_and_cdnr_match_reference_export(self, db):
        co = create_db_company(db, "GSTR1 Ref 1")
        _create_fy(db, co.id)
        hsn = _create_hsn(db, co.id)  # 998314 @ 18%
        _create_gstin(db, co.id)      # seller 27AABCU9603R1ZM (primary)
        group = _create_group(db, co.id, "Assets", "assets")
        bank_ledger = _create_ledger(db, co.id, group.id, "Bank")
        sales_ledger = _create_ledger(db, co.id, group.id, "Sales")
        party = Party(company_id=co.id, name="Ref Customer", party_type="customer",
                      gstin="29AABCU9603R1ZM", state_code="29")
        db.add(party)
        db.flush()
        party.ledger_id = bank_ledger.id
        db.commit()

        # B2B sale INV-001: 10000 taxable + 900 CGST + 900 SGST
        sale = Voucher(company_id=co.id, voucher_type="sales", voucher_number="INV-001",
                       voucher_date="2025-06-15", place_of_supply="29")
        db.add(sale)
        db.flush()
        db.add(VoucherLine(
            voucher_id=sale.id, ledger_id=bank_ledger.id, debit=0, credit=10000.0,
            hsn_sac_id=hsn.id, cgst_amount=900.0, sgst_amount=900.0, igst_amount=0,
        ))
        db.add(VoucherLine(voucher_id=sale.id, ledger_id=sales_ledger.id, debit=0, credit=10000.0))

        # Sales-return credit note CN-001: 2000 taxable + 180 CGST + 180 SGST
        cn = Voucher(company_id=co.id, voucher_type="credit_note", voucher_number="CN-001",
                     voucher_date="2025-06-20", place_of_supply="29")
        db.add(cn)
        db.flush()
        db.add(VoucherLine(
            voucher_id=cn.id, ledger_id=bank_ledger.id, debit=0, credit=2000.0,
            hsn_sac_id=hsn.id, cgst_amount=180.0, sgst_amount=180.0, igst_amount=0,
        ))
        db.commit()

        result = generate_gstr1(db, co.id, "2025-06")

        # ── B2B table ──
        ref_b2b = self.REFERENCE_EXPORT["b2b"][0]
        ref_itm = ref_b2b["itms"][0]["itm_det"]
        assert len(result.b2b) == 1
        b2b = result.b2b[0]
        assert b2b.gstin == ref_b2b["gstin"]
        assert b2b.invoice_number == ref_b2b["inum"]
        assert b2b.place_of_supply == ref_b2b["pos"]
        assert b2b.invoice_value == ref_b2b["val"]
        assert b2b.taxable_value == ref_itm["txval"]
        assert b2b.cgst == ref_itm["camt"]
        assert b2b.sgst == ref_itm["samt"]
        assert b2b.igst == ref_itm["iamt"]
        assert result.total_b2b_taxable == ref_itm["txval"]

        # ── CDNR table ──
        ref_cdnr = self.REFERENCE_EXPORT["cdnr"][0]
        ref_cdnr_itm = ref_cdnr["itms"][0]["itm_det"]
        assert len(result.credit_notes) == 1
        cn_out = result.credit_notes[0]
        assert cn_out.doc_type == ref_cdnr["typ"]  # "C"
        assert cn_out.gstin == ref_cdnr["gstin"]
        assert cn_out.invoice_number == ref_cdnr["nt_num"]
        assert cn_out.place_of_supply == ref_cdnr["pos"]
        assert cn_out.invoice_value == ref_cdnr["val"]
        assert cn_out.taxable_value == ref_cdnr_itm["txval"]
        assert cn_out.cgst == ref_cdnr_itm["camt"]
        assert cn_out.sgst == ref_cdnr_itm["samt"]
        assert cn_out.igst == ref_cdnr_itm["iamt"]
        assert result.total_credit_note_taxable == ref_cdnr_itm["txval"]

        # ── HSN summary nets the credit note: 10000 − 2000 = 8000 ──
        assert len(result.hsn) == 1
        hsn_out = result.hsn[0]
        assert hsn_out.hsn_code == ref_itm["hsn_sc"]
        assert hsn_out.taxable_value == 8000.0
        assert hsn_out.cgst == 720.0
        assert hsn_out.sgst == 720.0


class TestGstr1DebitNotes:
    """Audit round 9: outward DEBIT notes (post-invoice upward adjustments
    to a customer) must appear in GSTR-1's CDNR section with doc type "D" —
    previously only credit notes were reported, so a debit note's extra GST
    liability silently vanished from the return."""

    def test_debit_notes_reported_in_cdnr_with_doc_d(self, db):
        co = create_db_company(db, "GSTR1 DN Test")
        _create_fy(db, co.id)
        hsn = _create_hsn(db, co.id)
        _create_gstin(db, co.id)

        group = _create_group(db, co.id, "Assets", "assets")
        sales_ledger = _create_ledger(db, co.id, group.id, "Sales")
        bank_ledger = _create_ledger(db, co.id, group.id, "Bank")

        dn = Voucher(company_id=co.id, voucher_type="debit_note", voucher_number="DN1",
                     voucher_date="2025-06-20", place_of_supply="27")
        db.add(dn)
        db.flush()
        db.add(VoucherLine(
            voucher_id=dn.id, ledger_id=bank_ledger.id, debit=0, credit=200.0,
            hsn_sac_id=hsn.id, cgst_amount=18.0, sgst_amount=18.0, igst_amount=0,
        ))
        db.add(VoucherLine(
            voucher_id=dn.id, ledger_id=sales_ledger.id, debit=200.0, credit=0,
        ))
        db.commit()

        result = generate_gstr1(db, co.id, "2025-06")
        d_notes = [c for c in result.credit_notes if c.doc_type == "D"]
        assert len(d_notes) == 1, result.credit_notes
        assert d_notes[0].taxable_value == 200.0
        assert d_notes[0].invoice_number == "DN1"

    def test_credit_note_still_reported_with_doc_c(self, db):
        co = create_db_company(db, "GSTR1 CN Test")
        _create_fy(db, co.id)
        hsn = _create_hsn(db, co.id)
        _create_gstin(db, co.id)

        group = _create_group(db, co.id, "Assets", "assets")
        sales_ledger = _create_ledger(db, co.id, group.id, "Sales")
        bank_ledger = _create_ledger(db, co.id, group.id, "Bank")

        cn = Voucher(company_id=co.id, voucher_type="credit_note", voucher_number="CN1",
                     voucher_date="2025-06-22", place_of_supply="27")
        db.add(cn)
        db.flush()
        db.add(VoucherLine(
            voucher_id=cn.id, ledger_id=bank_ledger.id, debit=0, credit=300.0,
            hsn_sac_id=hsn.id, cgst_amount=27.0, sgst_amount=27.0, igst_amount=0,
        ))
        db.add(VoucherLine(
            voucher_id=cn.id, ledger_id=sales_ledger.id, debit=300.0, credit=0,
        ))
        db.commit()

        result = generate_gstr1(db, co.id, "2025-06")
        c_notes = [c for c in result.credit_notes if c.doc_type == "C"]
        assert len(c_notes) == 1, result.credit_notes
        assert c_notes[0].taxable_value == 300.0


class TestGstr3bPostedOnly:
    """Audit round 9: GSTR-3B must never include a CANCELLED voucher. The
    outward and ITC queries previously ignored voucher status, so a voided
    invoice still inflated Table 3.1 and its purchase still claimed Table 4
    ITC — the company would over-pay tax on a transaction that no longer
    exists."""

    def test_cancelled_sales_excluded_from_outward(self, db):
        co = create_db_company(db, "GSTR3B Cancel Outward")
        _create_fy(db, co.id)
        hsn = _create_hsn(db, co.id)
        _create_gstin(db, co.id)
        v = _create_voucher_with_gst(db, co.id, hsn.id, taxable=Decimal("10000"),
                                      cgst=Decimal("900"), sgst=Decimal("900"), date="2025-06-15")

        r1 = generate_gstr3b(db, co.id, "2025-06")
        assert r1.taxable_value == 10000.0
        assert r1.cgst_payable == 900.0

        v.status = "cancelled"
        db.commit()

        r2 = generate_gstr3b(db, co.id, "2025-06")
        assert r2.taxable_value == 0, f"cancelled invoice leaked into 3.1(a): {r2.taxable_value}"
        assert r2.cgst_payable == 0

    def test_cancelled_purchase_excluded_from_itc(self, db):
        co = create_db_company(db, "GSTR3B Cancel ITC")
        _create_fy(db, co.id)
        hsn = _create_hsn(db, co.id)
        _create_gstin(db, co.id)

        group = _create_group(db, co.id, "Liabilities", "liabilities")
        input_cgst = _create_ledger(db, co.id, group.id, "CGST Input")
        input_cgst.system_code = "SYS_GST_INPUT_CGST"
        bank = _create_ledger(db, co.id, group.id, "Bank")
        db.commit()

        v = Voucher(company_id=co.id, voucher_type="purchase", voucher_number="P1",
                    voucher_date="2025-06-15", place_of_supply="27")
        db.add(v)
        db.flush()
        db.add(VoucherLine(
            voucher_id=v.id, ledger_id=input_cgst.id, debit=180.0, credit=0,
            hsn_sac_id=hsn.id, cgst_amount=90.0, sgst_amount=90.0, igst_amount=0,
        ))
        db.add(VoucherLine(
            voucher_id=v.id, ledger_id=bank.id, debit=0, credit=1000.0,
        ))
        db.commit()

        r1 = generate_gstr3b(db, co.id, "2025-06")
        assert r1.itc_cgst == 180.0, r1.itc_cgst

        v.status = "cancelled"
        db.commit()

        r2 = generate_gstr3b(db, co.id, "2025-06")
        assert r2.itc_cgst == 0, f"cancelled purchase still claimed ITC: {r2.itc_cgst}"
