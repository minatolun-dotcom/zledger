"""Unit tests for E-Invoice services: builder, encryption, client."""
from __future__ import annotations

import base64
import json

from app.services.einvoice_client import _aes_encrypt, _aes_decrypt
from app.services.einvoice_builder import _format_date_gstn, _get_pin_code, _get_state_name, _determine_doc_type, _determine_supply_type, build_item_list, compute_val_dtls


class TestAesEncryption:
    def test_encrypt_decrypt_roundtrip(self):
        key = b"0123456789abcdef0123456789abcdef"  # 32 bytes
        plaintext = b"Hello, GSTN!"
        encrypted = _aes_encrypt(plaintext, key)
        decrypted = _aes_decrypt(encrypted, key)
        assert decrypted == plaintext

    def test_encrypt_produces_deterministic_output(self):
        key = b"0123456789abcdef0123456789abcdef"
        data = b"test data"
        enc1 = _aes_encrypt(data, key)
        enc2 = _aes_encrypt(data, key)
        assert enc1 == enc2  # ECB is deterministic

    def test_encrypt_different_keys_different_output(self):
        data = b"test data"
        key1 = b"0123456789abcdef0123456789abcdef"
        key2 = b"fedcba9876543210fedcba9876543210"
        enc1 = _aes_encrypt(data, key1)
        enc2 = _aes_encrypt(data, key2)
        assert enc1 != enc2

    def test_encrypt_empty_data(self):
        key = b"0123456789abcdef0123456789abcdef"
        encrypted = _aes_encrypt(b"", key)
        decrypted = _aes_decrypt(encrypted, key)
        assert decrypted == b""

    def test_encrypt_json_payload(self):
        key = b"0123456789abcdef0123456789abcdef"
        payload = json.dumps({"Version": "1.1", "TranDtls": {"TaxSch": "GST"}})
        encrypted = _aes_encrypt(payload.encode(), key)
        decrypted = _aes_decrypt(encrypted, key)
        assert json.loads(decrypted) == json.loads(payload)


class TestDateFormatting:
    def test_format_date_gstn(self):
        assert _format_date_gstn("2026-05-18") == "18/05/2026"

    def test_format_date_gstn_january(self):
        assert _format_date_gstn("2026-01-01") == "01/01/2026"

    def test_format_date_gstn_december(self):
        assert _format_date_gstn("2025-12-31") == "31/12/2025"

    def test_format_date_gstn_invalid(self):
        try:
            _format_date_gstn("20260518")
            assert False, "Should have raised ValueError"
        except ValueError:
            pass


class TestPinCode:
    def test_extract_pin_from_address(self):
        assert _get_pin_code("MG Road, Bengaluru, 560001") == 560001

    def test_no_pin_in_address(self):
        assert _get_pin_code("MG Road, Bengaluru") == 0

    def test_none_address(self):
        assert _get_pin_code(None) == 0

    def test_empty_address(self):
        assert _get_pin_code("") == 0


class TestStateName:
    def test_known_state(self):
        assert _get_state_name("27") == "Maharashtra"
        assert _get_state_name("29") == "Karnataka"

    def test_unknown_state(self):
        assert _get_state_name("99") == "Other Territory"


class TestDocType:
    def test_sales_invoice(self):
        class MockVoucher:
            voucher_type = "sales"
        assert _determine_doc_type(MockVoucher()) == "INV"

    def test_receipt_credit_note(self):
        class MockVoucher:
            voucher_type = "receipt"
        assert _determine_doc_type(MockVoucher()) == "CRN"

    def test_payment_debit_note(self):
        class MockVoucher:
            voucher_type = "payment"
        assert _determine_doc_type(MockVoucher()) == "DRN"


