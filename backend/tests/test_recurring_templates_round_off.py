"""Recurring template round-off: the mode is exposed on the template, merges
into the template payload, and every voucher generated from the template
(manual run + due processing) honors it."""
from decimal import Decimal

from tests.conftest import auth_header, create_company, register_user


def _setup_company(client, email: str):
    _, token = register_user(client, email)
    company = create_company(client, token)
    return company, token


def _create_group_and_ledgers(client, token, cid):
    group = client.post("/api/coa/groups", json={
        "name": "Bank Accounts", "nature": "assets", "group_type": "sub",
    }, headers=auth_header(token, cid)).json()
    l1 = client.post("/api/coa/ledgers", json={
        "name": "Test Cash Ledger", "group_id": group["id"], "opening_balance": 0, "opening_balance_type": "Dr",
    }, headers=auth_header(token, cid)).json()
    l2 = client.post("/api/coa/ledgers", json={
        "name": "Test Bank Ledger", "group_id": group["id"], "opening_balance": 0, "opening_balance_type": "Dr",
    }, headers=auth_header(token, cid)).json()
    return group, l1, l2


def _fractional_sales_payload(cid: str, l1_id: str, l2_id: str, narration: str) -> dict:
    """3 × 100.50 = 301.50 taxable; Auto rounds to 302 → +0.50 adjustment."""
    return {
        "voucher_type": "sales",
        "voucher_date": "2025-04-15",
        "party_id": None,
        "narration": narration,
        "round_off_to": 0,
        "lines": [
            {"ledger_id": l1_id, "quantity": 3, "rate": 100.5},
            {"ledger_id": l2_id, "debit": 302},
        ],
    }


class TestRecurringTemplateRoundOff:
    def test_template_round_off_to_merged_into_payload_and_exposed(self, client):
        company, token = _setup_company(client, "rtmpl-ro1@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        payload = _fractional_sales_payload(cid, l1["id"], l2["id"], "Monthly sales RO")
        resp = client.post("/api/recurring-templates", json={
            "name": "RO Sales Template",
            "voucher_type": "sales",
            "frequency": "monthly",
            "next_run_date": "2030-01-01",
            "round_off_to": 0,
            "template_payload": payload,
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["round_off_to"] == 0
        assert data["template_payload"]["round_off_to"] == 0

        # The list response also exposes the derived mode.
        lst = client.get("/api/recurring-templates", headers=auth_header(token, cid)).json()
        assert any(t["round_off_to"] == 0 and t["name"] == "RO Sales Template" for t in lst)

    def test_template_generated_voucher_honors_round_off(self, client):
        company, token = _setup_company(client, "rtmpl-ro2@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        payload = _fractional_sales_payload(cid, l1["id"], l2["id"], "Generated RO sale")
        resp = client.post("/api/recurring-templates", json={
            "name": "RO Auto Template",
            "voucher_type": "sales",
            "frequency": "monthly",
            "next_run_date": "2030-01-01",
            "template_payload": payload,
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        tmpl_id = resp.json()["id"]

        run = client.post(f"/api/recurring-templates/{tmpl_id}/run", headers=auth_header(token, cid))
        assert run.status_code == 200, run.text

        vouchers = client.get("/api/vouchers", headers=auth_header(token, cid)).json()["items"]
        gen = next(v for v in vouchers if v["narration"] == "Generated RO sale")
        assert abs(float(gen["grand_total"]) - 302.0) < 1e-9

        # The generated voucher has the round-off line parked on Round Off and balances.
        detail = client.get(f"/api/vouchers/{gen['id']}", headers=auth_header(token, cid)).json()
        ledgers = client.get("/api/coa/ledgers", headers=auth_header(token, cid)).json()
        ro = [l for l in ledgers if l["system_code"] == "SYS_ROUND_OFF"]
        assert len(ro) == 1
        ro_lines = [l for l in detail["lines"] if l["ledger_id"] == ro[0]["id"]]
        assert len(ro_lines) == 1
        assert abs(float(ro_lines[0]["credit"]) - 0.50) < 1e-9
        total_debit = sum(float(l["debit"] or 0) for l in detail["lines"])
        total_credit = sum(float(l["credit"] or 0) for l in detail["lines"])
        assert abs(total_debit - total_credit) < 0.001

    def test_template_round_off_none_removes_key(self, client):
        company, token = _setup_company(client, "rtmpl-ro3@example.com")
        cid = company["id"]
        _, l1, l2 = _create_group_and_ledgers(client, token, cid)

        payload = _fractional_sales_payload(cid, l1["id"], l2["id"], "RO None sale")
        resp = client.post("/api/recurring-templates", json={
            "name": "RO None Template",
            "voucher_type": "sales",
            "frequency": "monthly",
            "next_run_date": "2030-01-01",
            "round_off_to": None,
            "template_payload": payload,
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201, resp.text
        assert resp.json()["round_off_to"] is None
        assert "round_off_to" not in resp.json()["template_payload"]
