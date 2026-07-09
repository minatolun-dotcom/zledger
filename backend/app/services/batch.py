"""Batch service: CRUD, ledger, trace for batch tracking."""
from __future__ import annotations

from decimal import Decimal
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.batch import Batch, BatchLedger
from app.models.stock import StockItem, StockEntry
from app.schemas.batch import BatchCreate, BatchUpdate


# ── Batch CRUD ──────────────────────────────────────────────────────────

def list_batches(
    db: Session, company_id: str,
    stock_item_id: str | None = None,
    status: str | None = None,
) -> list[Batch]:
    """List all batches for a company, optionally filtered by item or status."""
    q = db.query(Batch).filter(Batch.company_id == company_id)
    if stock_item_id:
        q = q.filter(Batch.stock_item_id == stock_item_id)
    if status:
        q = q.filter(Batch.status == status)
    return q.order_by(Batch.batch_number).all()


def get_batch(db: Session, company_id: str, batch_id: str) -> Batch | None:
    """Get a single batch by ID."""
    return db.query(Batch).filter(
        Batch.id == batch_id,
        Batch.company_id == company_id,
    ).first()


def get_batch_by_number(db: Session, company_id: str, stock_item_id: str, batch_number: str) -> Batch | None:
    """Get a batch by stock_item_id + batch_number."""
    return db.query(Batch).filter(
        Batch.company_id == company_id,
        Batch.stock_item_id == stock_item_id,
        Batch.batch_number == batch_number,
    ).first()


def create_batch(db: Session, company_id: str, data: BatchCreate) -> Batch:
    """Create a new batch. Validates that the stock item exists."""
    item = db.get(StockItem, data.stock_item_id)
    if not item or item.company_id != company_id:
        raise ValueError("Stock item not found")
    if item.tracking_mode == "none":
        raise ValueError(f"Item '{item.name}' does not have batch tracking enabled")

    existing = get_batch_by_number(db, company_id, data.stock_item_id, data.batch_number)
    if existing:
        raise ValueError(f"Batch '{data.batch_number}' already exists for this item")

    batch = Batch(
        company_id=company_id,
        stock_item_id=data.stock_item_id,
        batch_number=data.batch_number,
        manufacturing_date=data.manufacturing_date,
        expiry_date=data.expiry_date,
        quantity=data.quantity,
        status="active",
    )
    db.add(batch)
    db.flush()
    return batch


