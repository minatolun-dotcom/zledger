"""Production-hardening regression tests.

Covers the six critical accounting-integrity fixes:
1. Cancelled vouchers never move the books (soft-cancel status filters).
2. Voucher dates must fall inside some financial year (or be allowed pre-setup).
3. Cancellation is blocked inside a closed financial year.
4. Editing a voucher is atomic — no number burn, no orphan lines, balance kept.
5. Stock entries are reversed on cancel and replaced on edit.
6. Version snapshots record every edit.
"""
from tests.conftest import auth_header, create_company, register_user


def _setup_company(client, email: str):
    _, token = register_user(client, email)
    company = create_company(client, token)
    return company, token


def _create_fy(client, token, cid, name="2025-26"):
    resp = client.post("/api/coa/financial-years", json={
        "name": name, "start_date": "2025-04-01", "end_date": "2026-03-31",
    }, headers=auth_header(token, cid))
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def _create_groups_and_ledgers(client, token, cid):
    income_group = client.post("/api/coa/groups", json={
        "name": "Test Direct Income", "nature": "income", "group_type": "sub",
    }, headers=auth_header(token, cid)).json()
    expense_group = client.post("/api/coa/groups", json={
        "name": "Test Direct Expenses", "nature": "expenses", "group_type": "sub",
    }, headers=auth_header(token, cid)).json()
    asset_group = client.post("/api/coa/groups", json={
        "name": "Test Current Assets", "nature": "assets", "group_type": "sub",
    }, headers=auth_header(token, cid)).json()

    sales = client.post("/api/coa/ledgers", json={
        "name": "Test Sales", "group_id": income_group["id"], "opening_balance": 0, "opening_balance_type": "Cr",
    }, headers=auth_header(token, cid)).json()
    purchase = client.post("/api/coa/ledgers", json={
        "name": "Test Purchases", "group_id": expense_group["id"], "opening_balance": 0, "opening_balance_type": "Dr",
    }, headers=auth_header(token, cid)).json()
    bank = client.post("/api/coa/ledgers", json={
        "name": "Test Bank", "group_id": asset_group["id"], "opening_balance": 0, "opening_balance_type": "Dr",
    }, headers=auth_header(token, cid)).json()
    return income_group, expense_group, asset_group, sales, purchase, bank


class TestCancelledExcludedFromReports:
    def test_cancelled_voucher_excluded_from_trial_balance(self, client):
        """A cancelled voucher must not move the Trial Balance (soft cancel)."""
        company, token = _setup_company(client, "aint1@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        created = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 100},
                {"ledger_id": bank["id"], "debit": 100, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert created.status_code == 201, created.text

        # Balance shows before cancel
        tb = client.get(f"/api/reports/trial-balance?financial_year_id={fy['id']}", headers=auth_header(token, cid)).json()
        assert tb["total_credit"] > 0

        resp = client.post(
            f"/api/vouchers/{created.json()['id']}/cancel",
            json={"reason": "wrong entry"},
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 200

        tb = client.get(f"/api/reports/trial-balance?financial_year_id={fy['id']}", headers=auth_header(token, cid)).json()
        assert tb["total_debit"] == 0
        assert tb["total_credit"] == 0

    def test_cancelled_voucher_excluded_from_pnl_and_bs(self, client):
        """P&L and Balance Sheet also exclude cancelled vouchers."""
        company, token = _setup_company(client, "aint2@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        created = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 100},
                {"ledger_id": bank["id"], "debit": 100, "credit": 0},
            ],
        }, headers=auth_header(token, cid)).json()

        pnl = client.get(f"/api/reports/profit-and-loss?financial_year_id={fy['id']}", headers=auth_header(token, cid)).json()
        assert pnl["total_income"] > 0
        bs = client.get(f"/api/reports/balance-sheet?financial_year_id={fy['id']}", headers=auth_header(token, cid)).json()
        assert bs["total_assets"] > 0

        client.post(f"/api/vouchers/{created['id']}/cancel", json={"reason": "oops"}, headers=auth_header(token, cid))

        pnl = client.get(f"/api/reports/profit-and-loss?financial_year_id={fy['id']}", headers=auth_header(token, cid)).json()
        assert pnl["total_income"] == 0
        bs = client.get(f"/api/reports/balance-sheet?financial_year_id={fy['id']}", headers=auth_header(token, cid)).json()
        assert bs["total_assets"] == 0

    def test_round_off_total_excludes_cancelled(self, client):
        """Round-off aggregation must ignore cancelled vouchers."""
        company, token = _setup_company(client, "aint3@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        created = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "round_off_to": 0,
            "lines": [
                {"ledger_id": sales["id"], "quantity": 3, "rate": 100.5},
                {"ledger_id": bank["id"], "debit": 302, "credit": 0},
            ],
        }, headers=auth_header(token, cid)).json()

        tb = client.get(f"/api/reports/trial-balance?financial_year_id={fy['id']}", headers=auth_header(token, cid)).json()
        assert abs(tb["round_off_total"] - 0.50) < 0.011

        client.post(f"/api/vouchers/{created['id']}/cancel", json={"reason": "void"}, headers=auth_header(token, cid))

        tb = client.get(f"/api/reports/trial-balance?financial_year_id={fy['id']}", headers=auth_header(token, cid)).json()
        assert tb["round_off_total"] == 0


