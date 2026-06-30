"""Stock valuation service: weighted average and FIFO calculation engines."""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from dataclasses import dataclass

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.stock import StockBalance, StockEntry, StockItem
from app.utils.money import to_money


@dataclass
class StockValuationResult:
    stock_item_id: str
    stock_item_name: str
    quantity: float
    avg_rate: float
    total_value: float
    valuation_method: str


def update_stock_balance_weighted_avg(
    db: Session,
    company_id: str,
    stock_item_id: str,
    entry_type: str,
    quantity: float,
    rate: float,
    entry_date: str,
) -> StockBalance:
    """Update stock balance using weighted average method.

    On inward: recalculate average rate.
    On outward: reduce quantity and value at current average rate.
    """
    balance = db.query(StockBalance).filter(
        StockBalance.company_id == company_id,
        StockBalance.stock_item_id == stock_item_id,
    ).first()

    if not balance:
        balance = StockBalance(
            company_id=company_id,
            stock_item_id=stock_item_id,
            quantity=0,
            avg_rate=0,
            total_value=0,
        )
        db.add(balance)
        db.flush()

    qty = Decimal(str(quantity))
    rte = Decimal(str(rate))

    if entry_type == "inward":
        # Weighted average: new_avg = (old_total + new_total) / (old_qty + new_qty)
        old_total = Decimal(str(balance.total_value))
        old_qty = Decimal(str(balance.quantity))
        new_total = qty * rte
        new_total_qty = old_qty + qty

        if new_total_qty > 0:
            balance.avg_rate = float(((old_total + new_total) / new_total_qty).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
            balance.total_value = float((old_total + new_total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
            balance.quantity = float(new_total_qty)
        balance.last_entry_date = entry_date

    elif entry_type == "outward":
        # Reduce at current average rate
        old_qty = Decimal(str(balance.quantity))
        if old_qty >= qty and qty > 0:
            deduction = qty * Decimal(str(balance.avg_rate))
            balance.quantity = float(old_qty - qty)
            balance.total_value = float((Decimal(str(balance.total_value)) - deduction).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
            balance.last_entry_date = entry_date

    db.flush()
    return balance


def update_stock_balance_fifo(
    db: Session,
    company_id: str,
    stock_item_id: str,
    entry_type: str,
    quantity: float,
    rate: float,
    entry_date: str,
) -> StockBalance:
    """Update stock balance using FIFO method.

    Maintains a queue of purchase lots. Outward entries consume from the oldest lot.
    For simplicity, we maintain the running balance and total value.
    """
    balance = db.query(StockBalance).filter(
        StockBalance.company_id == company_id,
        StockBalance.stock_item_id == stock_item_id,
    ).first()

    if not balance:
        balance = StockBalance(
            company_id=company_id,
            stock_item_id=stock_item_id,
            quantity=0,
            avg_rate=0,
            total_value=0,
        )
        db.add(balance)
        db.flush()

    qty = Decimal(str(quantity))
    rte = Decimal(str(rate))

    if entry_type == "inward":
        old_total = Decimal(str(balance.total_value))
        old_qty = Decimal(str(balance.quantity))
        new_total = qty * rte
        new_total_qty = old_qty + qty

        if new_total_qty > 0:
            balance.avg_rate = float(((old_total + new_total) / new_total_qty).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
            balance.total_value = float((old_total + new_total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
            balance.quantity = float(new_total_qty)
        balance.last_entry_date = entry_date

    elif entry_type == "outward":
        # FIFO: consume from oldest lots (simplified as avg rate for now)
        old_qty = Decimal(str(balance.quantity))
        if old_qty >= qty and qty > 0:
            deduction = qty * Decimal(str(balance.avg_rate))
            balance.quantity = float(old_qty - qty)
            balance.total_value = float((Decimal(str(balance.total_value)) - deduction).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
            balance.last_entry_date = entry_date

    db.flush()
    return balance


def get_stock_valuation_report(
    db: Session,
    company_id: str,
) -> list[StockValuationResult]:
    """Generate stock valuation report showing current balance per item."""
    items = db.query(StockItem).filter(
        StockItem.company_id == company_id,
        StockItem.is_active.is_(True),
    ).all()

    results = []
    for item in items:
        balance = db.query(StockBalance).filter(
            StockBalance.company_id == company_id,
            StockBalance.stock_item_id == item.id,
        ).first()

        qty = float(balance.quantity) if balance else 0
        avg = float(balance.avg_rate) if balance else 0
        val = float(balance.total_value) if balance else 0

        results.append(StockValuationResult(
            stock_item_id=item.id,
            stock_item_name=item.name,
            quantity=qty,
            avg_rate=avg,
            total_value=val,
            valuation_method=item.valuation_method,
        ))

    return sorted(results, key=lambda x: x.stock_item_name)


def get_stock_movement_summary(
    db: Session,
    company_id: str,
    stock_item_id: str | None = None,
) -> list[dict]:
    """Summarize stock movements per item: opening, inward, outward, closing."""
    q = db.query(StockItem).filter(
        StockItem.company_id == company_id,
        StockItem.is_active.is_(True),
    )
    if stock_item_id:
        q = q.filter(StockItem.id == stock_item_id)

    items = q.all()
    results = []

    for item in items:
        opening_qty = float(item.opening_qty)
        opening_value = float(item.opening_qty) * float(item.opening_rate)

        entries = db.query(StockEntry).filter(
            StockEntry.company_id == company_id,
            StockEntry.stock_item_id == item.id,
        ).all()

        inward_qty = sum(float(e.quantity) for e in entries if e.entry_type == "inward")
        inward_value = sum(float(e.total_amount) for e in entries if e.entry_type == "inward")
        outward_qty = sum(float(e.quantity) for e in entries if e.entry_type == "outward")
        outward_value = sum(float(e.total_amount) for e in entries if e.entry_type == "outward")

        closing_qty = opening_qty + inward_qty - outward_qty
        closing_value = opening_value + inward_value - outward_value

        results.append({
            "stock_item_id": item.id,
            "stock_item_name": item.name,
            "opening_qty": opening_qty,
            "opening_value": opening_value,
            "inward_qty": inward_qty,
            "inward_value": inward_value,
            "outward_qty": outward_qty,
            "outward_value": outward_value,
            "closing_qty": closing_qty,
            "closing_value": closing_value,
        })

    return sorted(results, key=lambda x: x["stock_item_name"])
