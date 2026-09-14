"""Integration tests for bank reconciliation endpoints and service."""
from __future__ import annotations

import io

from tests.conftest import auth_header, create_company, register_user


def _setup_company(client, email: str):
    _, token = register_user(client, email)
    company = create_company(client, token)
    # The company seed creates a Capital Account (SYS_CAPITAL_ACCOUNT) with 0
    # opening balance. The bank reconciliation tests set a non-zero bank opening
    # balance, which would make the books imbalanced and trigger the accounting-
    # equation gate on the first voucher. Set the capital account opening balance
    # to match so the gate passes.
    cid = company["id"]
    # Find the seeded Capital Account ledger and set its opening balance to
    # match the bank's opening balance so the accounting-equation gate passes.
    coa = client.get("/api/coa/ledgers", headers=auth_header(token, cid)).json()
    if isinstance(coa, list):
        ledgers = coa
    else:
        ledgers = coa.get("ledgers", [])
    for led in ledgers:
        if led.get("system_code") == "SYS_CAPITAL_ACCOUNT":
            # PATCH uses LedgerCreate (all fields required); include the full
            # record so only opening_balance opening_balance_type are changed.
            client.patch(
                f"/api/coa/ledgers/{led['id']}",
                json={
                    "name": led["name"],
                    "group_id": led["group_id"],
                    "opening_balance": 10000,
                    "opening_balance_type": "Cr",
                },
                headers=auth_header(token, cid),
            )
            break
    return company, token


def _create_bank_ledger(client, token, cid):
    """Create a bank ledger for testing."""
    group = client.post("/api/coa/groups", json={
        "name": "Bank Accounts", "nature": "assets", "group_type": "sub",
    }, headers=auth_header(token, cid)).json()

    ledger = client.post("/api/coa/ledgers", json={
        "name": "HDFC Bank", "group_id": group["id"],
        "opening_balance": 10000, "opening_balance_type": "Dr",
    }, headers=auth_header(token, cid)).json()

    return ledger


def _create_expense_ledger(client, token, cid):
    """Create an expense ledger for testing."""
    group = client.post("/api/coa/groups", json={
        "name": "Indirect Expenses", "nature": "expenses", "group_type": "sub",
    }, headers=auth_header(token, cid)).json()

    ledger = client.post("/api/coa/ledgers", json={
        "name": "Office Expenses", "group_id": group["id"],
        "opening_balance": 0, "opening_balance_type": "Dr",
    }, headers=auth_header(token, cid)).json()

    return ledger


SAMPLE_CSV = """date,description,debit,credit,reference,balance
2025-04-01,Opening Balance,,,,"10000.00"
2025-04-05,NEFT from Customer A,,5000.00,UTR123,"15000.00"
2025-04-10,Office Rent,3000.00,,CHQ001,"12000.00"
2025-04-15,Electricity Bill,1500.00,,,"10500.00"
2025-04-20,NEFT from Customer B,,8000.00,UTR456,"18500.00"
2025-04-25,Salary Payment,5000.00,,,"13500.00"
"""

SAMPLE_CSV_LATIN1 = """date,description,debit,credit,reference,balance
2025-04-01,Opening Balance,,,,"10000.00"
2025-04-05,Payment from客户 A,,5000.00,UTR123,"15000.00"
"""

INVALID_CSV = """wrong_column,another_wrong
data1,data2
"""

EMPTY_CSV = """date,description
"""


class TestCsvParsing:
    def test_parse_valid_csv(self):
        from app.services.bank_reconciliation import parse_bank_csv
        rows = parse_bank_csv(SAMPLE_CSV)
        assert len(rows) == 6  # includes opening balance line

    def test_parse_with_different_date_formats(self):
        from app.services.bank_reconciliation import parse_bank_csv
        csv_data = """Date,Description,Debit,Credit
05/04/2025,Rent Payment,3000.00,,
15-Apr-2025,Salary,5000.00,,
"""
        rows = parse_bank_csv(csv_data, date_format="%d/%m/%Y")
        assert len(rows) >= 1

    def test_parse_empty_csv(self):
        from app.services.bank_reconciliation import parse_bank_csv
        rows = parse_bank_csv("date,description\n")
        assert rows == []

    def test_parse_invalid_csv(self):
        from app.services.bank_reconciliation import parse_bank_csv
        import pytest
        with pytest.raises(ValueError, match="at least 'date' and 'description'"):
            parse_bank_csv(INVALID_CSV)


