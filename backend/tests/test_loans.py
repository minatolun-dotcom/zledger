"""Tests for Loans & Advances API endpoints."""
from __future__ import annotations

from tests.conftest import auth_header, create_company, register_user


def _setup(client, email: str = "loan@example.com"):
    """Register user, create company, enable loans module, return (token, company_id, headers)."""
    user, token = register_user(client, email)
    co = create_company(client, token, "Loan Test Co")
    cid = co["id"]
    # Enable the loans module on the company (it's gated by require_module)
    resp = client.patch(f"/api/companies/{cid}", json={"modules": ["core", "reports", "loans"]},
                        headers=auth_header(token, cid))
    assert resp.status_code == 200
    headers = auth_header(token, cid)
    return token, cid, headers


def _bank_ledger(client, headers: dict) -> str:
    """Get a Cash ledger ID for the company (needed for bank_ledger_id)."""
    resp = client.get("/api/coa/ledgers", headers=headers)
    assert resp.status_code == 200
    for l in resp.json():
        if l["name"] == "Cash":
            return l["id"]
    raise RuntimeError("No Cash ledger found in test company")


def _create_loan(client, headers: dict, bank_id: str, **overrides) -> dict:
    """Create a loan given and return the response body."""
    payload = {
        "loan_type": "given",
        "party_name": "Test Borrower",
        "principal_amount": 100000,
        "interest_rate": 12,
        "interest_type": "simple",
        "disbursement_date": "2026-01-15",
        "due_date": "2026-12-31",
        "emi_amount": 10000,
        "bank_ledger_id": bank_id,
    }
    payload.update(overrides)
    resp = client.post("/api/loans", json=payload, headers=headers)
    assert resp.status_code == 201
    return resp.json()


# ── Create ──────────────────────────────────────────────────────────────


def test_create_loan_given(client):
    _, _, h = _setup(client, "loancr1@example.com")
    bid = _bank_ledger(client, h)
    data = _create_loan(client, h, bid)
    assert data["loan_type"] == "given"
    assert data["party_name"] == "Test Borrower"
    assert float(data["principal_amount"]) == 100000
    assert data["status"] == "active"
    assert float(data["outstanding_balance"]) == 100000
    assert data["disbursement_voucher_id"] is not None


def test_create_loan_taken(client):
    _, _, h = _setup(client, "loancr2@example.com")
    bid = _bank_ledger(client, h)
    data = _create_loan(client, h, bid, loan_type="taken", party_name="HDFC Bank",
                        principal_amount=500000, interest_rate=9, interest_type="compound")
    assert data["loan_type"] == "taken"
    assert float(data["principal_amount"]) == 500000


def test_create_loan_employee_advance(client):
    _, _, h = _setup(client, "loancr3@example.com")
    bid = _bank_ledger(client, h)
    data = _create_loan(client, h, bid, loan_type="employee_advance", party_name="John Doe")
    assert data["loan_type"] == "employee_advance"


def test_create_loan_invalid_bank_ledger(client):
    _, _, h = _setup(client, "loancr4@example.com")
    resp = client.post("/api/loans", json={
        "loan_type": "given", "party_name": "X", "principal_amount": 10000,
        "interest_rate": 0, "interest_type": "none", "disbursement_date": "2026-01-01",
        "emi_amount": 0, "bank_ledger_id": "nonexistent-id",
    }, headers=h)
    assert resp.status_code == 400


def test_create_loan_missing_required_fields(client):
    _, _, h = _setup(client, "loancr5@example.com")
    resp = client.post("/api/loans", json={}, headers=h)
    assert resp.status_code == 422


def test_create_loan_wrong_company(client):
    """A loan created with a bank ledger from a different company should fail."""
    _, _, h = _setup(client, "loancr6@example.com")
    resp = client.post("/api/loans", json={
        "loan_type": "given", "party_name": "X", "principal_amount": 10000,
        "interest_rate": 0, "interest_type": "none", "disbursement_date": "2026-01-01",
        "emi_amount": 0, "bank_ledger_id": "fake-ledger-id",
    }, headers=h)
    assert resp.status_code == 400


# ── List ────────────────────────────────────────────────────────────────


def test_list_loans_empty(client):
    _, _, h = _setup(client, "loanlst1@example.com")
    resp = client.get("/api/loans", headers=h)
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


def test_list_loans(client):
    _, _, h = _setup(client, "loanlst2@example.com")
    bid = _bank_ledger(client, h)
    _create_loan(client, h, bid, party_name="Alice")
    _create_loan(client, h, bid, party_name="Bob", loan_type="taken")
    resp = client.get("/api/loans", headers=h)
    assert resp.status_code == 200
    assert resp.json()["total"] == 2


