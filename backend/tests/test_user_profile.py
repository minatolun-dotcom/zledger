"""Integration tests for user profile endpoints."""
from __future__ import annotations

from tests.conftest import auth_header, register_user


class TestUserProfile:
    def test_update_profile(self, client):
        _, token = register_user(client, "profile1@example.com")
        resp = client.patch("/api/auth/me", json={
            "name": "New Name",
        }, headers=auth_header(token))
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"
        assert resp.json()["email"] == "profile1@example.com"

    def test_update_profile_email(self, client):
        _, token = register_user(client, "profile2@example.com")
        resp = client.patch("/api/auth/me", json={
            "email": "profile2_new@example.com",
        }, headers=auth_header(token))
        assert resp.status_code == 200
        assert resp.json()["email"] == "profile2_new@example.com"

    def test_update_profile_duplicate_email(self, client):
        _, token1 = register_user(client, "profile3@example.com")
        _, token2 = register_user(client, "profile4@example.com")
        resp = client.patch("/api/auth/me", json={
            "email": "profile3@example.com",
        }, headers=auth_header(token2))
        assert resp.status_code == 409

    def test_change_password(self, client):
        _, token = register_user(client, "profile5@example.com", password="oldpassword123")
        resp = client.patch("/api/auth/me/password", json={
            "current_password": "oldpassword123",
            "new_password": "newpassword456",
        }, headers=auth_header(token))
        assert resp.status_code == 200
        assert resp.json()["message"] == "Password updated"

    def test_change_password_wrong_current(self, client):
        _, token = register_user(client, "profile6@example.com", password="correctpassword")
        resp = client.patch("/api/auth/me/password", json={
            "current_password": "wrongpassword",
            "new_password": "newpassword123",
        }, headers=auth_header(token))
        assert resp.status_code == 400

    def test_unauthorized_access(self, client):
        resp = client.patch("/api/auth/me", json={"name": "Test"})
        assert resp.status_code in (401, 403)

    def test_get_me(self, client):
        _, token = register_user(client, "profile7@example.com")
        resp = client.get("/api/auth/me", headers=auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["email"] == "profile7@example.com"
        assert len(data["companies"]) == 0
