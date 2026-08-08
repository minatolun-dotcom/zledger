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
