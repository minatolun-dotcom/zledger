"""Integration tests for TDS/TCS endpoints and service."""
from __future__ import annotations

from tests.conftest import auth_header, create_company, register_user


def _setup_company(client, email: str):
    _, token = register_user(client, email)
    company = create_company(client, token)
    return company, token


def _create_bank_ledger(client, token, cid):
    group = client.post("/api/coa/groups", json={
        "name": "Bank Accounts", "nature": "assets", "group_type": "sub",
    }, headers=auth_header(token, cid)).json()
    return client.post("/api/coa/ledgers", json={
        "name": "HDFC Bank", "group_id": group["id"],
        "opening_balance": 100000, "opening_balance_type": "Dr",
    }, headers=auth_header(token, cid)).json()


def _create_expense_ledger(client, token, cid):
    group = client.post("/api/coa/groups", json={
        "name": "Indirect Expenses", "nature": "expenses", "group_type": "sub",
    }, headers=auth_header(token, cid)).json()
    return client.post("/api/coa/ledgers", json={
        "name": "Professional Fees", "group_id": group["id"],
        "opening_balance": 0, "opening_balance_type": "Dr",
    }, headers=auth_header(token, cid)).json()


def _create_tds_liability_ledger(client, token, cid):
    group = client.post("/api/coa/groups", json={
        "name": "Duties & Taxes", "nature": "liabilities", "group_type": "sub",
    }, headers=auth_header(token, cid)).json()
    return client.post("/api/coa/ledgers", json={
        "name": "TDS Payable", "group_id": group["id"],
        "opening_balance": 0, "opening_balance_type": "Cr",
    }, headers=auth_header(token, cid)).json()


def _create_party(client, token, cid):
    return client.post("/api/coa/parties", json={
        "name": "ABC Consultants", "party_type": "supplier",
    }, headers=auth_header(token, cid)).json()


class TestTdsTcsSections:
    def test_seed_sections(self, client):
        company, token = _setup_company(client, "tds1@example.com")
        cid = company["id"]

        resp = client.post("/api/tds-tcs/sections/seed", headers=auth_header(token, cid))
        assert resp.status_code == 201

        resp = client.get("/api/tds-tcs/sections", headers=auth_header(token, cid))
        assert resp.status_code == 200
        sections = resp.json()
        assert len(sections) >= 10  # Common sections seeded
        codes = {s["section_code"] for s in sections}
        assert "194C-I" in codes
        assert "194J" in codes

    def test_create_section(self, client):
        company, token = _setup_company(client, "tds2@example.com")
        cid = company["id"]

        resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194Q",
            "section_name": "TDS on Purchase of Goods",
            "tds_tcs_type": "tds",
            "rate": 0.1,
            "threshold_limit": 5000000,
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert data["section_code"] == "194Q"
        assert data["rate"] == 0.1

    def test_delete_section(self, client):
        company, token = _setup_company(client, "tds3@example.com")
        cid = company["id"]

        create_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194X",
            "section_name": "Test Section",
            "tds_tcs_type": "tds",
            "rate": 5.0,
            "threshold_limit": 0,
        }, headers=auth_header(token, cid))
        section_id = create_resp.json()["id"]

        resp = client.delete(f"/api/tds-tcs/sections/{section_id}", headers=auth_header(token, cid))
        assert resp.status_code == 204

    def test_list_filter_by_type(self, client):
        company, token = _setup_company(client, "tds4@example.com")
        cid = company["id"]

        client.post("/api/tds-tcs/sections/seed", headers=auth_header(token, cid))

        resp = client.get("/api/tds-tcs/sections?tds_tcs_type=tcs", headers=auth_header(token, cid))
        assert resp.status_code == 200
        for s in resp.json():
            assert s["tds_tcs_type"] == "tcs"


