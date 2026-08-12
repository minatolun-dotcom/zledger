"""Integration tests for voucher endpoints: CRUD, double-entry enforcement, GST posting."""
from decimal import Decimal

from tests.conftest import auth_header, create_company, register_user


def _setup_company(client, email: str):
    _, token = register_user(client, email)
    company = create_company(client, token)
    return company, token


def _create_group_and_ledgers(client, token, cid):
    """Create an assets group with two ledgers for double-entry testing."""
    group = client.post("/api/coa/groups", json={
        "name": "Bank Accounts", "nature": "assets", "group_type": "sub",
    }, headers=auth_header(token, cid)).json()

    ledger1 = client.post("/api/coa/ledgers", json={
        "name": "Test Cash Ledger", "group_id": group["id"], "opening_balance": 0, "opening_balance_type": "Dr",
    }, headers=auth_header(token, cid)).json()

    ledger2 = client.post("/api/coa/ledgers", json={
        "name": "Test Bank Ledger", "group_id": group["id"], "opening_balance": 0, "opening_balance_type": "Dr",
    }, headers=auth_header(token, cid)).json()

    return group, ledger1, ledger2


class TestVoucherCreate:
    def test_create_balanced_voucher(self, client):
        company, token = _setup_company(client, "vch1@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        resp = client.post("/api/vouchers", json={
            "voucher_type": "journal",
            "voucher_date": "2025-04-15",
            "narration": "Test entry",
            "lines": [
                {"ledger_id": l1["id"], "debit": 1000, "credit": 0},
                {"ledger_id": l2["id"], "debit": 0, "credit": 1000},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert data["voucher_type"] == "journal"
        assert len(data["lines"]) == 2

    def test_payment_voucher_grand_total_is_one_side_only(self, client):
        """TallyPrime parity: a ₹1,000 payment totals ₹1,000, not ₹2,000.

        Regression for the subtotal double-count (debit side + credit side)
        that made every payment/receipt/contra/journal show 2× the amount.
        """
        company, token = _setup_company(client, "vch-pay@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        resp = client.post("/api/vouchers", json={
            "voucher_type": "payment",
            "voucher_date": "2025-04-15",
            "narration": "Payment parity",
            "lines": [
                {"ledger_id": l1["id"], "debit": 1000, "credit": 0},
                {"ledger_id": l2["id"], "debit": 0, "credit": 1000},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert float(data["grand_total"]) == 1000.0
        assert float(data["subtotal"]) == 1000.0

    def test_receipt_voucher_grand_total_is_one_side_only(self, client):
        company, token = _setup_company(client, "vch-rec@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        resp = client.post("/api/vouchers", json={
            "voucher_type": "receipt",
            "voucher_date": "2025-04-15",
            "narration": "Receipt parity",
            "lines": [
                {"ledger_id": l1["id"], "debit": 0, "credit": 2500},
                {"ledger_id": l2["id"], "debit": 2500, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert float(data["grand_total"]) == 2500.0

    def test_journal_voucher_grand_total_sums_debit_side(self, client):
        company, token = _setup_company(client, "vch-jr@example.com")
        cid = company["id"]
        group, l1, l2 = _create_group_and_ledgers(client, token, cid)
        l3 = client.post("/api/coa/ledgers", json={
            "name": "Test Third Ledger", "group_id": group["id"],
            "opening_balance": 0, "opening_balance_type": "Dr",
        }, headers=auth_header(token, cid)).json()

        resp = client.post("/api/vouchers", json={
            "voucher_type": "journal",
            "voucher_date": "2025-04-15",
            "narration": "Journal parity",
            "lines": [
                {"ledger_id": l1["id"], "debit": 700, "credit": 0},
                {"ledger_id": l2["id"], "debit": 300, "credit": 0},
                {"ledger_id": l3["id"], "debit": 0, "credit": 1000},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert float(data["grand_total"]) == 1000.0

    def test_unbalanced_voucher_rejected(self, client):
        company, token = _setup_company(client, "vch2@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        resp = client.post("/api/vouchers", json={
            "voucher_type": "journal",
            "voucher_date": "2025-04-15",
            "lines": [
                {"ledger_id": l1["id"], "debit": 1000, "credit": 0},
                {"ledger_id": l2["id"], "debit": 0, "credit": 500},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 422
        assert "not balanced" in resp.json()["detail"]

    def test_duplicate_ledger_rejected(self, client):
        company, token = _setup_company(client, "vch3@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        resp = client.post("/api/vouchers", json={
            "voucher_type": "journal",
            "voucher_date": "2025-04-15",
            "lines": [
                {"ledger_id": l1["id"], "debit": 1000, "credit": 0},
                {"ledger_id": l1["id"], "debit": 0, "credit": 1000},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 422
        assert "Duplicate" in resp.json()["detail"]

    def test_missing_line_rejected(self, client):
        company, token = _setup_company(client, "vch4@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        resp = client.post("/api/vouchers", json={
            "voucher_type": "journal",
            "voucher_date": "2025-04-15",
            "lines": [
                {"ledger_id": l1["id"], "debit": 1000, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 422

    def test_invalid_ledger_rejected(self, client):
        company, token = _setup_company(client, "vch5@example.com")
        cid = company["id"]

        resp = client.post("/api/vouchers", json={
            "voucher_type": "journal",
            "voucher_date": "2025-04-15",
            "lines": [
                {"ledger_id": "nonexistent", "debit": 1000, "credit": 0},
                {"ledger_id": "also-fake", "debit": 0, "credit": 1000},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 404

    def test_auto_numbering(self, client):
        company, token = _setup_company(client, "vch6@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        for i in range(3):
            resp = client.post("/api/vouchers", json={
                "voucher_type": "journal",
                "voucher_date": "2025-04-15",
                "narration": f"Auto-number test {i}",
                "lines": [
                    {"ledger_id": l1["id"], "debit": 100, "credit": 0},
                    {"ledger_id": l2["id"], "debit": 0, "credit": 100},
                ],
            }, headers=auth_header(token, cid))
            assert resp.status_code == 201


class TestVoucherRoundOff:
    """Round-off adjustment lines with an empty ledger id must resolve to the
    system Round Off ledger (auto-created when the company has none).

    Regression: the UI posts the round-off line with `ledger_id: ""` when the
    company has no "Round Off" ledger (Tally-imported / pre-seed companies such
    as the demo companies) — previously this 422'd with
    "Ledger is required for each line" and the voucher could not be saved.
    """

    def test_sales_round_off_auto_creates_round_off_ledger(self, client):
        company, token = _setup_company(client, "vch-ro@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        # No "Round Off" ledger exists yet in this company.
        ledgers = client.get("/api/coa/ledgers", headers=auth_header(token, cid)).json()
        assert not any(l["name"] == "Round Off" for l in ledgers)

        # 3 × 100.50 = 301.50, rounded up to 302 → +0.50 round-off credit.
        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales",
            "voucher_date": "2025-04-15",
            "narration": "Round-off auto ledger",
            "lines": [
                {"ledger_id": l1["id"], "quantity": 3, "rate": 100.5},
                {"ledger_id": "", "credit": 0.50},
                {"ledger_id": l2["id"], "debit": 302},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        data = resp.json()

        # Round Off ledger was auto-created with the system code.
        ledgers = client.get("/api/coa/ledgers", headers=auth_header(token, cid)).json()
        ro = [l for l in ledgers if l["system_code"] == "SYS_ROUND_OFF"]
        assert len(ro) == 1
        assert ro[0]["name"] == "Round Off"

        # The round-off line landed on the auto-created ledger, Dr == Cr.
        lines = data["lines"]
        ro_lines = [l for l in lines if l["ledger_id"] == ro[0]["id"]]
        assert len(ro_lines) == 1
        assert float(ro_lines[0]["credit"]) == 0.50
        assert float(ro_lines[0]["debit"]) == 0
        total_debit = sum(float(l["debit"] or 0) for l in lines)
        total_credit = sum(float(l["credit"] or 0) for l in lines)
        assert abs(total_debit - total_credit) < 0.001

    def test_round_off_negative_direction_uses_debit(self, client):
        company, token = _setup_company(client, "vch-ro2@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        # 1 × 302.60 = 302.60, rounded down to 302 → −0.60 round-off debit.
        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales",
            "voucher_date": "2025-04-16",
            "narration": "Round-off negative",
            "lines": [
                {"ledger_id": l1["id"], "quantity": 1, "rate": 302.6},
                {"ledger_id": "", "debit": 0.60},
                {"ledger_id": l2["id"], "debit": 302},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        data = resp.json()

        ledgers = client.get("/api/coa/ledgers", headers=auth_header(token, cid)).json()
        ro = [l for l in ledgers if l["system_code"] == "SYS_ROUND_OFF"]
        assert len(ro) == 1
        ro_lines = [l for l in data["lines"] if l["ledger_id"] == ro[0]["id"]]
        assert len(ro_lines) == 1
        assert float(ro_lines[0]["debit"]) == 0.60
        assert float(ro_lines[0]["credit"]) == 0

    def test_round_off_to_auto_rounds_grand_total(self, client):
        """round_off_to=0 (Auto): backend rounds to nearest rupee (half-up),
        parks the adjustment on the Round Off ledger, stores the rounded total.

        Regression: the backend used to interpret round_off_to as "round to
        nearest multiple" and ignored 0 (falsy), so the UI's Auto mode saved an
        UNROUNDED grand_total while debiting the rounded amount.
        """
        company, token = _setup_company(client, "vch-ro4@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales",
            "voucher_date": "2025-04-18",
            "narration": "Round-off Auto",
            "round_off_to": 0,
            "lines": [
                {"ledger_id": l1["id"], "quantity": 3, "rate": 100.5},
                {"ledger_id": l2["id"], "debit": 302},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert float(data["grand_total"]) == 302.0
        assert float(data["round_off_to"]) == 0

        ledgers = client.get("/api/coa/ledgers", headers=auth_header(token, cid)).json()
        ro = [l for l in ledgers if l["system_code"] == "SYS_ROUND_OFF"][0]
        ro_lines = [l for l in data["lines"] if l["ledger_id"] == ro["id"]]
        assert len(ro_lines) == 1
        assert float(ro_lines[0]["credit"]) == 0.50
        assert float(ro_lines[0]["debit"]) == 0

    def test_round_off_to_round_down_uses_debit(self, client):
        company, token = _setup_company(client, "vch-ro5@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        # 301.50 floors to 301 → −0.50 adjustment parked as a debit.
        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales",
            "voucher_date": "2025-04-19",
            "narration": "Round-off Down",
            "round_off_to": 2,
            "lines": [
                {"ledger_id": l1["id"], "quantity": 3, "rate": 100.5},
                {"ledger_id": l2["id"], "debit": 301},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert float(data["grand_total"]) == 301.0

        ledgers = client.get("/api/coa/ledgers", headers=auth_header(token, cid)).json()
        ro = [l for l in ledgers if l["system_code"] == "SYS_ROUND_OFF"][0]
        ro_lines = [l for l in data["lines"] if l["ledger_id"] == ro["id"]]
        assert len(ro_lines) == 1
        assert float(ro_lines[0]["debit"]) == 0.50
        assert float(ro_lines[0]["credit"]) == 0

    def test_round_off_to_round_up_ceils(self, client):
        company, token = _setup_company(client, "vch-ro6@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        # 302.60 ceils to 303 → +0.40 credit adjustment.
        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales",
            "voucher_date": "2025-04-20",
            "narration": "Round-off Up",
            "round_off_to": 1,
            "lines": [
                {"ledger_id": l1["id"], "quantity": 1, "rate": 302.6},
                {"ledger_id": l2["id"], "debit": 303},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert float(data["grand_total"]) == 303.0

        ledgers = client.get("/api/coa/ledgers", headers=auth_header(token, cid)).json()
        ro = [l for l in ledgers if l["system_code"] == "SYS_ROUND_OFF"][0]
        ro_lines = [l for l in data["lines"] if l["ledger_id"] == ro["id"]]
        assert len(ro_lines) == 1
        assert float(ro_lines[0]["credit"]) == 0.40

    def test_round_off_none_leaves_grand_total_untouched(self, client):
        company, token = _setup_company(client, "vch-ro7@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales",
            "voucher_date": "2025-04-21",
            "narration": "Round-off None",
            "lines": [
                {"ledger_id": l1["id"], "quantity": 3, "rate": 100.5},
                {"ledger_id": l2["id"], "debit": 301.50},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert float(data["grand_total"]) == 301.5
        assert data["round_off_to"] is None
        # No round-off line when rounding is off (ledger may not even exist).
        ledgers = client.get("/api/coa/ledgers", headers=auth_header(token, cid)).json()
        ro_ids = {l["id"] for l in ledgers if l["system_code"] == "SYS_ROUND_OFF"}
        assert not any(l["ledger_id"] in ro_ids for l in data["lines"])

    def test_purchase_round_off_balances(self, client):
        """Purchase counter is a CREDIT — a round-up must debit the Round Off
        ledger (regression: the adjustment side was hardcoded for sales, so a
        fractional purchase with rounding 422'd 'Voucher not balanced')."""
        company, token = _setup_company(client, "vch-ro8@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        resp = client.post("/api/vouchers", json={
            "voucher_type": "purchase",
            "voucher_date": "2025-04-22",
            "narration": "Purchase round-off up",
            "round_off_to": 0,
            "lines": [
                {"ledger_id": l1["id"], "quantity": 3, "rate": 100.5, "debit": 301.50, "credit": 0},
                {"ledger_id": l2["id"], "debit": 0, "credit": 302},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert float(data["grand_total"]) == 302.0
        ledgers = client.get("/api/coa/ledgers", headers=auth_header(token, cid)).json()
        ro = [l for l in ledgers if l["system_code"] == "SYS_ROUND_OFF"][0]
        ro_lines = [l for l in data["lines"] if l["ledger_id"] == ro["id"]]
        assert len(ro_lines) == 1
        assert float(ro_lines[0]["debit"]) == 0.50
        total_debit = sum(float(l["debit"] or 0) for l in data["lines"])
        total_credit = sum(float(l["credit"] or 0) for l in data["lines"])
        assert abs(total_debit - total_credit) < 0.001

    def test_purchase_round_off_down_credits(self, client):
        company, token = _setup_company(client, "vch-ro9@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        # 301.50 floors to 301; purchase counter is a credit, so the −0.50
        # adjustment credits Round Off.
        resp = client.post("/api/vouchers", json={
            "voucher_type": "purchase",
            "voucher_date": "2025-04-23",
            "narration": "Purchase round-off down",
            "round_off_to": 2,
            "lines": [
                {"ledger_id": l1["id"], "quantity": 3, "rate": 100.5, "debit": 301.50, "credit": 0},
                {"ledger_id": l2["id"], "debit": 0, "credit": 301},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert float(data["grand_total"]) == 301.0
        ledgers = client.get("/api/coa/ledgers", headers=auth_header(token, cid)).json()
        ro = [l for l in ledgers if l["system_code"] == "SYS_ROUND_OFF"][0]
        ro_lines = [l for l in data["lines"] if l["ledger_id"] == ro["id"]]
        assert len(ro_lines) == 1
        assert float(ro_lines[0]["credit"]) == 0.50
        total_debit = sum(float(l["debit"] or 0) for l in data["lines"])
        total_credit = sum(float(l["credit"] or 0) for l in data["lines"])
        assert abs(total_debit - total_credit) < 0.001

    def test_credit_note_round_off_balances(self, client):
        company, token = _setup_company(client, "vch-ro10@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        # Credit note: items debit 301.50, party credit 302 (rounded up), the
        # +0.50 adjustment debits Round Off.
        resp = client.post("/api/vouchers", json={
            "voucher_type": "credit_note",
            "voucher_date": "2025-04-24",
            "narration": "Credit note round-off",
            "round_off_to": 0,
            "lines": [
                {"ledger_id": l1["id"], "quantity": 3, "rate": 100.5},
                {"ledger_id": l2["id"], "debit": 0, "credit": 302},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert float(data["grand_total"]) == 302.0
        ledgers = client.get("/api/coa/ledgers", headers=auth_header(token, cid)).json()
        ro = [l for l in ledgers if l["system_code"] == "SYS_ROUND_OFF"][0]
        ro_lines = [l for l in data["lines"] if l["ledger_id"] == ro["id"]]
        assert len(ro_lines) == 1
        assert float(ro_lines[0]["debit"]) == 0.50
        total_debit = sum(float(l["debit"] or 0) for l in data["lines"])
        total_credit = sum(float(l["credit"] or 0) for l in data["lines"])
        assert abs(total_debit - total_credit) < 0.001

    def test_debit_note_round_off_balances(self, client):
        company, token = _setup_company(client, "vch-ro11@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        # Debit note: items credit 302.60, party debit 303 (ceil), the +0.40
        # adjustment credits Round Off.
        resp = client.post("/api/vouchers", json={
            "voucher_type": "debit_note",
            "voucher_date": "2025-04-25",
            "narration": "Debit note round-off",
            "round_off_to": 1,
            "lines": [
                {"ledger_id": l1["id"], "quantity": 1, "rate": 302.6},
                {"ledger_id": l2["id"], "debit": 303, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert float(data["grand_total"]) == 303.0
        ledgers = client.get("/api/coa/ledgers", headers=auth_header(token, cid)).json()
        ro = [l for l in ledgers if l["system_code"] == "SYS_ROUND_OFF"][0]
        ro_lines = [l for l in data["lines"] if l["ledger_id"] == ro["id"]]
        assert len(ro_lines) == 1
        assert float(ro_lines[0]["credit"]) == 0.40
        total_debit = sum(float(l["debit"] or 0) for l in data["lines"])
        total_credit = sum(float(l["credit"] or 0) for l in data["lines"])
        assert abs(total_debit - total_credit) < 0.001

    def test_round_off_amount_helper(self):
        """`round_off_amount` is grand_total − subtotal − tax: non-zero only
        when rounding was applied (round_off_to OR the ≤0.01 auto-balance path),
        so the PDF totals block always reconciles with the stored grand total."""
        from types import SimpleNamespace
        from app.services.pdf import round_off_amount

        # Auto mode: 337.68 → 338.00 → +0.32 adjustment.
        rounded = SimpleNamespace(grand_total=338.0, subtotal=301.50, tax_total=36.18)
        assert abs(round_off_amount(rounded) - 0.32) < 1e-9

        # Round Down: 337.68 → 337.00 → −0.68 adjustment.
        down = SimpleNamespace(grand_total=337.0, subtotal=301.50, tax_total=36.18)
        assert abs(round_off_amount(down) + 0.68) < 1e-9

        # Auto-balance path: round_off_to is None but a ≤0.01 adjustment exists.
        autobal = SimpleNamespace(grand_total=338.01, subtotal=301.50, tax_total=36.50)
        assert abs(round_off_amount(autobal) - 0.01) < 1e-9

        # No rounding: totals add up → zero.
        plain = SimpleNamespace(grand_total=337.68, subtotal=301.50, tax_total=36.18)
        assert round_off_amount(plain) == 0.0

    def test_round_off_voucher_pdf_generates(self, client):
        """A voucher saved with round-off must still render its PDF (the
        Round Off totals row now shows the actual adjustment, not the mode)."""
        company, token = _setup_company(client, "vch-ro12@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales",
            "voucher_date": "2025-04-26",
            "narration": "Round-off PDF",
            "round_off_to": 0,
            "lines": [
                {"ledger_id": l1["id"], "quantity": 3, "rate": 100.5},
                {"ledger_id": l2["id"], "debit": 302},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        voucher_id = resp.json()["id"]

        pdf = client.get(f"/api/vouchers/{voucher_id}/pdf", headers=auth_header(token, cid))
        assert pdf.status_code == 200
        assert pdf.headers["content-type"] == "application/pdf"
        assert len(pdf.content) > 1000

    def test_daybook_exposes_round_off_adjustment(self, client):
        """The Day Book exposes each voucher's round-off adjustment so the UI
        can show it as its own column/line (0 when the voucher has none)."""
        company, token = _setup_company(client, "vch-ro13@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        # Auto-mode sale: 3 × 100.50 = 301.50 → rounds to 302 → +0.50.
        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales",
            "voucher_date": "2025-04-27",
            "narration": "Daybook round-off",
            "round_off_to": 0,
            "lines": [
                {"ledger_id": l1["id"], "quantity": 3, "rate": 100.5},
                {"ledger_id": l2["id"], "debit": 302},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text

        daybook = client.get("/api/reports/daybook", headers=auth_header(token, cid)).json()
        entry = next(e for e in daybook["entries"] if e["narration"] == "Daybook round-off")
        assert abs(entry["round_off"] - 0.50) < 1e-9

        # A plain journal has no adjustment → 0.
        client.post("/api/vouchers", json={
            "voucher_type": "journal",
            "voucher_date": "2025-04-28",
            "narration": "Plain journal",
            "lines": [
                {"ledger_id": l1["id"], "debit": 100, "credit": 0},
                {"ledger_id": l2["id"], "debit": 0, "credit": 100},
            ],
        }, headers=auth_header(token, cid))
        daybook = client.get("/api/reports/daybook", headers=auth_header(token, cid)).json()
        entry = next(e for e in daybook["entries"] if e["narration"] == "Plain journal")
        assert entry["round_off"] == 0.0

    def test_empty_ledger_line_without_amount_still_rejected(self, client):
        """The empty-ledger escape hatch only applies to round-off-shaped lines
        (non-zero amount); a genuinely missing ledger still 422s."""
        company, token = _setup_company(client, "vch-ro3@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        resp = client.post("/api/vouchers", json={
            "voucher_type": "journal",
            "voucher_date": "2025-04-17",
            "lines": [
                {"ledger_id": l1["id"], "debit": 100, "credit": 0},
                {"ledger_id": "", "debit": 0, "credit": 0},
                {"ledger_id": l2["id"], "debit": 0, "credit": 100},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 422
        assert "Ledger is required" in resp.json()["detail"]


class TestVoucherRead:
    def test_get_voucher(self, client):
        company, token = _setup_company(client, "vch7@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        created = client.post("/api/vouchers", json={
            "voucher_type": "journal",
            "voucher_date": "2025-04-15",
            "narration": "Read test",
            "lines": [
                {"ledger_id": l1["id"], "debit": 500, "credit": 0},
                {"ledger_id": l2["id"], "debit": 0, "credit": 500},
            ],
        }, headers=auth_header(token, cid)).json()

        resp = client.get(f"/api/vouchers/{created['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.json()["narration"] == "Read test"

    def test_list_vouchers(self, client):
        company, token = _setup_company(client, "vch8@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        client.post("/api/vouchers", json={
            "voucher_type": "journal", "voucher_date": "2025-04-15",
            "lines": [{"ledger_id": l1["id"], "debit": 100, "credit": 0}, {"ledger_id": l2["id"], "debit": 0, "credit": 100}],
        }, headers=auth_header(token, cid))

        client.post("/api/vouchers", json={
            "voucher_type": "journal", "voucher_date": "2025-04-16",
            "lines": [{"ledger_id": l1["id"], "debit": 200, "credit": 0}, {"ledger_id": l2["id"], "debit": 0, "credit": 200}],
        }, headers=auth_header(token, cid))

        resp = client.get("/api/vouchers", headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 2

    def test_list_filter_by_type(self, client):
        company, token = _setup_company(client, "vch9@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        client.post("/api/vouchers", json={
            "voucher_type": "journal", "voucher_date": "2025-04-15",
            "lines": [{"ledger_id": l1["id"], "debit": 100, "credit": 0}, {"ledger_id": l2["id"], "debit": 0, "credit": 100}],
        }, headers=auth_header(token, cid))

        client.post("/api/vouchers", json={
            "voucher_type": "receipt", "voucher_date": "2025-04-15",
            "lines": [{"ledger_id": l1["id"], "debit": 100, "credit": 0}, {"ledger_id": l2["id"], "debit": 0, "credit": 100}],
        }, headers=auth_header(token, cid))

        resp = client.get("/api/vouchers?voucher_type=journal", headers=auth_header(token, cid))
        assert len(resp.json()["items"]) == 1
        assert resp.json()["items"][0]["voucher_type"] == "journal"

    def test_get_nonexistent(self, client):
        company, token = _setup_company(client, "vch10@example.com")
        cid = company["id"]
        resp = client.get("/api/vouchers/nonexistent", headers=auth_header(token, cid))
        assert resp.status_code == 404


class TestVoucherDelete:
    def test_delete_voucher(self, client):
        company, token = _setup_company(client, "vch11@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        created = client.post("/api/vouchers", json={
            "voucher_type": "journal", "voucher_date": "2025-04-15",
            "lines": [{"ledger_id": l1["id"], "debit": 100, "credit": 0}, {"ledger_id": l2["id"], "debit": 0, "credit": 100}],
        }, headers=auth_header(token, cid)).json()

        # Posted vouchers are protected: delete must reject with 400.
        resp = client.delete(f"/api/vouchers/{created['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 400

        # Cancel first, then delete succeeds.
        resp = client.post(
            f"/api/vouchers/{created['id']}/cancel",
            json={"reason": "test cleanup"},
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 200
        resp = client.delete(f"/api/vouchers/{created['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 204
