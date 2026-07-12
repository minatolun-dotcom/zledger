"""Inventory endpoints: stock groups, stock items, stock entries."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import (
    get_active_company,
    pagination_params,
    Pagination,
    require_role,
)
from app.models.stock import StockBalance, StockEntry, StockGroup, StockItem
from app.models.user import Company
from app.schemas.member import CompanyRole
from app.schemas.stock import (
    StockEntryCreate,
    StockEntryOut,
    StockGroupCreate,
    StockGroupOut,
    StockItemCreate,
    StockItemOut,
)
from app.schemas.common import BulkActionResult, BulkDeleteRequest
from app.services.stock_valuation import (
    get_stock_movement_summary,
    get_stock_valuation_report,
    update_stock_balance_fifo,
    update_stock_balance_weighted_avg,
)

router = APIRouter()


# ── Stock Groups ─────────────────────────────────────────────────────────

@router.get("/groups", response_model=list[StockGroupOut])
def list_groups(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
    search: str | None = Query(default=None),
    pagination: Pagination = Depends(pagination_params),
    response: Response = None,
):
    q = db.query(StockGroup).filter(StockGroup.company_id == company.id)
    if search:
        search_term = f"%{search}%"
        q = q.filter(StockGroup.name.ilike(search_term))
    total = q.count()
    items = pagination.apply(q.order_by(StockGroup.name)).all()
    if response is not None and pagination.limit is not None:
        response.headers.update(pagination.header(total))
    return items


@router.post("/groups", response_model=StockGroupOut, status_code=201)
def create_group(
    payload: StockGroupCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    sg = StockGroup(company_id=company.id, **payload.model_dump())
    db.add(sg)
    db.commit()
    db.refresh(sg)
    return sg


@router.patch("/groups/{group_id}", response_model=StockGroupOut)
def update_group(
    group_id: str,
    payload: StockGroupCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    sg = db.get(StockGroup, group_id)
    if not sg or sg.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Stock group not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(sg, k, v)
    db.commit()
    db.refresh(sg)
    return sg


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(
    group_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    sg = db.get(StockGroup, group_id)
    if not sg or sg.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Stock group not found")
    item_count = db.query(StockItem).filter(StockItem.stock_group_id == group_id).count()
    if item_count > 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot delete group with stock items")
    db.delete(sg)
    db.commit()


@router.post("/groups/bulk-delete", response_model=BulkActionResult)
def bulk_delete_groups(
    payload: BulkDeleteRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    processed = 0
    errors: list[str] = []
    for gid in payload.ids:
        sg = db.get(StockGroup, gid)
        if not sg or sg.company_id != company.id:
            errors.append(f"Group {gid} not found")
            continue
        item_count = db.query(StockItem).filter(StockItem.stock_group_id == gid).count()
        if item_count > 0:
            errors.append(f"Cannot delete '{sg.name}' — has {item_count} item(s)")
            continue
        db.delete(sg)
        processed += 1
    db.commit()
    return BulkActionResult(processed=processed, errors=errors)


# ── Stock Items ──────────────────────────────────────────────────────────

@router.get("/items", response_model=list[StockItemOut])
def list_items(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
    search: str | None = Query(default=None),
    pagination: Pagination = Depends(pagination_params),
    response: Response = None,
):
    q = db.query(StockItem).filter(StockItem.company_id == company.id)
    if search:
        search_term = f"%{search}%"
        q = q.filter(StockItem.name.ilike(search_term))
    total = q.count()
    items = pagination.apply(q.order_by(StockItem.name)).all()
    if response is not None and pagination.limit is not None:
        response.headers.update(pagination.header(total))
    return items


@router.post("/items", response_model=StockItemOut, status_code=201)
def create_item(
    payload: StockItemCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    if payload.stock_group_id:
        sg = db.get(StockGroup, payload.stock_group_id)
        if not sg or sg.company_id != company.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Stock group not found")
    si = StockItem(company_id=company.id, **payload.model_dump())
    db.add(si)
    db.commit()
    db.refresh(si)
    return si


@router.patch("/items/{item_id}", response_model=StockItemOut)
def update_item(
    item_id: str,
    payload: StockItemCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    si = db.get(StockItem, item_id)
    if not si or si.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Stock item not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(si, k, v)
    db.commit()
    db.refresh(si)
    return si


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    si = db.get(StockItem, item_id)
    if not si or si.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Stock item not found")
    db.query(StockBalance).filter(StockBalance.stock_item_id == item_id).delete()
    db.query(StockEntry).filter(StockEntry.stock_item_id == item_id).delete()
    db.delete(si)
    db.commit()


@router.post("/items/bulk-delete", response_model=BulkActionResult)
def bulk_delete_items(
    payload: BulkDeleteRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    processed = 0
    errors: list[str] = []
    for iid in payload.ids:
        si = db.get(StockItem, iid)
        if not si or si.company_id != company.id:
            errors.append(f"Item {iid} not found")
            continue
        db.query(StockBalance).filter(StockBalance.stock_item_id == iid).delete()
        db.query(StockEntry).filter(StockEntry.stock_item_id == iid).delete()
        db.delete(si)
        processed += 1
    db.commit()
    return BulkActionResult(processed=processed, errors=errors)


# ── Stock Entries ────────────────────────────────────────────────────────

@router.get("/entries")
def list_entries(
    search: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    q = db.query(StockEntry).filter(StockEntry.company_id == company.id)
    if search:
        search_term = f"%{search}%"
        q = q.filter(
            StockEntry.narration.ilike(search_term) |
            StockEntry.reference.ilike(search_term)
        )

    total = q.count()
    entries = q.order_by(StockEntry.entry_date.desc()).offset(offset).limit(limit).all()
    return {"items": [StockEntryOut.model_validate(e).model_dump() for e in entries], "total": total, "limit": limit, "offset": offset}


@router.post("/entries", response_model=StockEntryOut, status_code=201)
def create_entry(
    payload: StockEntryCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    si = db.get(StockItem, payload.stock_item_id)
    if not si or si.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Stock item not found")
    total = round(payload.quantity * payload.rate, 2)
    entry = StockEntry(
        company_id=company.id,
        total_amount=total,
        **payload.model_dump(),
    )
    db.add(entry)
    db.flush()
    update_stock_balance_weighted_avg(
        db, company.id, payload.stock_item_id,
        payload.entry_type, payload.quantity, payload.rate, payload.entry_date,
    )
    db.commit()
    db.refresh(entry)
    return entry


@router.patch("/entries/{entry_id}", response_model=StockEntryOut)
def update_entry(
    entry_id: str,
    payload: StockEntryCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    entry = db.get(StockEntry, entry_id)
    if not entry or entry.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Stock entry not found")
    total = round(payload.quantity * payload.rate, 2)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(entry, k, v)
    entry.total_amount = total
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    entry_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    entry = db.get(StockEntry, entry_id)
    if not entry or entry.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Stock entry not found")
    db.delete(entry)
    db.commit()


@router.post("/entries/bulk-delete", response_model=BulkActionResult)
def bulk_delete_entries(
    payload: BulkDeleteRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    processed = 0
    errors: list[str] = []
    for eid in payload.ids:
        entry = db.get(StockEntry, eid)
        if not entry or entry.company_id != company.id:
            errors.append(f"Entry {eid} not found")
            continue
        db.delete(entry)
        processed += 1
    db.commit()
    return BulkActionResult(processed=processed, errors=errors)


# ── Stock Valuation ──────────────────────────────────────────────────────


@router.get("/valuation")
def stock_valuation(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Stock valuation report: current balance per item with avg rate and total value."""
    results = get_stock_valuation_report(db, company.id)
    return [
        {
            "stock_item_id": r.stock_item_id,
            "stock_item_name": r.stock_item_name,
            "quantity": r.quantity,
            "avg_rate": r.avg_rate,
            "total_value": r.total_value,
            "valuation_method": r.valuation_method,
        }
        for r in results
    ]


@router.get("/movement-summary")
def stock_movement_summary(
    stock_item_id: str | None = None,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Stock movement summary: opening, inward, outward, closing per item."""
    results = get_stock_movement_summary(db, company.id, stock_item_id)
    return results


@router.post("/update-balance")
def update_stock_balance_endpoint(
    stock_item_id: str,
    entry_type: str,
    quantity: float,
    rate: float,
    entry_date: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Manually update stock balance (for corrections or opening balance)."""
    si = db.get(StockItem, stock_item_id)
    if not si or si.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Stock item not found")

    if si.valuation_method == "fifo":
        balance = update_stock_balance_fifo(db, company.id, stock_item_id, entry_type, quantity, rate, entry_date)
    else:
        balance = update_stock_balance_weighted_avg(db, company.id, stock_item_id, entry_type, quantity, rate, entry_date)

    db.commit()
    return {
        "stock_item_id": balance.stock_item_id,
        "quantity": float(balance.quantity),
        "avg_rate": float(balance.avg_rate),
        "total_value": float(balance.total_value),
        "last_entry_date": balance.last_entry_date,
    }
