"""Integration tests for Chart of Accounts endpoints: financial years, groups, ledgers, parties."""
from tests.conftest import auth_header, create_company, register_user


# ── Financial Years ──────────────────────────────────────────────────────


class TestFinancialYears:
    def test_list_empty(self, client):
        _, token = register_user(client, "fy1@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.get("/api/coa/financial-years", headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_fy(self, client):
        _, token = register_user(client, "fy2@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.post("/api/coa/financial-years", json={
            "name": "2025-26", "start_date": "2025-04-01", "end_date": "2026-03-31",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "2025-26"
        assert data["start_date"] == "2025-04-01"

    def test_list_returns_created(self, client):
        _, token = register_user(client, "fy3@example.com")
        company = create_company(client, token)
        cid = company["id"]
        client.post("/api/coa/financial-years", json={
            "name": "2025-26", "start_date": "2025-04-01", "end_date": "2026-03-31",
        }, headers=auth_header(token, cid))
        resp = client.get("/api/coa/financial-years", headers=auth_header(token, cid))
        assert len(resp.json()) == 1

    def test_unauthenticated(self, client):
        resp = client.get("/api/coa/financial-years")
        assert resp.status_code in (401, 403)


# ── Account Groups ───────────────────────────────────────────────────────


class TestAccountGroups:
    def test_list_empty(self, client):
        _, token = register_user(client, "grp1@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.get("/api/coa/groups", headers=auth_header(token, cid))
        assert resp.status_code == 200
        # Seed creates 23 default groups, so list won't be empty after company creation
        assert isinstance(resp.json(), list)

    def test_create_group(self, client):
        _, token = register_user(client, "grp2@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.post("/api/coa/groups", json={
            "name": "Current Assets", "nature": "assets", "group_type": "primary",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Current Assets"
        assert data["nature"] == "assets"

    def test_create_sub_group(self, client):
        _, token = register_user(client, "grp3@example.com")
        company = create_company(client, token)
        cid = company["id"]
        parent = client.post("/api/coa/groups", json={
            "name": "Assets", "nature": "assets", "group_type": "primary",
        }, headers=auth_header(token, cid)).json()
        resp = client.post("/api/coa/groups", json={
            "name": "Bank Accounts", "nature": "assets", "group_type": "sub", "parent_id": parent["id"],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        assert resp.json()["parent_id"] == parent["id"]

    def test_update_group(self, client):
        _, token = register_user(client, "grp4@example.com")
        company = create_company(client, token)
        cid = company["id"]
        grp = client.post("/api/coa/groups", json={
            "name": "Temp Group", "nature": "income", "group_type": "sub",
        }, headers=auth_header(token, cid)).json()
        resp = client.patch(f"/api/coa/groups/{grp['id']}", json={
            "name": "Renamed Group", "nature": "income", "group_type": "sub",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.json()["name"] == "Renamed Group"

    def test_update_system_group_rename_allowed_but_structural_protected(self, client):
        _, token = register_user(client, "grp5@example.com")
        company = create_company(client, token)
        cid = company["id"]
        from app.models.accounting import AccountGroup
        from app.core.db import SessionLocal
        with SessionLocal() as db:
            sg = AccountGroup(company_id=cid, name="System Group", nature="assets", group_type="sub", is_system=True)
            db.add(sg)
            db.commit()
            db.refresh(sg)
            sg_id = sg.id
        # System groups may be renamed, but structural fields (nature/group_type)
        # are protected and must not change.
        resp = client.patch(f"/api/coa/groups/{sg_id}", json={
            "name": "Renamed System Group", "nature": "liabilities", "group_type": "primary",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "Renamed System Group"
        assert body["nature"] == "assets"
        assert body["group_type"] == "sub"


# ── Ledgers ──────────────────────────────────────────────────────────────


class TestLedgers:
    def _create_group(self, client, token, cid):
        resp = client.post("/api/coa/groups", json={
            "name": "Bank Accounts", "nature": "assets", "group_type": "sub",
        }, headers=auth_header(token, cid))
        return resp.json()

    def test_list_empty(self, client):
        _, token = register_user(client, "led1@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.get("/api/coa/ledgers", headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_ledger(self, client):
        _, token = register_user(client, "led2@example.com")
        company = create_company(client, token)
        cid = company["id"]
        group = self._create_group(client, token, cid)
        resp = client.post("/api/coa/ledgers", json={
            "name": "HDFC Bank", "group_id": group["id"], "opening_balance": 0, "opening_balance_type": "Dr",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "HDFC Bank"
        assert data["group_id"] == group["id"]

    def test_create_ledger_invalid_group(self, client):
        _, token = register_user(client, "led3@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.post("/api/coa/ledgers", json={
            "name": "Bad Ledger", "group_id": "nonexistent", "opening_balance": 0, "opening_balance_type": "Dr",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 404

    def test_update_ledger(self, client):
        _, token = register_user(client, "led4@example.com")
        company = create_company(client, token)
        cid = company["id"]
        group = self._create_group(client, token, cid)
        ledger = client.post("/api/coa/ledgers", json={
            "name": "SBI Bank", "group_id": group["id"], "opening_balance": 0, "opening_balance_type": "Dr",
        }, headers=auth_header(token, cid)).json()
        resp = client.patch(f"/api/coa/ledgers/{ledger['id']}", json={
            "name": "State Bank", "group_id": group["id"], "opening_balance": 5000, "opening_balance_type": "Dr",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.json()["name"] == "State Bank"

    def test_list_returns_all(self, client):
        _, token = register_user(client, "led5@example.com")
        company = create_company(client, token)
        cid = company["id"]
        group = self._create_group(client, token, cid)
        client.post("/api/coa/ledgers", json={
            "name": "L1", "group_id": group["id"], "opening_balance": 0, "opening_balance_type": "Dr",
        }, headers=auth_header(token, cid))
        client.post("/api/coa/ledgers", json={
            "name": "L2", "group_id": group["id"], "opening_balance": 0, "opening_balance_type": "Cr",
        }, headers=auth_header(token, cid))
        resp = client.get("/api/coa/ledgers", headers=auth_header(token, cid))
        assert len(resp.json()) >= 2


# ── Parties ──────────────────────────────────────────────────────────────


class TestParties:
    def test_list_empty(self, client):
        _, token = register_user(client, "pty1@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.get("/api/coa/parties", headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_party(self, client):
        _, token = register_user(client, "pty2@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.post("/api/coa/parties", json={
            "name": "Acme Corp", "party_type": "customer",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Acme Corp"
        assert data["party_type"] == "customer"

    def test_update_party(self, client):
        _, token = register_user(client, "pty3@example.com")
        company = create_company(client, token)
        cid = company["id"]
        party = client.post("/api/coa/parties", json={
            "name": "Old Name", "party_type": "supplier",
        }, headers=auth_header(token, cid)).json()
        resp = client.patch(f"/api/coa/parties/{party['id']}", json={
            "name": "New Name", "party_type": "supplier",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    def test_list_returns_all(self, client):
        _, token = register_user(client, "pty4@example.com")
        company = create_company(client, token)
        cid = company["id"]
        client.post("/api/coa/parties", json={"name": "P1", "party_type": "customer"}, headers=auth_header(token, cid))
        client.post("/api/coa/parties", json={"name": "P2", "party_type": "supplier"}, headers=auth_header(token, cid))
        resp = client.get("/api/coa/parties", headers=auth_header(token, cid))
        assert len(resp.json()) == 2

    # ── Party-account integrity (round 15) ───────────────────────────────

    def test_create_party_rejects_missing_ledger(self, client):
        """A bogus ledger_id must 400 (not a misleading FK 409)."""
        _, token = register_user(client, "pty5@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.post("/api/coa/parties", json={
            "name": "Ghost Ledger Co", "party_type": "customer",
            "ledger_id": "00000000-0000-0000-0000-000000000000",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 400
        assert "Ledger not found" in resp.json()["detail"]

    def test_create_party_rejects_foreign_ledger(self, client):
        """Cross-company ledger linkage must be impossible (data corruption)."""
        _, token = register_user(client, "pty6@example.com")
        company_a = create_company(client, token)
        company_b = create_company(client, token, name="Test Co B")
        # Auto-create a party+ledger in company A to obtain a real ledger id.
        party_a = client.post("/api/coa/parties", json={
            "name": "A Corp", "party_type": "customer",
        }, headers=auth_header(token, company_a["id"])).json()
        assert party_a["ledger_id"]
        # Reusing company A's ledger inside company B must be rejected.
        resp = client.post("/api/coa/parties", json={
            "name": "B Corp", "party_type": "customer",
            "ledger_id": party_a["ledger_id"],
        }, headers=auth_header(token, company_b["id"]))
        assert resp.status_code == 400
        assert "Ledger not found" in resp.json()["detail"]

    def test_update_party_rejects_foreign_ledger(self, client):
        """Re-linking a party to another company's ledger must 400."""
        _, token = register_user(client, "pty7@example.com")
        company_a = create_company(client, token)
        company_b = create_company(client, token, name="Test Co C")
        party_a = client.post("/api/coa/parties", json={
            "name": "A2 Corp", "party_type": "supplier",
        }, headers=auth_header(token, company_a["id"])).json()
        party_b = client.post("/api/coa/parties", json={
            "name": "B2 Corp", "party_type": "supplier",
        }, headers=auth_header(token, company_b["id"])).json()
        resp = client.patch(f"/api/coa/parties/{party_b['id']}", json={
            "name": "B2 Corp", "party_type": "supplier",
            "ledger_id": party_a["ledger_id"],
        }, headers=auth_header(token, company_b["id"]))
        assert resp.status_code == 400
        assert "Ledger not found" in resp.json()["detail"]

    def test_update_party_renames_linked_ledger(self, client):
        """Renaming a party must rename its auto-created account ledger, so the
        voucher party selector and reports never show a stale ledger name."""
        _, token = register_user(client, "pty8@example.com")
        company = create_company(client, token)
        cid = company["id"]
        party = client.post("/api/coa/parties", json={
            "name": "Old Trading Co", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()
        assert party["ledger_id"]
        resp = client.patch(f"/api/coa/parties/{party['id']}", json={
            "name": "New Trading Co", "party_type": "customer",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200
        ledger = client.get(f"/api/coa/ledgers/{party['ledger_id']}", headers=auth_header(token, cid)).json()
        assert ledger["name"] == "New Trading Co"

    def test_delete_ledger_blocked_by_party_link(self, client):
        """Deleting a party's account ledger must be blocked — otherwise the
        party's ledger_id is silently SET NULL and it becomes unreachable."""
        _, token = register_user(client, "pty9@example.com")
        company = create_company(client, token)
        cid = company["id"]
        party = client.post("/api/coa/parties", json={
            "name": "Guard Me Traders", "party_type": "customer",
        }, headers=auth_header(token, cid)).json()
        resp = client.delete(f"/api/coa/ledgers/{party['ledger_id']}", headers=auth_header(token, cid))
        assert resp.status_code == 400
        assert "linked to party" in resp.json()["detail"]
        # Party is still intact and linked.
        party_after = client.get(f"/api/coa/parties/{party['id']}", headers=auth_header(token, cid)).json()
        assert party_after["ledger_id"] == party["ledger_id"]

    def test_bulk_delete_ledgers_skips_party_linked(self, client):
        """Bulk ledger delete must report party-linked ledgers as errors, not
        silently null the party link."""
        _, token = register_user(client, "pty10@example.com")
        company = create_company(client, token)
        cid = company["id"]
        party = client.post("/api/coa/parties", json={
            "name": "Bulk Guard Co", "party_type": "supplier",
        }, headers=auth_header(token, cid)).json()
        resp = client.post("/api/coa/ledgers/bulk-delete", json={
            "ids": [party["ledger_id"]],
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200
        body = resp.json()
        assert body["processed"] == 0
        assert any("linked to party" in e for e in body["errors"])
