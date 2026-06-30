"""Integration tests for superadmin user management endpoints."""
from __future__ import annotations

from tests.conftest import auth_header, create_company, register_user


class TestAdminUsers:
    def test_list_users_as_superadmin(self, client):
        # Register bootstrap admin
        _, token = register_user(client, "admin@example.com")
        # Make them superadmin via DB
        from app.core.db import SessionLocal
        from app.models.user import User
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == "admin@example.com").first()
            user.is_superadmin = True
            db.commit()
        finally:
            db.close()

        # Create another user
        register_user(client, "other@example.com")

        resp = client.get("/api/admin/users", headers=auth_header(token))
        assert resp.status_code == 200
        assert len(resp.json()) >= 2

    def test_list_users_as_non_superadmin(self, client):
        _, token = register_user(client, "regular@example.com")
        resp = client.get("/api/admin/users", headers=auth_header(token))
        assert resp.status_code == 403

    def test_get_user_as_superadmin(self, client):
        _, token = register_user(client, "admin2@example.com")
        from app.core.db import SessionLocal
        from app.models.user import User
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == "admin2@example.com").first()
            user.is_superadmin = True
            db.commit()
            user_id = user.id
        finally:
            db.close()

        resp = client.get(f"/api/admin/users/{user_id}", headers=auth_header(token))
        assert resp.status_code == 200
        assert resp.json()["email"] == "admin2@example.com"

    def test_update_user_as_superadmin(self, client):
        _, token = register_user(client, "admin3@example.com")
        from app.core.db import SessionLocal
        from app.models.user import User
        db = SessionLocal()
        try:
            admin = db.query(User).filter(User.email == "admin3@example.com").first()
            admin.is_superadmin = True
            db.commit()
            admin_id = admin.id
        finally:
            db.close()

        # Create target user
        _, token2 = register_user(client, "target@example.com")
        db2 = SessionLocal()
        try:
            target = db2.query(User).filter(User.email == "target@example.com").first()
            target_id = target.id
        finally:
            db2.close()

        resp = client.patch(f"/api/admin/users/{target_id}", json={
            "name": "Updated Name",
        }, headers=auth_header(token))
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    def test_cannot_deactivate_self(self, client):
        _, token = register_user(client, "admin4@example.com")
        from app.core.db import SessionLocal
        from app.models.user import User
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == "admin4@example.com").first()
            user.is_superadmin = True
            db.commit()
            user_id = user.id
        finally:
            db.close()

        resp = client.delete(f"/api/admin/users/{user_id}", headers=auth_header(token))
        assert resp.status_code == 400

    def test_unauthorized_access(self, client):
        resp = client.get("/api/admin/users")
        assert resp.status_code in (401, 403)

    def test_get_stats_as_superadmin(self, client):
        _, token = register_user(client, "admin5@example.com")
        from app.core.db import SessionLocal
        from app.models.user import User
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == "admin5@example.com").first()
            user.is_superadmin = True
            db.commit()
        finally:
            db.close()

        resp = client.get("/api/admin/stats", headers=auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert "total_users" in data
        assert "active_users" in data
