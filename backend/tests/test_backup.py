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

    def test_rejects_non_pgdmp_archive_before_dropping_db(self, client, backup_env):
        """A valid gzip that is NOT a pg_dump archive must be rejected BEFORE
        the DB is dropped — otherwise a junk upload destroys the instance."""
        token = _make_superadmin(client, "badmin-re4@example.com")
        # gzip-compressed SQL (not a PGDMP archive)
        (backup_env / "sql-only.sql.gz").write_bytes(gzip.compress(b"CREATE TABLE t (id int);"))
        resp = client.post(
            "/api/admin/restore/execute",
            json={"database_file": "sql-only.sql.gz", "confirm": "RESTORE"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400
        assert "PGDMP" in resp.json()["detail"]

    def test_rejects_bad_gzip_at_execute(self, client, backup_env):
        token = _make_superadmin(client, "badmin-re5@example.com")
        (backup_env / "bad.sql.gz").write_bytes(b"this is not gzip at all")
        resp = client.post(
            "/api/admin/restore/execute",
            json={"database_file": "bad.sql.gz", "confirm": "RESTORE"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400
        assert "not a valid gzip" in resp.json()["detail"]


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


class TestDeleteBackup:
    """Admins can delete individual backup files from the volume via the UI."""

    def test_delete_existing_file(self, client, backup_env):
        token = _make_superadmin(client, "badmin-del@example.com")
        (backup_env / "zledger_20260101_000000.sql.gz").write_bytes(b"fake dump")
        resp = client.delete(
            "/api/admin/backups/zledger_20260101_000000.sql.gz",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["deleted"] == "zledger_20260101_000000.sql.gz"
        assert body["bytes_freed"] == len(b"fake dump")
        assert not (backup_env / "zledger_20260101_000000.sql.gz").exists()

        # The deletion is logged for audit (type + filename + who did it)
        log_file = backup_env / "backup-logs.json"
        assert log_file.exists()
        logs = json.loads(log_file.read_text())
        assert logs[-1]["type"] == "backup_deleted"
        assert logs[-1]["filename"] == "zledger_20260101_000000.sql.gz"
        assert logs[-1]["triggered_by"] == "badmin-del@example.com"

    def test_delete_missing_file_404(self, client, backup_env):
        token = _make_superadmin(client, "badmin-del2@example.com")
        resp = client.delete(
            "/api/admin/backups/ghost.sql.gz",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404

    def test_delete_rejects_path_traversal(self, client, backup_env):
        """No filename may escape the backup dir — a traversal attempt must
        never delete a file outside it."""
        token = _make_superadmin(client, "badmin-del3@example.com")
        (backup_env / "keep.sql.gz").write_bytes(b"keep me")

        # Multi-segment encoded path: FastAPI router rejects (404) or the
        # handler's regex guard rejects (400) — either way no deletion.
        resp = client.delete(
            "/api/admin/backups/..%2F..%2Fetc%2Fpasswd",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code in (400, 404)
        # Plain traversal reaches the handler and hits the regex guard
        resp2 = client.delete(
            "/api/admin/backups/..%2E%2E%2Fkeep.sql.gz",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp2.status_code in (400, 404)
        assert (backup_env / "keep.sql.gz").exists()

    def test_delete_non_superadmin_forbidden(self, client, backup_env):
        _, token = register_user(client, "badmin-del4@example.com")
        resp = client.delete(
            "/api/admin/backups/whatever.sql.gz",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_delete_refuses_non_backup_files(self, client, backup_env):
        """Config/state files in the backup dir (gdrive token, progress, logs)
        must never be deletable through this endpoint — only backups."""
        token = _make_superadmin(client, "badmin-del5@example.com")
        (backup_env / "gdrive-token.json").write_text(json.dumps({"access_token": "x" * 40}))
        (backup_env / "backup-progress.json").write_text("{\"step\": \"done\"}")
        (backup_env / "backup-logs.json").write_text("[]")
        (backup_env / "sync-status.json").write_text("{}")

        for name in ("gdrive-token.json", "backup-progress.json", "backup-logs.json", "sync-status.json"):
            resp = client.delete(
                f"/api/admin/backups/{name}",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 400, name
            assert (backup_env / name).exists(), name

        # Uploads backups are still deletable
        (backup_env / "zledger_uploads_20260101_000000.tar.gz").write_bytes(b"uploads")
        resp = client.delete(
            "/api/admin/backups/zledger_uploads_20260101_000000.tar.gz",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert not (backup_env / "zledger_uploads_20260101_000000.tar.gz").exists()


class TestPruneBackups:
    """POST /admin/backups/prune removes only backups older than retention."""

    @staticmethod
    def _backdate(path, days: int):
        import os
        import time as time_mod

        ts = time_mod.time() - days * 86400
        os.utime(path, (ts, ts))

    def test_prunes_only_old_backups(self, client, backup_env, monkeypatch):
        token = _make_superadmin(client, "badmin-prune@example.com")
        monkeypatch.setenv("BACKUP_RETENTION_DAYS", "1")

        (backup_env / "zledger_old1.sql.gz").write_bytes(b"x" * 100)
        (backup_env / "zledger_old2.sql.gz").write_bytes(b"x" * 50)
        (backup_env / "zledger_new.sql.gz").write_bytes(b"x" * 10)
        self._backdate(backup_env / "zledger_old1.sql.gz", days=3)
        self._backdate(backup_env / "zledger_old2.sql.gz", days=3)

        resp = client.post("/api/admin/backups/prune", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert sorted(body["pruned"]) == ["zledger_old1.sql.gz", "zledger_old2.sql.gz"]
        assert body["count"] == 2
        assert body["bytes_freed"] == 150
        assert body["retention_days"] == 1
        assert not (backup_env / "zledger_old1.sql.gz").exists()
        assert not (backup_env / "zledger_old2.sql.gz").exists()
        assert (backup_env / "zledger_new.sql.gz").exists()

        # Audit log entry with a human summary
        logs = json.loads((backup_env / "backup-logs.json").read_text())
        assert logs[-1]["type"] == "backup_pruned"
        assert "2 file(s)" in logs[-1]["filename"]

    def test_prune_never_touches_config_files(self, client, backup_env, monkeypatch):
        token = _make_superadmin(client, "badmin-prune2@example.com")
        monkeypatch.setenv("BACKUP_RETENTION_DAYS", "1")
        (backup_env / "gdrive-token.json").write_text(json.dumps({"access_token": "x" * 40}))
        (backup_env / "sync-status.json").write_text("{}")
        (backup_env / "backup-progress.json").write_text("{\"status\": \"done\"}")
        for name in ("gdrive-token.json", "sync-status.json", "backup-progress.json"):
            self._backdate(backup_env / name, days=3)

        resp = client.post("/api/admin/backups/prune", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["count"] == 0
        for name in ("gdrive-token.json", "sync-status.json", "backup-progress.json"):
            assert (backup_env / name).exists()

    def test_prune_non_superadmin_forbidden(self, client, backup_env):
        _, token = register_user(client, "badmin-prune3@example.com")
        resp = client.post("/api/admin/backups/prune", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    def test_retention_clamped_to_minimum(self, client, backup_env, monkeypatch):
        """A 0/negative retention must never mean 'delete everything' — the
        cutoff is clamped to 1 day and fresh files always survive."""
        token = _make_superadmin(client, "badmin-prune4@example.com")
        monkeypatch.setenv("BACKUP_RETENTION_DAYS", "0")
        (backup_env / "zledger_fresh.sql.gz").write_bytes(b"x" * 10)

        resp = client.post("/api/admin/backups/prune", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["retention_days"] == 1
        assert body["count"] == 0
        assert (backup_env / "zledger_fresh.sql.gz").exists()


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

    def test_status_includes_volume_disk_usage(self, client, backup_env):
        token = _make_superadmin(client, "badmin-du@example.com")
        resp = client.get("/api/admin/backups", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["disk_usage"] is not None
        assert set(["total", "used", "free"]).issubset(body["disk_usage"])
        assert body["disk_usage"]["total"] > 0
        assert body["disk_usage"]["free"] >= 0


class TestRetentionMapping:
    """The UI retention setting (BACKUP_RETENTION_DAYS) must reach backup.sh
    as RETENTION_DAYS — otherwise manual backups always use the 30-day default."""

    def test_maps_backup_retention_to_script_var(self, monkeypatch):
        monkeypatch.setenv("BACKUP_RETENTION_DAYS", "7")
        monkeypatch.delenv("RETENTION_DAYS", raising=False)
        from app.api.v1.admin import _build_backup_subprocess_env

        env = _build_backup_subprocess_env(gdrive_enabled=False)
        assert env["RETENTION_DAYS"] == "7"

    def test_prefers_explicit_retention_days(self, monkeypatch):
        monkeypatch.setenv("BACKUP_RETENTION_DAYS", "7")
        monkeypatch.setenv("RETENTION_DAYS", "45")
        from app.api.v1.admin import _build_backup_subprocess_env

        env = _build_backup_subprocess_env(gdrive_enabled=False)
        assert env["RETENTION_DAYS"] == "45"

    def test_gdrive_flag_reflected(self, monkeypatch):
        from app.api.v1.admin import _build_backup_subprocess_env

        env = _build_backup_subprocess_env(gdrive_enabled=True)
        assert env.get("GDRIVE_ENABLED") == "true"


class TestBackupHealthAlerts:
    """cron_runner.check_backup_health must raise in-app alerts for failed
    backup runs and GDrive sync errors, deduped per failure.

    Alerts go to companies that have a superadmin member (backup management
    is superadmin-only) — so each fixture company gets a superadmin member.
    """

    @staticmethod
    def _company_with_superadmin(db, name: str):
        from app.core.security import hash_password
        from app.models.user import Company, CompanyMember, User

        company = Company(name=name, is_active=True)
        db.add(company)
        db.flush()
        user = User(
            email=f"{name.replace(' ', '').lower()}@example.com",
            name=name,
            is_superadmin=True,
            hashed_password=hash_password("test12345"),
        )
        db.add(user)
        db.flush()
        db.add(CompanyMember(company_id=company.id, user_id=user.id, role="owner"))
        db.commit()
        db.refresh(company)
        return company

    def test_alerts_on_failed_progress_file(self, db, backup_env, monkeypatch):
        from app.models.user import Company
        from app.services.notification import Notification

        company = self._company_with_superadmin(db, "Alert Co")

        (backup_env / "backup-progress.json").write_text(json.dumps({
            "step": "failed", "step_label": "Database backup failed",
            "status": "error", "timestamp": "2026-08-09T01:00:00Z",
        }))

        monkeypatch.setenv("BACKUP_DIR", str(backup_env))
        from app.cron_runner import check_backup_health

        assert check_backup_health(db) == 1
        n = db.query(Notification).filter(Notification.company_id == company.id).first()
        assert n is not None
        assert n.category == "error"
        assert "Backup failed" in n.title
        assert n.link == "/admin/backups"

        # Same failure again → deduped, no new notification
        assert check_backup_health(db) == 0
        assert db.query(Notification).count() == 1

    def test_alerts_on_gdrive_sync_error(self, db, backup_env, monkeypatch):
        from app.models.user import Company
        from app.services.notification import Notification

        company = self._company_with_superadmin(db, "Sync Alert Co")

        (backup_env / "sync-status.json").write_text(json.dumps({
            "gdrive_enabled": True,
            "last_sync_at": "2026-08-09T02:00:00Z",
            "last_sync_status": "error",
            "last_error": "Failed to upload database dump",
        }))

        monkeypatch.setenv("BACKUP_DIR", str(backup_env))
        from app.cron_runner import check_backup_health

        assert check_backup_health(db) == 1
        n = db.query(Notification).filter(Notification.company_id == company.id).first()
        assert "Google Drive sync error" == n.title
        assert "Failed to upload" in n.message

    def test_healthy_backups_no_alerts(self, db, backup_env, monkeypatch):
        from app.models.user import Company

        company = self._company_with_superadmin(db, "Healthy Co")

        (backup_env / "backup-progress.json").write_text(json.dumps({
            "step": "done", "step_label": "Backup complete",
            "status": "done", "timestamp": "2026-08-09T03:00:00Z",
        }))
        (backup_env / "sync-status.json").write_text(json.dumps({
            "last_sync_status": "success", "last_sync_at": "2026-08-09T03:00:00Z",
        }))

        monkeypatch.setenv("BACKUP_DIR", str(backup_env))
        from app.cron_runner import check_backup_health

        assert check_backup_health(db) == 0


class TestBackupIntegrity:
    """cron_runner.check_backup_integrity validates the newest dump and raises
    a bell alert when it is corrupt (truncated gzip or not a pg_dump)."""

    @staticmethod
    def _make_pgdmp() -> bytes:
        return gzip.compress(b"PGDMP" + b"\x00" * 128)

    def test_valid_newest_dump_no_alert(self, db, backup_env, monkeypatch):
        from app.models.notification import Notification
        TestBackupHealthAlerts._company_with_superadmin(db, "Integrity Co")
        (backup_env / "zledger_20260101_000000.sql.gz").write_bytes(self._make_pgdmp())
        monkeypatch.setenv("BACKUP_DIR", str(backup_env))
        from app.cron_runner import check_backup_integrity

        assert check_backup_integrity(db) == 0
        assert db.query(Notification).count() == 0

    def test_truncated_dump_alerts_and_dedupes(self, db, backup_env, monkeypatch):
        from app.models.notification import Notification
        company = TestBackupHealthAlerts._company_with_superadmin(db, "Integrity Trunc Co")
        full = self._make_pgdmp()
        (backup_env / "zledger_20260101_000000.sql.gz").write_bytes(full[: len(full) // 2])
        monkeypatch.setenv("BACKUP_DIR", str(backup_env))
        from app.cron_runner import check_backup_integrity

        assert check_backup_integrity(db) == 1
        n = db.query(Notification).filter(Notification.company_id == company.id).first()
        assert n is not None
        assert n.title == "Backup integrity check failed"
        assert "truncated" in n.message
        assert n.link == "/admin/backups"
        # Same file + mtime → deduped, no second alert on the next pass
        assert check_backup_integrity(db) == 0
        assert db.query(Notification).count() == 1

    def test_non_pgdmp_gzip_alerts(self, db, backup_env, monkeypatch):
        from app.models.notification import Notification
        company = TestBackupHealthAlerts._company_with_superadmin(db, "Integrity Junk Co")
        (backup_env / "zledger_20260101_000000.sql.gz").write_bytes(
            gzip.compress(b"CREATE TABLE t (id INT);")
        )
        monkeypatch.setenv("BACKUP_DIR", str(backup_env))
        from app.cron_runner import check_backup_integrity

        assert check_backup_integrity(db) == 1
        n = db.query(Notification).filter(Notification.company_id == company.id).first()
        assert "PGDMP" in n.message

    def test_no_dumps_no_alert(self, db, backup_env, monkeypatch):
        from app.models.notification import Notification
        TestBackupHealthAlerts._company_with_superadmin(db, "Integrity Empty Co")
        monkeypatch.setenv("BACKUP_DIR", str(backup_env))
        from app.cron_runner import check_backup_integrity

        assert check_backup_integrity(db) == 0
        assert db.query(Notification).count() == 0

    def test_skips_while_backup_running(self, db, backup_env, monkeypatch):
        """A mid-run dump is legitimately incomplete — never alert on it."""
        from app.models.notification import Notification
        TestBackupHealthAlerts._company_with_superadmin(db, "Integrity Busy Co")
        (backup_env / "zledger_20260101_000000.sql.gz").write_bytes(b"garbage not gzip")
        (backup_env / "backup-progress.json").write_text(json.dumps({
            "status": "running", "step": "db_dump", "timestamp": "2026-08-09T04:00:00Z",
        }))
        monkeypatch.setenv("BACKUP_DIR", str(backup_env))
        from app.cron_runner import check_backup_integrity

        assert check_backup_integrity(db) == 0
        assert db.query(Notification).count() == 0

    def test_stale_running_progress_does_not_block_check(self, db, backup_env, monkeypatch):
        """A crashed run leaves status=running forever — a stale progress file
        must not permanently disable the integrity check (that is exactly the
        corruption scenario the check exists to catch)."""
        import os
        import time
        from app.models.notification import Notification
        company = TestBackupHealthAlerts._company_with_superadmin(db, "Integrity Stale Co")
        (backup_env / "zledger_20260101_000000.sql.gz").write_bytes(
            gzip.compress(b"CREATE TABLE t (id INT);")
        )
        prog = backup_env / "backup-progress.json"
        prog.write_text(json.dumps({
            "status": "running", "step": "db_dump", "timestamp": "2026-08-09T04:00:00Z",
        }))
        old_ts = time.time() - 7200  # 2h old → stale
        os.utime(prog, (old_ts, old_ts))
        monkeypatch.setenv("BACKUP_DIR", str(backup_env))
        from app.cron_runner import check_backup_integrity

        assert check_backup_integrity(db) == 1
        n = db.query(Notification).filter(Notification.company_id == company.id).first()
        assert n is not None
        assert "PGDMP" in n.message


class TestRestoreAuditLog:
    """Restore executions are recorded in the backup audit log."""

    def test_restore_start_logged_before_thread(self, client, backup_env, monkeypatch):
        import threading

        token = _make_superadmin(client, "badmin-ra@example.com")
        (backup_env / "valid.sql.gz").write_bytes(gzip.compress(b"PGDMP" + b"\x00" * 64))
        # Never let the destructive restore thread actually run.
        monkeypatch.setattr(threading.Thread, "start", lambda self: None)

        resp = client.post(
            "/api/admin/restore/execute",
            json={"database_file": "valid.sql.gz", "confirm": "RESTORE"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

        logs = json.loads((backup_env / "backup-logs.json").read_text())
        assert logs[-1]["type"] == "restore_started"
        assert logs[-1]["filename"] == "valid.sql.gz"
        assert logs[-1]["triggered_by"] == "badmin-ra@example.com"

    def test_failed_validation_not_logged_as_restore(self, client, backup_env):
        """Rejected restores (bad confirm / bad archive) never log a start."""
        token = _make_superadmin(client, "badmin-ra2@example.com")
        resp = client.post(
            "/api/admin/restore/execute",
            json={"database_file": "nope.sql.gz", "confirm": "RESTORE"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404
        assert not (backup_env / "backup-logs.json").exists()
