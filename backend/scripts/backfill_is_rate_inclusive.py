#!/usr/bin/env python3
"""Backfill is_rate_inclusive for existing voucher lines that were created
with inclusive pricing but the flag was not stored (bug in _process_voucher_lines).

Usage:
    docker-compose exec api python scripts/backfill_is_rate_inclusive.py
"""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from decimal import Decimal
from sqlalchemy.orm import Session, joinedload
from app.core.db import SessionLocal
from app.models.voucher import VoucherLine
from app.models.stock import StockItem


def gst_rate_for_line(line: VoucherLine) -> Decimal | None:
    if line.stock_item_id:
        item = line.stock_item
        if item and item.gst_rate and item.gst_rate > 0:
            return Decimal(str(item.gst_rate))
    return None


def main():
    db: Session = SessionLocal()
    try:
        lines = (
            db.query(VoucherLine)
            .options(joinedload(VoucherLine.stock_item))
            .filter(
                VoucherLine.stock_item_id.isnot(None),
                VoucherLine.quantity.isnot(None),
                VoucherLine.rate.isnot(None),
                VoucherLine.line_total.isnot(None),
                VoucherLine.is_rate_inclusive == False,
            )
            .all()
        )
        print(f"Found {len(lines)} candidate lines with is_rate_inclusive=False")

        updated = 0
        for line in lines:
            gst_rate = gst_rate_for_line(line)
            if gst_rate is None or gst_rate == 0:
                continue

            qty = Decimal(str(line.quantity))
            rate = Decimal(str(line.rate))
            discount = Decimal(str(line.discount_amount or 0))
            line_total = Decimal(str(line.line_total))

            gross = qty * rate - discount
            expected_exclusive = gross
            expected_inclusive = (gross / (Decimal("1") + gst_rate / Decimal("100"))).quantize(Decimal("0.01"))

            # If stored line_total matches the inclusive back-calculation (within 1 paisa),
            # then this line was created with inclusive pricing
            if abs(line_total - expected_inclusive) <= Decimal("0.01") and abs(line_total - expected_exclusive) > Decimal("0.01"):
                line.is_rate_inclusive = True
                updated += 1
                print(f"  Updated line {line.id}: line_total={line_total}, gross={gross}, gst_rate={gst_rate}")

        db.commit()
        print(f"Backfilled {updated} lines")
    finally:
        db.close()


if __name__ == "__main__":
    main()