class TestTdsTcsEntries:
    def test_create_entry(self, client):
        company, token = _setup_company(client, "tds5@example.com")
        cid = company["id"]
        bank = _create_bank_ledger(client, token, cid)
        expense = _create_expense_ledger(client, token, cid)
        tds_liability = _create_tds_liability_ledger(client, token, cid)
        party = _create_party(client, token, cid)

        # Create section
        section_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194J",
            "section_name": "Professional Fees",
            "tds_tcs_type": "tds",
            "rate": 10.0,
            "threshold_limit": 30000,
        }, headers=auth_header(token, cid))
        section_id = section_resp.json()["id"]

        # Create voucher
        vch_resp = client.post("/api/vouchers", json={
            "voucher_type": "payment",
            "voucher_number": "BP100",
            "voucher_date": "2025-04-15",
            "narration": "Professional fees",
            "lines": [
                {"ledger_id": expense["id"], "debit": 50000, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 50000},
            ],
        }, headers=auth_header(token, cid))
        voucher_id = vch_resp.json()["id"]

        # Create TDS entry
        resp = client.post("/api/tds-tcs/entries", json={
            "voucher_id": voucher_id,
            "party_id": party["id"],
            "section_id": section_id,
            "base_amount": 50000,
            "entry_date": "2025-04-15",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert data["deducted_amount"] == 5000.0  # 10% of 50000
        assert data["rate"] == 10.0
        assert data["status"] == "pending"

    def test_entry_below_threshold(self, client):
        company, token = _setup_company(client, "tds6@example.com")
        cid = company["id"]
        bank = _create_bank_ledger(client, token, cid)
        expense = _create_expense_ledger(client, token, cid)
        party = _create_party(client, token, cid)

        section_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194C",
            "section_name": "Contractors",
            "tds_tcs_type": "tds",
            "rate": 1.0,
            "threshold_limit": 30000,
        }, headers=auth_header(token, cid))
        section_id = section_resp.json()["id"]

        vch_resp = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_number": "BP101", "voucher_date": "2025-04-15",
            "lines": [
                {"ledger_id": expense["id"], "debit": 20000, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 20000},
            ],
        }, headers=auth_header(token, cid))
        voucher_id = vch_resp.json()["id"]

        resp = client.post("/api/tds-tcs/entries", json={
            "voucher_id": voucher_id,
            "section_id": section_id,
            "base_amount": 20000,
            "entry_date": "2025-04-15",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        assert resp.json()["deducted_amount"] == 0  # Below threshold

    def test_list_entries(self, client):
        company, token = _setup_company(client, "tds7@example.com")
        cid = company["id"]
        bank = _create_bank_ledger(client, token, cid)
        expense = _create_expense_ledger(client, token, cid)

        section_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194J", "section_name": "Professional", "tds_tcs_type": "tds", "rate": 10.0, "threshold_limit": 0,
        }, headers=auth_header(token, cid))
        section_id = section_resp.json()["id"]

        vch_resp = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_number": "BP102", "voucher_date": "2025-04-15",
            "lines": [
                {"ledger_id": expense["id"], "debit": 10000, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 10000},
            ],
        }, headers=auth_header(token, cid))

        client.post("/api/tds-tcs/entries", json={
            "voucher_id": vch_resp.json()["id"], "section_id": section_id,
            "base_amount": 10000, "entry_date": "2025-04-15",
        }, headers=auth_header(token, cid))

        resp = client.get("/api/tds-tcs/entries", headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestDeposit:
    def test_deposit_entries(self, client):
        company, token = _setup_company(client, "tds8@example.com")
        cid = company["id"]
        bank = _create_bank_ledger(client, token, cid)
        expense = _create_expense_ledger(client, token, cid)

        section_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194J", "section_name": "Professional", "tds_tcs_type": "tds", "rate": 10.0, "threshold_limit": 0,
        }, headers=auth_header(token, cid))
        section_id = section_resp.json()["id"]

        vch_resp = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_number": "BP103", "voucher_date": "2025-04-15",
            "lines": [
                {"ledger_id": expense["id"], "debit": 10000, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 10000},
            ],
        }, headers=auth_header(token, cid))

        entry_resp = client.post("/api/tds-tcs/entries", json={
            "voucher_id": vch_resp.json()["id"], "section_id": section_id,
            "base_amount": 10000, "entry_date": "2025-04-15",
        }, headers=auth_header(token, cid))
        entry_id = entry_resp.json()["id"]

        resp = client.post("/api/tds-tcs/deposit", json={
            "entry_ids": [entry_id],
            "challan_number": "CHALLAN001",
            "deposition_date": "2025-04-20",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200
        data = resp.json()
        assert data[0]["status"] == "deposited"
        assert data[0]["challan_number"] == "CHALLAN001"


class TestReturns:
    def test_generate_return(self, client):
        company, token = _setup_company(client, "tds9@example.com")
        cid = company["id"]
        bank = _create_bank_ledger(client, token, cid)
        expense = _create_expense_ledger(client, token, cid)

        section_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194J", "section_name": "Professional", "tds_tcs_type": "tds", "rate": 10.0, "threshold_limit": 0,
        }, headers=auth_header(token, cid))
        section_id = section_resp.json()["id"]

        vch_resp = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_number": "BP104", "voucher_date": "2025-04-15",
            "lines": [
                {"ledger_id": expense["id"], "debit": 10000, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 10000},
            ],
        }, headers=auth_header(token, cid))

        entry_resp = client.post("/api/tds-tcs/entries", json={
            "voucher_id": vch_resp.json()["id"], "section_id": section_id,
            "base_amount": 10000, "entry_date": "2025-05-15",
        }, headers=auth_header(token, cid))
        entry_id = entry_resp.json()["id"]

        # Deposit first
        client.post("/api/tds-tcs/deposit", json={
            "entry_ids": [entry_id],
            "challan_number": "CH001",
            "deposition_date": "2025-06-10",
        }, headers=auth_header(token, cid))

        # Generate return
        resp = client.post("/api/tds-tcs/returns", json={
            "return_type": "tds",
            "quarter": "Q1",
            "financial_year": "2025-26",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert data["total_entries"] == 1
        assert data["total_tax"] == 1000.0
        assert data["status"] == "draft"

    def test_file_return(self, client):
        company, token = _setup_company(client, "tds10@example.com")
        cid = company["id"]
        bank = _create_bank_ledger(client, token, cid)
        expense = _create_expense_ledger(client, token, cid)

        section_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194J", "section_name": "Professional", "tds_tcs_type": "tds", "rate": 10.0, "threshold_limit": 0,
        }, headers=auth_header(token, cid))
        section_id = section_resp.json()["id"]

        vch_resp = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_number": "BP105", "voucher_date": "2025-04-15",
            "lines": [
                {"ledger_id": expense["id"], "debit": 10000, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 10000},
            ],
        }, headers=auth_header(token, cid))

        entry_resp = client.post("/api/tds-tcs/entries", json={
            "voucher_id": vch_resp.json()["id"], "section_id": section_id,
            "base_amount": 10000, "entry_date": "2025-05-01",
        }, headers=auth_header(token, cid))

        client.post("/api/tds-tcs/deposit", json={
            "entry_ids": [entry_resp.json()["id"]],
            "challan_number": "CH002",
            "deposition_date": "2025-06-10",
        }, headers=auth_header(token, cid))

        ret_resp = client.post("/api/tds-tcs/returns", json={
            "return_type": "tds", "quarter": "Q1", "financial_year": "2025-26",
        }, headers=auth_header(token, cid))
        return_id = ret_resp.json()["id"]

        resp = client.patch(f"/api/tds-tcs/returns/{return_id}/file", json={
            "ack_number": "ACK123456",
            "filing_date": "2025-07-15",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.json()["status"] == "filed"
        assert resp.json()["ack_number"] == "ACK123456"


class TestSummary:
    def test_summary(self, client):
        company, token = _setup_company(client, "tds11@example.com")
        cid = company["id"]

        resp = client.get("/api/tds-tcs/summary", headers=auth_header(token, cid))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_entries"] == 0
        assert data["pending_amount"] == 0


class TestCalculate:
    def test_calculate(self, client):
        company, token = _setup_company(client, "tds12@example.com")
        cid = company["id"]

        section_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194J", "section_name": "Professional", "tds_tcs_type": "tds", "rate": 10.0, "threshold_limit": 30000,
        }, headers=auth_header(token, cid))
        section_id = section_resp.json()["id"]

        resp = client.get(
            f"/api/tds-tcs/calculate?section_id={section_id}&base_amount=50000",
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["calculated_amount"] == 5000.0
        assert data["is_applicable"] is True

    def test_calculate_below_threshold(self, client):
        company, token = _setup_company(client, "tds13@example.com")
        cid = company["id"]

        section_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194J", "section_name": "Professional", "tds_tcs_type": "tds", "rate": 10.0, "threshold_limit": 30000,
        }, headers=auth_header(token, cid))
        section_id = section_resp.json()["id"]

        resp = client.get(
            f"/api/tds-tcs/calculate?section_id={section_id}&base_amount=20000",
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["calculated_amount"] == 0
        assert data["is_applicable"] is False


class TestUnauthorized:
    def test_unauthenticated(self, client):
        resp = client.get("/api/tds-tcs/sections")
        assert resp.status_code in (401, 403)
