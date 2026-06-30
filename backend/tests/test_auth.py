"""Tests for auth endpoints: register, login, me."""
from __future__ import annotations


def test_register_success(client):
    resp = client.post("/api/auth/register", json={
        "email": "test@example.com",
        "name": "Test User",
        "password": "strongpassword123",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["email"] == "test@example.com"
    assert data["user"]["name"] == "Test User"
    assert data["user"]["is_superadmin"] is False


def test_register_duplicate_email(client):
    payload = {"email": "dup@example.com", "name": "User", "password": "strongpassword123"}
    client.post("/api/auth/register", json=payload)
    resp = client.post("/api/auth/register", json=payload)
    assert resp.status_code == 409


def test_register_short_password(client):
    resp = client.post("/api/auth/register", json={
        "email": "short@example.com",
        "name": "User",
        "password": "abc",
    })
    assert resp.status_code == 422


def test_login_success(client):
    client.post("/api/auth/register", json={
        "email": "login@example.com",
        "name": "Login User",
        "password": "strongpassword123",
    })
    resp = client.post("/api/auth/login", json={
        "email": "login@example.com",
        "password": "strongpassword123",
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password(client):
    client.post("/api/auth/register", json={
        "email": "wrong@example.com",
        "name": "User",
        "password": "strongpassword123",
    })
    resp = client.post("/api/auth/login", json={
        "email": "wrong@example.com",
        "password": "wrongpassword",
    })
    assert resp.status_code == 401


def test_login_nonexistent_user(client):
    resp = client.post("/api/auth/login", json={
        "email": "nobody@example.com",
        "password": "whatever",
    })
    assert resp.status_code == 401


def test_me_authenticated(client):
    reg = client.post("/api/auth/register", json={
        "email": "me@example.com",
        "name": "Me User",
        "password": "strongpassword123",
    })
    token = reg.json()["access_token"]
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["user"]["email"] == "me@example.com"
    assert resp.json()["companies"] == []


def test_me_unauthenticated(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code in (401, 403)