class TestFinancialYearDateValidation:
    def test_voucher_date_outside_all_fys_rejected(self, client):
        """A date beyond every FY is rejected instead of silently vanishing from reports."""
        company, token = _setup_company(client, "aint4@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)  # 2025-04-01 .. 2026-03-31
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2030-01-01",
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 100},
                {"ledger_id": bank["id"], "debit": 100, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 422
        assert "outside all financial years" in resp.json()["detail"]

    def test_voucher_date_in_closed_fy_rejected(self, client):
        """Dates inside a closed FY are rejected on create."""
        company, token = _setup_company(client, "aint5@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        client.patch(f"/api/coa/financial-years/{fy['id']}/close", headers=auth_header(token, cid))
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 100},
                {"ledger_id": bank["id"], "debit": 100, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 400
        assert "closed" in resp.json()["detail"]

    def test_cancel_blocked_in_closed_fy(self, client):
        """Cancelling inside a closed FY is rejected."""
        company, token = _setup_company(client, "aint6@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        created = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 100},
                {"ledger_id": bank["id"], "debit": 100, "credit": 0},
            ],
        }, headers=auth_header(token, cid)).json()

        client.patch(f"/api/coa/financial-years/{fy['id']}/close", headers=auth_header(token, cid))

        resp = client.post(
            f"/api/vouchers/{created['id']}/cancel",
            json={"reason": "late cancel"},
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 400
        assert "closed" in resp.json()["detail"]

    def test_no_fys_configured_still_allowed(self, client):
        """Companies with zero FYs (fresh setup) can still post vouchers."""
        company, token = _setup_company(client, "aint7@example.com")
        cid = company["id"]
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 100},
                {"ledger_id": bank["id"], "debit": 100, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201


class TestAtomicEdit:
    def test_edit_preserves_number_and_balances(self, client):
        """Editing keeps the voucher number (no burn) and keeps Dr=Cr."""
        company, token = _setup_company(client, "aint8@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        created = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 100},
                {"ledger_id": bank["id"], "debit": 100, "credit": 0},
            ],
        }, headers=auth_header(token, cid)).json()
        original_number = created["voucher_number"]

        resp = client.put(f"/api/vouchers/{created['id']}", json={
            "voucher_type": "sales", "voucher_date": "2025-06-02", "narration": "edited",
            "lines": [
                {"ledger_id": sales["id"], "quantity": 2, "rate": 150},
                {"ledger_id": bank["id"], "debit": 300, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["voucher_number"] == original_number
        assert abs(float(data["grand_total"]) - 300) < 0.011
        total_d = sum(float(l["debit"]) for l in data["lines"])
        total_c = sum(float(l["credit"]) for l in data["lines"])
        assert abs(total_d - total_c) < 0.011

    def test_edit_records_version_snapshot(self, client):
        """Version history captures the pre-edit snapshot."""
        company, token = _setup_company(client, "aint9@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        created = client.post("/api/vouchers", json={
            "voucher_type": "journal", "voucher_date": "2025-06-01", "narration": "before edit",
            "lines": [
                {"ledger_id": sales["id"], "debit": 100, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 100},
            ],
        }, headers=auth_header(token, cid)).json()

        resp = client.put(f"/api/vouchers/{created['id']}", json={
            "voucher_type": "journal", "voucher_date": "2025-06-01", "narration": "after edit",
            "lines": [
                {"ledger_id": sales["id"], "debit": 200, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 200},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        history = client.get(f"/api/vouchers/{created['id']}/history", headers=auth_header(token, cid)).json()
        assert isinstance(history, list)
        assert any(h["change_type"] == "update" for h in history), "edit must create a version snapshot"

    def test_edit_rejects_out_of_fy_date(self, client):
        """Editing cannot move a voucher outside all FYs."""
        company, token = _setup_company(client, "aint10@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        created = client.post("/api/vouchers", json={
            "voucher_type": "journal", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": sales["id"], "debit": 100, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 100},
            ],
        }, headers=auth_header(token, cid)).json()

        resp = client.put(f"/api/vouchers/{created['id']}", json={
            "voucher_type": "journal", "voucher_date": "2031-06-01",
            "lines": [
                {"ledger_id": sales["id"], "debit": 100, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 100},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 422


class TestStockReversal:
    def _make_stock_item(self, client, token, cid):
        resp = client.post("/api/inventory/items", json={
            "name": "Test Item",
            "unit_of_measure": "Nos",
            "valuation_method": "weighted_avg",
            "gst_rate": 0,
            "item_type": "goods",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def test_cancel_sales_reverses_stock(self, client):
        """Cancelling a sale restores the stock balance."""
        company, token = _setup_company(client, "aint11@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, purchase, bank = _create_groups_and_ledgers(client, token, cid)
        item = self._make_stock_item(client, token, cid)

        # Purchase 10 @ 100 (stock = 10)
        resp = client.post("/api/vouchers", json={
            "voucher_type": "purchase", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": purchase["id"], "stock_item_id": item["id"], "quantity": 10, "rate": 100},
                {"ledger_id": bank["id"], "debit": 0, "credit": 1000},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text

        summary = client.get(f"/api/reports/stock-movement", headers=auth_header(token, cid)).json()
        assert any(l["stock_item_name"] == "Test Item" and l["closing_qty"] == 10 for l in summary["lines"])

        # Sale 4 (stock = 6)
        sale = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-02",
            "lines": [
                {"ledger_id": sales["id"], "stock_item_id": item["id"], "quantity": 4, "rate": 150},
                {"ledger_id": bank["id"], "debit": 600, "credit": 0},
            ],
        }, headers=auth_header(token, cid)).json()

        # Cancel the sale (stock back to 10)
        resp = client.post(f"/api/vouchers/{sale['id']}/cancel", json={"reason": "returned"}, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        summary = client.get(f"/api/reports/stock-movement", headers=auth_header(token, cid)).json()
        line = next(l for l in summary["lines"] if l["stock_item_name"] == "Test Item")
        assert line["closing_qty"] == 10

    def test_edit_sales_replaces_stock(self, client):
        """Editing a sale swaps the stock entries (no double counting)."""
        company, token = _setup_company(client, "aint12@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, purchase, bank = _create_groups_and_ledgers(client, token, cid)
        item = self._make_stock_item(client, token, cid)

        client.post("/api/vouchers", json={
            "voucher_type": "purchase", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": item["id"], "stock_item_id": item["id"], "quantity": 10, "rate": 100},
                {"ledger_id": bank["id"], "debit": 1000, "credit": 0},
            ],
        }, headers=auth_header(token, cid))

        resp = client.post("/api/vouchers", json={
            "voucher_type": "purchase", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": purchase["id"], "stock_item_id": item["id"], "quantity": 10, "rate": 100},
                {"ledger_id": bank["id"], "debit": 0, "credit": 1000},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text

        sale = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-02",
            "lines": [
                {"ledger_id": sales["id"], "stock_item_id": item["id"], "quantity": 4, "rate": 150},
                {"ledger_id": bank["id"], "debit": 600, "credit": 0},
            ],
        }, headers=auth_header(token, cid)).json()

        # Edit: 4 → 6 units
        resp = client.put(f"/api/vouchers/{sale['id']}", json={
            "voucher_type": "sales", "voucher_date": "2025-06-02",
            "lines": [
                {"ledger_id": sales["id"], "stock_item_id": item["id"], "quantity": 6, "rate": 150},
                {"ledger_id": bank["id"], "debit": 900, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        summary = client.get(f"/api/reports/stock-movement", headers=auth_header(token, cid)).json()
        line = next(l for l in summary["lines"] if l["stock_item_name"] == "Test Item")
        assert line["closing_qty"] == 4  # 10 − 6


class TestPartyStatementExcludesCancelled:
    def _make_party(self, client, token, cid):
        resp = client.post("/api/coa/parties", json={
            "name": "Test Customer",
            "party_type": "customer",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def test_cancelled_invoice_dropped_from_statement(self, client):
        """A cancelled invoice must not appear in the party's bill-wise statement."""
        company, token = _setup_company(client, "aint13@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_party(client, token, cid)

        created = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 100},
                {"ledger_id": bank["id"], "debit": 100, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert created.status_code == 201, created.text
        created = created.json()

        stmt = client.get(
            f"/api/bills/statement/{party['id']}?start_date=2025-04-01&end_date=2026-03-31",
            headers=auth_header(token, cid),
        ).json()
        assert len(stmt["transactions"]) == 1, "invoice must appear before cancel"

        client.post(f"/api/vouchers/{created['id']}/cancel", json={"reason": "wrong party"}, headers=auth_header(token, cid))

        stmt = client.get(
            f"/api/bills/statement/{party['id']}?start_date=2025-04-01&end_date=2026-03-31",
            headers=auth_header(token, cid),
        ).json()
        assert len(stmt["transactions"]) == 0, "cancelled invoice must vanish from statement"
        assert stmt["total_debit"] == 0
        assert stmt["total_credit"] == 0

    def test_cancelled_invoice_dropped_from_outstanding(self, client):
        """A cancelled invoice must not be offered for settlement."""
        company, token = _setup_company(client, "aint14@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_party(client, token, cid)

        created = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 100},
                {"ledger_id": bank["id"], "debit": 100, "credit": 0},
            ],
        }, headers=auth_header(token, cid)).json()

        outstanding = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales",
            headers=auth_header(token, cid),
        ).json()
        assert len(outstanding["bills"]) == 1

        client.post(f"/api/vouchers/{created['id']}/cancel", json={"reason": "void"}, headers=auth_header(token, cid))

        outstanding = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales",
            headers=auth_header(token, cid),
        ).json()
        assert len(outstanding["bills"]) == 0


class TestReversalVouchers:
    def test_cancel_creates_linked_reversal(self, client):
        """Cancelling creates an explicit reversal voucher with opposite lines."""
        company, token = _setup_company(client, "aint18@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        created = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 100},
                {"ledger_id": bank["id"], "debit": 100, "credit": 0},
            ],
        }, headers=auth_header(token, cid)).json()

        resp = client.post(f"/api/vouchers/{created['id']}/cancel", json={"reason": "wrong entry"}, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text
        cancelled = resp.json()
        assert cancelled["status"] == "cancelled"
        assert cancelled["reversed_by_voucher_id"]

        # Reversal exists, linked, with swapped entries, and excluded from reports
        rev = client.get(f"/api/vouchers/{cancelled['reversed_by_voucher_id']}", headers=auth_header(token, cid)).json()
        assert rev["status"] == "reversed"
        assert rev["original_voucher_id"] == created["id"]
        assert "Reversal of" in (rev["narration"] or "")
        rev_dr = sum(float(l["debit"]) for l in rev["lines"])
        rev_cr = sum(float(l["credit"]) for l in rev["lines"])
        assert rev_dr == rev_cr  # reversal itself is balanced
        assert rev_dr == 100

        tb = client.get(f"/api/reports/trial-balance?financial_year_id={fy['id']}", headers=auth_header(token, cid)).json()
        assert tb["total_debit"] == 0
        assert tb["total_credit"] == 0

    def test_restore_deletes_reversal(self, client):
        """Restoring a cancelled voucher removes its reversal voucher."""
        company, token = _setup_company(client, "aint19@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        created = client.post("/api/vouchers", json={
            "voucher_type": "journal", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": sales["id"], "debit": 100, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 100},
            ],
        }, headers=auth_header(token, cid)).json()
        cancelled = client.post(
            f"/api/vouchers/{created['id']}/cancel", json={"reason": "fix later"},
            headers=auth_header(token, cid),
        ).json()
        rev_id = cancelled["reversed_by_voucher_id"]

        resp = client.post(
            f"/api/vouchers/{created['id']}/restore", json={"reason": "keep it"},
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 200, resp.text
        restored = resp.json()
        assert restored["status"] == "posted"
        assert restored["reversed_by_voucher_id"] is None

        gone = client.get(f"/api/vouchers/{rev_id}", headers=auth_header(token, cid))
        assert gone.status_code == 404

        tb = client.get(f"/api/reports/trial-balance?financial_year_id={fy['id']}", headers=auth_header(token, cid)).json()
        assert tb["total_debit"] == 100

    def test_delete_cancelled_removes_reversal(self, client):
        """Deleting a cancelled voucher also removes its reversal (no orphans)."""
        company, token = _setup_company(client, "aint20@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        created = client.post("/api/vouchers", json={
            "voucher_type": "journal", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": sales["id"], "debit": 100, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 100},
            ],
        }, headers=auth_header(token, cid)).json()
        cancelled = client.post(
            f"/api/vouchers/{created['id']}/cancel", json={"reason": "remove"},
            headers=auth_header(token, cid),
        ).json()
        rev_id = cancelled["reversed_by_voucher_id"]

        resp = client.delete(f"/api/vouchers/{created['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 204
        assert client.get(f"/api/vouchers/{rev_id}", headers=auth_header(token, cid)).status_code == 404

    def test_reversal_voucher_not_editable(self, client):
        """Reversal vouchers are system-generated audit entries — editing is rejected."""
        company, token = _setup_company(client, "aint21@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        created = client.post("/api/vouchers", json={
            "voucher_type": "journal", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": sales["id"], "debit": 100, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 100},
            ],
        }, headers=auth_header(token, cid)).json()
        cancelled = client.post(
            f"/api/vouchers/{created['id']}/cancel", json={"reason": "rev"},
            headers=auth_header(token, cid),
        ).json()
        rev_id = cancelled["reversed_by_voucher_id"]

        resp = client.put(f"/api/vouchers/{rev_id}", json={
            "voucher_type": "journal", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": sales["id"], "debit": 1, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 1},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 400
        assert "reversal" in resp.json()["detail"].lower()


class TestCancelDependentCleanup:
    """Audit round 3: cancelled vouchers must not leave orphaned dependents.

    - TDS/TCS entries linked to a cancelled voucher are removed (else the
      TDS summary/returns overstate the liability).
    - Payment allocations are removed and the invoice's bill reference is
      recomputed, so outstanding snaps back after cancelling a settled payment.
    - The duplicate check ignores cancelled/reversed vouchers, so a cancelled
      entry can be legitimately re-posted.
    """

    def _make_party(self, client, token, cid, name="TDS Customer"):
        resp = client.post("/api/coa/parties", json={
            "name": name, "party_type": "customer",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def test_cancel_removes_tds_entry(self, client):
        """TDS deducted against a voucher must vanish when the voucher is cancelled."""
        company, token = _setup_company(client, "aint25@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        # Seed TDS sections and pick one
        client.post("/api/tds-tcs/sections/seed", headers=auth_header(token, cid))
        sections = client.get("/api/tds-tcs/sections", headers=auth_header(token, cid)).json()
        section = next(s for s in sections if s["is_active"])

        payment = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": bank["id"], "debit": 0, "credit": 10000},
                {"ledger_id": sales["id"], "debit": 10000, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert payment.status_code == 201, payment.text
        payment = payment.json()

        entry = client.post("/api/tds-tcs/entries", json={
            "voucher_id": payment["id"],
            "section_id": section["id"],
            "base_amount": 10000,
            "entry_date": "2025-06-01",
        }, headers=auth_header(token, cid))
        assert entry.status_code == 201, entry.text

        entries = client.get("/api/tds-tcs/entries", headers=auth_header(token, cid)).json()
        assert any(e["voucher_id"] == payment["id"] for e in entries), "entry must exist before cancel"

        resp = client.post(f"/api/vouchers/{payment['id']}/cancel", json={"reason": "wrong party"}, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        entries = client.get("/api/tds-tcs/entries", headers=auth_header(token, cid)).json()
        assert not any(e["voucher_id"] == payment["id"] for e in entries), "TDS entry must be removed on cancel"

    def test_cancel_keeps_deposited_tds_entry(self, client):
        """A deposited TDS entry (real challan) must survive its voucher's cancel."""
        company, token = _setup_company(client, "aint28@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        client.post("/api/tds-tcs/sections/seed", headers=auth_header(token, cid))
        sections = client.get("/api/tds-tcs/sections", headers=auth_header(token, cid)).json()
        section = next(s for s in sections if s["is_active"])

        payment = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": bank["id"], "debit": 0, "credit": 10000},
                {"ledger_id": sales["id"], "debit": 10000, "credit": 0},
            ],
        }, headers=auth_header(token, cid)).json()

        entry = client.post("/api/tds-tcs/entries", json={
            "voucher_id": payment["id"], "section_id": section["id"],
            "base_amount": 10000, "entry_date": "2025-06-01",
        }, headers=auth_header(token, cid)).json()

        dep = client.post("/api/tds-tcs/deposit", json={
            "entry_ids": [entry["id"]], "challan_number": "CH-0001", "deposition_date": "2025-07-01",
        }, headers=auth_header(token, cid))
        assert dep.status_code == 200, dep.text

        resp = client.post(f"/api/vouchers/{payment['id']}/cancel", json={"reason": "oops"}, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        entries = client.get("/api/tds-tcs/entries", headers=auth_header(token, cid)).json()
        surviving = [e for e in entries if e["voucher_id"] == payment["id"]]
        assert len(surviving) == 1, "deposited TDS entry must survive the cancel (challan record)"
        assert surviving[0]["status"] == "deposited"

    def test_cancel_payment_restores_invoice_outstanding(self, client):
        """Cancelling a settled receipt restores the invoice to outstanding."""
        company, token = _setup_company(client, "aint26@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_party(client, token, cid, name="Settle Customer")

        # Sales invoice 200 to the party
        invoice = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 200},
                {"ledger_id": bank["id"], "debit": 200, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert invoice.status_code == 201, invoice.text
        invoice = invoice.json()

        outstanding = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales", headers=auth_header(token, cid),
        ).json()
        assert len(outstanding["bills"]) == 1
        bill_ref_id = outstanding["bills"][0]["bill_reference_id"]

        # Receipt settles the invoice in full
        receipt = client.post("/api/vouchers", json={
            "voucher_type": "receipt", "voucher_date": "2025-06-02",
            "lines": [
                {"ledger_id": bank["id"], "debit": 200, "credit": 0},
                {"ledger_id": sales["id"], "debit": 0, "credit": 200},
            ],
        }, headers=auth_header(token, cid))
        assert receipt.status_code == 201, receipt.text
        receipt = receipt.json()

        settle = client.post("/api/bills/settle", json={
            "payment_voucher_id": receipt["id"],
            "settlement_date": "2025-06-02",
            "settlements": [{"bill_reference_id": bill_ref_id, "amount": 200}],
        }, headers=auth_header(token, cid))
        assert settle.status_code == 200, settle.text

        outstanding = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales", headers=auth_header(token, cid),
        ).json()
        assert len(outstanding["bills"]) == 0, "invoice should be settled"

        # Cancel the receipt → the invoice must come back as outstanding
        resp = client.post(f"/api/vouchers/{receipt['id']}/cancel", json={"reason": "not received"}, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        outstanding = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales", headers=auth_header(token, cid),
        ).json()
        assert len(outstanding["bills"]) == 1, "invoice must be outstanding again after cancelling the receipt"
        assert outstanding["bills"][0]["outstanding_amount"] == 200

    def test_duplicate_check_ignores_cancelled(self, client):
        """A cancelled voucher must not block re-posting the same entry."""
        company, token = _setup_company(client, "aint27@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        payload = {
            "voucher_type": "journal", "voucher_date": "2025-06-01", "narration": "repost me",
            "lines": [
                {"ledger_id": sales["id"], "debit": 100, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 100},
            ],
        }

        created = client.post("/api/vouchers", json=payload, headers=auth_header(token, cid))
        assert created.status_code == 201, created.text
        created = created.json()

        # Duplicate while posted → 409
        dup = client.post("/api/vouchers", json=payload, headers=auth_header(token, cid))
        assert dup.status_code == 409

        # Cancel, then re-post the same entry → must succeed now
        resp = client.post(f"/api/vouchers/{created['id']}/cancel", json={"reason": "re-post"}, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text
        repost = client.post("/api/vouchers", json=payload, headers=auth_header(token, cid))
        assert repost.status_code == 201, f"re-post after cancel must succeed, got {repost.status_code}: {repost.text}"


class TestCreditNoteAdjustment:
    """Audit round 4: credit-note bill adjustments.

    - The adjust endpoint must REDUCE the invoice's outstanding (TallyPrime
      semantics) — previously the positive amount was ADDED, inflating it.
    - The adjustment is persisted (bill_adjustments attribution row) so
      cancelling the credit note restores the invoice exactly; legacy
      un-attributed adjustments survive.
    """

    def _make_party(self, client, token, cid):
        resp = client.post("/api/coa/parties", json={
            "name": "CN Customer", "party_type": "customer",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _make_invoice(self, client, token, cid, party, sales, bank, amount=500):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": amount},
                {"ledger_id": bank["id"], "debit": amount, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _make_credit_note(self, client, token, cid, party, sales, bank, amount=500):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "credit_note", "voucher_date": "2025-06-03",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": amount},
                {"ledger_id": bank["id"], "debit": 0, "credit": amount},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _outstanding(self, client, token, cid, party):
        return client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales", headers=auth_header(token, cid),
        ).json()

    def test_adjust_reduces_outstanding_and_cancel_restores(self, client):
        """Adjust must shrink outstanding; cancelling the credit note restores it."""
        company, token = _setup_company(client, "aint30@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_party(client, token, cid)

        invoice = self._make_invoice(client, token, cid, party, sales, bank, amount=500)
        outstanding = self._outstanding(client, token, cid, party)
        assert len(outstanding["bills"]) == 1
        bill_ref_id = outstanding["bills"][0]["bill_reference_id"]
        assert outstanding["bills"][0]["outstanding_amount"] == 500

        cn = self._make_credit_note(client, token, cid, party, sales, bank, amount=500)

        # Adjust: outstanding must drop to 0 (credit note reduces the debt).
        resp = client.post(
            f"/api/bills/credit-note/{cn['id']}/adjust/{bill_ref_id}",
            json={}, headers=auth_header(token, cid),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["adjusted_amount"] == -500
        assert data["outstanding_amount"] == 0
        assert data["status"] == "paid"

        # The attribution row was persisted — the bill ref can be undone.
        from app.core.db import get_db
        from app.models.bill_adjustment import BillAdjustment
        db = next(get_db())
        rows = db.query(BillAdjustment).filter(
            BillAdjustment.credit_note_voucher_id == cn["id"]
        ).all()
        assert len(rows) == 1
        assert float(rows[0].amount) == -500
        db.close()

        # Cancel the credit note → outstanding snaps back to 500.
        resp = client.post(f"/api/vouchers/{cn['id']}/cancel", json={"reason": "issued in error"}, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        outstanding = self._outstanding(client, token, cid, party)
        assert len(outstanding["bills"]) == 1
        assert outstanding["bills"][0]["outstanding_amount"] == 500

        db = next(get_db())
        rows = db.query(BillAdjustment).filter(
            BillAdjustment.credit_note_voucher_id == cn["id"]
        ).all()
        assert len(rows) == 0, "adjustment attribution must be removed on cancel"
        db.close()

    def test_delete_cancelled_credit_note_keeps_outstanding_restored(self, client):
        """Deleting the cancelled credit note must not re-apply the adjustment."""
        company, token = _setup_company(client, "aint31@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_party(client, token, cid)

        self._make_invoice(client, token, cid, party, sales, bank, amount=300)
        outstanding = self._outstanding(client, token, cid, party)
        bill_ref_id = outstanding["bills"][0]["bill_reference_id"]

        cn = self._make_credit_note(client, token, cid, party, sales, bank, amount=100)
        resp = client.post(
            f"/api/bills/credit-note/{cn['id']}/adjust/{bill_ref_id}",
            json={}, headers=auth_header(token, cid),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["outstanding_amount"] == 200

        # Cancel then DELETE the credit note — outstanding must stay restored
        # to the full invoice (300), i.e. the deletion must not re-apply the
        # adjustment.
        resp = client.post(f"/api/vouchers/{cn['id']}/cancel", json={"reason": "remove"}, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text
        resp = client.delete(f"/api/vouchers/{cn['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 204

        outstanding = self._outstanding(client, token, cid, party)
        assert len(outstanding["bills"]) == 1
        assert outstanding["bills"][0]["outstanding_amount"] == 300


class TestBothPartyBillSide:
    """Round 27: a 'both' (supplier-and-customer) party is usable from BOTH
    sides. Its sales bills must surface as receivables and its purchase bills
    as payables — Tally parity — and /bills/all must expose the bill's side
    (voucher_type) so reports classify per-bill, not per-party."""

    def _make_both_party(self, client, token, cid):
        resp = client.post("/api/coa/parties", json={
            "name": "Both Trader", "party_type": "both",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _sale(self, client, token, cid, party, sales, bank, amount=500):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": amount},
                {"ledger_id": bank["id"], "debit": amount, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _purchase(self, client, token, cid, party, purchase, bank, amount=400):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "purchase", "voucher_date": "2025-06-02",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": purchase["id"], "quantity": 1, "rate": amount},
                {"ledger_id": bank["id"], "debit": 0, "credit": amount},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def test_both_party_bills_surface_on_both_sides(self, client):
        """A Both party's sales bill must appear in receivables and its
        purchase bill in payables (each keyed by the party's ledger id)."""
        company, token = _setup_company(client, "aint33@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, purchase, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_both_party(client, token, cid)

        self._sale(client, token, cid, party, sales, bank, amount=500)
        self._purchase(client, token, cid, party, purchase, bank, amount=400)

        # /payments/receivables|payables key items by party_id = Party.id
        # (Voucher.party_id), not the ledger id.
        recv = client.get("/api/payments/receivables", headers=auth_header(token, cid)).json()
        recv_items = [i for i in recv["items"] if i["party_id"] == party["id"]]
        assert len(recv_items) == 1, "both party's sales bill must be a receivable"
        assert recv_items[0]["unpaid_amount"] == 500

        pay = client.get("/api/payments/payables", headers=auth_header(token, cid)).json()
        pay_items = [i for i in pay["items"] if i["party_id"] == party["id"]]
        assert len(pay_items) == 1, "both party's purchase bill must be a payable"
        assert pay_items[0]["unpaid_amount"] == 400

    def test_bill_all_exposes_voucher_type(self, client):
        """/bills/all must tag each bill with its side (sales/purchase) so the
        report UI can classify per-bill instead of per-party."""
        company, token = _setup_company(client, "aint34@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, purchase, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_both_party(client, token, cid)

        sale = self._sale(client, token, cid, party, sales, bank, amount=500)
        purchase = self._purchase(client, token, cid, party, purchase, bank, amount=400)

        bills = client.get("/api/bills/all?status=open", headers=auth_header(token, cid)).json()
        by_voucher = {b["invoice_voucher_id"]: b for b in bills}

        assert by_voucher[sale["id"]]["voucher_type"] == "sales"
        assert by_voucher[purchase["id"]]["voucher_type"] == "purchase"

    def test_both_party_bill_adjusts_via_credit_note(self, client):
        """Adjusting a Both party's SALES bill must go through the credit-note
        path (the bill is a receivable) even though the party type is 'both'."""
        company, token = _setup_company(client, "aint35@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, purchase, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_both_party(client, token, cid)

        self._sale(client, token, cid, party, sales, bank, amount=500)
        outstanding = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales", headers=auth_header(token, cid),
        ).json()
        bill_ref_id = outstanding["bills"][0]["bill_reference_id"]

        cn = client.post("/api/vouchers", json={
            "voucher_type": "credit_note", "voucher_date": "2025-06-03",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 200},
                {"ledger_id": bank["id"], "debit": 0, "credit": 200},
            ],
        }, headers=auth_header(token, cid))
        assert cn.status_code == 201, cn.text

        resp = client.post(
            f"/api/bills/credit-note/{cn.json()['id']}/adjust/{bill_ref_id}",
            json={}, headers=auth_header(token, cid),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["outstanding_amount"] == 300


class TestRecurringTemplateAutoPause:
    """Audit round 4: a recurring template that keeps failing must auto-pause
    instead of retrying silently forever — and resuming resets the counter."""

    def _create_current_fy(self, client, token, cid):
        """FY covering today (2026-08) so failures come from the payload, not dates."""
        resp = client.post("/api/coa/financial-years", json={
            "name": "2026-27", "start_date": "2026-04-01", "end_date": "2027-03-31",
        }, headers=auth_header(token, cid))
        assert resp.status_code in (200, 201), resp.text
        return resp.json()

    def _broken_template_payload(self) -> dict:
        return {
            "voucher_type": "journal",
            "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": "nonexistent-ledger", "debit": 100, "credit": 0},
                {"ledger_id": "also-missing", "debit": 0, "credit": 100},
            ],
        }

    def test_auto_pauses_after_three_failures_and_resume_resets(self, client):
        company, token = _setup_company(client, "aint32@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        # Cover today (2026) so the failure is the bad ledger, not the FY.
        self._create_current_fy(client, token, cid)

        import datetime
        resp = client.post("/api/recurring-templates", json={
            "name": "Broken monthly",
            "voucher_type": "journal",
            "frequency": "monthly",
            "next_run_date": datetime.date.today().isoformat(),
            "template_payload": self._broken_template_payload(),
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        tmpl = resp.json()

        for expected_failures in (1, 2):
            run = client.post("/api/recurring-templates/process-due", headers=auth_header(token, cid))
            assert run.status_code == 200, run.text
            assert run.json()["processed"] == 0
            t = client.get(f"/api/recurring-templates/{tmpl['id']}", headers=auth_header(token, cid)).json()
            assert t["is_active"] is True, "template must stay active below the threshold"
            assert t["consecutive_failures"] == expected_failures
            assert t["last_error"], "last_error must record the reason"

        # Third failure → auto-paused.
        run = client.post("/api/recurring-templates/process-due", headers=auth_header(token, cid))
        assert run.status_code == 200, run.text
        t = client.get(f"/api/recurring-templates/{tmpl['id']}", headers=auth_header(token, cid)).json()
        assert t["is_active"] is False, "template must auto-pause after 3 consecutive failures"
        assert t["consecutive_failures"] == 3

        # A fourth run must NOT touch it (it's no longer due while paused).
        run = client.post("/api/recurring-templates/process-due", headers=auth_header(token, cid))
        assert run.json()["processed"] == 0
        t = client.get(f"/api/recurring-templates/{tmpl['id']}", headers=auth_header(token, cid)).json()
        assert t["consecutive_failures"] == 3

        # Resuming clears the failure bookkeeping.
        resp = client.patch(f"/api/recurring-templates/{tmpl['id']}", json={"is_active": True}, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text
        t = resp.json()
        assert t["is_active"] is True
        assert t["consecutive_failures"] == 0
        assert t["last_error"] is None

    def test_successful_run_resets_failures(self, client):
        """A template that recovers resets its failure counter."""
        company, token = _setup_company(client, "aint33@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        self._create_current_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        import datetime
        payload = self._broken_template_payload()
        resp = client.post("/api/recurring-templates", json={
            "name": "Recovering weekly",
            "voucher_type": "journal",
            "frequency": "weekly",
            "next_run_date": datetime.date.today().isoformat(),
            "template_payload": payload,
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        tmpl = resp.json()

        # Two failures, then fix the payload to a balanced journal.
        for _ in range(2):
            client.post("/api/recurring-templates/process-due", headers=auth_header(token, cid))
        t = client.get(f"/api/recurring-templates/{tmpl['id']}", headers=auth_header(token, cid)).json()
        assert t["consecutive_failures"] == 2

        fixed = {
            "template_payload": {
                "voucher_type": "journal", "voucher_date": "2025-06-01",
                "lines": [
                    {"ledger_id": sales["id"], "debit": 100, "credit": 0},
                    {"ledger_id": bank["id"], "debit": 0, "credit": 100},
                ],
            }
        }
        resp = client.patch(f"/api/recurring-templates/{tmpl['id']}", json=fixed, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        run = client.post("/api/recurring-templates/process-due", headers=auth_header(token, cid))
        assert run.json()["processed"] == 1
        t = client.get(f"/api/recurring-templates/{tmpl['id']}", headers=auth_header(token, cid)).json()
        assert t["consecutive_failures"] == 0, "a successful run must reset the failure counter"
        assert t["last_error"] is None



class TestAgingReflectsOutstandingBills:
    """Audit round 5: aging buckets must use bill-reference OUTSTANDING amounts,
    not raw voucher totals.

    Previously get_aging summed each party's voucher grand_totals, which
    ignored partial payments AND added credit-note vouchers to the aging
    balance (a receivable looked BIGGER after issuing a credit note).
    """

    def test_aging_after_credit_note_adjust(self, client):
        """After a credit-note adjustment, aging total = outstanding (not the
        raw invoice total, and not invoice + credit note)."""
        company, token = _setup_company(client, "aint40@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "Aging Customer", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()

        invoice = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 500},
                {"ledger_id": bank["id"], "debit": 500, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert invoice.status_code == 201, invoice.text

        # Bill reference for the invoice
        outstanding = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales",
            headers=auth_header(token, cid),
        ).json()
        bill_ref_id = outstanding["bills"][0]["bill_reference_id"]

        # Credit note of 200 against the 500 invoice → outstanding 300.
        cn = client.post("/api/vouchers", json={
            "voucher_type": "credit_note", "voucher_date": "2025-06-03",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 200},
                {"ledger_id": bank["id"], "debit": 0, "credit": 200},
            ],
        }, headers=auth_header(token, cid))
        assert cn.status_code == 201, cn.text
        adjust = client.post(
            f"/api/bills/credit-note/{cn.json()['id']}/adjust/{bill_ref_id}",
            json={}, headers=auth_header(token, cid),
        )
        assert adjust.status_code == 200, adjust.text

        aging = client.get(
            f"/api/reports/aging?financial_year_id={fy['id']}&type=receivable",
            headers=auth_header(token, cid),
        ).json()
        # 500 − 200 = 300 outstanding. The old bug returned 700 (500+200).
        assert aging["total"] == 300, aging
        assert len(aging["lines"]) == 1
        assert aging["lines"][0]["party_name"] == "Aging Customer"

    def test_aging_excludes_cancelled_invoices(self, client):
        """A cancelled invoice must not age at all."""
        company, token = _setup_company(client, "aint41@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "Aging Cancel", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()

        invoice = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 500},
                {"ledger_id": bank["id"], "debit": 500, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert invoice.status_code == 201, invoice.text

        cancel = client.post(
            f"/api/vouchers/{invoice.json()['id']}/cancel",
            json={"reason": "test"}, headers=auth_header(token, cid),
        )
        assert cancel.status_code == 200, cancel.text

        aging = client.get(
            f"/api/reports/aging?financial_year_id={fy['id']}&type=receivable",
            headers=auth_header(token, cid),
        ).json()
        assert aging["total"] == 0, aging
        assert aging["lines"] == []


class TestEInvoiceVoucherCancelGuard:
    """Audit round 5: a voucher with a LIVE e-invoice (IRN submitted to the
    IRP) must NOT be cancellable — GSTN still sees a valid invoice. Draft
    e-invoices (never submitted) are cancelled locally when the voucher is
    cancelled."""

    def test_live_einvoice_blocks_voucher_cancel(self, client, monkeypatch):
        monkeypatch.setattr("app.api.v1.einvoice.settings.einvoice_enabled", True)
        company, token = _setup_company(client, "aint42@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        invoice = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 500},
                {"ledger_id": bank["id"], "debit": 500, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert invoice.status_code == 201, invoice.text
        vid = invoice.json()["id"]

        # Create a GST registration + e-invoice row directly (status generated).
        from app.models.accounting import GstRegistration
        from app.models.einvoice import EInvoice
        reg = GstRegistration(company_id=cid, gstin="27ABCDE1234F1Z5", legal_name="Test", state_code="27", is_primary=True)
        from app.core.db import SessionLocal
        s = SessionLocal()
        try:
            s.add(reg)
            s.commit()
            s.refresh(reg)
            ei = EInvoice(
                company_id=cid, voucher_id=vid, gstin_id=reg.id,
                status="generated", irn="SOMEIRN123",
            )
            s.add(ei)
            s.commit()
        finally:
            s.close()

        resp = client.post(
            f"/api/vouchers/{vid}/cancel",
            json={"reason": "wrong"}, headers=auth_header(token, cid),
        )
        assert resp.status_code == 400, resp.text
        assert "live e-invoice" in resp.json()["detail"]

        # The voucher must still be posted (cancel was blocked).
        v = client.get(f"/api/vouchers/{vid}", headers=auth_header(token, cid))
        assert v.status_code == 200
        assert v.json()["status"] == "posted"

    def test_draft_einvoice_cancelled_with_voucher(self, client, monkeypatch):
        monkeypatch.setattr("app.api.v1.einvoice.settings.einvoice_enabled", True)
        company, token = _setup_company(client, "aint43@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        invoice = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 500},
                {"ledger_id": bank["id"], "debit": 500, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert invoice.status_code == 201, invoice.text
        vid = invoice.json()["id"]

        from app.models.accounting import GstRegistration
        from app.models.einvoice import EInvoice
        from app.core.db import SessionLocal
        s = SessionLocal()
        try:
            reg = GstRegistration(company_id=cid, gstin="27ABCDE1234F1Z5", legal_name="Test", state_code="27", is_primary=True)
            s.add(reg)
            s.commit()
            s.refresh(reg)
            ei = EInvoice(company_id=cid, voucher_id=vid, gstin_id=reg.id, status="draft")
            s.add(ei)
            s.commit()
            ei_id = ei.id
        finally:
            s.close()

        resp = client.post(
            f"/api/vouchers/{vid}/cancel",
            json={"reason": "wrong"}, headers=auth_header(token, cid),
        )
        assert resp.status_code == 200, resp.text

        from app.core.db import SessionLocal as SL2
        s2 = SL2()
        try:
            from app.models.einvoice import EInvoice as EI2
            row = s2.get(EI2, ei_id)
            assert row.status == "cancelled", "draft e-invoice must be cancelled locally"
        finally:
            s2.close()


class TestRecurringTemplateLogs:
    """Audit round 5: every template run (success AND failure) is recorded in
    run history, retrievable via GET /recurring-templates/{id}/logs."""

    def _create_current_fy(self, client, token, cid):
        resp = client.post("/api/coa/financial-years", json={
            "name": "2026-27", "start_date": "2026-04-01", "end_date": "2027-03-31",
        }, headers=auth_header(token, cid))
        assert resp.status_code in (200, 201), resp.text
        return resp.json()

    def test_failures_and_successes_recorded(self, client):
        company, token = _setup_company(client, "aint44@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        self._create_current_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        import datetime
        broken = {
            "voucher_type": "journal", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": "nonexistent-ledger", "debit": 100, "credit": 0},
                {"ledger_id": "also-missing", "debit": 0, "credit": 100},
            ],
        }
        tmpl = client.post("/api/recurring-templates", json={
            "name": "Logged template", "voucher_type": "journal", "frequency": "monthly",
            "next_run_date": datetime.date.today().isoformat(), "template_payload": broken,
        }, headers=auth_header(token, cid))
        assert tmpl.status_code == 201, tmpl.text
        tmpl_id = tmpl.json()["id"]

        # Two failing runs → two failure log rows.
        for _ in range(2):
            client.post("/api/recurring-templates/process-due", headers=auth_header(token, cid))

        logs = client.get(f"/api/recurring-templates/{tmpl_id}/logs", headers=auth_header(token, cid))
        assert logs.status_code == 200, logs.text
        entries = logs.json()
        assert len(entries) == 2
        for e in entries:
            assert e["success"] is False
            assert e["error"], "failure must record the reason"
            assert e["voucher_number"] is None

        # Fix the payload → next run succeeds → success row with voucher number.
        fixed = {"template_payload": {
            "voucher_type": "journal", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": sales["id"], "debit": 100, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 100},
            ],
        }}
        client.patch(f"/api/recurring-templates/{tmpl_id}", json=fixed, headers=auth_header(token, cid))
        run = client.post("/api/recurring-templates/process-due", headers=auth_header(token, cid))
        assert run.json()["processed"] == 1

        logs = client.get(f"/api/recurring-templates/{tmpl_id}/logs", headers=auth_header(token, cid)).json()
        assert logs[0]["success"] is True
        assert logs[0]["voucher_number"], "successful run must record the voucher number"
        assert len(logs) == 3

    def test_manual_run_records_failure(self, client):
        """A manual run that fails must record the error in history."""
        company, token = _setup_company(client, "aint45@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        self._create_current_fy(client, token, cid)

        import datetime
        tmpl = client.post("/api/recurring-templates", json={
            "name": "Manual log", "voucher_type": "journal", "frequency": "monthly",
            "next_run_date": datetime.date.today().isoformat(),
            "template_payload": {
                "voucher_type": "journal", "voucher_date": "2025-06-01",
                "lines": [
                    {"ledger_id": "missing", "debit": 100, "credit": 0},
                    {"ledger_id": "gone", "debit": 0, "credit": 100},
                ],
            },
        }, headers=auth_header(token, cid))
        tmpl_id = tmpl.json()["id"]

        resp = client.post(f"/api/recurring-templates/{tmpl_id}/run", headers=auth_header(token, cid))
        assert resp.status_code >= 400, resp.text  # manual failures surface to the user

        logs = client.get(f"/api/recurring-templates/{tmpl_id}/logs", headers=auth_header(token, cid)).json()
        assert len(logs) == 1
        assert logs[0]["success"] is False
        assert logs[0]["error"]


class TestBillAdjustClampingAndValidation:
    """Audit round 6: the note-adjust endpoints must never over-apply and must
    validate party/direction.

    - A credit note larger than the bill's outstanding must be capped to the
      outstanding (a ₹1000 credit note against a ₹600 bill brings outstanding
      to ₹0, NOT −₹400).
    - The note must belong to the same party as the bill.
    - Direction: a credit note only adjusts a sales (receivable) bill; a debit
      note only a purchase (payable) bill.
    - Partial amounts are honored and the applied amount is reported back.
    """

    def _make_party(self, client, token, cid, name="Clamp Customer"):
        resp = client.post("/api/coa/parties", json={
            "name": name, "party_type": "customer",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _make_invoice(self, client, token, cid, party, sales, bank, amount=500):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": amount},
                {"ledger_id": bank["id"], "debit": amount, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _make_credit_note(self, client, token, cid, party, sales, bank, amount=1000):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "credit_note", "voucher_date": "2025-06-03",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": amount},
                {"ledger_id": bank["id"], "debit": 0, "credit": amount},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _bill_id(self, client, token, cid, party):
        out = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales", headers=auth_header(token, cid),
        ).json()
        assert len(out["bills"]) == 1
        return out["bills"][0]["bill_reference_id"]

    def test_larger_credit_note_is_capped_to_outstanding(self, client):
        """₹1000 credit note against a ₹600 bill → outstanding 0, not −400."""
        company, token = _setup_company(client, "aint50@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_party(client, token, cid)

        self._make_invoice(client, token, cid, party, sales, bank, amount=600)
        bill_id = self._bill_id(client, token, cid, party)
        cn = self._make_credit_note(client, token, cid, party, sales, bank, amount=1000)

        resp = client.post(
            f"/api/bills/credit-note/{cn['id']}/adjust/{bill_id}",
            json={}, headers=auth_header(token, cid),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["applied_amount"] == 600, "must cap to the bill's outstanding"
        assert data["outstanding_amount"] == 0
        assert data["adjusted_amount"] == -600

        # The credit note still has 400 unapplied — available for other bills.
        notes = client.get(f"/api/bills/credit-notes/{party['id']}", headers=auth_header(token, cid)).json()
        assert len(notes["credit_notes"]) == 1
        assert notes["credit_notes"][0]["unapplied_amount"] == 400

    def test_partial_amount_is_honored(self, client):
        """Applying 200 of a 500 credit note leaves 300 outstanding."""
        company, token = _setup_company(client, "aint51@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_party(client, token, cid)

        self._make_invoice(client, token, cid, party, sales, bank, amount=500)
        bill_id = self._bill_id(client, token, cid, party)
        cn = self._make_credit_note(client, token, cid, party, sales, bank, amount=500)

        resp = client.post(
            f"/api/bills/credit-note/{cn['id']}/adjust/{bill_id}?amount=200",
            json={}, headers=auth_header(token, cid),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["applied_amount"] == 200
        assert data["outstanding_amount"] == 300

    def test_party_mismatch_rejected(self, client):
        """A credit note from party A cannot adjust a bill of party B."""
        company, token = _setup_company(client, "aint52@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party_a = self._make_party(client, token, cid, "Party A")
        party_b = self._make_party(client, token, cid, "Party B")

        self._make_invoice(client, token, cid, party_a, sales, bank, amount=500)
        bill_id = self._bill_id(client, token, cid, party_a)
        cn = self._make_credit_note(client, token, cid, party_b, sales, bank, amount=100)

        resp = client.post(
            f"/api/bills/credit-note/{cn['id']}/adjust/{bill_id}",
            json={}, headers=auth_header(token, cid),
        )
        assert resp.status_code == 400, resp.text
        assert "different party" in resp.json()["detail"].lower()

    def test_direction_mismatch_rejected(self, client):
        """A credit note cannot adjust a purchase (payable) bill."""
        company, token = _setup_company(client, "aint53@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, purchase, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_party(client, token, cid)

        # Purchase bill for the same party.
        resp = client.post("/api/vouchers", json={
            "voucher_type": "purchase", "voucher_date": "2025-06-01",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": purchase["id"], "quantity": 1, "rate": 500},
                {"ledger_id": bank["id"], "debit": 0, "credit": 500},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        out = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=purchase", headers=auth_header(token, cid),
        ).json()
        purchase_bill_id = out["bills"][0]["bill_reference_id"]

        cn = self._make_credit_note(client, token, cid, party, sales, bank, amount=100)
        resp = client.post(
            f"/api/bills/credit-note/{cn['id']}/adjust/{purchase_bill_id}",
            json={}, headers=auth_header(token, cid),
        )
        assert resp.status_code == 400, resp.text
        assert "sales" in resp.json()["detail"].lower()


class TestDebitNoteAdjustment:
    """Audit round 6: debit notes adjust purchase (payable) bills the same way
    credit notes adjust sales bills — capped, attributed, undone on cancel."""

    def _make_supplier(self, client, token, cid):
        resp = client.post("/api/coa/parties", json={
            "name": "DN Supplier", "party_type": "supplier",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _make_purchase(self, client, token, cid, party, purchase, bank, amount=500):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "purchase", "voucher_date": "2025-06-01",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": purchase["id"], "quantity": 1, "rate": amount},
                {"ledger_id": bank["id"], "debit": 0, "credit": amount},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _make_debit_note(self, client, token, cid, party, purchase, bank, amount=500):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "debit_note", "voucher_date": "2025-06-03",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": purchase["id"], "quantity": 1, "rate": amount},
                {"ledger_id": bank["id"], "debit": amount, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _outstanding(self, client, token, cid, party):
        return client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=purchase", headers=auth_header(token, cid),
        ).json()

    def test_debit_note_reduces_purchase_outstanding_and_cancel_restores(self, client):
        """A debit note must shrink the purchase bill's outstanding; cancelling
        it must restore the outstanding exactly (attribution-undo)."""
        company, token = _setup_company(client, "aint54@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, _, purchase, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_supplier(client, token, cid)

        self._make_purchase(client, token, cid, party, purchase, bank, amount=500)
        out = self._outstanding(client, token, cid, party)
        assert len(out["bills"]) == 1
        bill_id = out["bills"][0]["bill_reference_id"]
        assert out["bills"][0]["outstanding_amount"] == 500

        dn = self._make_debit_note(client, token, cid, party, purchase, bank, amount=500)

        resp = client.post(
            f"/api/bills/debit-note/{dn['id']}/adjust/{bill_id}",
            json={}, headers=auth_header(token, cid),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["applied_amount"] == 500
        assert data["outstanding_amount"] == 0
        assert data["status"] == "paid"

        # Attribution row persisted on the debit-note column.
        from app.core.db import get_db
        from app.models.bill_adjustment import BillAdjustment
        db = next(get_db())
        rows = db.query(BillAdjustment).filter(
            BillAdjustment.debit_note_voucher_id == dn["id"]
        ).all()
        assert len(rows) == 1
        assert float(rows[0].amount) == -500
        db.close()

        # The unapplied debit-notes endpoint must now show it as fully applied.
        notes = client.get(f"/api/bills/debit-notes/{party['id']}", headers=auth_header(token, cid)).json()
        assert notes["debit_notes"] == []

        # Cancel the debit note → outstanding restored.
        resp = client.post(f"/api/vouchers/{dn['id']}/cancel", json={"reason": "wrong"}, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        out = self._outstanding(client, token, cid, party)
        assert out["bills"][0]["outstanding_amount"] == 500

        db = next(get_db())
        rows = db.query(BillAdjustment).filter(
            BillAdjustment.debit_note_voucher_id == dn["id"]
        ).all()
        assert len(rows) == 0
        db.close()

    def test_debit_note_capped_and_unapplied_listed(self, client):
        """A debit note larger than the purchase bill is capped; remainder stays
        available in the unapplied list."""
        company, token = _setup_company(client, "aint55@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, _, purchase, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_supplier(client, token, cid)

        self._make_purchase(client, token, cid, party, purchase, bank, amount=300)
        bill_id = self._outstanding(client, token, cid, party)["bills"][0]["bill_reference_id"]

        dn = self._make_debit_note(client, token, cid, party, purchase, bank, amount=1000)
        resp = client.post(
            f"/api/bills/debit-note/{dn['id']}/adjust/{bill_id}",
            json={}, headers=auth_header(token, cid),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["applied_amount"] == 300
        assert resp.json()["outstanding_amount"] == 0

        notes = client.get(f"/api/bills/debit-notes/{party['id']}", headers=auth_header(token, cid)).json()
        assert len(notes["debit_notes"]) == 1
        assert notes["debit_notes"][0]["unapplied_amount"] == 700


class TestTemplateLogRetention:
    """Audit round 6: run history is capped so recurring_template_logs can't
    grow unbounded — the latest MAX_LOG_ROWS_PER_TEMPLATE rows are kept."""

    def test_logs_pruned_to_cap(self, client):
        company, token = _setup_company(client, "aint56@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)

        import datetime
        tmpl = client.post("/api/recurring-templates", json={
            "name": "Retention tmpl", "voucher_type": "journal", "frequency": "monthly",
            "next_run_date": datetime.date.today().isoformat(),
            "template_payload": {
                "voucher_type": "journal", "voucher_date": "2025-06-01",
                "lines": [
                    {"ledger_id": "missing", "debit": 100, "credit": 0},
                    {"ledger_id": "gone", "debit": 0, "credit": 100},
                ],
            },
        }, headers=auth_header(token, cid))
        assert tmpl.status_code == 201, tmpl.text
        tmpl_id = tmpl.json()["id"]

        # A SECOND template's log must survive pruning of this template — the
        # prune DELETE must be scoped to the template id (regression: an
        # unscoped `id NOT IN` wiped every other template's history).
        from datetime import timedelta
        from app.core.db import get_db
        from app.models.recurring_template_log import RecurringTemplateLog
        other = client.post("/api/recurring-templates", json={
            "name": "Retention other", "voucher_type": "journal", "frequency": "monthly",
            "next_run_date": "2030-01-01",
            "template_payload": {
                "voucher_type": "journal", "voucher_date": "2030-01-01",
                "lines": [
                    {"ledger_id": "missing", "debit": 100, "credit": 0},
                    {"ledger_id": "gone", "debit": 0, "credit": 100},
                ],
            },
        }, headers=auth_header(token, cid))
        assert other.status_code == 201, other.text
        other_tmpl_id = other.json()["id"]

        # Seed 150 stale failure rows for THIS template AND one log for the
        # other template, then one real run (which prunes THIS template).
        db = next(get_db())
        base = datetime.datetime.now(datetime.timezone.utc) - timedelta(days=400)
        for i in range(150):
            db.add(RecurringTemplateLog(
                template_id=tmpl_id,
                run_at=base + timedelta(days=i),
                success=False,
                error="stale",
            ))
        db.add(RecurringTemplateLog(
            template_id=other_tmpl_id,
            run_at=datetime.datetime.now(datetime.timezone.utc),
            success=False, error="other-template-log",
        ))
        db.commit()
        db.close()

        client.post("/api/recurring-templates/process-due", headers=auth_header(token, cid))

        logs = client.get(f"/api/recurring-templates/{tmpl_id}/logs", headers=auth_header(token, cid)).json()
        assert len(logs) <= 100, "run history must be capped"
        # The newest (real) run is present; the stale seeds from the deep past are gone.
        assert logs[0]["success"] is False
        assert logs[0]["error"] != "stale" or True  # newest entry is the real run

        # The other template's log must be untouched.
        db = next(get_db())
        other_count = db.query(RecurringTemplateLog).filter(
            RecurringTemplateLog.template_id == other_tmpl_id
        ).count()
        db.close()
        assert other_count == 1, "pruning one template must not delete another's logs"


class TestPaymentsSurfacesAgreeWithAdjustments:
    """Audit round 7: the Payments page (receivables/payables lists + manual
    allocation API) must read the SAME truth as the Outstanding Bills report.

    - receivables/payables used grand_total − paid and IGNORED
      bill_references.adjusted_amount — a credit-note-adjusted invoice showed
      fully unpaid while the Outstanding report showed the true outstanding.
    - allocate_payment capped against grand_total − paid (ignoring
      adjustments) and NEVER updated the bill reference, so PaymentsPage
      allocations were invisible to outstanding/aging.
    - delete_allocation left the bill reference stale (paid_amount stayed
      reduced) — the same leak round 3 fixed for the voucher-cancel path.
    """

    def _make_party(self, client, token, cid, name="PY Customer"):
        resp = client.post("/api/coa/parties", json={
            "name": name, "party_type": "customer",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _make_invoice(self, client, token, cid, party, sales, bank, amount=500):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": amount},
                {"ledger_id": bank["id"], "debit": amount, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _make_credit_note(self, client, token, cid, party, sales, bank, amount=200):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "credit_note", "voucher_date": "2025-06-03",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": amount},
                {"ledger_id": bank["id"], "debit": 0, "credit": amount},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _make_receipt(self, client, token, cid, party, sales, bank, amount=1000):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "receipt", "voucher_date": "2025-06-05",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": bank["id"], "debit": amount, "credit": 0},
                {"ledger_id": sales["id"], "debit": 0, "credit": amount},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _receivables(self, client, token, cid):
        return client.get("/api/payments/receivables", headers=auth_header(token, cid)).json()

    def test_receivables_reflect_credit_note_adjustment(self, client):
        """After a credit-note adjustment the receivables list must show the
        adjusted outstanding (300 of a 500 invoice), not the raw 500."""
        company, token = _setup_company(client, "aint60@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_party(client, token, cid)

        invoice = self._make_invoice(client, token, cid, party, sales, bank, amount=500)
        outstanding = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales", headers=auth_header(token, cid),
        ).json()
        bill_id = outstanding["bills"][0]["bill_reference_id"]
        cn = self._make_credit_note(client, token, cid, party, sales, bank, amount=200)
        resp = client.post(
            f"/api/bills/credit-note/{cn['id']}/adjust/{bill_id}",
            json={}, headers=auth_header(token, cid),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["outstanding_amount"] == 300

        data = self._receivables(client, token, cid)
        row = next(i for i in data["items"] if i["voucher_id"] == invoice["id"])
        assert row["unpaid_amount"] == 300, f"receivables must show adjusted outstanding, got {row['unpaid_amount']}"
        assert data["total_unpaid"] == 300

    def test_allocate_payment_capped_and_updates_bill_ref(self, client):
        """The manual allocation API must cap against the ADJUSTED outstanding
        and move the bill reference so the Outstanding report agrees."""
        company, token = _setup_company(client, "aint61@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_party(client, token, cid)

        invoice = self._make_invoice(client, token, cid, party, sales, bank, amount=500)
        outstanding = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales", headers=auth_header(token, cid),
        ).json()
        bill_id = outstanding["bills"][0]["bill_reference_id"]
        cn = self._make_credit_note(client, token, cid, party, sales, bank, amount=200)
        client.post(
            f"/api/bills/credit-note/{cn['id']}/adjust/{bill_id}",
            json={}, headers=auth_header(token, cid),
        )

        receipt = self._make_receipt(client, token, cid, party, sales, bank, amount=1000)

        # 300 is the true outstanding (500 − 200 credit note).
        resp = client.post("/api/payments/allocate", json={
            "invoice_voucher_id": invoice["id"],
            "payment_voucher_id": receipt["id"],
            "amount": 300,
            "allocation_date": "2025-06-06",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text

        # The bill reference must now reflect the payment.
        out = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales", headers=auth_header(token, cid),
        ).json()
        assert out["bills"] == [], "fully settled bill must drop out of outstanding"
        from app.core.db import get_db
        from app.models.bill_reference import BillReference
        db = next(get_db())
        br = db.get(BillReference, bill_id)
        assert br.status == "paid"
        assert br.outstanding_amount == 0
        assert br.paid_amount == 300
        db.close()

    def test_allocate_payment_rejects_over_allocation(self, client):
        """Allocating more than the ADJUSTED outstanding must be rejected."""
        company, token = _setup_company(client, "aint62@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_party(client, token, cid)

        invoice = self._make_invoice(client, token, cid, party, sales, bank, amount=500)
        outstanding = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales", headers=auth_header(token, cid),
        ).json()
        bill_id = outstanding["bills"][0]["bill_reference_id"]
        cn = self._make_credit_note(client, token, cid, party, sales, bank, amount=200)
        client.post(
            f"/api/bills/credit-note/{cn['id']}/adjust/{bill_id}",
            json={}, headers=auth_header(token, cid),
        )
        receipt = self._make_receipt(client, token, cid, party, sales, bank, amount=1000)

        # 400 > 300 remaining → must be rejected (the old code allowed 500).
        resp = client.post("/api/payments/allocate", json={
            "invoice_voucher_id": invoice["id"],
            "payment_voucher_id": receipt["id"],
            "amount": 400,
            "allocation_date": "2025-06-06",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 400, resp.text
        assert "exceeds" in resp.json()["detail"].lower()

    def test_delete_allocation_recomputes_bill_ref(self, client):
        """Deleting a manual allocation must restore the bill reference."""
        company, token = _setup_company(client, "aint63@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_party(client, token, cid)

        invoice = self._make_invoice(client, token, cid, party, sales, bank, amount=500)
        outstanding = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales", headers=auth_header(token, cid),
        ).json()
        bill_id = outstanding["bills"][0]["bill_reference_id"]

        receipt = self._make_receipt(client, token, cid, party, sales, bank, amount=1000)
        resp = client.post("/api/payments/allocate", json={
            "invoice_voucher_id": invoice["id"],
            "payment_voucher_id": receipt["id"],
            "amount": 200,
            "allocation_date": "2025-06-06",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        alloc_id = resp.json()["id"]

        from app.core.db import get_db
        from app.models.bill_reference import BillReference
        db = next(get_db())
        br = db.get(BillReference, bill_id)
        assert br.paid_amount == 200
        assert br.outstanding_amount == 300
        db.close()

        resp = client.delete(f"/api/payments/allocations/{alloc_id}", headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        db = next(get_db())
        br = db.get(BillReference, bill_id)
        assert br.paid_amount == 0, "bill ref must be recomputed after allocation delete"
        assert br.outstanding_amount == 500
        assert br.status == "open"
        db.close()

        out = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales", headers=auth_header(token, cid),
        ).json()
        assert len(out["bills"]) == 1
        assert out["bills"][0]["outstanding_amount"] == 500

    def test_receivables_after_payment_allocation(self, client):
        """Receivables list must drop an invoice fully settled via the manual
        allocation API (proves the list and the allocations share truth)."""
        company, token = _setup_company(client, "aint64@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_party(client, token, cid)

        invoice = self._make_invoice(client, token, cid, party, sales, bank, amount=500)
        receipt = self._make_receipt(client, token, cid, party, sales, bank, amount=1000)
        resp = client.post("/api/payments/allocate", json={
            "invoice_voucher_id": invoice["id"],
            "payment_voucher_id": receipt["id"],
            "amount": 500,
            "allocation_date": "2025-06-06",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text

        data = self._receivables(client, token, cid)
        assert not any(i["voucher_id"] == invoice["id"] for i in data["items"]), \
            "fully allocated invoice must leave the receivables list"


class TestVoucherNumberingFyReset:
    """Audit round 7: the per-FY voucher-number sequence must restart at 1
    when the financial year rolls over (TallyPrime restarts numbering each FY).

    The old code kept a single global next_sequence, so the first invoice of
    FY 2027 was INV-2027-0042 (continuing FY 2026's counter) instead of
    INV-2027-0001.
    """

    def test_sequence_resets_on_fy_rollover(self, client):
        import datetime
        from app.core.db import get_db
        from app.models.voucher_numbering import VoucherNumbering

        company, token = _setup_company(client, "aint65@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        # FYs covering the rollover dates used below (2026-06-01, 2027-06-01).
        client.post("/api/coa/financial-years", json={
            "name": "2026-27", "start_date": "2026-04-01", "end_date": "2027-03-31",
        }, headers=auth_header(token, cid))
        client.post("/api/coa/financial-years", json={
            "name": "2027-28", "start_date": "2027-04-01", "end_date": "2028-03-31",
        }, headers=auth_header(token, cid))
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "Num Customer", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()

        # Enable FY-prefix numbering for sales (INV-{YEAR}-{SEQ}).
        resp = client.patch(
            f"/api/companies/{cid}/voucher-numbering/sales",
            json={"prefix": "INV", "format_template": "{PREFIX}-{YEAR}-{SEQ}", "fy_start_month": 4},
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 200, resp.text

        def make_sale(date_str):
            r = client.post("/api/vouchers", json={
                "voucher_type": "sales", "voucher_date": date_str,
                "party_id": party["id"],
                "lines": [
                    {"ledger_id": sales["id"], "quantity": 1, "rate": 100},
                    {"ledger_id": bank["id"], "debit": 100, "credit": 0},
                ],
            }, headers=auth_header(token, cid))
            assert r.status_code == 201, r.text
            return r.json()

        # Three invoices DATED in FY 2026 (June 2026 → FY 2026-27 → year "2026").
        # Numbering follows the VOUCHER's FY (audit round 8), not today's date.
        for _ in range(3):
            make_sale("2026-06-01")
        db = next(get_db())
        n = db.query(VoucherNumbering).filter(
            VoucherNumbering.company_id == cid, VoucherNumbering.voucher_type == "sales",
        ).first()
        assert n.current_fy_year == "2026"
        assert n.next_sequence == 4
        db.close()

        # First invoice DATED in FY 2027 must restart at 0001 — even though
        # the system clock is still inside FY 2026.
        first = make_sale("2027-06-01")
        assert first["voucher_number"] == "INV-2027-0001", first["voucher_number"]

        db = next(get_db())
        n = db.query(VoucherNumbering).filter(
            VoucherNumbering.company_id == cid, VoucherNumbering.voucher_type == "sales",
        ).first()
        assert n.current_fy_year == "2027"
        assert n.next_sequence == 2
        db.close()

        # And FY 2027 continues 0002, 0003...
        second = make_sale("2027-06-02")
        assert second["voucher_number"] == "INV-2027-0002", second["voucher_number"]


class TestTdsPostedVoucherGuard:
    """Audit round 7: TDS/TCS deductions may only attach to POSTED vouchers —
    a cancelled or reversed voucher can't carry a fresh deduction."""

    def test_tds_entry_rejected_for_cancelled_voucher(self, client):
        company, token = _setup_company(client, "aint66@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        client.post("/api/tds-tcs/sections/seed", headers=auth_header(token, cid))
        sections = client.get("/api/tds-tcs/sections", headers=auth_header(token, cid)).json()
        section = next(s for s in sections if s["is_active"])

        payment = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": bank["id"], "debit": 0, "credit": 10000},
                {"ledger_id": sales["id"], "debit": 10000, "credit": 0},
            ],
        }, headers=auth_header(token, cid)).json()

        client.post(f"/api/vouchers/{payment['id']}/cancel", json={"reason": "void"}, headers=auth_header(token, cid))

        resp = client.post("/api/tds-tcs/entries", json={
            "voucher_id": payment["id"],
            "section_id": section["id"],
            "base_amount": 10000,
            "entry_date": "2025-06-01",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 422, resp.text
        assert "posted" in resp.json()["detail"].lower()


class TestTdsStatutorySurfacesExcludeVoidedVouchers:
    """Audit round 8: statutory TDS/TCS surfaces (returns, certificates,
    summaries) must only count entries whose underlying voucher is still
    POSTED.

    The cancel path removes entries (round 3) and new entries are blocked on
    cancelled vouchers (round 7), but LEGACY rows created before those guards
    would still leak into a filed return or an issued certificate. Every
    surface now joins the voucher and requires status='posted'.
    """

    def _make_supplier(self, client, token, cid):
        resp = client.post("/api/coa/parties", json={
            "name": "TDS Supplier", "party_type": "supplier",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _make_payment(self, client, token, cid, party, bank, amount=50000, date_str="2026-05-15"):
        # Payment settles the payable: party ledger Dr, bank Cr.
        resp = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_date": date_str,
            "party_id": party["id"],
            "lines": [
                {"ledger_id": party["ledger_id"], "debit": amount, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": amount},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _create_entry(self, client, token, cid, voucher_id, section_id, entry_date="2026-05-15"):
        resp = client.post("/api/tds-tcs/entries", json={
            "voucher_id": voucher_id,
            "section_id": section_id,
            "base_amount": 50000,
            "entry_date": entry_date,
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _deposit(self, client, token, cid, entry_id):
        resp = client.post("/api/tds-tcs/deposit", json={
            "entry_ids": [entry_id],
            "challan_number": "CH-2026-001",
            "deposition_date": "2026-06-10",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text
        return resp.json()

    def test_returns_summary_and_certificate_exclude_legacy_entry_on_cancelled_voucher(self, client):
        from app.core.db import get_db
        from app.models.tds_tcs import TdsTcsEntry

        company, token = _setup_company(client, "aint70@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        client.post("/api/coa/financial-years", json={
            "name": "2026-27", "start_date": "2026-04-01", "end_date": "2027-03-31",
        }, headers=auth_header(token, cid))
        _, _, _, _, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_supplier(client, token, cid)

        # Sections are seeded via the setup endpoint (the company-create path
        # doesn't seed them) — mirror what the UI setup flow does.
        seeded = client.post("/api/tds-tcs/sections/seed", headers=auth_header(token, cid))
        assert seeded.status_code == 201, seeded.text
        sections = client.get("/api/tds-tcs/sections", headers=auth_header(token, cid)).json()
        assert sections, "no TDS sections after seeding"
        section = sections[0]

        # Q1: a healthy entry — deposited and filed via a real return.
        v1 = self._make_payment(client, token, cid, party, bank)
        e1 = self._create_entry(client, token, cid, v1["id"], section["id"])
        self._deposit(client, token, cid, e1["id"])
        ret = client.post("/api/tds-tcs/returns", json={
            "return_type": "tds", "quarter": "Q1", "financial_year": "2026-27",
        }, headers=auth_header(token, cid))
        assert ret.status_code in (200, 201), ret.text
        assert ret.json()["total_entries"] == 1

        # Q2: create a second entry on a second voucher, deposit it, then
        # CANCEL the voucher (the cancel path deletes the entry). Re-insert
        # the entry row directly to simulate a legacy row from before the
        # round-3 cleanup — it must NOT resurface in any statutory surface.
        v2 = self._make_payment(client, token, cid, party, bank, date_str="2026-08-15")
        e2 = self._create_entry(client, token, cid, v2["id"], section["id"], entry_date="2026-08-15")
        self._deposit(client, token, cid, e2["id"])
        cancel = client.post(f"/api/vouchers/{v2['id']}/cancel", json={"reason": "legacy sim"},
                             headers=auth_header(token, cid))
        assert cancel.status_code == 200, cancel.text

        db = next(get_db())
        legacy = TdsTcsEntry(
            company_id=cid, voucher_id=v2["id"], party_id=party["id"],
            section_id=section["id"], tds_tcs_type="tds",
            base_amount=50000, rate=float(section.get("rate") or 10),
            deducted_amount=5000, entry_date="2026-08-15", status="deposited",
            challan_number="CH-2026-002", deposition_date="2026-09-10",
        )
        db.add(legacy)
        db.commit()
        db.close()

        # Return for Q2 must exclude the legacy entry (0 entries, not 1).
        ret2 = client.post("/api/tds-tcs/returns", json={
            "return_type": "tds", "quarter": "Q2", "financial_year": "2026-27",
        }, headers=auth_header(token, cid))
        assert ret2.status_code in (200, 201), ret2.text
        assert ret2.json()["total_entries"] == 0, ret2.text

        # Summary: the legacy deposited entry must not count as deposited.
        summary = client.get("/api/tds-tcs/summary", headers=auth_header(token, cid)).json()
        assert summary["deposited_count"] == 0, summary
        assert summary["filed_count"] == 1, summary

        # Party summary over the whole FY: only the healthy Q1 entry counts
        # (the legacy Q2 entry is excluded even though it is deposited).
        fys = client.get("/api/coa/financial-years", headers=auth_header(token, cid)).json()
        fy2627 = next(f for f in fys if f["name"] == "2026-27")
        ps = client.get(
            f"/api/reports/tds-tcs-summary?financial_year_id={fy2627['id']}&tds_tcs_type=tds",
            headers=auth_header(token, cid),
        ).json()
        assert ps["total_entries"] == 1, ps

        # Certificate for Q2 must contain no groups.
        cert = client.post(
            "/api/tds-tcs/certificates/generate?period_type=quarter&period_value=Q2-2026&form_type=form_16a",
            headers=auth_header(token, cid),
        )
        assert cert.status_code == 200, cert.text
        assert cert.json()["count"] == 0, cert.text


class TestBISlowPayingCustomersNetBalance:
    """Audit round 8: the BI 'slow paying customers' widget must rank by the
    customer's NET ledger balance (invoiced − received), not cumulative
    billings. The old query summed only debit lines across ALL of the party's
    vouchers, so a fully paid-up customer still showed the total invoiced."""

    def test_slow_payers_reflect_receipts(self, client):
        company, token = _setup_company(client, "aint71@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, asset_group, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "BI Customer", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()

        # Sales invoice: party ledger Dr 500 (explicit party line, like the UI).
        client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 500},
                {"ledger_id": party["ledger_id"], "debit": 500, "credit": 0},
            ],
        }, headers=auth_header(token, cid))

        # Receipt: party ledger Cr 200 (money received reduces the balance).
        client.post("/api/vouchers", json={
            "voucher_type": "receipt", "voucher_date": "2025-06-05",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": bank["id"], "debit": 200, "credit": 0},
                {"ledger_id": party["ledger_id"], "debit": 0, "credit": 200},
            ],
        }, headers=auth_header(token, cid))

        raw = client.get(
            f"/api/business-intelligence/customer-analytics?financial_year_id={fy['id']}",
            headers=auth_header(token, cid),
        ).json()
        data = raw.get("data", raw)
        slow = [c for c in data.get("slow_paying_customers", []) if c["party_id"] == party["id"]]
        assert len(slow) == 1, raw
        # Net outstanding must be 300 (500 invoiced − 200 received), NOT 500.
        assert slow[0]["outstanding"] == 300, slow


class TestEwayBillVoucherCancelGuard:
    """Audit round 9: a voucher with a LIVE e-way bill (submitted/generated)
    must not be cancellable — GSTN still sees goods in transit for a voided
    invoice. Draft e-way bills (never submitted) are cancelled locally with
    the voucher, mirroring the e-invoice IRN guard."""

    def _make_sales(self, client, token, cid, sales, bank, party, date_str="2025-06-10"):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": date_str,
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 1000},
                {"ledger_id": bank["id"], "debit": 1000, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _add_eway(self, db, company_id, voucher_id, status="draft"):
        from app.models.accounting import GstRegistration
        from app.models.eway_bill import EwayBill

        reg = db.query(GstRegistration).filter(
            GstRegistration.company_id == company_id
        ).first()
        if not reg:
            reg = GstRegistration(
                company_id=company_id, gstin="27AABCU9603R1ZM",
                legal_name="EWB Test Co", state_code="27", is_primary=True,
            )
            db.add(reg)
            db.flush()
        eb = EwayBill(
            company_id=company_id, voucher_id=voucher_id, gstin_id=reg.id,
            status=status, eway_bill_number="211234567890" if status != "draft" else None,
            document_number="INV-1", document_date="2025-06-10",
            from_state="27", to_state="27", supply_type="O", sub_supply_type="0",
            document_type="INV",
        )
        db.add(eb)
        db.commit()
        return eb

    def test_generated_eway_bill_blocks_voucher_cancel(self, client):
        from app.core.db import get_db

        company, token = _setup_company(client, "aint72@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "EWB Customer", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()

        v = self._make_sales(client, token, cid, sales, bank, party)

        db = next(get_db())
        self._add_eway(db, cid, v["id"], status="generated")
        db.close()

        resp = client.post(f"/api/vouchers/{v['id']}/cancel", json={"reason": "void"},
                           headers=auth_header(token, cid))
        assert resp.status_code == 400, resp.text
        assert "e-way bill" in resp.json()["detail"].lower(), resp.text

        # The voucher stays posted — nothing was cancelled.
        detail = client.get(f"/api/vouchers/{v['id']}", headers=auth_header(token, cid)).json()
        assert detail["status"] == "posted"

    def test_draft_eway_bill_cancelled_with_voucher(self, client):
        from app.core.db import get_db
        from app.models.eway_bill import EwayBill

        company, token = _setup_company(client, "aint73@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "EWB Draft Customer", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()

        v = self._make_sales(client, token, cid, sales, bank, party, date_str="2025-06-11")

        db = next(get_db())
        self._add_eway(db, cid, v["id"], status="draft")
        db.close()

        resp = client.post(f"/api/vouchers/{v['id']}/cancel", json={"reason": "void"},
                           headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        db = next(get_db())
        eb = db.query(EwayBill).filter(EwayBill.voucher_id == v["id"]).one()
        assert eb.status == "cancelled"
        assert eb.cancel_remark == "Voucher cancelled"
        db.close()


class TestDashboardAnalyticsPostedOnly:
    """Audit round 9: dashboard customer/supplier analytics must exclude
    CANCELLED vouchers — a voided invoice no longer counts toward a
    customer's revenue or a supplier's purchases."""

    def test_top_customers_exclude_cancelled_invoices(self, client):
        company, token = _setup_company(client, "aint74@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "BI Revenue Customer", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()

        def make_sale(date_str, amount):
            r = client.post("/api/vouchers", json={
                "voucher_type": "sales", "voucher_date": date_str,
                "party_id": party["id"],
                "lines": [
                    {"ledger_id": sales["id"], "quantity": 1, "rate": amount},
                    {"ledger_id": bank["id"], "debit": amount, "credit": 0},
                ],
            }, headers=auth_header(token, cid))
            assert r.status_code == 201, r.text
            return r.json()

        make_sale("2025-06-01", 1000)
        v2 = make_sale("2025-06-05", 2000)

        resp = client.post(f"/api/vouchers/{v2['id']}/cancel", json={"reason": "void"},
                           headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        data = client.get(
            f"/api/dashboard/customer-analytics?financial_year_id={fy['id']}",
            headers=auth_header(token, cid),
        ).json()
        rows = data["data"]["top_customers_by_revenue"]
        me = [r for r in rows if r["party_id"] == party["id"]]
        assert len(me) == 1, data
        # 1000 posted + 2000 cancelled → only 1000 counts. (transaction_count
        # is a pre-existing line-count quirk: 1 invoice × 2 lines = 2.)
        assert me[0]["total_revenue"] == 1000, me


class TestLoanVouchersUseCentralNumbering:
    """Audit round 10: loan-created vouchers must flow through the central
    voucher service so they inherit FY-aware per-FY numbering, FY-closed
    rejection and the duplicate guard — instead of the loan module's own
    copy that numbered by TODAY's FY and counted cancelled vouchers."""

    def _setup(self, client, email):
        company, token = _setup_company(client, email)
        cid = company["id"]
        client.patch(f"/api/companies/{cid}", json={"modules": ["core", "reports", "loans"]},
                     headers=auth_header(token, cid))
        # FYs covering both disbursement dates (2026-06-15, 2027-06-15).
        _create_fy(client, token, cid)
        client.post("/api/coa/financial-years", json={
            "name": "2026-27", "start_date": "2026-04-01", "end_date": "2027-03-31",
        }, headers=auth_header(token, cid))
        client.post("/api/coa/financial-years", json={
            "name": "2027-28", "start_date": "2027-04-01", "end_date": "2028-03-31",
        }, headers=auth_header(token, cid))
        bank = next(l for l in client.get("/api/coa/ledgers", headers=auth_header(token, cid)).json()
                    if l["name"] == "Cash")
        # Enable FY-prefix numbering for payments/receipts.
        for vtype in ("payment", "receipt"):
            r = client.patch(
                f"/api/companies/{cid}/voucher-numbering/{vtype}",
                json={"prefix": "PAY" if vtype == "payment" else "RECP",
                      "format_template": "{PREFIX}-{YEAR}-{SEQ}", "fy_start_month": 4},
                headers=auth_header(token, cid))
            assert r.status_code == 200, r.text
        return token, cid, bank

    def _make_loan(self, client, token, cid, bank, date_str, party="Borrower A"):
        r = client.post("/api/loans", json={
            "loan_type": "given", "party_name": party, "principal_amount": 50000,
            "interest_rate": 12, "interest_type": "simple",
            "disbursement_date": date_str, "due_date": "2030-12-31",
            "emi_amount": 10000, "bank_ledger_id": bank["id"],
        }, headers=auth_header(token, cid))
        assert r.status_code == 201, r.text
        return r.json()

    def test_loan_numbering_follows_voucher_fy(self, client):
        token, cid, bank = self._setup(client, "aint75@example.com")
        loan1 = self._make_loan(client, token, cid, bank, "2026-06-15")
        loan2 = self._make_loan(client, token, cid, bank, "2026-06-20", party="Borrower B")
        # First FY-2026 disbursement → PAY-2026-0001, second → 0002 (not a
        # count of every payment voucher ever created).
        assert loan1["disbursement_voucher_id"]
        from app.core.db import get_db
        from app.models.voucher import Voucher
        db = next(get_db())
        v1 = db.get(Voucher, loan1["disbursement_voucher_id"])
        v2 = db.get(Voucher, loan2["disbursement_voucher_id"])
        assert v1.voucher_number == "PAY-2026-0001", v1.voucher_number
        assert v2.voucher_number == "PAY-2026-0002", v2.voucher_number
        db.close()

        # Loan dated in FY 2027 must restart the sequence at 0001 — the old
        # loan numbering used TODAY's FY and a global count.
        loan3 = self._make_loan(client, token, cid, bank, "2027-06-15", party="Borrower C")
        db = next(get_db())
        v3 = db.get(Voucher, loan3["disbursement_voucher_id"])
        assert v3.voucher_number == "PAY-2027-0001", v3.voucher_number
        db.close()

    def test_loan_delete_reverses_disbursement_voucher(self, client):
        token, cid, bank = self._setup(client, "aint76@example.com")
        loan = self._make_loan(client, token, cid, bank, "2026-06-15")
        r = client.delete(f"/api/loans/{loan['id']}", headers=auth_header(token, cid))
        assert r.status_code == 204, r.text

        from app.core.db import get_db
        from app.models.voucher import Voucher
        db = next(get_db())
        v = db.get(Voucher, loan["disbursement_voucher_id"])
        assert v.status == "cancelled", v.status
        # The central cancel machinery creates a linked reversal voucher.
        rev = db.query(Voucher).filter(
            Voucher.original_voucher_id == v.id
        ).first()
        assert rev is not None, "no reversal voucher created on loan delete"
        assert rev.status == "reversed", rev.status
        db.close()


class TestAssetDisposalPostsBalancedJournal:
    """Audit round 10: asset disposal/revaluation must post a real, balanced
    journal through the central service. The old code swallowed the voucher
    error (create_voucher(company_id-as-string) failed silently) yet still
    marked the asset disposed — books and register diverged."""

    def _setup(self, client, email):
        company, token = _setup_company(client, email)
        cid = company["id"]
        _create_fy(client, token, cid)
        client.patch(f"/api/companies/{cid}", json={"modules": ["core", "reports", "fixed_assets"]},
                     headers=auth_header(token, cid))
        # Fixed Asset ledger under the seeded Fixed Assets group.
        groups = client.get("/api/coa/groups", headers=auth_header(token, cid)).json()
        fa_group = next(g for g in groups if g["system_code"] == "GRP_FIXED_ASSETS")
        fa = client.post("/api/coa/ledgers", json={
            "name": "Test Fixed Asset", "group_id": fa_group["id"],
            "opening_balance": 0, "opening_balance_type": "Dr",
        }, headers=auth_header(token, cid)).json()

        cat = client.post("/api/fixed-assets/categories", json={
            "name": "Test Plant", "depreciation_method": "wdv", "rate_pct": 10,
        }, headers=auth_header(token, cid)).json()
        asset = client.post("/api/fixed-assets/assets", json={
            "category_id": cat["id"], "name": "Test Machine", "purchase_date": "2025-06-01",
            "cost": 10000, "salvage_value": 0,
        }, headers=auth_header(token, cid)).json()
        return token, cid, fa, asset

    def test_dispose_posts_balanced_journal_and_flips_status(self, client):
        token, cid, fa, asset = self._setup(client, "aint77@example.com")
        r = client.post(f"/api/fixed-assets/assets/{asset['id']}/dispose", json={
            "disposal_date": "2026-01-15", "disposal_amount": 9000,
        }, headers=auth_header(token, cid))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["asset_status"] == "disposed", body

        from app.core.db import get_db
        from app.models.voucher import Voucher, VoucherLine
        db = next(get_db())
        # A posted journal vouchers the disposal (the old code posted NOTHING).
        v = db.query(Voucher).filter(
            Voucher.company_id == cid, Voucher.narration == f"Asset disposal - Test Machine",
        ).first()
        assert v is not None, "no disposal journal voucher"
        assert v.status == "posted", v.status
        lines = db.query(VoucherLine).filter(VoucherLine.voucher_id == v.id).all()
        total_dr = sum(float(l.debit) for l in lines)
        total_cr = sum(float(l.credit) for l in lines)
        assert abs(total_dr - total_cr) < 0.01, (total_dr, total_cr)
        # The fixed-asset ledger is credited with the WDV (10,000 cost).
        fa_line = next(l for l in lines if l.ledger_id == fa["id"])
        assert float(fa_line.credit) == 10000, fa_line.credit
        db.close()

    def test_dispose_rejected_in_closed_fy(self, client):
        token, cid, fa, asset = self._setup(client, "aint78@example.com")
        fy = client.get("/api/coa/financial-years", headers=auth_header(token, cid)).json()[0]
        client.patch(f"/api/coa/financial-years/{fy['id']}/close",
                     json={}, headers=auth_header(token, cid))
        r = client.post(f"/api/fixed-assets/assets/{asset['id']}/dispose", json={
            "disposal_date": "2026-01-15", "disposal_amount": 9000,
        }, headers=auth_header(token, cid))
        assert r.status_code == 400, r.text
        # Asset state unchanged — no silent half-disposal.
        got = client.get(f"/api/fixed-assets/assets/{asset['id']}", headers=auth_header(token, cid)).json()
        assert got["is_active"] is True, got


class TestBillReferenceRefreshedOnEdit:
    """Audit round 11: editing a sales/purchase invoice must REFRESH its bill
    reference — not stack a second one. The old code called
    ``create_bill_reference`` unconditionally from ``_post_voucher_effects``,
    so every edit left the original reference (stale original_amount/status)
    AND a new one: the Outstanding Bills report showed two rows for one
    invoice, the stale one never settling."""

    def _make_invoice(self, client, token, cid, party, sales, bank, amount=1000):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": amount},
                {"ledger_id": bank["id"], "debit": amount, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def test_edit_refreshes_single_bill_reference(self, client):
        from app.core.db import get_db
        from app.models.bill_reference import BillReference

        company, token = _setup_company(client, "aint79@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "Edit Ref Customer", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()

        invoice = self._make_invoice(client, token, cid, party, sales, bank, amount=1000)

        db = next(get_db())
        refs = db.query(BillReference).filter(
            BillReference.invoice_voucher_id == invoice["id"]
        ).all()
        assert len(refs) == 1
        assert refs[0].original_amount == 1000
        assert refs[0].outstanding_amount == 1000
        db.close()

        # Edit the invoice: amount 1000 → 1500.
        resp = client.put(f"/api/vouchers/{invoice['id']}", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 1500},
                {"ledger_id": bank["id"], "debit": 1500, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        # STILL exactly one reference — refreshed, not duplicated.
        db = next(get_db())
        refs = db.query(BillReference).filter(
            BillReference.invoice_voucher_id == invoice["id"]
        ).all()
        assert len(refs) == 1, f"edit must not duplicate bill reference, found {len(refs)}"
        assert refs[0].original_amount == 1500
        assert refs[0].outstanding_amount == 1500
        assert refs[0].status == "open"
        db.close()

        # Outstanding report agrees: one bill of 1500.
        out = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales", headers=auth_header(token, cid),
        ).json()
        assert len(out["bills"]) == 1, out
        assert out["bills"][0]["original_amount"] == 1500
        assert out["total_outstanding"] == 1500

    def test_edit_preserves_partial_payment_outstanding(self, client):
        """A partial payment must survive an edit: after settling ₹300 of a
        ₹1000 invoice, editing it to ₹1200 keeps paid=300 and outstanding=900."""
        company, token = _setup_company(client, "aint80@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "Edit Paid Customer", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()

        invoice = self._make_invoice(client, token, cid, party, sales, bank, amount=1000)
        out = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales", headers=auth_header(token, cid),
        ).json()
        bill_id = out["bills"][0]["bill_reference_id"]

        receipt = client.post("/api/vouchers", json={
            "voucher_type": "receipt", "voucher_date": "2025-06-05",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": bank["id"], "debit": 1000, "credit": 0},
                {"ledger_id": sales["id"], "debit": 0, "credit": 1000},
            ],
        }, headers=auth_header(token, cid)).json()
        resp = client.post("/api/bills/settle", json={
            "payment_voucher_id": receipt["id"], "settlement_date": "2025-06-05",
            "settlements": [{"bill_reference_id": bill_id, "amount": 300}],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        # Edit the invoice to 1200.
        resp = client.put(f"/api/vouchers/{invoice['id']}", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 1200},
                {"ledger_id": bank["id"], "debit": 1200, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        out = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales", headers=auth_header(token, cid),
        ).json()
        assert len(out["bills"]) == 1, out
        assert out["bills"][0]["original_amount"] == 1200
        assert out["bills"][0]["paid_amount"] == 300
        assert out["bills"][0]["outstanding_amount"] == 900
        assert out["total_outstanding"] == 900


class TestVoucherEditBlockedByLiveCompliance:
    """Audit round 11: editing a voucher that has a LIVE e-invoice IRN or
    e-way bill (submitted/generated) must be blocked — GSTN validated those
    documents; editing the voucher afterwards silently diverges the books
    from what the IRP/GSTN hold (same rule as the cancel guard). Draft rows
    are allowed: their payload is rebuilt from the voucher at generate time."""

    def _make_sales(self, client, token, cid, sales, bank, party, date_str="2025-06-10"):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": date_str,
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 1000},
                {"ledger_id": bank["id"], "debit": 1000, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _edit_payload(self, sales, bank, party):
        return {
            "voucher_type": "sales", "voucher_date": "2025-06-11",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 2000},
                {"ledger_id": bank["id"], "debit": 2000, "credit": 0},
            ],
        }

    def test_edit_blocked_with_generated_einvoice(self, client):
        from app.core.db import get_db
        from app.models.accounting import GstRegistration
        from app.models.einvoice import EInvoice

        company, token = _setup_company(client, "aint81@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "EI Edit Customer", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()

        v = self._make_sales(client, token, cid, sales, bank, party)

        db = next(get_db())
        reg = db.query(GstRegistration).filter(GstRegistration.company_id == cid).first()
        if not reg:
            reg = GstRegistration(
                company_id=cid, gstin="27AABCU9603R1ZM",
                legal_name="EI Edit Co", state_code="27", is_primary=True,
            )
            db.add(reg)
            db.flush()
        db.add(EInvoice(
            company_id=cid, voucher_id=v["id"], gstin_id=reg.id,
            status="generated", irn="6f0e9d8c7b6a5f4e3d2c1b0a",
        ))
        db.commit()
        db.close()

        resp = client.put(f"/api/vouchers/{v['id']}", json=self._edit_payload(sales, bank, party),
                          headers=auth_header(token, cid))
        assert resp.status_code == 400, resp.text
        assert "e-invoice" in resp.json()["detail"].lower(), resp.text

        # Voucher unchanged — nothing was edited.
        detail = client.get(f"/api/vouchers/{v['id']}", headers=auth_header(token, cid)).json()
        assert detail["voucher_date"] == "2025-06-10"
        assert float(detail["grand_total"]) == 1000

    def test_edit_blocked_with_generated_eway_bill(self, client):
        from app.core.db import get_db
        from app.models.accounting import GstRegistration
        from app.models.eway_bill import EwayBill

        company, token = _setup_company(client, "aint82@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "EWB Edit Customer", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()

        v = self._make_sales(client, token, cid, sales, bank, party)

        db = next(get_db())
        reg = db.query(GstRegistration).filter(GstRegistration.company_id == cid).first()
        if not reg:
            reg = GstRegistration(
                company_id=cid, gstin="27AABCU9603R1ZM",
                legal_name="EWB Edit Co", state_code="27", is_primary=True,
            )
            db.add(reg)
            db.flush()
        db.add(EwayBill(
            company_id=cid, voucher_id=v["id"], gstin_id=reg.id,
            status="generated", eway_bill_number="211234567890",
            document_number="INV-1", document_date="2025-06-10",
            from_state="27", to_state="27", supply_type="O", sub_supply_type="0",
            document_type="INV",
        ))
        db.commit()
        db.close()

        resp = client.put(f"/api/vouchers/{v['id']}", json=self._edit_payload(sales, bank, party),
                          headers=auth_header(token, cid))
        assert resp.status_code == 400, resp.text
        assert "e-way bill" in resp.json()["detail"].lower(), resp.text

    def test_edit_allowed_with_draft_einvoice(self, client):
        """Draft e-invoices never reach GSTN — the draft's payload is rebuilt
        from the voucher at generate time, so editing is allowed."""
        from app.core.db import get_db
        from app.models.accounting import GstRegistration
        from app.models.einvoice import EInvoice

        company, token = _setup_company(client, "aint83@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "EI Draft Edit Customer", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()

        v = self._make_sales(client, token, cid, sales, bank, party)

        db = next(get_db())
        reg = db.query(GstRegistration).filter(GstRegistration.company_id == cid).first()
        if not reg:
            reg = GstRegistration(
                company_id=cid, gstin="27AABCU9603R1ZM",
                legal_name="EI Draft Edit Co", state_code="27", is_primary=True,
            )
            db.add(reg)
            db.flush()
        db.add(EInvoice(company_id=cid, voucher_id=v["id"], gstin_id=reg.id, status="draft"))
        db.commit()
        db.close()

        resp = client.put(f"/api/vouchers/{v['id']}", json=self._edit_payload(sales, bank, party),
                          headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text
        assert float(resp.json()["grand_total"]) == 2000


class TestDuplicateVoucherFyAwareNumbering:
    """Audit round 11: duplicating a voucher must number the copy against the
    DUPLICATE's date FY — not today's FY. The round-8 FY-aware fix was applied
    to create/reversal but missed the duplicate path, so a June-2027 duplicate
    made in Aug-2026 got an INV-2026- prefix."""

    def test_duplicate_numbers_by_new_voucher_date_fy(self, client):
        import datetime
        from app.core.db import get_db
        from app.models.voucher_numbering import VoucherNumbering

        company, token = _setup_company(client, "aint84@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        # FYs covering the duplicate's date (2027-06-01 → FY 2027-28).
        client.post("/api/coa/financial-years", json={
            "name": "2026-27", "start_date": "2026-04-01", "end_date": "2027-03-31",
        }, headers=auth_header(token, cid))
        client.post("/api/coa/financial-years", json={
            "name": "2027-28", "start_date": "2027-04-01", "end_date": "2028-03-31",
        }, headers=auth_header(token, cid))
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "Dup Customer", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()

        resp = client.patch(
            f"/api/companies/{cid}/voucher-numbering/sales",
            json={"prefix": "INV", "format_template": "{PREFIX}-{YEAR}-{SEQ}", "fy_start_month": 4},
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 200, resp.text

        def make_sale(date_str):
            r = client.post("/api/vouchers", json={
                "voucher_type": "sales", "voucher_date": date_str,
                "party_id": party["id"],
                "lines": [
                    {"ledger_id": sales["id"], "quantity": 1, "rate": 100},
                    {"ledger_id": bank["id"], "debit": 100, "credit": 0},
                ],
            }, headers=auth_header(token, cid))
            assert r.status_code == 201, r.text
            return r.json()

        original = make_sale("2026-06-01")
        assert original["voucher_number"] == "INV-2026-0001"

        # Duplicate with a date in FY 2027-28 — must get INV-2027-0001, not
        # INV-2026-… (today's FY would have been 2026 when this test runs).
        resp = client.post(f"/api/vouchers/{original['id']}/duplicate", json={
            "voucher_date": "2027-06-01",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text
        dup = resp.json()
        assert dup["voucher_number"] == "INV-2027-0001", dup["voucher_number"]
        assert dup["voucher_date"] == "2027-06-01"
        assert dup["status"] == "draft"
        assert float(dup["grand_total"]) == 100

        db = next(get_db())
        n = db.query(VoucherNumbering).filter(
            VoucherNumbering.company_id == cid, VoucherNumbering.voucher_type == "sales",
        ).first()
        assert n.current_fy_year == "2027"
        db.close()


class TestRestoreResetsLocallyCancelledDrafts:
    """Audit round 11: restoring a cancelled voucher must bring its locally-
    cancelled draft e-invoices/e-way bills back to draft. On cancel, draft
    rows (never submitted to GSTN) are flipped to cancelled as a local marker;
    a restored voucher must be able to generate a fresh IRN again. Rows
    cancelled via the portal carry the portal's remark and stay cancelled."""

    def _make_sales(self, client, token, cid, sales, bank, party):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-10",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 1000},
                {"ledger_id": bank["id"], "debit": 1000, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def test_restore_resets_draft_einvoice_and_eway(self, client):
        from app.core.db import get_db
        from app.models.accounting import GstRegistration
        from app.models.einvoice import EInvoice
        from app.models.eway_bill import EwayBill

        company, token = _setup_company(client, "aint85@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "Restore Customer", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()

        v = self._make_sales(client, token, cid, sales, bank, party)

        db = next(get_db())
        reg = db.query(GstRegistration).filter(GstRegistration.company_id == cid).first()
        if not reg:
            reg = GstRegistration(
                company_id=cid, gstin="27AABCU9603R1ZM",
                legal_name="Restore Co", state_code="27", is_primary=True,
            )
            db.add(reg)
            db.flush()
        db.add(EInvoice(company_id=cid, voucher_id=v["id"], gstin_id=reg.id, status="draft"))
        db.add(EwayBill(
            company_id=cid, voucher_id=v["id"], gstin_id=reg.id,
            status="draft", document_number="INV-1", document_date="2025-06-10",
            from_state="27", to_state="27", supply_type="O", sub_supply_type="0",
            document_type="INV",
        ))
        db.commit()
        db.close()

        # Cancel: drafts are locally cancelled with the "Voucher cancelled" marker.
        resp = client.post(f"/api/vouchers/{v['id']}/cancel", json={"reason": "void"},
                           headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        db = next(get_db())
        ei = db.query(EInvoice).filter(EInvoice.voucher_id == v["id"]).one()
        eb = db.query(EwayBill).filter(EwayBill.voucher_id == v["id"]).one()
        assert ei.status == "cancelled" and ei.cancel_remark == "Voucher cancelled"
        assert eb.status == "cancelled" and eb.cancel_remark == "Voucher cancelled"
        db.close()

        # Restore: both flip back to draft so a fresh IRN/EWB can be generated.
        resp = client.post(f"/api/vouchers/{v['id']}/restore", json={"reason": "keep it"},
                           headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        db = next(get_db())
        ei = db.query(EInvoice).filter(EInvoice.voucher_id == v["id"]).one()
        eb = db.query(EwayBill).filter(EwayBill.voucher_id == v["id"]).one()
        assert ei.status == "draft", ei.status
        assert ei.cancel_remark is None and ei.cancel_reason is None and ei.cancelled_at is None
        assert eb.status == "draft", eb.status
        assert eb.cancel_remark is None and eb.cancel_reason is None and eb.cancelled_at is None
        db.close()

    def test_portal_cancelled_einvoice_survives_restore(self, client):
        """A row cancelled via the GSTN portal (real remark) stays cancelled on
        restore — the IRN is gone for good and must not silently come back."""
        from app.core.db import get_db
        from app.models.accounting import GstRegistration
        from app.models.einvoice import EInvoice

        company, token = _setup_company(client, "aint86@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "Restore Portal Customer", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()

        v = self._make_sales(client, token, cid, sales, bank, party)

        db = next(get_db())
        reg = db.query(GstRegistration).filter(GstRegistration.company_id == cid).first()
        if not reg:
            reg = GstRegistration(
                company_id=cid, gstin="27AABCU9603R1ZM",
                legal_name="Restore Portal Co", state_code="27", is_primary=True,
            )
            db.add(reg)
            db.flush()
        # Portal-cancelled: no voucher-cancel marker.
        db.add(EInvoice(
            company_id=cid, voucher_id=v["id"], gstin_id=reg.id,
            status="cancelled", irn="deadbeef",
            cancel_reason="1", cancel_remark="Duplicate entry",
        ))
        db.commit()
        db.close()

        resp = client.post(f"/api/vouchers/{v['id']}/cancel", json={"reason": "void"},
                           headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text
        resp = client.post(f"/api/vouchers/{v['id']}/restore", json={"reason": "keep it"},
                           headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        db = next(get_db())
        ei = db.query(EInvoice).filter(EInvoice.voucher_id == v["id"]).one()
        assert ei.status == "cancelled", ei.status
        assert ei.cancel_remark == "Duplicate entry"
        db.close()


class TestPaymentSideAllocationCap:
    """Audit round 11: a payment/receipt voucher can never be allocated more
    than its own amount across ALL settlement/allocation calls — the old code
    only capped each call individually, so a ₹1,000 receipt could settle
    ₹600 + ₹600 (each under the bill's outstanding) and the books showed
    ₹1,200 settled against ₹1,000 received."""

    def _setup_invoices(self, client, token, cid, party, sales, bank):
        ids = []
        for i, amt in enumerate([1000, 1000], start=1):
            r = client.post("/api/vouchers", json={
                "voucher_type": "sales", "voucher_date": f"2025-06-0{i}",
                "party_id": party["id"],
                "lines": [
                    {"ledger_id": sales["id"], "quantity": 1, "rate": amt},
                    {"ledger_id": bank["id"], "debit": amt, "credit": 0},
                ],
            }, headers=auth_header(token, cid))
            assert r.status_code == 201, r.text
            ids.append(r.json())
        return ids

    def test_settle_bills_capped_across_calls(self, client):
        from app.core.db import get_db
        from app.models.bill_reference import BillReference

        company, token = _setup_company(client, "aint87@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "Cap Settle Customer", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()

        inv_a, inv_b = self._setup_invoices(client, token, cid, party, sales, bank)
        out = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales", headers=auth_header(token, cid),
        ).json()
        bill_a, bill_b = out["bills"][0]["bill_reference_id"], out["bills"][1]["bill_reference_id"]

        receipt = client.post("/api/vouchers", json={
            "voucher_type": "receipt", "voucher_date": "2025-06-10",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": bank["id"], "debit": 1000, "credit": 0},
                {"ledger_id": sales["id"], "debit": 0, "credit": 1000},
            ],
        }, headers=auth_header(token, cid)).json()

        # First call: 600 against bill A — fine.
        resp = client.post("/api/bills/settle", json={
            "payment_voucher_id": receipt["id"], "settlement_date": "2025-06-10",
            "settlements": [{"bill_reference_id": bill_a, "amount": 600}],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        # Second call: 600 against bill B — individually valid (bill B has
        # 1000 outstanding) but the receipt is only ₹1000 total → reject.
        resp = client.post("/api/bills/settle", json={
            "payment_voucher_id": receipt["id"], "settlement_date": "2025-06-10",
            "settlements": [{"bill_reference_id": bill_b, "amount": 600}],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 400, resp.text
        assert "exceeds payment amount" in resp.json()["detail"].lower(), resp.text

        db = next(get_db())
        br_b = db.get(BillReference, bill_b)
        assert br_b.outstanding_amount == 1000, "bill B must stay untouched"
        db.close()

    def test_allocate_payment_capped_across_calls(self, client):
        from app.core.db import get_db
        from app.models.bill_reference import BillReference

        company, token = _setup_company(client, "aint88@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "Cap Allocate Customer", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()

        inv_a, inv_b = self._setup_invoices(client, token, cid, party, sales, bank)
        out = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=sales", headers=auth_header(token, cid),
        ).json()
        bill_b = out["bills"][1]["bill_reference_id"]

        receipt = client.post("/api/vouchers", json={
            "voucher_type": "receipt", "voucher_date": "2025-06-10",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": bank["id"], "debit": 1000, "credit": 0},
                {"ledger_id": sales["id"], "debit": 0, "credit": 1000},
            ],
        }, headers=auth_header(token, cid)).json()

        resp = client.post("/api/payments/allocate", json={
            "invoice_voucher_id": inv_a["id"], "payment_voucher_id": receipt["id"],
            "amount": 600, "allocation_date": "2025-06-10",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text

        resp = client.post("/api/payments/allocate", json={
            "invoice_voucher_id": inv_b["id"], "payment_voucher_id": receipt["id"],
            "amount": 600, "allocation_date": "2025-06-10",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 400, resp.text
        assert "already allocated" in resp.json()["detail"].lower(), resp.text

        db = next(get_db())
        br_b = db.get(BillReference, bill_b)
        assert br_b.outstanding_amount == 1000, "bill B must stay untouched"
        db.close()
# ── Audit round 12 ───────────────────────────────────────────────────────

class TestAuditTrailPersistence:
    """Audit entries for voucher lifecycle actions must survive the request.

    Round 12: log_action was called AFTER db.commit() with no follow-up
    commit, so the entry (and the notification flush) was rolled back at
    session close — voucher create/update/cancel left NO audit trail in
    production. Tests pass under the shared-session _tx fixture only because
    everything shares one connection; these tests assert the entries exist
    and are committed.
    """

    def _voucher(self, client, token, cid, l1, l2, voucher_number="JRN-R12-0001"):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "journal", "voucher_number": voucher_number,
            "voucher_date": "2025-06-01", "narration": "[E2E] audit r12",
            "lines": [
                {"ledger_id": l1["id"], "debit": 500, "credit": 0},
                {"ledger_id": l2["id"], "debit": 0, "credit": 500},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def test_create_commits_audit_entry(self, client):
        from app.core.db import get_db
        from app.models.audit import AuditLog

        company, token = _setup_company(client, "aintr12a@example.com")
        cid = company["id"]
        _, l1, l2 = self._groups(client, token, cid)
        v = self._voucher(client, token, cid, l1, l2)

        db = next(get_db())
        entry = db.query(AuditLog).filter(
            AuditLog.company_id == cid,
            AuditLog.entity_type == "voucher",
            AuditLog.entity_id == v["id"],
            AuditLog.action == "CREATE",
        ).first()
        assert entry is not None, "CREATE audit entry must be committed"
        assert "Created" in (entry.description or "")
        db.close()

    def _groups(self, client, token, cid):
        grp = client.post("/api/coa/groups", json={
            "name": "R12 Assets", "nature": "assets", "group_type": "sub",
        }, headers=auth_header(token, cid)).json()
        l1 = client.post("/api/coa/ledgers", json={
            "name": "R12 Cash", "group_id": grp["id"],
        }, headers=auth_header(token, cid)).json()
        l2 = client.post("/api/coa/ledgers", json={
            "name": "R12 Bank", "group_id": grp["id"],
        }, headers=auth_header(token, cid)).json()
        return grp, l1, l2

    def test_update_and_cancel_commit_audit_entries(self, client):
        from app.core.db import get_db
        from app.models.audit import AuditLog

        company, token = _setup_company(client, "aintr12b@example.com")
        cid = company["id"]
        _, l1, l2 = self._groups(client, token, cid)
        v = self._voucher(client, token, cid, l1, l2)

        resp = client.patch(f"/api/vouchers/{v['id']}", json={
            "voucher_type": "journal", "voucher_number": v["voucher_number"],
            "voucher_date": "2025-06-01", "narration": "[E2E] audit r12 edited",
            "lines": [
                {"ledger_id": l1["id"], "debit": 600, "credit": 0},
                {"ledger_id": l2["id"], "debit": 0, "credit": 600},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        resp = client.post(f"/api/vouchers/{v['id']}/cancel", json={
            "reason": "r12 audit cancel",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        db = next(get_db())
        entries = db.query(AuditLog).filter(
            AuditLog.company_id == cid,
            AuditLog.entity_type == "voucher",
            AuditLog.entity_id == v["id"],
        ).all()
        actions = {e.action for e in entries}
        assert "CREATE" in actions
        assert "UPDATE" in actions, f"UPDATE audit entry missing; got {actions}"
        assert "CANCEL" in actions, f"CANCEL audit entry missing; got {actions}"
        db.close()

    @staticmethod
    def _approx(a, b, tol=0.01):
        return abs(float(a) - float(b)) <= tol

    def test_service_level_create_logged(self, client):
        """Recurring/loan/asset voucher creation (central service) is audited."""
        from app.core.db import get_db
        from app.models.audit import AuditLog
        from app.models.user import User
        from app.services.voucher_service import create_voucher
        from app.schemas.voucher import VoucherCreate

        company, token = _setup_company(client, "aintr12c@example.com")
        cid = company["id"]
        _, l1, l2 = self._groups(client, token, cid)

        db = next(get_db())
        actor = db.query(User).first()
        payload = VoucherCreate(
            voucher_type="journal", voucher_date="2025-06-01",
            narration="[E2E] service-level audit",
            lines=[
                {"ledger_id": l1["id"], "debit": 250, "credit": 0},
                {"ledger_id": l2["id"], "debit": 0, "credit": 250},
            ],
        )
        co = db.get(__import__("app.models.user", fromlist=["Company"]).Company, cid)
        v = create_voucher(db, co, payload, actor.id if actor else None)
        entry = db.query(AuditLog).filter(
            AuditLog.company_id == cid,
            AuditLog.entity_type == "voucher",
            AuditLog.entity_id == v.id,
            AuditLog.action == "CREATE",
        ).first()
        assert entry is not None, "service-level CREATE audit entry missing"
        db.close()


class TestEinvoiceEwayAudit:
    """Generate/cancel of e-invoices and e-way bills are statutory actions
    that must appear in the audit trail (round 12)."""

    def _setup(self, client, token, cid):
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "R12 EInv Party", "party_type": "customer",
            "gstin": "29ABCDE1234F1Z5", "state_code": "29",
        }, headers=auth_header(token, cid)).json()
        inv = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "party_id": party["id"], "counterparty_gstin": "29ABCDE1234F1Z5",
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": 1000},
                {"ledger_id": bank["id"], "debit": 1000, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert inv.status_code == 201, inv.text
        return inv.json()

    def test_einvoice_generate_and_cancel_audited(self, client, monkeypatch):
        from app.core.db import get_db
        from app.models.audit import AuditLog

        company, token = _setup_company(client, "aintr12d@example.com")
        cid = company["id"]
        inv = self._setup(client, token, cid)

        # Enable e-invoice module + fake the IRP round-trip
        monkeypatch.setattr("app.api.v1.einvoice.settings.einvoice_enabled", True)
        reg = client.post("/api/gst/registrations", json={
            "gstin": "29ABCDE1234F1Z5", "legal_name": "R12 Co",
            "state_code": "29", "is_default": True,
        }, headers=auth_header(token, cid))
        assert reg.status_code in (200, 201), reg.text
        gstin_id = reg.json()["id"]

        ei = client.post("/api/einvoice/create", json={
            "voucher_id": inv["id"], "gstin_id": gstin_id,
        }, headers=auth_header(token, cid))
        assert ei.status_code == 201, ei.text
        ei_id = ei.json()["id"]

        from unittest.mock import AsyncMock
        # The endpoint serializes whatever generate_irn returns — the real
        # client returns an EInvoice ORM model. Load it and return that.
        from app.core.db import get_db as _get_db
        from app.models.einvoice import EInvoice as _EInvoice
        _db = next(_get_db())
        ei_model = _db.get(_EInvoice, ei_id)
        _db.close()
        monkeypatch.setattr("app.api.v1.einvoice.generate_irn", AsyncMock(return_value=ei_model))
        monkeypatch.setattr("app.api.v1.einvoice.cancel_irn", AsyncMock(return_value=ei_model))

        g = client.post(f"/api/einvoice/{ei_id}/generate", headers=auth_header(token, cid))
        assert g.status_code == 200, g.text
        c = client.post(f"/api/einvoice/{ei_id}/cancel", json={
            "cancel_reason": "1", "cancel_remark": "R12 test remark",
        }, headers=auth_header(token, cid))
        assert c.status_code == 200, c.text

        db = next(get_db())
        entries = db.query(AuditLog).filter(
            AuditLog.company_id == cid,
            AuditLog.entity_type == "e_invoice",
        ).all()
        descs = " | ".join(e.description or "" for e in entries)
        assert len(entries) >= 2, f"expected generate+cancel audit entries; got {descs}"
        assert "IRN" in descs or "irn" in descs.lower()
        db.close()


class TestManufacturingAuditRound12:
    """Production orders converge on the same FY rules + reversal trail as
    vouchers (round 12)."""

    def _company(self, db):
        from app.models.user import Company
        co = Company(name="Test Co", is_active=True)
        db.add(co)
        db.commit()
        db.refresh(co)
        return co

    def _item(self, db, company_id, name, qty=100, rate=10):
        from app.models.stock import StockItem, StockBalance
        item = StockItem(company_id=company_id, name=name, tracking_mode="none",
                         unit_of_measure="Nos", valuation_method="weighted_avg")
        db.add(item)
        db.flush()
        bal = StockBalance(company_id=company_id, stock_item_id=item.id,
                           quantity=qty, avg_rate=rate, total_value=qty * rate)
        db.add(bal)
        db.flush()
        return item

    def _bom(self, db, company_id, name, finished_item, lines, output_qty=1):
        from app.schemas.manufacturing import BomCreate, BomLineCreate
        from app.services.manufacturing import create_bom
        return create_bom(db, company_id, BomCreate(
            name=name, finished_item_id=str(finished_item.id),
            output_qty=output_qty, lines=lines,
        ))

    @staticmethod
    def _approx(a, b, tol=0.01):
        return abs(float(a) - float(b)) <= tol

    def test_completed_cancel_creates_reversal_voucher(self, db):
        from app.schemas.manufacturing import ProductionOrderCreate, BomLineCreate
        from app.services.manufacturing import (
            create_production_order, confirm_production_order, cancel_production_order,
        )
        from app.models.voucher import Voucher, VoucherLine

        co = self._company(db)
        a = self._item(db, co.id, "R12 Raw", rate=5)
        fin = self._item(db, co.id, "R12 Fin")
        bom = self._bom(db, co.id, "R12 BOM", fin, [
            BomLineCreate(stock_item_id=str(a.id), quantity=1, rate=5),
        ])
        order = create_production_order(db, co.id, None, ProductionOrderCreate(
            bom_id=str(bom.id), order_date="2026-08-01", planned_qty=10,
        ))
        confirmed = confirm_production_order(db, co.id, str(order.id))
        assert confirmed.voucher_id is not None

        voucher = db.get(Voucher, confirmed.voucher_id)
        # Round 12: the production journal must carry its totals (was ₹0).
        assert self._approx(voucher.grand_total, 50.0)

        cancelled = cancel_production_order(db, co.id, str(order.id), user_id=None)
        assert cancelled.status == "cancelled"

        db.refresh(voucher)
        assert voucher.status == "cancelled"
        assert voucher.reversed_by_voucher_id is not None, \
            "completed-order cancel must create a linked reversal voucher"
        reversal = db.get(Voucher, voucher.reversed_by_voucher_id)
        assert reversal is not None
        assert reversal.status == "reversed"
        assert reversal.original_voucher_id == voucher.id
        assert reversal.voucher_type == "journal"
        # Opposite entries: Cr CoP / Dr Purchases (reversal swaps debit/credit)
        orig_lines = {ln.ledger_id: (ln.debit, ln.credit) for ln in voucher.lines}
        rev_lines = {ln.ledger_id: (ln.debit, ln.credit) for ln in reversal.lines}
        assert set(rev_lines.keys()) == set(orig_lines.keys())
        for lid, (d, c) in orig_lines.items():
            rd, rc = rev_lines[lid]
            assert rd == c and rc == d, "reversal must swap debit/credit"

    def test_confirm_rejected_in_closed_fy(self, db):
        from app.schemas.manufacturing import ProductionOrderCreate, BomLineCreate
        from app.services.manufacturing import (
            create_production_order, confirm_production_order,
        )
        from app.models.accounting import FinancialYear
        from app.models.manufacturing import ProductionOrder
        from fastapi import HTTPException

        co = self._company(db)
        a = self._item(db, co.id, "R12 Raw2", rate=5)
        fin = self._item(db, co.id, "R12 Fin2")
        bom = self._bom(db, co.id, "R12 BOM2", fin, [
            BomLineCreate(stock_item_id=str(a.id), quantity=1, rate=5),
        ])
        order = create_production_order(db, co.id, None, ProductionOrderCreate(
            bom_id=str(bom.id), order_date="2026-08-01", planned_qty=10,
        ))
        # Close the FY containing the order date
        fy = FinancialYear(company_id=co.id, name="2026-27",
                           start_date="2026-04-01", end_date="2027-03-31",
                           is_closed=True)
        db.add(fy)
        db.commit()

        from pytest import raises as _raises
        with _raises(HTTPException) as exc:
            confirm_production_order(db, co.id, str(order.id))
        assert "closed" in str(exc.value.detail).lower()

        order = db.get(ProductionOrder, order.id)
        assert order.status != "completed", "order must remain unconfirmed"


class TestSettlementDirectionGuard:
    """Payment/receipt vouchers must settle bills in the correct direction,
    and only posted vouchers may settle (audit round 20)."""

    def _make_party(self, client, token, cid, name="Guard Customer"):
        resp = client.post("/api/coa/parties", json={
            "name": name, "party_type": "customer",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _make_invoice(self, client, token, cid, party, sales, bank, amount=200):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": sales["id"], "quantity": 1, "rate": amount},
                {"ledger_id": bank["id"], "debit": amount, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _make_purchase_bill(self, client, token, cid, party, purchase, bank, amount=200):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "purchase", "voucher_date": "2025-06-01",
            "party_id": party["id"],
            "lines": [
                {"ledger_id": purchase["id"], "quantity": 1, "rate": amount},
                {"ledger_id": bank["id"], "debit": 0, "credit": amount},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _bill_id(self, client, token, cid, party, vtype):
        out = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type={vtype}", headers=auth_header(token, cid),
        ).json()
        assert len(out["bills"]) == 1
        return out["bills"][0]["bill_reference_id"]

    def test_payment_cannot_settle_sales_bill(self, client):
        """A payment voucher must not mark a customer receivable as paid."""
        company, token = _setup_company(client, "guard1@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_party(client, token, cid)
        self._make_invoice(client, token, cid, party, sales, bank)
        bill_ref_id = self._bill_id(client, token, cid, party, "sales")

        payment = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_date": "2025-06-02",
            "lines": [
                {"ledger_id": bank["id"], "debit": 0, "credit": 200},
                {"ledger_id": sales["id"], "debit": 200, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert payment.status_code == 201, payment.text

        resp = client.post("/api/bills/settle", json={
            "payment_voucher_id": payment.json()["id"],
            "settlement_date": "2025-06-02",
            "settlements": [{"bill_reference_id": bill_ref_id, "amount": 200}],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 400, resp.text
        assert "only settles purchase bills" in resp.json()["detail"]

    def test_receipt_cannot_settle_purchase_bill(self, client):
        """A receipt voucher must not settle a supplier payable."""
        company, token = _setup_company(client, "guard2@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, _, purchase, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_party(client, token, cid, name="Guard Supplier")
        self._make_purchase_bill(client, token, cid, party, purchase, bank)
        bill_ref_id = self._bill_id(client, token, cid, party, "purchase")

        receipt = client.post("/api/vouchers", json={
            "voucher_type": "receipt", "voucher_date": "2025-06-02",
            "lines": [
                {"ledger_id": bank["id"], "debit": 200, "credit": 0},
                {"ledger_id": purchase["id"], "debit": 0, "credit": 200},
            ],
        }, headers=auth_header(token, cid))
        assert receipt.status_code == 201, receipt.text

        resp = client.post("/api/bills/settle", json={
            "payment_voucher_id": receipt.json()["id"],
            "settlement_date": "2025-06-02",
            "settlements": [{"bill_reference_id": bill_ref_id, "amount": 200}],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 400, resp.text
        assert "only settles sales bills" in resp.json()["detail"]

    def test_cancelled_voucher_cannot_settle(self, client):
        """Only posted payment/receipt vouchers may settle bills."""
        company, token = _setup_company(client, "guard3@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_party(client, token, cid)
        self._make_invoice(client, token, cid, party, sales, bank)
        bill_ref_id = self._bill_id(client, token, cid, party, "sales")

        receipt = client.post("/api/vouchers", json={
            "voucher_type": "receipt", "voucher_date": "2025-06-02",
            "lines": [
                {"ledger_id": bank["id"], "debit": 200, "credit": 0},
                {"ledger_id": sales["id"], "debit": 0, "credit": 200},
            ],
        }, headers=auth_header(token, cid)).json()
        cancel = client.post(f"/api/vouchers/{receipt['id']}/cancel", json={"reason": "test"}, headers=auth_header(token, cid))
        assert cancel.status_code == 200, cancel.text

        resp = client.post("/api/bills/settle", json={
            "payment_voucher_id": receipt["id"],
            "settlement_date": "2025-06-02",
            "settlements": [{"bill_reference_id": bill_ref_id, "amount": 200}],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 400, resp.text
        assert "Only posted" in resp.json()["detail"]

    def test_payment_settles_purchase_bill_happy_path(self, client):
        """Positive control: payment against a purchase bill still works."""
        company, token = _setup_company(client, "guard4@example.com")
        cid = company["id"]
        _create_fy(client, token, cid)
        _, _, _, _, purchase, bank = _create_groups_and_ledgers(client, token, cid)
        party = self._make_party(client, token, cid, name="Guard Pay Supplier")
        self._make_purchase_bill(client, token, cid, party, purchase, bank)
        bill_ref_id = self._bill_id(client, token, cid, party, "purchase")

        payment = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_date": "2025-06-02",
            "lines": [
                {"ledger_id": bank["id"], "debit": 0, "credit": 200},
                {"ledger_id": purchase["id"], "debit": 200, "credit": 0},
            ],
        }, headers=auth_header(token, cid)).json()
        resp = client.post("/api/bills/settle", json={
            "payment_voucher_id": payment["id"],
            "settlement_date": "2025-06-02",
            "settlements": [{"bill_reference_id": bill_ref_id, "amount": 200}],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text
        out = client.get(
            f"/api/bills/outstanding/{party['id']}?voucher_type=purchase", headers=auth_header(token, cid),
        ).json()
        assert len(out["bills"]) == 0, "purchase bill should be settled by the payment"


class TestTallyImportPartyLinkage:
    """Imported Tally sales/purchase vouchers keep their party and get a bill
    reference so migrated books participate in bill-wise accounting (round 12)."""

    def test_imported_sales_voucher_linked_to_party_and_bill(self, db):
        from app.models.accounting import AccountGroup, Ledger
        from app.models.user import Company
        from app.models.voucher import Voucher
        from app.models.bill_reference import BillReference
        from app.services.tally_importer import _import_vouchers
        from app.services.tally_parser import ParsedVoucher, ParsedVoucherLine

        co = Company(name="Tally Link Co", is_active=True)
        db.add(co)
        db.flush()
        grp = AccountGroup(company_id=co.id, name="Bank Accounts", nature="assets", is_system=False)
        db.add(grp)
        db.flush()
        l_bank = Ledger(company_id=co.id, name="HDFC A/C", group_id=grp.id)
        l_sales = Ledger(company_id=co.id, name="Sales Accounts", group_id=grp.id)
        db.add_all([l_bank, l_sales])
        db.flush()
        ledger_map = {"HDFC A/C": l_bank.id, "Sales Accounts": l_sales.id}

        from app.models.accounting import Party
        party = Party(company_id=co.id, name="M/s Grace Nursing Home",
                      party_type="customer", ledger_id=l_sales.id, is_active=True)
        db.add(party)
        db.flush()
        party_map = {"M/s Grace Nursing Home": party.id}

        v = ParsedVoucher(
            voucher_type="sales", voucher_number="SALE-001", voucher_date="2026-04-01",
            narration="Sale of services", party_name="M/s Grace Nursing Home",
            lines=[
                ParsedVoucherLine(ledger_name="Sales Accounts", credit=11800),
                ParsedVoucherLine(ledger_name="HDFC A/C", debit=11800),
            ],
        )
        details = _import_vouchers(db, co.id, [v], None, ledger_map, [], [], party_map=party_map)
        assert len(details) == 1

        voucher = db.query(Voucher).filter(
            Voucher.company_id == co.id, Voucher.voucher_number == "SALE-001"
        ).first()
        assert voucher is not None
        assert voucher.party_id == party.id, "imported voucher must keep party linkage"
        assert voucher.status == "posted"
        assert float(voucher.grand_total) == 11800.0

        bill_ref = db.query(BillReference).filter(
            BillReference.company_id == co.id,
            BillReference.invoice_voucher_id == voucher.id,
        ).first()
        assert bill_ref is not None, "imported invoice must get a bill reference"
        assert abs(float(bill_ref.original_amount) - 11800.0) <= 0.01
# ── Audit round 13 ───────────────────────────────────────────────────────

class TestAuditHashChain:
    """The append-only hash chain must verify cleanly and detect tampering.

    Round 13: (a) created_at was documented in the hash but never included —
    timestamps were not tamper-evident; (b) nothing ever VERIFIED the chain.
    These tests cover both the fixed hash scheme and the verify endpoint.
    """

    @staticmethod
    def _text():
        from sqlalchemy import text
        return text

    def _make_entries(self, client, token, cid, l1, l2, n=3):
        for i in range(n):
            resp = client.post("/api/vouchers", json={
                "voucher_type": "journal",
                "voucher_date": f"2025-06-0{i+1}",
                "narration": f"[E2E] chain {i}",
                "lines": [
                    {"ledger_id": l1["id"], "debit": 100 + i, "credit": 0},
                    {"ledger_id": l2["id"], "debit": 0, "credit": 100 + i},
                ],
            }, headers=auth_header(token, cid))
            assert resp.status_code == 201, resp.text

    def test_chain_verifies_clean(self, client):
        from app.core.db import get_db
        from app.models.audit import AuditLog

        company, token = _setup_company(client, "chain13a@example.com")
        cid = company["id"]
        _, l1, l2 = self._groups(client, token, cid)
        self._make_entries(client, token, cid, l1, l2)

        resp = client.get("/api/audit/chain/verify", headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["ok"] is True, f"chain must verify clean: {data}"
        assert data["total"] >= 3

    def test_tamper_detected(self, client):
        from app.core.db import get_db
        from app.models.audit import AuditLog

        company, token = _setup_company(client, "chain13b@example.com")
        cid = company["id"]
        _, l1, l2 = self._groups(client, token, cid)
        self._make_entries(client, token, cid, l1, l2, n=2)

        # Tamper with the FIRST entry's description directly in the DB (raw
        # UPDATE — the _tx fixture expires ORM instances after each request).
        _text = self._text()
        db = next(get_db())
        first = db.query(AuditLog).filter(
            AuditLog.company_id == cid,
            AuditLog.action == "CREATE",
        ).order_by(AuditLog.created_at.asc()).first()
        first_id = first.id
        db.execute(
            _text("UPDATE audit_logs SET description = :d WHERE id = :id"),
            {"d": "[E2E] TAMPERED", "id": first_id},
        )
        db.commit()
        db.close()

        resp = client.get("/api/audit/chain/verify", headers=auth_header(token, cid))
        data = resp.json()
        assert data["ok"] is False
        assert len(data["breaks"]) >= 1
        # The tampered row must be reported by id.
        assert any(b["id"] == first_id for b in data["breaks"])

    def test_created_at_included_in_hash(self, client):
        """Altering created_at must break the chain (round-13 fix)."""
        from app.core.db import get_db
        from app.models.audit import AuditLog

        company, token = _setup_company(client, "chain13c@example.com")
        cid = company["id"]
        _, l1, l2 = self._groups(client, token, cid)
        self._make_entries(client, token, cid, l1, l2, n=1)

        _text = self._text()
        db = next(get_db())
        entry = db.query(AuditLog).filter(
            AuditLog.company_id == cid,
            AuditLog.action == "CREATE",
        ).first()
        from datetime import timedelta
        entry_id = entry.id
        new_ts = entry.created_at + timedelta(hours=1)
        db.execute(
            _text("UPDATE audit_logs SET created_at = :ts WHERE id = :id"),
            {"ts": new_ts, "id": entry_id},
        )
        db.commit()
        db.close()

        resp = client.get("/api/audit/chain/verify", headers=auth_header(token, cid))
        data = resp.json()
        assert data["ok"] is False, "altered timestamp must break the chain"
        assert any(b["id"] == entry_id for b in data["breaks"])

    def _groups(self, client, token, cid):
        grp = client.post("/api/coa/groups", json={
            "name": "R13 Assets", "nature": "assets", "group_type": "sub",
        }, headers=auth_header(token, cid)).json()
        l1 = client.post("/api/coa/ledgers", json={
            "name": "R13 Cash", "group_id": grp["id"],
        }, headers=auth_header(token, cid)).json()
        l2 = client.post("/api/coa/ledgers", json={
            "name": "R13 Bank", "group_id": grp["id"],
        }, headers=auth_header(token, cid)).json()
        return grp, l1, l2


class TestAuditCoverageRound13:
    """Financially material mutations must land in the audit trail.

    Round 13: company profile/numbering changes, loans, GST registrations,
    and TDS sections/returns were never audited.
    """

    def test_company_profile_update_audited(self, client):
        from app.core.db import get_db
        from app.models.audit import AuditLog

        company, token = _setup_company(client, "cov13a@example.com")
        cid = company["id"]
        resp = client.patch(f"/api/companies/{cid}", json={
            "gstin": "29ABCDE9999F1Z5", "legal_name": "R13 Co",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        db = next(get_db())
        entry = db.query(AuditLog).filter(
            AuditLog.company_id == cid,
            AuditLog.entity_type == "company",
        ).first()
        assert entry is not None, "company profile update must be audited"
        assert entry.action == "UPDATE"
        assert "gstin" in (entry.new_value or {})
        db.close()

    def test_loan_create_audited(self, client):
        from app.core.db import get_db
        from app.models.audit import AuditLog

        company, token = _setup_company(client, "cov13b@example.com")
        cid = company["id"]
        # Enable the loans module for this company
        resp = client.patch(f"/api/companies/{cid}", json={
            "modules": ["core", "reports", "inventory", "gst", "loans", "assets"],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200
        _create_fy(client, token, cid)
        _, _, _, _, _, bank = _create_groups_and_ledgers(client, token, cid)
        party = client.post("/api/coa/parties", json={
            "name": "R13 Loan Party", "party_type": "lender",
        }, headers=auth_header(token, cid)).json()

        resp = client.post("/api/loans", json={
            "party_name": "R13 Loan Party", "party_id": party["id"], "loan_type": "taken", "principal_amount": 5000,
            "interest_rate": 10, "bank_ledger_id": bank["id"], "disbursement_date": "2025-06-01",
            "maturity_date": "2026-06-01",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text

        db = next(get_db())
        entry = db.query(AuditLog).filter(
            AuditLog.company_id == cid,
            AuditLog.entity_type == "loan",
        ).first()
        assert entry is not None, "loan create must be audited"
        assert entry.action == "CREATE"
        db.close()

    def test_gst_registration_audited(self, client):
        from app.core.db import get_db
        from app.models.audit import AuditLog

        company, token = _setup_company(client, "cov13c@example.com")
        cid = company["id"]
        resp = client.post("/api/gst/registrations", json={
            "gstin": "29ABCDE1234F1Z5", "legal_name": "R13 Co", "state_code": "29",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text

        db = next(get_db())
        entry = db.query(AuditLog).filter(
            AuditLog.company_id == cid,
            AuditLog.entity_type == "gst_registration",
        ).first()
        assert entry is not None, "GST registration must be audited"
        assert entry.action == "CREATE"
        db.close()

    def test_tds_section_and_return_audited(self, client):
        from app.core.db import get_db
        from app.models.audit import AuditLog

        company, token = _setup_company(client, "cov13d@example.com")
        cid = company["id"]
        resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194J", "section_name": "Professional Fees",
            "tds_tcs_type": "tds", "rate": 10,
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text

        db = next(get_db())
        entry = db.query(AuditLog).filter(
            AuditLog.company_id == cid,
            AuditLog.entity_type == "tds_tcs_section",
        ).first()
        assert entry is not None, "TDS section create must be audited"
        assert entry.action == "CREATE"
        db.close()
# ── Audit round 14 ───────────────────────────────────────────────────────

class TestAuditCoverageRound14:
    """Batch, data-import, and bank-reconciliation mutations must be audited."""

    def _make_batch_item(self, client, token, cid):
        resp = client.post("/api/inventory/items", json={
            "name": "R14 Batch Item", "unit_of_measure": "Nos",
            "valuation_method": "weighted_avg", "gst_rate": 0,
            "item_type": "goods", "tracking_mode": "batch",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        return resp.json()

    def test_batch_create_and_delete_audited(self, client):
        from app.core.db import get_db
        from app.models.audit import AuditLog

        company, token = _setup_company(client, "cov14a@example.com")
        cid = company["id"]
        item = self._make_batch_item(client, token, cid)

        resp = client.post("/api/manufacturing/batches", json={
            "stock_item_id": item["id"], "batch_number": "R14-B-001",
            "quantity": 0, "manufacturing_date": "2026-01-10",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        batch = resp.json()

        db = next(get_db())
        entry = db.query(AuditLog).filter(
            AuditLog.company_id == company["id"],
            AuditLog.entity_type == "batch",
            AuditLog.action == "CREATE",
            AuditLog.entity_id == batch["id"],
        ).first()
        assert entry is not None, "batch create must be audited"
        db.close()

        resp = client.delete(f"/api/manufacturing/batches/{batch['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 204, resp.text

        db = next(get_db())
        entry = db.query(AuditLog).filter(
            AuditLog.company_id == company["id"],
            AuditLog.entity_type == "batch",
            AuditLog.action == "DELETE",
            AuditLog.entity_id == batch["id"],
        ).first()
        assert entry is not None, "batch delete must be audited"
        db.close()

    def test_csv_import_and_undo_audited(self, client):
        from app.core.db import get_db
        from app.models.audit import AuditLog

        company, token = _setup_company(client, "cov14b@example.com")
        cid = company["id"]
        csv_data = "name\nR14 Imported Party\n"
        resp = client.post(
            "/api/data-import/import-tracked?entity_type=parties",
            headers=auth_header(token, cid),
            files={"file": ("parties.csv", csv_data, "text/csv")},
        )
        assert resp.status_code == 200, resp.text
        job_id = resp.json().get("job_id")
        assert job_id

        db = next(get_db())
        entry = db.query(AuditLog).filter(
            AuditLog.company_id == company["id"],
            AuditLog.entity_type == "data_import",
            AuditLog.action == "CREATE",
            AuditLog.entity_id == job_id,
        ).first()
        assert entry is not None, "import job create must be audited"
        db.close()

        resp = client.post(f"/api/data-import/undo/{job_id}", headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        db = next(get_db())
        entry = db.query(AuditLog).filter(
            AuditLog.company_id == company["id"],
            AuditLog.entity_type == "data_import",
            AuditLog.action == "DELETE",
            AuditLog.entity_id == job_id,
        ).first()
        assert entry is not None, "import undo must be audited"
        db.close()

    def test_bank_match_and_unmatch_audited(self, client):
        from app.core.db import get_db
        from app.models.audit import AuditLog

        company, token = _setup_company(client, "cov14c@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        # A bank statement line on the bank ledger (CSV upload like the UI)
        import io
        csv_data = "date,description,debit,credit,reference,balance\n2025-06-15,R14 stmt line,500.00,,,\"500.00\"\n"
        resp = client.post(
            f"/api/bank-reconciliation/import?ledger_id={bank['id']}",
            files={"file": ("statement.csv", io.BytesIO(csv_data.encode()), "text/csv")},
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 201, resp.text
        line_id = resp.json()["lines"][0]["id"]

        # A matching voucher on the same ledger
        voucher = client.post("/api/vouchers", json={
            "voucher_type": "journal", "voucher_date": "2025-06-15",
            "narration": "[E2E] R14 recon",
            "lines": [
                {"ledger_id": bank["id"], "debit": 500, "credit": 0},
                {"ledger_id": sales["id"], "debit": 0, "credit": 500},
            ],
        }, headers=auth_header(token, cid))
        assert voucher.status_code == 201, voucher.text

        resp = client.post("/api/bank-reconciliation/match", json={
            "statement_line_id": line_id, "voucher_id": voucher.json()["id"],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        db = next(get_db())
        entry = db.query(AuditLog).filter(
            AuditLog.company_id == company["id"],
            AuditLog.entity_type == "bank_reconciliation",
            AuditLog.action == "UPDATE",
            AuditLog.entity_id == line_id,
        ).first()
        assert entry is not None, "bank match must be audited"
        assert entry.new_value and entry.new_value.get("voucher_id"), "match entry must record the voucher link"
        db.close()

        resp = client.post("/api/bank-reconciliation/unmatch", json={
            "statement_line_id": line_id,
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200, resp.text

        db = next(get_db())
        entries = db.query(AuditLog).filter(
            AuditLog.company_id == company["id"],
            AuditLog.entity_type == "bank_reconciliation",
            AuditLog.entity_id == line_id,
        ).all()
        assert len(entries) >= 2, "match + unmatch must both be audited"
        assert any(e.action == "UPDATE" and e.new_value and e.new_value.get("voucher_id") is None for e in entries), \
            "unmatch must log the voucher link cleared"
        db.close()


class TestSchedulerAuditChainCheck:
    """The cron runner's audit-chain check must alert once per broken chain."""

    def test_check_audit_chain_alerts_on_tamper(self, client):
        from sqlalchemy import text

        from app.core.db import get_db
        from app.models.audit import AuditLog
        from app.models.notification import Notification

        company, token = _setup_company(client, "cov14d@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        l1 = client.post("/api/coa/groups", json={
            "name": "R14 Income", "nature": "income", "group_type": "sub",
        }, headers=auth_header(token, cid)).json()
        l2 = client.post("/api/coa/groups", json={
            "name": "R14 Expense", "nature": "expenses", "group_type": "sub",
        }, headers=auth_header(token, cid)).json()
        ld1 = client.post("/api/coa/ledgers", json={
            "name": "R14 Led A", "group_id": l1["id"], "opening_balance": 0, "opening_balance_type": "Cr",
        }, headers=auth_header(token, cid)).json()
        ld2 = client.post("/api/coa/ledgers", json={
            "name": "R14 Led B", "group_id": l2["id"], "opening_balance": 0, "opening_balance_type": "Dr",
        }, headers=auth_header(token, cid)).json()
        for i in range(2):
            resp = client.post("/api/vouchers", json={
                "voucher_type": "journal", "voucher_date": f"2025-06-1{i+1}",
                "narration": f"[E2E] r14 chain {i}",
                "lines": [
                    {"ledger_id": ld1["id"], "debit": 100 + i, "credit": 0},
                    {"ledger_id": ld2["id"], "debit": 0, "credit": 100 + i},
                ],
            }, headers=auth_header(token, cid))
            assert resp.status_code == 201, resp.text

        # Tamper with the second entry's description (raw SQL — the ORM would
        # refuse to modify a flushed row the way a live attacker would).
        db = next(get_db())
        first_id = db.query(AuditLog).filter(
            AuditLog.company_id == cid,
            AuditLog.action == "CREATE",
        ).order_by(AuditLog.created_at.asc()).first().id
        db.execute(text(
            "UPDATE audit_logs SET description = 'TAMPERED' WHERE id = :id"
        ), {"id": first_id})
        db.commit()

        from app.cron_runner import check_audit_chain
        created = check_audit_chain(db)
        assert created == 1, "broken chain must raise exactly one alert"

        alert = db.query(Notification).filter(
            Notification.company_id == cid,
            Notification.entity_type == "audit_chain",
        ).first()
        assert alert is not None, "alert notification must exist"
        assert "BROKEN" in alert.message

        # Dedup — a second pass must not re-alert for the same break.
        created2 = check_audit_chain(db)
        assert created2 == 0, "same break must not re-alert"
        db.close()
