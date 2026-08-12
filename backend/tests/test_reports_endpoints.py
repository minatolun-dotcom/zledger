"""Integration tests for report endpoints: trial balance, P&L, balance sheet (JSON + PDF/XLSX)."""
from tests.conftest import auth_header, create_company, register_user


def _setup_company(client, email: str):
    _, token = register_user(client, email)
    company = create_company(client, token)
    return company, token


def _create_fy(client, token, cid):
    resp = client.post("/api/coa/financial-years", json={
        "name": "2025-26", "start_date": "2025-04-01", "end_date": "2026-03-31",
    }, headers=auth_header(token, cid))
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


class TestTrialBalanceEndpoint:
    def test_empty_trial_balance(self, client):
        company, token = _setup_company(client, "rpt1@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        resp = client.get(f"/api/reports/trial-balance?financial_year_id={fy['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
        data = resp.json()
        # May have seeded GST ledgers, but no voucher activity
        assert data["total_debit"] == 0
        assert data["total_credit"] == 0

    def test_trial_balance_with_data(self, client):
        company, token = _setup_company(client, "rpt2@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, _, sales, purchase, bank = _create_groups_and_ledgers(client, token, cid)

        client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_number": "1", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": bank["id"], "debit": 11800, "credit": 0},
                {"ledger_id": sales["id"], "debit": 0, "credit": 10000},
            ],
        }, headers=auth_header(token, cid))

        resp = client.get(f"/api/reports/trial-balance?financial_year_id={fy['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["lines"]) >= 2

    def test_trial_balance_pdf(self, client):
        company, token = _setup_company(client, "rpt3@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        resp = client.get(f"/api/reports/trial-balance/pdf?financial_year_id={fy['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"

    def test_trial_balance_xlsx(self, client):
        company, token = _setup_company(client, "rpt4@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        resp = client.get(f"/api/reports/trial-balance/xlsx?financial_year_id={fy['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert "spreadsheetml" in resp.headers["content-type"]


    def test_trial_balance_round_off_total(self, client):
        """A fractional Auto-rounded item voucher posts a net round-off movement
        that the trial balance exposes as round_off_total (credit = round-up
        adjustment). 3 × 100.50 = 301.50 → rounds to 302 → +0.50 credit."""
        company, token = _setup_company(client, "rpt13@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "round_off_to": 0,
            "lines": [
                {"ledger_id": sales["id"], "quantity": 3, "rate": 100.5},
                {"ledger_id": bank["id"], "debit": 302, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text

        resp = client.get(f"/api/reports/trial-balance?financial_year_id={fy['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
        data = resp.json()
        assert abs(data["round_off_total"] - 0.50) < 0.011
        assert data["round_off_type"] == "Cr"

    def test_trial_balance_round_off_total_round_down(self, client):
        """Round Down posts a debit to Round Off → round_off_total is negative (Dr)."""
        company, token = _setup_company(client, "rpt14@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        # 301.50 floors to 301 → −0.50 adjustment parked as a debit.
        resp = client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "round_off_to": 2,
            "lines": [
                {"ledger_id": sales["id"], "quantity": 3, "rate": 100.5},
                {"ledger_id": bank["id"], "debit": 301, "credit": 0},
            ],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text

        resp = client.get(f"/api/reports/trial-balance?financial_year_id={fy['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
        data = resp.json()
        assert abs(data["round_off_total"] - (-0.50)) < 0.011
        assert data["round_off_type"] == "Dr"

    def test_trial_balance_round_off_total_zero_without_rounding(self, client):
        """No rounding applied → round_off_total is 0."""
        company, token = _setup_company(client, "rpt15@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": sales["id"], "quantity": 3, "rate": 100.5},
                {"ledger_id": bank["id"], "debit": 301.50, "credit": 0},
            ],
        }, headers=auth_header(token, cid))

        resp = client.get(f"/api/reports/trial-balance?financial_year_id={fy['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
        data = resp.json()
        assert data["round_off_total"] == 0


class TestProfitAndLossEndpoint:
    def test_empty_pnl(self, client):
        company, token = _setup_company(client, "rpt5@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        resp = client.get(f"/api/reports/profit-and-loss?financial_year_id={fy['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_income"] == 0
        assert data["total_expenses"] == 0

    def test_pnl_with_data(self, client):
        company, token = _setup_company(client, "rpt6@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, _, sales, purchase, bank = _create_groups_and_ledgers(client, token, cid)

        client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_number": "1", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": bank["id"], "debit": 50000, "credit": 0},
                {"ledger_id": sales["id"], "debit": 0, "credit": 50000},
            ],
        }, headers=auth_header(token, cid))

        client.post("/api/vouchers", json={
            "voucher_type": "purchase", "voucher_number": "1", "voucher_date": "2025-06-02",
            "lines": [
                {"ledger_id": purchase["id"], "debit": 30000, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 30000},
            ],
        }, headers=auth_header(token, cid))

        resp = client.get(f"/api/reports/profit-and-loss?financial_year_id={fy['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_income"] > 0
        assert data["total_expenses"] > 0
        assert "net_profit" in data
        assert "is_profit" in data

    def test_pnl_pdf(self, client):
        company, token = _setup_company(client, "rpt7@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        resp = client.get(f"/api/reports/profit-and-loss/pdf?financial_year_id={fy['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"

    def test_pnl_xlsx(self, client):
        company, token = _setup_company(client, "rpt8@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        resp = client.get(f"/api/reports/profit-and-loss/xlsx?financial_year_id={fy['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200


class TestBalanceSheetEndpoint:
    def test_empty_bs(self, client):
        company, token = _setup_company(client, "rpt9@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        resp = client.get(f"/api/reports/balance-sheet?financial_year_id={fy['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_assets"] == 0
        assert data["total_liabilities"] == 0

    def test_bs_with_data(self, client):
        company, token = _setup_company(client, "rpt10@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, asset_group, _, _, bank = _create_groups_and_ledgers(client, token, cid)
        liab_group = client.post("/api/coa/groups", json={
            "name": "Current Liabilities", "nature": "liabilities", "group_type": "sub",
        }, headers=auth_header(token, cid)).json()
        loan = client.post("/api/coa/ledgers", json={
            "name": "Loan", "group_id": liab_group["id"], "opening_balance": 0, "opening_balance_type": "Cr",
        }, headers=auth_header(token, cid)).json()

        client.post("/api/vouchers", json={
            "voucher_type": "journal", "voucher_number": "1", "voucher_date": "2025-06-01",
            "lines": [
                {"ledger_id": bank["id"], "debit": 100000, "credit": 0},
                {"ledger_id": loan["id"], "debit": 0, "credit": 100000},
            ],
        }, headers=auth_header(token, cid))

        resp = client.get(f"/api/reports/balance-sheet?financial_year_id={fy['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_assets"] > 0
        assert data["total_liabilities"] > 0

    def test_bs_round_off_total(self, client):
        """Balance sheet also exposes round_off_total for the period."""
        company, token = _setup_company(client, "rpt16@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        _, _, _, sales, _, bank = _create_groups_and_ledgers(client, token, cid)

        client.post("/api/vouchers", json={
            "voucher_type": "sales", "voucher_date": "2025-06-01",
            "round_off_to": 0,
            "lines": [
                {"ledger_id": sales["id"], "quantity": 3, "rate": 100.5},
                {"ledger_id": bank["id"], "debit": 302, "credit": 0},
            ],
        }, headers=auth_header(token, cid))

        resp = client.get(f"/api/reports/balance-sheet?financial_year_id={fy['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
        data = resp.json()
        assert abs(data["round_off_total"] - 0.50) < 0.011
        assert data["round_off_type"] == "Cr"

    def test_bs_pdf(self, client):
        company, token = _setup_company(client, "rpt11@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        resp = client.get(f"/api/reports/balance-sheet/pdf?financial_year_id={fy['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"

    def test_bs_xlsx(self, client):
        company, token = _setup_company(client, "rpt12@example.com")
        cid = company["id"]
        fy = _create_fy(client, token, cid)
        resp = client.get(f"/api/reports/balance-sheet/xlsx?financial_year_id={fy['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
