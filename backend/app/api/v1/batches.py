"""Batch tracking endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, require_role
from app.models.user import Company
from app.schemas.batch import (
    BatchCreate,
    BatchLedgerCreate,
    BatchLedgerOut,
    BatchOut,
    BatchUpdate,
)
from app.schemas.member import CompanyRole
from app.services.batch import (
    create_batch,
    create_batch_ledger_entry,
    delete_batch,
    get_batch,
    get_batch_by_number,
    get_batch_ledger,
    get_batch_summary,
    get_batches_for_production_order,
    list_batches,
    trace_batch,
    update_batch,
)

router = APIRouter()


# ── Batch CRUD ──────────────────────────────────────────────────────────

@router.get("/batches", response_model=list[BatchOut])
def list_batches_endpoint(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    stock_item_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
):
    batches = list_batches(db, company.id, stock_item_id, status)
    result = []
    for b in batches:
        item = b.stock_item
        out = BatchOut(
            id=b.id,
            company_id=b.company_id,
            stock_item_id=b.stock_item_id,
            item_name=item.name if item else None,
            batch_number=b.batch_number,
            manufacturing_date=b.manufacturing_date,
            expiry_date=b.expiry_date,
            quantity=float(b.quantity),
            status=b.status,
            created_at=b.created_at,
            updated_at=b.updated_at,
        )
        result.append(out)
    return result


@router.post("/batches", response_model=BatchOut, status_code=201)
def create_batch_endpoint(
    payload: BatchCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    try:
        batch = create_batch(db, company.id, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    db.refresh(batch)
    item = batch.stock_item
    return BatchOut(
        id=batch.id,
        company_id=batch.company_id,
        stock_item_id=batch.stock_item_id,
        item_name=item.name if item else None,
        batch_number=batch.batch_number,
        manufacturing_date=batch.manufacturing_date,
        expiry_date=batch.expiry_date,
        quantity=float(batch.quantity),
        status=batch.status,
        created_at=batch.created_at,
        updated_at=batch.updated_at,
    )


@router.get("/batches/{batch_id}", response_model=BatchOut)
def get_batch_endpoint(
    batch_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    batch = get_batch(db, company.id, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    item = batch.stock_item
    return BatchOut(
        id=batch.id,
        company_id=batch.company_id,
        stock_item_id=batch.stock_item_id,
        item_name=item.name if item else None,
        batch_number=batch.batch_number,
        manufacturing_date=batch.manufacturing_date,
        expiry_date=batch.expiry_date,
        quantity=float(batch.quantity),
        status=batch.status,
        created_at=batch.created_at,
        updated_at=batch.updated_at,
    )


@router.patch("/batches/{batch_id}", response_model=BatchOut)
def update_batch_endpoint(
    batch_id: str,
    payload: BatchUpdate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    try:
        batch = update_batch(db, company.id, batch_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    db.refresh(batch)
    item = batch.stock_item
    return BatchOut(
        id=batch.id,
        company_id=batch.company_id,
        stock_item_id=batch.stock_item_id,
        item_name=item.name if item else None,
        batch_number=batch.batch_number,
        manufacturing_date=batch.manufacturing_date,
        expiry_date=batch.expiry_date,
        quantity=float(batch.quantity),
        status=batch.status,
        created_at=batch.created_at,
        updated_at=batch.updated_at,
    )


@router.delete("/batches/{batch_id}", status_code=204)
def delete_batch_endpoint(
    batch_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    try:
        delete_batch(db, company.id, batch_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()


# ── Batch Ledger ────────────────────────────────────────────────────────

@router.get("/batches/{batch_id}/ledger", response_model=list[BatchLedgerOut])
def get_batch_ledger_endpoint(
    batch_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    try:
        return get_batch_ledger(db, company.id, batch_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/batches/{batch_id}/ledger", response_model=BatchLedgerOut, status_code=201)
def create_batch_ledger_endpoint(
    batch_id: str,
    payload: BatchLedgerCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    try:
        entry = create_batch_ledger_entry(
            db,
            company.id,
            batch_id,
            entry_type=payload.entry_type,
            quantity=payload.quantity,
            rate=payload.rate,
            reference=payload.reference,
        )
        db.commit()
        db.refresh(entry)
        return entry
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Batch Trace ─────────────────────────────────────────────────────────

@router.get("/batches/trace/{batch_number}")
def trace_batch_endpoint(
    batch_number: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    results = trace_batch(db, company.id, batch_number)
    if not results:
        raise HTTPException(status_code=404, detail=f"No batches found with number '{batch_number}'")
    return results


# ── Batch Summary ───────────────────────────────────────────────────────

@router.get("/stock-items/{item_id}/batch-summary")
def get_batch_summary_endpoint(
    item_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    return get_batch_summary(db, company.id, item_id)


# ── Production Order Batches ────────────────────────────────────────────

@router.get("/production-orders/{order_id}/batches")
def get_production_order_batches_endpoint(
    order_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    return get_batches_for_production_order(db, company.id, order_id)


# ── Expiry Alerts ──────────────────────────────────────────────────────

@router.get("/batches/expiring")
def get_expiring_batches_endpoint(
    days: int = Query(default=30, ge=1, le=365),
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    from datetime import date, timedelta
    from app.models.batch import Batch as BatchModel
    from app.models.stock import StockItem

    cutoff = (date.today() + timedelta(days=days)).isoformat()
    today = date.today().isoformat()

    batches = db.query(BatchModel).filter(
        BatchModel.company_id == company.id,
        BatchModel.status == "active",
        BatchModel.expiry_date.isnot(None),
        BatchModel.expiry_date <= cutoff,
    ).order_by(BatchModel.expiry_date).all()

    result = []
    for b in batches:
        item = db.get(StockItem, b.stock_item_id)
        exp = b.expiry_date
        days_left = (date.fromisoformat(exp) - date.today()).days if exp else None
        result.append({
            "id": b.id,
            "stock_item_id": b.stock_item_id,
            "item_name": item.name if item else None,
            "batch_number": b.batch_number,
            "expiry_date": exp,
            "quantity": float(b.quantity),
            "days_left": days_left,
            "status": "expired" if days_left is not None and days_left < 0 else "expiring_soon" if days_left is not None and days_left <= 30 else "ok",
        })
    return result


# ── Batch Report ───────────────────────────────────────────────────────

@router.get("/batches/report")
def batch_report_endpoint(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    from app.models.batch import Batch as BatchModel, BatchLedger
    from app.models.stock import StockItem
    from sqlalchemy import func

    batches = db.query(BatchModel).filter(BatchModel.company_id == company.id).all()
    items = {i.id: i for i in db.query(StockItem).filter(StockItem.company_id == company.id).all()}

    total_batches = len(batches)
    active_batches = sum(1 for b in batches if b.status == "active")
    total_qty = sum(float(b.quantity) for b in batches)

    # Per-item summary
    item_summary = {}
    for b in batches:
        item = items.get(b.stock_item_id)
        name = item.name if item else "Unknown"
        if name not in item_summary:
            item_summary[name] = {"item_name": name, "batch_count": 0, "total_qty": 0, "active": 0}
        item_summary[name]["batch_count"] += 1
        item_summary[name]["total_qty"] += float(b.quantity)
        if b.status == "active":
            item_summary[name]["active"] += 1

    return {
        "total_batches": total_batches,
        "active_batches": active_batches,
        "total_quantity": total_qty,
        "by_item": sorted(item_summary.values(), key=lambda x: x["total_qty"], reverse=True),
    }