def update_batch(db: Session, company_id: str, batch_id: str, data: BatchUpdate) -> Batch:
    """Update batch fields."""
    batch = get_batch(db, company_id, batch_id)
    if not batch:
        raise ValueError("Batch not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(batch, field, value)
    db.flush()
    return batch


def delete_batch(db: Session, company_id: str, batch_id: str) -> None:
    """Delete a batch (only if quantity is 0 and no ledger entries)."""
    batch = get_batch(db, company_id, batch_id)
    if not batch:
        raise ValueError("Batch not found")
    if batch.quantity > 0:
        raise ValueError("Cannot delete batch with remaining quantity")
    entry_count = db.query(func.count(BatchLedger.id)).filter(BatchLedger.batch_id == batch_id).scalar()
    if entry_count > 0:
        raise ValueError("Cannot delete batch with ledger history")
    db.delete(batch)
    db.flush()


# ── Batch Ledger ────────────────────────────────────────────────────────

def get_batch_ledger(db: Session, company_id: str, batch_id: str) -> list[BatchLedger]:
    """Get all ledger entries for a batch, ordered by date."""
    batch = get_batch(db, company_id, batch_id)
    if not batch:
        raise ValueError("Batch not found")
    return db.query(BatchLedger).filter(
        BatchLedger.batch_id == batch_id,
    ).order_by(BatchLedger.created_at).all()


def create_batch_ledger_entry(
    db: Session,
    company_id: str,
    batch_id: str,
    entry_type: str,
    quantity: float,
    rate: float,
    stock_entry_id: str | None = None,
    production_order_id: str | None = None,
    reference: str | None = None,
) -> BatchLedger:
    """Create a ledger entry and update batch quantity."""
    batch = get_batch(db, company_id, batch_id)
    if not batch:
        raise ValueError("Batch not found")

    entry = BatchLedger(
        company_id=company_id,
        batch_id=batch_id,
        stock_entry_id=stock_entry_id,
        production_order_id=production_order_id,
        entry_type=entry_type,
        quantity=quantity,
        rate=rate,
        reference=reference,
    )
    db.add(entry)

    # Update batch quantity
    if entry_type == "inward":
        batch.quantity = float(Decimal(str(batch.quantity)) + Decimal(str(quantity)))
    elif entry_type == "outward":
        new_qty = float(Decimal(str(batch.quantity)) - Decimal(str(quantity)))
        if new_qty < 0:
            raise ValueError(f"Insufficient quantity in batch '{batch.batch_number}': has {batch.quantity}, tried to remove {quantity}")
        batch.quantity = new_qty
        if batch.quantity == 0:
            batch.status = "exhausted"

    db.flush()
    return entry


# ── Batch Trace ─────────────────────────────────────────────────────────

def trace_batch(db: Session, company_id: str, batch_number: str) -> list[dict]:
    """Trace a batch number across all stock items in a company."""
    batches = db.query(Batch).filter(
        Batch.company_id == company_id,
        Batch.batch_number == batch_number,
    ).all()

    results = []
    for batch in batches:
        item = db.get(StockItem, batch.stock_item_id)
        ledger_entries = db.query(BatchLedger).filter(
            BatchLedger.batch_id == batch.id,
        ).order_by(BatchLedger.created_at).all()

        results.append({
            "batch_id": batch.id,
            "stock_item_id": batch.stock_item_id,
            "item_name": item.name if item else None,
            "batch_number": batch.batch_number,
            "manufacturing_date": batch.manufacturing_date,
            "expiry_date": batch.expiry_date,
            "current_quantity": batch.quantity,
            "status": batch.status,
            "ledger": [
                {
                    "id": le.id,
                    "entry_type": le.entry_type,
                    "quantity": le.quantity,
                    "rate": le.rate,
                    "reference": le.reference,
                    "created_at": le.created_at.isoformat() if le.created_at else None,
                }
                for le in ledger_entries
            ],
        })
    return results


def get_batch_summary(db: Session, company_id: str, stock_item_id: str) -> dict:
    """Get batch-wise stock summary for a stock item."""
    batches = db.query(Batch).filter(
        Batch.company_id == company_id,
        Batch.stock_item_id == stock_item_id,
    ).order_by(Batch.batch_number).all()

    item = db.get(StockItem, stock_item_id)
    total_qty = sum(float(b.quantity) for b in batches)

    return {
        "stock_item_id": stock_item_id,
        "item_name": item.name if item else None,
        "total_batches": len(batches),
        "total_quantity": total_qty,
        "batches": [
            {
                "id": b.id,
                "batch_number": b.batch_number,
                "manufacturing_date": b.manufacturing_date,
                "expiry_date": b.expiry_date,
                "quantity": b.quantity,
                "status": b.status,
            }
            for b in batches
        ],
    }


def get_batches_for_production_order(db: Session, company_id: str, order_id: str) -> list[dict]:
    """Get all batches used in a production order's stock entries."""
    entries = db.query(StockEntry).filter(
        StockEntry.company_id == company_id,
        StockEntry.reference == order_id,
        StockEntry.batch_id.isnot(None),
    ).all()

    results = []
    seen_batch_ids = set()
    for entry in entries:
        if entry.batch_id and entry.batch_id not in seen_batch_ids:
            seen_batch_ids.add(entry.batch_id)
            batch = db.get(Batch, entry.batch_id)
            item = db.get(StockItem, entry.stock_item_id) if batch else None
            if batch:
                results.append({
                    "batch_id": batch.id,
                    "batch_number": batch.batch_number,
                    "stock_item_id": entry.stock_item_id,
                    "item_name": item.name if item else None,
                    "entry_type": entry.entry_type,
                    "quantity": entry.quantity,
                })
    return results