def test_list_loans_filter_by_type(client):
    _, _, h = _setup(client, "loanlst3@example.com")
    bid = _bank_ledger(client, h)
    _create_loan(client, h, bid, party_name="A")
    _create_loan(client, h, bid, party_name="B", loan_type="taken")
    resp = client.get("/api/loans?loan_type=given", headers=h)
    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["loan_type"] == "given"


# ── Get detail ──────────────────────────────────────────────────────────


def test_get_loan(client):
    _, _, h = _setup(client, "loanget1@example.com")
    bid = _bank_ledger(client, h)
    loan = _create_loan(client, h, bid)
    resp = client.get(f"/api/loans/{loan['id']}", headers=h)
    assert resp.status_code == 200
    assert resp.json()["id"] == loan["id"]
    assert float(resp.json()["accrued_interest"]) > 0


def test_get_loan_not_found(client):
    _, _, h = _setup(client, "loanget2@example.com")
    resp = client.get("/api/loans/nonexistent-id", headers=h)
    assert resp.status_code == 404


def test_get_loan_wrong_company(client):
    _, _, h1 = _setup(client, "loanget3@example.com")
    bid = _bank_ledger(client, h1)
    loan = _create_loan(client, h1, bid)
    # Create a second company
    _, token2, h2 = _setup(client, "loanget4@example.com")
    resp = client.get(f"/api/loans/{loan['id']}", headers=h2)
    assert resp.status_code == 404


# ── Update ──────────────────────────────────────────────────────────────


def test_update_loan(client):
    _, _, h = _setup(client, "loanupd1@example.com")
    bid = _bank_ledger(client, h)
    loan = _create_loan(client, h, bid)
    resp = client.patch(f"/api/loans/{loan['id']}", json={"notes": "Updated note"}, headers=h)
    assert resp.status_code == 200
    assert resp.json()["notes"] == "Updated note"


def test_update_loan_close(client):
    _, _, h = _setup(client, "loanupd2@example.com")
    bid = _bank_ledger(client, h)
    loan = _create_loan(client, h, bid)
    resp = client.patch(f"/api/loans/{loan['id']}", json={"status": "closed"}, headers=h)
    assert resp.status_code == 200
    assert resp.json()["status"] == "closed"


# ── Delete ──────────────────────────────────────────────────────────────


def test_delete_loan(client):
    _, _, h = _setup(client, "loandel1@example.com")
    bid = _bank_ledger(client, h)
    loan = _create_loan(client, h, bid)
    resp = client.delete(f"/api/loans/{loan['id']}", headers=h)
    assert resp.status_code == 204
    # Verify gone
    resp = client.get(f"/api/loans/{loan['id']}", headers=h)
    assert resp.status_code == 404


def test_delete_loan_with_payments_blocked(client):
    _, _, h = _setup(client, "loandel2@example.com")
    bid = _bank_ledger(client, h)
    loan = _create_loan(client, h, bid)
    # Record a payment first
    resp = client.post(f"/api/loans/{loan['id']}/payments", json={
        "total_amount": 5000, "payment_date": "2026-02-15", "bank_ledger_id": bid,
    }, headers=h)
    assert resp.status_code == 201
    # Now try to delete
    resp = client.delete(f"/api/loans/{loan['id']}", headers=h)
    assert resp.status_code == 400
    assert "payments" in resp.json()["detail"].lower()


# ── Payments ────────────────────────────────────────────────────────────


def test_record_payment(client):
    _, _, h = _setup(client, "loanpay1@example.com")
    bid = _bank_ledger(client, h)
    loan = _create_loan(client, h, bid)
    resp = client.post(f"/api/loans/{loan['id']}/payments", json={
        "total_amount": 10000, "payment_date": "2026-02-15", "bank_ledger_id": bid,
    }, headers=h)
    assert resp.status_code == 201
    data = resp.json()
    assert float(data["total_amount"]) == 10000
    assert data["interest_portion"] > 0
    assert data["principal_portion"] > 0
    assert data["voucher_id"] is not None
    # Interest + principal should equal total
    assert abs(data["interest_portion"] + data["principal_portion"] - 10000) < 0.01


def test_payment_reduces_outstanding(client):
    _, _, h = _setup(client, "loanpay2@example.com")
    bid = _bank_ledger(client, h)
    loan = _create_loan(client, h, bid, principal_amount=100000)
    client.post(f"/api/loans/{loan['id']}/payments", json={
        "total_amount": 10000, "payment_date": "2026-02-15", "bank_ledger_id": bid,
    }, headers=h)
    detail = client.get(f"/api/loans/{loan['id']}", headers=h).json()
    assert float(detail["outstanding_balance"]) < 100000


