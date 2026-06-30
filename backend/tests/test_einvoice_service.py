"""Unit tests for E-Invoice services: builder, encryption, client."""
from __future__ import annotations

import base64
import json

from app.services.einvoice_client import _aes_encrypt, _aes_decrypt
from app.services.einvoice_builder import _format_date_gstn, _get_pin_code, _get_state_name, _determine_doc_type, _determine_supply_type


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
