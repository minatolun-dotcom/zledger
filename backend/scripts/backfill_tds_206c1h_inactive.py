#!/usr/bin/env python3
"""Deactivate Section 206C(1H) (TCS on sale of goods) for all companies.

Section 206C(1H) was made inapplicable with effect from 1 April 2025 by the
Finance Act, 2025 (and is not carried into the Income-tax Act, 2025). This
backfill marks any still-active seeded 206C-1H sections as inactive so the
section list and TDS/TCS calculations mirror the current law (TallyPrime).

Usage:
    docker-compose exec api python scripts/backfill_tds_206c1h_inactive.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session  # noqa: E402

from app.core.db import SessionLocal  # noqa: E402
from app.models.tds_tcs import TdsTcsSection  # noqa: E402


def main() -> None:
    db: Session = SessionLocal()
    try:
        rows = db.query(TdsTcsSection).filter(
            TdsTcsSection.section_code == "206C-1H",
            TdsTcsSection.is_active.is_(True),
        ).all()
        for r in rows:
            r.is_active = False
        db.commit()
        print(f"Deactivated {len(rows)} 206C-1H section(s) across companies")
    finally:
        db.close()


if __name__ == "__main__":
    main()
