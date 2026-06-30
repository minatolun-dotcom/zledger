"""Security utilities: password hashing and JWT token creation.

Uses the ``bcrypt`` library directly (passlib 1.7.4 is unmaintained and breaks
with bcrypt >= 4.1). Bcrypt has a 72-byte input limit, so we hash longer inputs
with SHA-256 first (a standard, safe approach) — the common case (passwords
shorter than 72 bytes) is hashed directly.

Kept minimal here; login endpoint + dependencies live in core/dependencies.py.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import jwt

from app.core.config import settings

_BCRYPT_MAX = 72


def _prepare_password(raw: str) -> bytes:
    """Return bytes suitable for bcrypt (<=72 bytes)."""
    raw_bytes = raw.encode("utf-8")
    if len(raw_bytes) > _BCRYPT_MAX:
        # Pre-hash with SHA-256 and base64-encode to stay within bcrypt's limit.
        raw_bytes = hashlib.sha256(raw_bytes).hexdigest().encode("ascii")
    return raw_bytes


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(_prepare_password(raw), bcrypt.gensalt()).decode("utf-8")


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_prepare_password(raw), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(
    subject: str | int, extra: dict[str, Any] | None = None
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {"sub": str(subject), "iat": now, "exp": expire}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
