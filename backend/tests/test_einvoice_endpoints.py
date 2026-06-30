"""Integration tests for E-Invoice endpoints."""
from __future__ import annotations

from unittest.mock import patch, MagicMock

from tests.conftest import auth_header, create_company, register_user


class TestEInvoiceEndpoints:
    """Test e-invoice API endpoints."""

    def _setup_einvoice_env(self, monkeypatch):
        """Enable e-invoice for tests."""
        monkeypatch.setattr("app.api.v1.einvoice.settings.einvoice_enabled", True)

    def test_list_einvoices_empty(self, client, monkeypatch):
        self._setup_einvoice_env(monkeypatch)
        _, token = register_user(client, "ei1@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.get("/api/einvoice", headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_einvoices_disabled(self, client):
        _, token = register_user(client, "ei2@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.get("/api/einvoice", headers=auth_header(token, cid))
        assert resp.status_code == 400
        assert "not enabled" in resp.json()["detail"]

    def test_create_einvoice_disabled(self, client):
        _, token = register_user(client, "ei3@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.post("/api/einvoice/create", json={
            "voucher_id": "test", "gstin_id": "test",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 400
        assert "not enabled" in resp.json()["detail"]

    def test_create_einvoice_voucher_not_found(self, client, monkeypatch):
        self._setup_einvoice_env(monkeypatch)
        _, token = register_user(client, "ei4@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.post("/api/einvoice/create", json={
            "voucher_id": "nonexistent", "gstin_id": "nonexistent",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 404

    def test_get_einvoice_not_found(self, client, monkeypatch):
        self._setup_einvoice_env(monkeypatch)
        _, token = register_user(client, "ei5@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.get("/api/einvoice/nonexistent", headers=auth_header(token, cid))
        assert resp.status_code == 404

    def test_generate_einvoice_disabled(self, client):
        _, token = register_user(client, "ei6@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.post("/api/einvoice/nonexistent/generate", headers=auth_header(token, cid))
        assert resp.status_code == 400
        assert "not enabled" in resp.json()["detail"]

    def test_cancel_einvoice_disabled(self, client):
        _, token = register_user(client, "ei7@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.post("/api/einvoice/nonexistent/cancel", json={
            "cancel_reason": "4", "cancel_remark": "test",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 400
        assert "not enabled" in resp.json()["detail"]

    def test_qr_endpoint_disabled(self, client):
        _, token = register_user(client, "ei8@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.get("/api/einvoice/nonexistent/qr", headers=auth_header(token, cid))
        assert resp.status_code == 400
        assert "not enabled" in resp.json()["detail"]

    def test_invoice_data_endpoint_disabled(self, client):
        _, token = register_user(client, "ei9@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.get("/api/einvoice/nonexistent/invoice-data", headers=auth_header(token, cid))
        assert resp.status_code == 400
        assert "not enabled" in resp.json()["detail"]

    def test_list_with_filters(self, client, monkeypatch):
        self._setup_einvoice_env(monkeypatch)
        _, token = register_user(client, "ei10@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.get("/api/einvoice?status=draft", headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.json() == []

    def test_unauthorized_access(self, client, monkeypatch):
        self._setup_einvoice_env(monkeypatch)
        resp = client.get("/api/einvoice")
        assert resp.status_code in (401, 403)

    def test_wrong_company_access(self, client, monkeypatch):
        self._setup_einvoice_env(monkeypatch)
        _, token1 = register_user(client, "ei11@example.com")
        company1 = create_company(client, token1)
        _, token2 = register_user(client, "ei12@example.com")
        company2 = create_company(client, token2)
        resp = client.get("/api/einvoice", headers=auth_header(token1, company2["id"]))
        assert resp.status_code == 403
