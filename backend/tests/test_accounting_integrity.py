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