class TestStatementImport:
    def test_import_statement(self, client):
        company, token = _setup_company(client, "bank1@example.com")
        cid = company["id"]
        bank_ledger = _create_bank_ledger(client, token, cid)

        # Upload CSV
        import io
        csv_bytes = SAMPLE_CSV.encode("utf-8")
        resp = client.post(
            f"/api/bank-reconciliation/import?ledger_id={bank_ledger['id']}",
            files={"file": ("statement.csv", io.BytesIO(csv_bytes), "text/csv")},
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["imported_count"] == 6
        assert data["lines"][0]["description"] == "Opening Balance"

    def test_import_invalid_ledger(self, client):
        company, token = _setup_company(client, "bank2@example.com")
        cid = company["id"]

        csv_bytes = SAMPLE_CSV.encode("utf-8")
        resp = client.post(
            "/api/bank-reconciliation/import?ledger_id=nonexistent",
            files={"file": ("statement.csv", io.BytesIO(csv_bytes), "text/csv")},
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 404

    def test_import_empty_csv(self, client):
        company, token = _setup_company(client, "bank3@example.com")
        cid = company["id"]
        bank_ledger = _create_bank_ledger(client, token, cid)

        csv_bytes = EMPTY_CSV.encode("utf-8")
        resp = client.post(
            f"/api/bank-reconciliation/import?ledger_id={bank_ledger['id']}",
            files={"file": ("statement.csv", io.BytesIO(csv_bytes), "text/csv")},
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 422


class TestStatementLines:
    def test_list_lines(self, client):
        company, token = _setup_company(client, "bank4@example.com")
        cid = company["id"]
        bank_ledger = _create_bank_ledger(client, token, cid)

        # Import
        csv_bytes = SAMPLE_CSV.encode("utf-8")
        client.post(
            f"/api/bank-reconciliation/import?ledger_id={bank_ledger['id']}",
            files={"file": ("statement.csv", io.BytesIO(csv_bytes), "text/csv")},
            headers=auth_header(token, cid),
        )

        # List
        resp = client.get(
            f"/api/bank-reconciliation/lines?ledger_id={bank_ledger['id']}",
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 6

    def test_filter_unreconciled(self, client):
        company, token = _setup_company(client, "bank5@example.com")
        cid = company["id"]
        bank_ledger = _create_bank_ledger(client, token, cid)

        csv_bytes = SAMPLE_CSV.encode("utf-8")
        client.post(
            f"/api/bank-reconciliation/import?ledger_id={bank_ledger['id']}",
            files={"file": ("statement.csv", io.BytesIO(csv_bytes), "text/csv")},
            headers=auth_header(token, cid),
        )

        resp = client.get(
            f"/api/bank-reconciliation/lines?ledger_id={bank_ledger['id']}&reconciled=false",
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 6  # all unreconciled

    def test_delete_unreconciled_line(self, client):
        company, token = _setup_company(client, "bank6@example.com")
        cid = company["id"]
        bank_ledger = _create_bank_ledger(client, token, cid)

        csv_bytes = SAMPLE_CSV.encode("utf-8")
        import_resp = client.post(
            f"/api/bank-reconciliation/import?ledger_id={bank_ledger['id']}",
            files={"file": ("statement.csv", io.BytesIO(csv_bytes), "text/csv")},
            headers=auth_header(token, cid),
        )
        line_id = import_resp.json()["lines"][0]["id"]

        resp = client.delete(
            f"/api/bank-reconciliation/lines/{line_id}",
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 204


class TestMatching:
    def test_match_statement_to_voucher(self, client):
        company, token = _setup_company(client, "bank7@example.com")
        cid = company["id"]
        bank_ledger = _create_bank_ledger(client, token, cid)
        expense_ledger = _create_expense_ledger(client, token, cid)

        # Import statement
        csv_bytes = SAMPLE_CSV.encode("utf-8")
        import_resp = client.post(
            f"/api/bank-reconciliation/import?ledger_id={bank_ledger['id']}",
            files={"file": ("statement.csv", io.BytesIO(csv_bytes), "text/csv")},
            headers=auth_header(token, cid),
        )
        lines = import_resp.json()["lines"]
        # Find the rent line (debit 3000)
        rent_line = next(l for l in lines if "Rent" in l["description"])

        # Create a matching voucher (payment)
        vch_resp = client.post("/api/vouchers", json={
            "voucher_type": "payment",
            "voucher_number": "BP001",
            "voucher_date": "2025-04-10",
            "narration": "Office rent payment",
            "lines": [
                {"ledger_id": expense_ledger["id"], "debit": 3000, "credit": 0},
                {"ledger_id": bank_ledger["id"], "debit": 0, "credit": 3000},
            ],
        }, headers=auth_header(token, cid))
        assert vch_resp.status_code == 201
        voucher_id = vch_resp.json()["id"]

        # Match
        resp = client.post("/api/bank-reconciliation/match", json={
            "statement_line_id": rent_line["id"],
            "voucher_id": voucher_id,
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.json()["is_reconciled"] is True
        assert resp.json()["voucher_id"] == voucher_id

    def test_match_amount_mismatch(self, client):
        company, token = _setup_company(client, "bank8@example.com")
        cid = company["id"]
        bank_ledger = _create_bank_ledger(client, token, cid)
        expense_ledger = _create_expense_ledger(client, token, cid)

        csv_bytes = SAMPLE_CSV.encode("utf-8")
        import_resp = client.post(
            f"/api/bank-reconciliation/import?ledger_id={bank_ledger['id']}",
            files={"file": ("statement.csv", io.BytesIO(csv_bytes), "text/csv")},
            headers=auth_header(token, cid),
        )
        rent_line = next(l for l in import_resp.json()["lines"] if "Rent" in l["description"])

        # Create voucher with different amount
        vch_resp = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_number": "BP002", "voucher_date": "2025-04-10",
            "lines": [
                {"ledger_id": expense_ledger["id"], "debit": 5000, "credit": 0},
                {"ledger_id": bank_ledger["id"], "debit": 0, "credit": 5000},
            ],
        }, headers=auth_header(token, cid))
        voucher_id = vch_resp.json()["id"]

        resp = client.post("/api/bank-reconciliation/match", json={
            "statement_line_id": rent_line["id"],
            "voucher_id": voucher_id,
        }, headers=auth_header(token, cid))
        assert resp.status_code == 422
        assert "mismatch" in resp.json()["detail"].lower()

    def test_unmatch(self, client):
        company, token = _setup_company(client, "bank9@example.com")
        cid = company["id"]
        bank_ledger = _create_bank_ledger(client, token, cid)
        expense_ledger = _create_expense_ledger(client, token, cid)

        csv_bytes = SAMPLE_CSV.encode("utf-8")
        import_resp = client.post(
            f"/api/bank-reconciliation/import?ledger_id={bank_ledger['id']}",
            files={"file": ("statement.csv", io.BytesIO(csv_bytes), "text/csv")},
            headers=auth_header(token, cid),
        )
        rent_line = next(l for l in import_resp.json()["lines"] if "Rent" in l["description"])

        vch_resp = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_number": "BP003", "voucher_date": "2025-04-10",
            "lines": [
                {"ledger_id": expense_ledger["id"], "debit": 3000, "credit": 0},
                {"ledger_id": bank_ledger["id"], "debit": 0, "credit": 3000},
            ],
        }, headers=auth_header(token, cid))
        voucher_id = vch_resp.json()["id"]

        # Match
        client.post("/api/bank-reconciliation/match", json={
            "statement_line_id": rent_line["id"],
            "voucher_id": voucher_id,
        }, headers=auth_header(token, cid))

        # Unmatch
        resp = client.post("/api/bank-reconciliation/unmatch", json={
            "statement_line_id": rent_line["id"],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.json()["is_reconciled"] is False
        assert resp.json()["voucher_id"] is None


class TestSuggestMatches:
    def test_suggest_matches(self, client):
        company, token = _setup_company(client, "bank10@example.com")
        cid = company["id"]
        bank_ledger = _create_bank_ledger(client, token, cid)
        expense_ledger = _create_expense_ledger(client, token, cid)

        csv_bytes = SAMPLE_CSV.encode("utf-8")
        import_resp = client.post(
            f"/api/bank-reconciliation/import?ledger_id={bank_ledger['id']}",
            files={"file": ("statement.csv", io.BytesIO(csv_bytes), "text/csv")},
            headers=auth_header(token, cid),
        )
        rent_line = next(l for l in import_resp.json()["lines"] if "Rent" in l["description"])

        # Create a matching voucher
        client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_number": "BP010", "voucher_date": "2025-04-10",
            "narration": "Office rent",
            "lines": [
                {"ledger_id": expense_ledger["id"], "debit": 3000, "credit": 0},
                {"ledger_id": bank_ledger["id"], "debit": 0, "credit": 3000},
            ],
        }, headers=auth_header(token, cid))

        # Suggest
        resp = client.get(
            f"/api/bank-reconciliation/suggest/{rent_line['id']}",
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 200
        candidates = resp.json()
        assert len(candidates) >= 1
        assert candidates[0]["amount"] == 3000.0


class TestSummary:
    def test_summary(self, client):
        company, token = _setup_company(client, "bank11@example.com")
        cid = company["id"]
        bank_ledger = _create_bank_ledger(client, token, cid)

        csv_bytes = SAMPLE_CSV.encode("utf-8")
        client.post(
            f"/api/bank-reconciliation/import?ledger_id={bank_ledger['id']}",
            files={"file": ("statement.csv", io.BytesIO(csv_bytes), "text/csv")},
            headers=auth_header(token, cid),
        )

        resp = client.get(
            f"/api/bank-reconciliation/summary?ledger_id={bank_ledger['id']}",
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_lines"] == 6
        assert data["reconciled_count"] == 0
        assert data["unreconciled_count"] == 6


class TestReconciliationSession:
    def test_create_session(self, client):
        company, token = _setup_company(client, "bank12@example.com")
        cid = company["id"]
        bank_ledger = _create_bank_ledger(client, token, cid)

        resp = client.post("/api/bank-reconciliation/sessions", json={
            "ledger_id": bank_ledger["id"],
            "statement_date": "2025-04-30",
            "opening_balance": 10000,
            "closing_balance": 13500,
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert data["statement_date"] == "2025-04-30"
        assert data["is_finalized"] is False

    def test_duplicate_session_rejected(self, client):
        company, token = _setup_company(client, "bank13@example.com")
        cid = company["id"]
        bank_ledger = _create_bank_ledger(client, token, cid)

        client.post("/api/bank-reconciliation/sessions", json={
            "ledger_id": bank_ledger["id"],
            "statement_date": "2025-04-30",
            "opening_balance": 10000,
            "closing_balance": 13500,
        }, headers=auth_header(token, cid))

        resp = client.post("/api/bank-reconciliation/sessions", json={
            "ledger_id": bank_ledger["id"],
            "statement_date": "2025-04-30",
            "opening_balance": 10000,
            "closing_balance": 13500,
        }, headers=auth_header(token, cid))
        assert resp.status_code == 409

    def test_finalize_session(self, client):
        company, token = _setup_company(client, "bank14@example.com")
        cid = company["id"]
        bank_ledger = _create_bank_ledger(client, token, cid)

        create_resp = client.post("/api/bank-reconciliation/sessions", json={
            "ledger_id": bank_ledger["id"],
            "statement_date": "2025-04-30",
            "opening_balance": 10000,
            "closing_balance": 13500,
        }, headers=auth_header(token, cid))
        session_id = create_resp.json()["id"]

        resp = client.patch(
            f"/api/bank-reconciliation/sessions/{session_id}/finalize",
            json={"closing_balance": 14000},
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 200
        assert resp.json()["is_finalized"] is True
        assert resp.json()["closing_balance"] == 14000

    def test_list_sessions(self, client):
        company, token = _setup_company(client, "bank15@example.com")
        cid = company["id"]
        bank_ledger = _create_bank_ledger(client, token, cid)

        client.post("/api/bank-reconciliation/sessions", json={
            "ledger_id": bank_ledger["id"],
            "statement_date": "2025-03-31",
            "opening_balance": 8000,
            "closing_balance": 10000,
        }, headers=auth_header(token, cid))

        client.post("/api/bank-reconciliation/sessions", json={
            "ledger_id": bank_ledger["id"],
            "statement_date": "2025-04-30",
            "opening_balance": 10000,
            "closing_balance": 13500,
        }, headers=auth_header(token, cid))

        resp = client.get(
            f"/api/bank-reconciliation/sessions?ledger_id={bank_ledger['id']}",
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 2


class TestUnauthorized:
    def test_unauthenticated(self, client):
        resp = client.get("/api/bank-reconciliation/lines?ledger_id=test")
        assert resp.status_code in (401, 403)

    def test_wrong_company(self, client):
        _, token1 = _setup_company(client, "bank16@example.com")
        company2, token2 = _setup_company(client, "bank17@example.com")

        resp = client.get(
            "/api/bank-reconciliation/lines?ledger_id=test",
            headers=auth_header(token1, company2["id"]),
        )
        assert resp.status_code in (403, 404)