class TestBuildItemList:
    """build_item_list must mirror the actual invoice line (TallyPrime parity)."""

    def test_goods_line_with_real_data(self):
        class MockStock:
            name = "Paracetamol 500mg"
            unit_of_measure = "Box"

        class MockLine:
            hsn_sac_id = "hsn-1"
            stock_item_id = "stock-1"
            stock_item = MockStock()
            taxable_value = 1000.0
            debit = 1000.0
            credit = 0.0
            quantity = 5
            rate = 200.0
            cgst_amount = 90.0
            sgst_amount = 90.0
            igst_amount = 0.0
            _hsn_code = "30049099"
            _hsn_rate = 18.0
            _hsn_desc = "Medicaments"

        items = build_item_list([MockLine()])
        assert len(items) == 1
        item = items[0]
        assert item["PrdDesc"] == "Paracetamol 500mg"
        assert item["Qty"] == 5
        assert item["Unit"] == "BOX"
        assert item["UnitPrice"] == 200.0
        assert item["AssAmt"] == 1000.0
        assert item["HsnCd"] == "30049099"
        assert item["GstRt"] == 18.0
        assert item["IsServc"] == "N"
        assert item["TotItemVal"] == 1180.0

    def test_service_line_defaults(self):
        class MockLine:
            hsn_sac_id = "hsn-2"
            stock_item_id = None
            taxable_value = 500.0
            debit = 500.0
            credit = 0.0
            quantity = None
            rate = None
            cgst_amount = 45.0
            sgst_amount = 45.0
            igst_amount = 0.0
            _hsn_code = "998314"
            _hsn_rate = 18.0
            _hsn_desc = "IT Services"

        items = build_item_list([MockLine()])
        assert len(items) == 1
        item = items[0]
        assert item["Qty"] == 1
        assert item["Unit"] == "OTH"
        assert item["UnitPrice"] == 500.0
        assert item["IsServc"] == "Y"

    def test_line_without_hsn_is_skipped(self):
        class MockLine:
            hsn_sac_id = None
            stock_item_id = None
            taxable_value = 0.0
            debit = 0.0
            credit = 100.0
            quantity = None
            rate = None
            cgst_amount = None
            sgst_amount = None
            igst_amount = None

        assert build_item_list([MockLine()]) == []


class TestComputeValDtls:
    """ValDtls must count ONLY the HSN-bearing item lines as assessable."""

    def test_ignores_gst_posting_and_party_lines(self):
        class ItemLine:
            hsn_sac_id = "hsn-1"
            taxable_value = 1000.0
            debit = 0.0
            credit = 1000.0
            cgst_amount = 90.0
            sgst_amount = 90.0
            igst_amount = 0.0

        class GstPostingLine:
            hsn_sac_id = None
            taxable_value = None
            debit = 0.0
            credit = 90.0
            cgst_amount = None
            sgst_amount = None
            igst_amount = None

        class PartyLine:
            hsn_sac_id = None
            taxable_value = None
            debit = 1180.0
            credit = 0.0
            cgst_amount = None
            sgst_amount = None
            igst_amount = None

        val = compute_val_dtls([ItemLine(), GstPostingLine(), GstPostingLine(), PartyLine()])
        # ₹1,180 invoice must stay ₹1,180 — not ₹2,540 (party + posting lines)
        assert val["total_assessed"] == 1000.0
        assert val["total_cgst"] == 90.0
        assert val["total_sgst"] == 90.0
        assert val["total_igst"] == 0.0
        assert val["total_inv_value"] == 1180.0

    def test_inter_state_igst(self):
        class ItemLine:
            hsn_sac_id = "hsn-2"
            taxable_value = 2000.0
            debit = 0.0
            credit = 2000.0
            cgst_amount = 0.0
            sgst_amount = 0.0
            igst_amount = 360.0

        val = compute_val_dtls([ItemLine()])
        assert val["total_assessed"] == 2000.0
        assert val["total_igst"] == 360.0
        assert val["total_inv_value"] == 2360.0


class TestSupplyType:
    def test_b2b_with_gstin(self):
        class MockVoucher:
            voucher_type = "sales"
            counterparty_gstin = "27AABCU9603R1ZM"
        assert _determine_supply_type(MockVoucher()) == "B2B"

    def test_b2c_without_gstin(self):
        class MockVoucher:
            voucher_type = "sales"
            counterparty_gstin = None
        assert _determine_supply_type(MockVoucher()) == "B2C"

    def test_journal_default(self):
        class MockVoucher:
            voucher_type = "journal"
            counterparty_gstin = None
        assert _determine_supply_type(MockVoucher()) == "B2B"
