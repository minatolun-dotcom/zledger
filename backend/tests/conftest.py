"""Shared test fixtures: PostgreSQL DB, FastAPI TestClient, auth helpers."""
from __future__ import annotations

import os

# Use DATABASE_URL from environment (PostgreSQL in Docker), fall back to SQLite for local dev.
if "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = "sqlite:///test.db"

import pytest
from fastapi.testclient import TestClient

# Import models to register them on Base.metadata BEFORE create_all.
import app.models  # noqa: F401
from app.core.db import Base, SessionLocal
from app.main import app


@pytest.fixture(autouse=True)
def setup_db():
    """Create all tables before each test, drop after."""
    engine = SessionLocal.kw["bind"]
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


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
