"""Integration tests for member management endpoints."""
from __future__ import annotations

from tests.conftest import auth_header, create_company, register_user


class TestMembers:
    def test_list_members_empty(self, client):
        _, token = register_user(client, "mem1@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.get("/api/members", headers=auth_header(token, cid))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1  # Owner is auto-added
        assert data[0]["role"] == "owner"
        assert data[0]["user_email"] == "mem1@example.com"

    def test_add_member(self, client):
        _, token1 = register_user(client, "mem2@example.com")
        company = create_company(client, token1)
        cid = company["id"]
        # Create second user
        _, token2 = register_user(client, "mem3@example.com")
        # Add second user as member
        resp = client.post("/api/members", json={
            "email": "mem3@example.com", "role": "accountant",
        }, headers=auth_header(token1, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert data["role"] == "accountant"
        assert data["user_email"] == "mem3@example.com"

    def test_add_member_nonexistent_user(self, client):
        _, token = register_user(client, "mem4@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.post("/api/members", json={
            "email": "nonexistent@example.com", "role": "accountant",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 404

    def test_add_member_duplicate(self, client):
        _, token1 = register_user(client, "mem5@example.com")
        company = create_company(client, token1)
        cid = company["id"]
        _, token2 = register_user(client, "mem6@example.com")
        client.post("/api/members", json={
            "email": "mem6@example.com", "role": "accountant",
        }, headers=auth_header(token1, cid))
        # Try to add again
        resp = client.post("/api/members", json={
            "email": "mem6@example.com", "role": "viewer",
        }, headers=auth_header(token1, cid))
        assert resp.status_code == 409

    def test_change_role(self, client):
        _, token1 = register_user(client, "mem7@example.com")
        company = create_company(client, token1)
        cid = company["id"]
        _, token2 = register_user(client, "mem8@example.com")
        add_resp = client.post("/api/members", json={
            "email": "mem8@example.com", "role": "accountant",
        }, headers=auth_header(token1, cid))
        user_id = add_resp.json()["user_id"]
        # Change role
        resp = client.patch(f"/api/members/{user_id}", json={
            "role": "viewer",
        }, headers=auth_header(token1, cid))
        assert resp.status_code == 200
        assert resp.json()["role"] == "viewer"

    def test_remove_member(self, client):
        _, token1 = register_user(client, "mem9@example.com")
        company = create_company(client, token1)
        cid = company["id"]
        _, token2 = register_user(client, "mem10@example.com")
        add_resp = client.post("/api/members", json={
            "email": "mem10@example.com", "role": "viewer",
        }, headers=auth_header(token1, cid))
        user_id = add_resp.json()["user_id"]
        # Remove
        resp = client.delete(f"/api/members/{user_id}", headers=auth_header(token1, cid))
        assert resp.status_code == 204
        # Verify removed
        list_resp = client.get("/api/members", headers=auth_header(token1, cid))
        assert len(list_resp.json()) == 1  # Only owner remains

    def test_cannot_remove_owner(self, client):
        _, token = register_user(client, "mem11@example.com")
        company = create_company(client, token)
        cid = company["id"]
        # Get owner user_id
        list_resp = client.get("/api/members", headers=auth_header(token, cid))
        owner_id = list_resp.json()[0]["user_id"]
        resp = client.delete(f"/api/members/{owner_id}", headers=auth_header(token, cid))
        assert resp.status_code == 400

    def test_non_owner_cannot_add_member(self, client):
        _, token1 = register_user(client, "mem12@example.com")
        company = create_company(client, token1)
        cid = company["id"]
        _, token2 = register_user(client, "mem13@example.com")
        # Add as viewer
        add_resp = client.post("/api/members", json={
            "email": "mem13@example.com", "role": "viewer",
        }, headers=auth_header(token1, cid))
        # Viewer tries to add member
        resp = client.post("/api/members", json={
            "email": "mem14@example.com", "role": "accountant",
        }, headers=auth_header(token2, cid))
        assert resp.status_code == 403

    def test_unauthorized_access(self, client):
        resp = client.get("/api/members")
        assert resp.status_code in (401, 403)

    def test_wrong_company_access(self, client):
        _, token1 = register_user(client, "mem15@example.com")
        company1 = create_company(client, token1)
        _, token2 = register_user(client, "mem16@example.com")
        company2 = create_company(client, token2)
        resp = client.get("/api/members", headers=auth_header(token1, company2["id"]))
        assert resp.status_code == 403
