"""Unit tests for GST service: calculate_gst, get_gst_ledger_ids, get_rcm_ledger_mapping."""
from decimal import Decimal

import pytest

from app.models.accounting import HsnSac
from app.services.coa import seed_groups
from app.services.gst import (
    GstBreakdown,
    _round_gst,
    calculate_gst,
    get_gst_ledger_ids,
    get_rcm_ledger_mapping,
    seed_gst_ledgers,
)
from tests.conftest import create_db_company


def _create_hsn(db, company_id: str, code: str = "998314", gst_rate: float = 18.0) -> HsnSac:
    hsn = HsnSac(
        company_id=company_id, code=code, description="IT Services",
        gst_rate=gst_rate, code_type="sac", is_active=True,
    )
    db.add(hsn)
    db.commit()
    db.refresh(hsn)
    return hsn


class TestRoundGst:
    def test_round_half_up(self):
        assert _round_gst(Decimal("1.005")) == Decimal("1.01")
        assert _round_gst(Decimal("2.005")) == Decimal("2.01")
        assert _round_gst(Decimal("1.004")) == Decimal("1.00")

    def test_already_rounded(self):
        assert _round_gst(Decimal("5.50")) == Decimal("5.50")


class TestCalculateGst:
    def test_intra_state_18_percent(self, db):
        co = create_db_company(db, "GST Test 1")
        hsn = _create_hsn(db, co.id, gst_rate=18.0)
        result = calculate_gst(db, co.id, Decimal("1000"), hsn.id, is_inter_state=False)
        assert result.cgst_amount == Decimal("90.00")
        assert result.sgst_amount == Decimal("90.00")
        assert result.igst_amount == Decimal("0")
        assert result.total_tax == Decimal("180.00")
        assert result.total_amount == Decimal("1180.00")
        assert result.cgst_rate == Decimal("9.00")
        assert result.sgst_rate == Decimal("9.00")

    def test_inter_state_18_percent(self, db):
        co = create_db_company(db, "GST Test 2")
        hsn = _create_hsn(db, co.id, gst_rate=18.0)
        result = calculate_gst(db, co.id, Decimal("1000"), hsn.id, is_inter_state=True)
        assert result.igst_amount == Decimal("180.00")
        assert result.cgst_amount == Decimal("0")
        assert result.sgst_amount == Decimal("0")
        assert result.igst_rate == Decimal("18.00")

    def test_12_percent_intra_state(self, db):
        co = create_db_company(db, "GST Test 3")
        hsn = _create_hsn(db, co.id, gst_rate=12.0)
        result = calculate_gst(db, co.id, Decimal("500"), hsn.id, is_inter_state=False)
        assert result.cgst_amount == Decimal("30.00")
        assert result.sgst_amount == Decimal("30.00")
        assert result.total_tax == Decimal("60.00")

    def test_5_percent_intra_state(self, db):
        co = create_db_company(db, "GST Test 4")
        hsn = _create_hsn(db, co.id, gst_rate=5.0)
        result = calculate_gst(db, co.id, Decimal("1000"), hsn.id, is_inter_state=False)
        assert result.cgst_amount == Decimal("25.00")
        assert result.sgst_amount == Decimal("25.00")

    def test_rounding_edge_case(self, db):
        co = create_db_company(db, "GST Test 5")
        hsn = _create_hsn(db, co.id, gst_rate=18.0)
        result = calculate_gst(db, co.id, Decimal("333.33"), hsn.id, is_inter_state=False)
        assert result.cgst_amount == Decimal("30.00")
        assert result.sgst_amount == Decimal("30.00")

    def test_fractional_amount(self, db):
        co = create_db_company(db, "GST Test 6")
        hsn = _create_hsn(db, co.id, gst_rate=18.0)
        result = calculate_gst(db, co.id, Decimal("99.99"), hsn.id, is_inter_state=False)
        assert result.cgst_amount == Decimal("9.00")
        assert result.sgst_amount == Decimal("9.00")

    def test_reverse_charge_flag(self, db):
        co = create_db_company(db, "GST Test 7")
        hsn = _create_hsn(db, co.id, gst_rate=18.0)
        result = calculate_gst(db, co.id, Decimal("1000"), hsn.id, is_reverse_charge=True)
        assert result.is_reverse_charge is True

    def test_invalid_hsn_raises(self, db):
        with pytest.raises(ValueError, match="not found"):
            calculate_gst(db, "nonexistent", Decimal("1000"), "nonexistent-id")

    def test_hsn_wrong_company_raises(self, db):
        co1 = create_db_company(db, "GST Test 8a")
        co2 = create_db_company(db, "GST Test 8b")
        hsn = _create_hsn(db, co1.id)
        with pytest.raises(ValueError, match="not found"):
            calculate_gst(db, co2.id, Decimal("1000"), hsn.id)

    def test_zero_amount(self, db):
        co = create_db_company(db, "GST Test 9")
        hsn = _create_hsn(db, co.id, gst_rate=18.0)
        result = calculate_gst(db, co.id, Decimal("0"), hsn.id)
        assert result.total_tax == Decimal("0.00")
        assert result.total_amount == Decimal("0.00")

    def test_hsn_code_in_result(self, db):
        co = create_db_company(db, "GST Test 10")
        hsn = _create_hsn(db, co.id, code="09983")
        result = calculate_gst(db, co.id, Decimal("100"), hsn.id)
        assert result.hsn_sac_code == "09983"


class TestGetGstLedgerIds:
    def test_returns_all_gst_ledgers(self, db):
        co = create_db_company(db, "GST Test 11")
        seed_groups(db, co.id)
        seed_gst_ledgers(db, co.id)
        ids = get_gst_ledger_ids(db, co.id)
        assert len(ids) == 10
        assert "SYS_GST_OUTPUT_CGST" in ids
        assert "SYS_GST_INPUT_IGST" in ids
        assert "SYS_RCM_CGST" in ids

    def test_empty_for_no_ledgers(self, db):
        ids = get_gst_ledger_ids(db, "nonexistent")
        assert ids == {}


class TestGetRcmLedgerMapping:
    def test_mapping(self):
        m = get_rcm_ledger_mapping()
        assert m["SYS_GST_INPUT_CGST"] == "SYS_RCM_CGST"
        assert m["SYS_GST_INPUT_SGST"] == "SYS_RCM_SGST"
        assert m["SYS_GST_INPUT_IGST"] == "SYS_RCM_IGST"
        assert len(m) == 3
