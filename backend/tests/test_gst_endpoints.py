"""Integration tests for GST endpoints: HSN/SAC, registrations, GST calc, returns."""
from tests.conftest import auth_header, create_company, register_user


class TestHsnSac:
    def test_list_empty(self, client):
        _, token = register_user(client, "hsn1@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.get("/api/gst/hsn-sac", headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_hsn(self, client):
        _, token = register_user(client, "hsn2@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.post("/api/gst/hsn-sac", json={
            "code": "998314", "description": "IT Consulting", "gst_rate": 18.0, "code_type": "sac",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert data["code"] == "998314"
        assert data["gst_rate"] == 18.0

    def test_get_hsn(self, client):
        _, token = register_user(client, "hsn3@example.com")
        company = create_company(client, token)
        cid = company["id"]
        created = client.post("/api/gst/hsn-sac", json={
            "code": "0401", "description": "Milk", "gst_rate": 0.0, "code_type": "hsn",
        }, headers=auth_header(token, cid)).json()
        resp = client.get(f"/api/gst/hsn-sac/{created['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.json()["code"] == "0401"

    def test_delete_hsn(self, client):
        _, token = register_user(client, "hsn4@example.com")
        company = create_company(client, token)
        cid = company["id"]
        created = client.post("/api/gst/hsn-sac", json={
            "code": "1001", "description": "Wheat", "gst_rate": 5.0, "code_type": "hsn",
        }, headers=auth_header(token, cid)).json()
        resp = client.delete(f"/api/gst/hsn-sac/{created['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 204

    def test_list_after_create(self, client):
        _, token = register_user(client, "hsn5@example.com")
        company = create_company(client, token)
        cid = company["id"]
        client.post("/api/gst/hsn-sac", json={"code": "1234", "description": "A", "gst_rate": 12.0, "code_type": "hsn"}, headers=auth_header(token, cid))
        client.post("/api/gst/hsn-sac", json={"code": "998314", "description": "B", "gst_rate": 18.0, "code_type": "sac"}, headers=auth_header(token, cid))
        resp = client.get("/api/gst/hsn-sac", headers=auth_header(token, cid))
        assert len(resp.json()) == 2


class TestGstRegistrations:
    def test_list_empty(self, client):
        _, token = register_user(client, "gst1@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.get("/api/gst/registrations", headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_registration(self, client):
        _, token = register_user(client, "gst2@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.post("/api/gst/registrations", json={
            "gstin": "27AABCU9603R1ZM", "legal_name": "Test Corp", "state_code": "27", "is_primary": True,
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert data["gstin"] == "27AABCU9603R1ZM"
        assert data["is_primary"] is True

    def test_get_registration(self, client):
        _, token = register_user(client, "gst3@example.com")
        company = create_company(client, token)
        cid = company["id"]
        created = client.post("/api/gst/registrations", json={
            "gstin": "09AABCU9603R1ZM", "legal_name": "UP Corp", "state_code": "09",
        }, headers=auth_header(token, cid)).json()
        resp = client.get(f"/api/gst/registrations/{created['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.json()["gstin"] == "09AABCU9603R1ZM"

    def test_update_registration(self, client):
        _, token = register_user(client, "gst4@example.com")
        company = create_company(client, token)
        cid = company["id"]
        created = client.post("/api/gst/registrations", json={
            "gstin": "24AABCU9603R1ZM", "legal_name": "Old Name", "state_code": "24",
        }, headers=auth_header(token, cid)).json()
        resp = client.patch(f"/api/gst/registrations/{created['id']}", json={
            "gstin": "24AABCU9603R1ZM", "legal_name": "New Name", "state_code": "24",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.json()["legal_name"] == "New Name"

    def test_delete_registration(self, client):
        _, token = register_user(client, "gst5@example.com")
        company = create_company(client, token)
        cid = company["id"]
        created = client.post("/api/gst/registrations", json={
            "gstin": "33AABCU9603R1ZM", "legal_name": "TN Corp", "state_code": "33",
        }, headers=auth_header(token, cid)).json()
        resp = client.delete(f"/api/gst/registrations/{created['id']}", headers=auth_header(token, cid))
        assert resp.status_code == 204


class TestGstCalculate:
    def test_calculate_gst(self, client):
        _, token = register_user(client, "calc1@example.com")
        company = create_company(client, token)
        cid = company["id"]
        hsn = client.post("/api/gst/hsn-sac", json={
            "code": "998314", "description": "IT Services", "gst_rate": 18.0, "code_type": "sac",
        }, headers=auth_header(token, cid)).json()
        resp = client.post("/api/gst/calculate-gst", json={
            "amount": 1000, "hsn_sac_id": hsn["id"], "is_inter_state": False,
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200
        data = resp.json()
        assert data["cgst_amount"] == 90.0
        assert data["sgst_amount"] == 90.0
        assert data["total_tax"] == 180.0

    def test_calculate_gst_inter_state(self, client):
        _, token = register_user(client, "calc2@example.com")
        company = create_company(client, token)
        cid = company["id"]
        hsn = client.post("/api/gst/hsn-sac", json={
            "code": "998314", "description": "IT Services", "gst_rate": 18.0, "code_type": "sac",
        }, headers=auth_header(token, cid)).json()
        resp = client.post("/api/gst/calculate-gst", json={
            "amount": 1000, "hsn_sac_id": hsn["id"], "is_inter_state": True,
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200
        data = resp.json()
        assert data["igst_amount"] == 180.0
        assert data["cgst_amount"] == 0.0

    def test_calculate_gst_invalid_hsn(self, client):
        _, token = register_user(client, "calc3@example.com")
        company = create_company(client, token)
        cid = company["id"]
        resp = client.post("/api/gst/calculate-gst", json={
            "amount": 1000, "hsn_sac_id": "nonexistent", "is_inter_state": False,
        }, headers=auth_header(token, cid))
        assert resp.status_code in (400, 404)