def test_payment_on_closed_loan_fails(client):
    _, _, h = _setup(client, "loanpay3@example.com")
    bid = _bank_ledger(client, h)
    loan = _create_loan(client, h, bid)
    client.patch(f"/api/loans/{loan['id']}", json={"status": "closed"}, headers=h)
    resp = client.post(f"/api/loans/{loan['id']}/payments", json={
        "total_amount": 5000, "payment_date": "2026-03-01", "bank_ledger_id": bid,
    }, headers=h)
    assert resp.status_code == 400
    assert "closed" in resp.json()["detail"].lower()


def test_manual_interest_split(client):
    _, _, h = _setup(client, "loanpay4@example.com")
    bid = _bank_ledger(client, h)
    loan = _create_loan(client, h, bid)
    resp = client.post(f"/api/loans/{loan['id']}/payments", json={
        "total_amount": 10000, "payment_date": "2026-02-15",
        "bank_ledger_id": bid, "is_manual_interest": True, "interest_portion": 3000,
    }, headers=h)
    assert resp.status_code == 201
    data = resp.json()
    assert data["interest_portion"] == 3000
    assert data["principal_portion"] == 7000


def test_list_payments(client):
    _, _, h = _setup(client, "loanpay5@example.com")
    bid = _bank_ledger(client, h)
    loan = _create_loan(client, h, bid)
    client.post(f"/api/loans/{loan['id']}/payments", json={
        "total_amount": 5000, "payment_date": "2026-02-15", "bank_ledger_id": bid,
    }, headers=h)
    client.post(f"/api/loans/{loan['id']}/payments", json={
        "total_amount": 5000, "payment_date": "2026-03-15", "bank_ledger_id": bid,
    }, headers=h)
    resp = client.get(f"/api/loans/{loan['id']}/payments", headers=h)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


# ── Summary ─────────────────────────────────────────────────────────────


def test_summary(client):
    _, _, h = _setup(client, "loansum1@example.com")
    bid = _bank_ledger(client, h)
    _create_loan(client, h, bid, principal_amount=100000, party_name="A")
    _create_loan(client, h, bid, loan_type="taken", principal_amount=200000, party_name="B")
    resp = client.get("/api/loans/summary", headers=h)
    assert resp.status_code == 200
    data = resp.json()
    assert float(data["total_given"]) == 100000
    assert float(data["total_taken"]) == 200000
    assert float(data["outstanding_given"]) == 100000
    assert float(data["outstanding_taken"]) == 200000


# ── Interest ────────────────────────────────────────────────────────────


def test_interest_simple(client):
    _, _, h = _setup(client, "loanint1@example.com")
    bid = _bank_ledger(client, h)
    loan = _create_loan(client, h, bid, principal_amount=100000, interest_rate=12,
                        interest_type="simple", disbursement_date="2026-01-01")
    resp = client.get(f"/api/loans/{loan['id']}/interest?as_of=2026-07-01", headers=h)
    assert resp.status_code == 200
    data = resp.json()
    # 12% of 100000 for 181 days = ~5958.90
    assert data["accrued_interest"] > 5000
    assert data["accrued_interest"] < 7000


def test_interest_compound(client):
    _, _, h = _setup(client, "loanint2@example.com")
    bid = _bank_ledger(client, h)
    loan = _create_loan(client, h, bid, principal_amount=100000, interest_rate=12,
                        interest_type="compound", disbursement_date="2026-01-01")
    resp = client.get(f"/api/loans/{loan['id']}/interest?as_of=2026-07-01", headers=h)
    assert resp.status_code == 200
    assert resp.json()["accrued_interest"] > 0


def test_interest_none(client):
    _, _, h = _setup(client, "loanint3@example.com")
    bid = _bank_ledger(client, h)
    loan = _create_loan(client, h, bid, interest_rate=0, interest_type="none")
    resp = client.get(f"/api/loans/{loan['id']}/interest?as_of=2026-07-01", headers=h)
    assert resp.status_code == 200
    assert resp.json()["accrued_interest"] == 0


# ── Auto-close on full payment ──────────────────────────────────────────


def test_auto_close_on_full_payment(client):
    _, _, h = _setup(client, "loanauto1@example.com")
    bid = _bank_ledger(client, h)
    loan = _create_loan(client, h, bid, principal_amount=1000, interest_rate=0,
                        interest_type="none")
    # Pay enough to close the loan (principal + any interest)
    client.post(f"/api/loans/{loan['id']}/payments", json={
        "total_amount": 2000, "payment_date": "2026-06-01", "bank_ledger_id": bid,
    }, headers=h)
    detail = client.get(f"/api/loans/{loan['id']}", headers=h).json()
    assert detail["status"] == "closed"
    assert float(detail["outstanding_balance"]) == 0


# ── No auth ─────────────────────────────────────────────────────────────


def test_loans_requires_auth(client):
    resp = client.get("/api/loans")
    assert resp.status_code in (401, 403)


def test_loans_requires_company_header(client):
    _, token, _ = _setup(client, "loanauth1@example.com")
    resp = client.get("/api/loans", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code in (400, 401, 403)
