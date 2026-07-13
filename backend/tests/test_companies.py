"""Tests for company endpoints."""
from __future__ import annotations


def _auth_header(client) -> dict:
    """Register a user and return the Authorization header."""
    resp = client.post("/api/auth/register", json={
        "email": "owner@example.com",
        "name": "Owner",
        "password": "strongpassword123",
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_company(client):
    headers = _auth_header(client)
    resp = client.post("/api/companies", json={
        "name": "Acme Pvt Ltd",
        "state_code": "27",
    }, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Acme Pvt Ltd"
    assert data["state_code"] == "27"
    assert data["is_active"] is True


def test_list_my_companies(client):
    headers = _auth_header(client)
    client.post("/api/companies", json={"name": "Co1"}, headers=headers)
    client.post("/api/companies", json={"name": "Co2"}, headers=headers)
    resp = client.get("/api/companies", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_get_company(client):
    headers = _auth_header(client)
    create = client.post("/api/companies", json={"name": "GetCo"}, headers=headers)
    co_id = create.json()["id"]
    resp = client.get(f"/api/companies/{co_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "GetCo"


def test_update_company(client):
    headers = _auth_header(client)
    create = client.post("/api/companies", json={"name": "OldName"}, headers=headers)
    co_id = create.json()["id"]
    patch_headers = {**headers, "X-Company-Id": co_id}
    resp = client.patch(f"/api/companies/{co_id}", json={"name": "NewName"}, headers=patch_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "NewName"


def test_get_company_not_member(client):
    headers_a = _auth_header(client)
    create = client.post("/api/companies", json={"name": "PrivateCo"}, headers=headers_a)
    co_id = create.json()["id"]

    resp_b = client.post("/api/auth/register", json={
        "email": "other@example.com",
        "name": "Other",
        "password": "strongpassword123",
    })
    headers_b = {"Authorization": f"Bearer {resp_b.json()['access_token']}"}
    resp = client.get(f"/api/companies/{co_id}", headers=headers_b)
    assert resp.status_code == 403


def test_create_company_gstin_unique(client):
    headers = _auth_header(client)
    client.post("/api/companies", json={"name": "Co1", "gstin": "27AAAAA1111A1Z5"}, headers=headers)
    resp = client.post("/api/companies", json={"name": "Co2", "gstin": "27AAAAA1111A1Z5"}, headers=headers)
    assert resp.status_code == 409
