"""Idempotent seed entrypoint (runs on every container start).

Creates the bootstrap admin user from environment settings if it does not exist.
"""
from __future__ import annotations

from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models.user import User


def seed_bootstrap_admin() -> None:
    db = SessionLocal()
    try:
        existing = db.scalar(
            select(User).where(User.email == settings.bootstrap_admin_email)
        )
        if existing:
            return
        user = User(
            email=settings.bootstrap_admin_email,
            name=settings.bootstrap_admin_name,
            hashed_password=hash_password(settings.bootstrap_admin_password),
            is_active=True,
            is_superadmin=True,
        )
        db.add(user)
        db.commit()
        print(f"[zledger] seed: created bootstrap admin '{user.email}'")
    finally:
        db.close()


def main() -> None:
    seed_bootstrap_admin()


if __name__ == "__main__":
    main()
