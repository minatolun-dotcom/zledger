"""Integration tests for the superadmin backup & restore endpoints.

All file-touching tests redirect BACKUP_DIR to a pytest tmp_path so the real
/backups volume is never touched.
"""
from __future__ import annotations

import gzip
import json

import pytest

from tests.conftest import register_user


def _make_superadmin(client, email: str) -> str:
    """Register a user, promote to superadmin, return their token."""
    _, token = register_user(client, email)
    from app.core.db import SessionLocal
    from app.models.user import User

    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == email).first()
        u.is_superadmin = True
        db.commit()
    finally:
        db.close()
    return token


@pytest.fixture
def backup_env(tmp_path, monkeypatch):
    """Point all backup env vars at a throwaway dir."""
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path))
    monkeypatch.setenv("GDRIVE_TOKEN_FILE", str(tmp_path / "gdrive-token.json"))
    monkeypatch.setenv("GDRIVE_ENABLED", "false")
    return tmp_path


class TestBackupSettings:
    def test_get_settings_shape(self, client, backup_env):
        token = _make_superadmin(client, "badmin-settings@example.com")
        resp = client.get("/api/admin/backup/settings", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["backup_interval_hours"] == 24
        assert body["retention_days"] == 30
        assert body["gdrive_enabled"] is False
        assert body["gdrive_token_set"] is False

    def test_get_settings_reflects_flag_file_even_when_env_off(self, client, backup_env):
        """gdrive_enabled must be true when the flag file exists (the backup
        container's source of truth) even if the env var is still false."""
        token = _make_superadmin(client, "badmin-flag@example.com")
        (backup_env / "gdrive-enabled").write_text("true")
        resp = client.get("/api/admin/backup/settings", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["gdrive_enabled"] is True

    def test_update_settings_writes_flag_and_env(self, client, backup_env):
        token = _make_superadmin(client, "badmin-update@example.com")
        resp = client.put(
            "/api/admin/backup/settings",
            json={"backup_interval_hours": 12, "retention_days": 7, "gdrive_enabled": True},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["backup_interval_hours"] == 12
        assert body["retention_days"] == 7
        assert body["gdrive_enabled"] is True
        assert (backup_env / "gdrive-enabled").exists()

        # Disabling removes the flag file again
        resp = client.put(
            "/api/admin/backup/settings",
            json={"gdrive_enabled": False},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.json()["gdrive_enabled"] is False
        assert not (backup_env / "gdrive-enabled").exists()

    def test_non_superadmin_forbidden(self, client, backup_env):
        _, token = register_user(client, "badmin-not@example.com")
        resp = client.get("/api/admin/backup/settings", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403


class TestGDriveToken:
    def test_save_token_enables_sync(self, client, backup_env):
        token = _make_superadmin(client, "badmin-token@example.com")
        resp = client.post(
            "/api/admin/backup/gdrive-token",
            json={"token": json.dumps({"access_token": "x" * 40, "refresh_token": "r" * 20})},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["gdrive_token_set"] is True
        assert resp.json()["gdrive_enabled"] is True
        assert (backup_env / "gdrive-enabled").exists()
        assert (backup_env / "gdrive-token.json").exists()

    def test_clear_token_disables_sync(self, client, backup_env):
        token = _make_superadmin(client, "badmin-clear@example.com")
        # First save (auto-enables)
        client.post(
            "/api/admin/backup/gdrive-token",
            json={"token": json.dumps({"access_token": "x" * 40})},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert (backup_env / "gdrive-enabled").exists()

        resp = client.delete("/api/admin/backup/gdrive-token", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert not (backup_env / "gdrive-token.json").exists()
        # Flag removed + env flipped off so the backup container stops syncing
        assert not (backup_env / "gdrive-enabled").exists()
        settings = client.get(
            "/api/admin/backup/settings", headers={"Authorization": f"Bearer {token}"}
        ).json()
        assert settings["gdrive_enabled"] is False
        assert settings["gdrive_token_set"] is False


class TestGDriveConnection:
    def test_no_token_returns_error_status(self, client, backup_env):
        token = _make_superadmin(client, "badmin-gtest@example.com")
        resp = client.post("/api/admin/backup/gdrive-test", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200  # backend reports via body, not HTTP status
        body = resp.json()
        assert body["status"] == "error"
        assert "No GDrive token" in body["message"]

    def test_malformed_token_returns_error_status(self, client, backup_env):
        token = _make_superadmin(client, "badmin-gtest2@example.com")
        (backup_env / "gdrive-token.json").write_text("not json at all")
        resp = client.post("/api/admin/backup/gdrive-test", headers={"Authorization": f"Bearer {token}"})
        body = resp.json()
        assert body["status"] == "error"
        assert "not valid JSON" in body["message"]

    def test_token_without_access_token_returns_error(self, client, backup_env):
        token = _make_superadmin(client, "badmin-gtest3@example.com")
        (backup_env / "gdrive-token.json").write_text(json.dumps({"foo": "bar"}))
        resp = client.post("/api/admin/backup/gdrive-test", headers={"Authorization": f"Bearer {token}"})
        body = resp.json()
        assert body["status"] == "error"
        assert "access_token" in body["message"]


class TestRestoreUpload:
    def test_rejects_non_sql_gz(self, client, backup_env):
        token = _make_superadmin(client, "badmin-ru@example.com")
        resp = client.post(
            "/api/admin/restore/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"database_file": ("backup.txt", b"data", "text/plain")},
        )
        assert resp.status_code == 400
        assert ".sql.gz" in resp.json()["detail"]

    def test_rejects_invalid_gzip(self, client, backup_env):
        token = _make_superadmin(client, "badmin-ru2@example.com")
        resp = client.post(
            "/api/admin/restore/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"database_file": ("backup.sql.gz", b"not gzip at all", "application/gzip")},
        )
        assert resp.status_code == 400
        assert "not a valid gzip" in resp.json()["detail"]

    def test_accepts_valid_gzip(self, client, backup_env):
        token = _make_superadmin(client, "badmin-ru3@example.com")
        payload = gzip.compress(b"CREATE TABLE t (id int);")
        resp = client.post(
            "/api/admin/restore/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"database_file": ("ok.sql.gz", payload, "application/gzip")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["database_file"] == "ok.sql.gz"
        assert body["database_size"] == len(payload)
        assert (backup_env / "ok.sql.gz").exists()

    def test_rejects_traversal_filename(self, client, backup_env):
        """A filename with ../ must not write outside the backup dir."""
        token = _make_superadmin(client, "badmin-ru4@example.com")
        payload = gzip.compress(b"CREATE TABLE t (id int);")
        resp = client.post(
            "/api/admin/restore/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"database_file": ("../escape.sql.gz", payload, "application/gzip")},
        )
        assert resp.status_code == 400
        # Nothing may have been written outside the backup dir
        assert not (backup_env.parent / "escape.sql.gz").exists()


class TestRestoreExecute:
    def test_requires_confirm(self, client, backup_env):
        token = _make_superadmin(client, "badmin-re@example.com")
        resp = client.post(
            "/api/admin/restore/execute",
            json={"database_file": "x.sql.gz", "confirm": "WRONG"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400
        assert "RESTORE" in resp.json()["detail"]

    def test_missing_file_404(self, client, backup_env):
        token = _make_superadmin(client, "badmin-re2@example.com")
        resp = client.post(
            "/api/admin/restore/execute",
            json={"database_file": "does-not-exist.sql.gz", "confirm": "RESTORE"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404

    def test_rejects_traversal_in_database_file(self, client, backup_env):
        """database_file must not allow escaping the backup dir."""
        token = _make_superadmin(client, "badmin-re3@example.com")
        # Put a file INSIDE the backup dir, then try to escape with ../
        (backup_env / "real.sql.gz").write_bytes(b"x")
        resp = client.post(
            "/api/admin/restore/execute",
            json={"database_file": "../../etc/passwd", "confirm": "RESTORE"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400
        # And a nested traversal that would resolve to a real file
        resp2 = client.post(
            "/api/admin/restore/execute",
            json={"database_file": "subdir/../real.sql.gz", "confirm": "RESTORE"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp2.status_code == 400


class TestDownloadGuard:
    def test_download_rejects_path_traversal(self, client, backup_env):
        """Any traversal must be rejected — either by the endpoint's own
        filename guard (400) or by the router rejecting the decoded multi-
        segment path (404). Either way, no file outside the backup dir may
        be served."""
        token = _make_superadmin(client, "badmin-dl@example.com")
        resp = client.get(
            "/api/admin/backups/download/..%2F..%2Fetc%2Fpasswd",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code in (400, 404)
        # Plain double-dot filename reaches the handler and hits the regex guard
        resp2 = client.get(
            "/api/admin/backups/download/..%2E%2E%2Fetc.sql.gz",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp2.status_code in (400, 404)

    def test_download_missing_file_404(self, client, backup_env):
        token = _make_superadmin(client, "badmin-dl2@example.com")
        resp = client.get(
            "/api/admin/backups/download/nope.sql.gz",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404


class TestBackupStatus:
    def test_status_shape_and_auth(self, client, backup_env):
        # Non-superadmin forbidden
        _, token = register_user(client, "badmin-st@example.com")
        resp = client.get("/api/admin/backups", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

        admin = _make_superadmin(client, "badmin-st2@example.com")
        resp = client.get("/api/admin/backups", headers={"Authorization": f"Bearer {admin}"})
        assert resp.status_code == 200
        body = resp.json()
        assert set(["backup_dir", "database_backups", "uploads_backups", "total_backups"]).issubset(body)
        assert isinstance(body["database_backups"], list)
        assert isinstance(body["uploads_backups"], list)

    def test_progress_returns_204_when_idle(self, client, backup_env):
        token = _make_superadmin(client, "badmin-pr@example.com")
        resp = client.get("/api/admin/backup/progress", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 204
