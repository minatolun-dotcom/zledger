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

    def _make_credit_note(self, client, token, cid, sales, bank, amount=500):
        resp = client.post("/api/vouchers", json={
            "voucher_type": "credit_note", "voucher_date": "2025-06-03",
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

        cn = self._make_credit_note(client, token, cid, sales, bank, amount=500)

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

        cn = self._make_credit_note(client, token, cid, sales, bank, amount=100)
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

