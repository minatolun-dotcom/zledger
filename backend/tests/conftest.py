"""Shared test fixtures: isolated PostgreSQL test DB, FastAPI TestClient, auth helpers.

Tests run against dedicated `zledger_test*` databases (never the live `zledger`
DB). Under pytest-xdist (`-n N`) each worker gets its OWN database
(`zledger_test_gw0`, `zledger_test_gw1`, ...) so parallel workers can never
lock/truncate each other's tables (the old shared-DB design deadlocked on
TRUNCATE CASCADE vs concurrent test transactions). Each worker's DB is dropped
and recreated once per session, then the schema is built from Alembic
migrations; per-test isolation is via the `_tx` restarting-savepoint fixture
(committed data never leaks between tests).
"""
from __future__ import annotations

import os
import subprocess

# pytest-xdist sets PYTEST_XDIST_WORKER (e.g. "gw0") in every worker process;
# it is unset in the controller/master and in non-xdist runs. Each worker gets
# its own database so parallel runs are fully isolated.
_WORKER_ID = os.environ.get("PYTEST_XDIST_WORKER") or ""

# Redirect to a dedicated test database so we NEVER touch the live DB.
if "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = "sqlite:///test.db"
elif os.environ["DATABASE_URL"].startswith("postgresql"):
    _base, _, _db = os.environ["DATABASE_URL"].rpartition("/")
    _db_name = f"zledger_test{('_' + _WORKER_ID) if _WORKER_ID else ''}"
    os.environ["DATABASE_URL"] = f"{_base}/{_db_name}"
elif os.environ["DATABASE_URL"].startswith("sqlite") and _WORKER_ID:
    # A single shared sqlite file would race across xdist workers (alembic
    # upgrade / truncate) — give each worker its own file. Postgres is the
    # canonical test target (docker); this keeps the local fallback parallel-safe.
    os.environ["DATABASE_URL"] = f"sqlite:///test_{_WORKER_ID}.db"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import Session

# Import models to register them on Base.metadata BEFORE anything else.
import app.models  # noqa: F401
from app.core.db import Base, SessionLocal, engine, get_db
from app.main import app

TEST_DB_NAME = f"zledger_test{('_' + _WORKER_ID) if _WORKER_ID else ''}"


def _ensure_test_db() -> None:
    """(Re)create this worker's test database from scratch.

    Drop-then-create guarantees a pristine schema every run, clears any leftover
    connections from a crashed previous run (WITH (FORCE), PG 13+), and removes
    the need to track stale per-worker databases across runs.
    """
    url = os.environ["DATABASE_URL"]
    base, _, _ = url.rpartition("/")
    maint = create_engine(f"{base}/postgres", future=True, isolation_level="AUTOCOMMIT")
    with maint.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": TEST_DB_NAME}
        ).scalar()
        if exists:
            conn.execute(text(f'DROP DATABASE "{TEST_DB_NAME}" WITH (FORCE)'))
        conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
    maint.dispose()


def _truncate_all() -> None:
    """Remove all rows from every application table (keeps schema + alembic version)."""
    tables = [t for t in inspect(engine).get_table_names(schema="public") if t != "alembic_version"]
    if not tables:
        return
    stmt = text(f"TRUNCATE TABLE {', '.join(tables)} RESTART IDENTITY CASCADE")
    with engine.begin() as conn:
        conn.execute(stmt)


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    """Build the test schema from Alembic migrations (matches production)."""
    _ensure_test_db()
    # Each xdist worker owns its own database now, so setup can never race with
    # another worker's tests. A small advisory lock is kept as a belt-and-braces
    # guard for two non-xdist invocations pointing at the same DB.
    lock_conn = engine.connect()
    lock_conn.execution_options(isolation_level="AUTOCOMMIT")
    try:
        lock_conn.execute(text("SELECT pg_advisory_lock(hashtext('zledger_test_setup'))"))
        subprocess.run(["alembic", "upgrade", "head"], check=True, env={**os.environ})
        _truncate_all()
    finally:
        lock_conn.execute(text("SELECT pg_advisory_unlock(hashtext('zledger_test_setup'))"))
        lock_conn.close()
    yield


@pytest.fixture
def _tx():
    """One session/transaction per test, fully isolated via a restarting savepoint.

    The application code calls ``session.commit()`` (e.g. when persisting a
    registration). A plain outer transaction would be *deassociated* by that
    commit, leaking data into the next test. Instead we begin a nested
    savepoint and restart it after every commit/rollback, so the app's commits
    are absorbed while the whole test is still rolled back at teardown.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    session.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(sess, ended_tx):
        if ended_tx.nested and not ended_tx._parent.nested:
            sess.expire_all()
            sess.begin_nested()

    # Route every SessionLocal() call (app services AND tests that open their
    # own session) to the same test connection, so data written via the API is
    # visible to test-side queries within the same (savepoint) transaction.
    original_bind = SessionLocal.kw.get("bind")
    SessionLocal.configure(bind=connection)

    try:
        yield session
    finally:
        SessionLocal.configure(bind=original_bind)
        event.remove(session, "after_transaction_end", restart_savepoint)
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def db(_tx):
    return _tx


@pytest.fixture
def client(_tx):
    def _override_get_db():
        yield _tx

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── Auth & Company helpers ────────────────────────────────────────────────


def register_user(client: TestClient, email: str = "user@example.com", password: str = "strongpassword123"):
    """Register a user and return (user_data, token)."""
    resp = client.post("/api/auth/register", json={
        "email": email, "name": email.split("@")[0], "password": password,
    })
    assert resp.status_code == 201
    data = resp.json()
    return data["user"], data["access_token"]


def create_company(client: TestClient, token: str, name: str = "Test Co", gstin: str | None = None):
    """Create a company and return the company dict."""
    payload = {"name": name}
    if gstin:
        payload["gstin"] = gstin
    resp = client.post("/api/companies", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 201
    return resp.json()


def auth_header(token: str, company_id: str | None = None) -> dict:
    h = {"Authorization": f"Bearer {token}"}
    if company_id:
        h["X-Company-Id"] = company_id
    return h


def create_db_company(db, name: str = "Test Co") -> "Company":
    """Create a Company record directly in DB (for service-level tests)."""
    from app.models.user import Company
    co = Company(name=name, is_active=True)
    db.add(co)
    db.commit()
    db.refresh(co)
    return co
