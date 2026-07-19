"""Global search across all entities."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, require_role
from app.models.accounting import AccountGroup, Ledger, Party, party_type_label
from app.models.stock import StockItem
from app.models.user import Company, User
from app.models.voucher import Voucher
from app.schemas.member import CompanyRole

router = APIRouter()

MAX_RESULTS = 50


@router.get("")
def global_search(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(50, ge=1, le=100),
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Search across ledgers, parties, stock items, vouchers, and account groups.

    Returns categorized results with navigation links.
    """
    term = f"%{q}%"
    results: list[dict] = []
    seen: set[str] = set()

    def add(entity_type: str, id_val: str, name: str, subtitle: str, link: str):
        key = f"{entity_type}:{id_val}"
        if key not in seen:
            seen.add(key)
            results.append({
                "entity_type": entity_type,
                "id": id_val,
                "name": name,
                "subtitle": subtitle,
                "link": link,
            })

    # Ledgers
    ledgers = db.query(Ledger).filter(
        Ledger.company_id == company.id,
        Ledger.name.ilike(term),
        Ledger.is_active.is_(True),
    ).limit(limit).all()
    for l in ledgers:
        group_name = l.group.name if l.group else ""
        add("ledger", l.id, l.name, group_name, f"/chart-of-accounts?highlight={l.id}")

    # Parties
    parties = db.query(Party).filter(
        Party.company_id == company.id,
        Party.name.ilike(term),
        Party.is_active.is_(True),
    ).limit(limit).all()
    for p in parties:
        add("party", p.id, p.name, party_type_label(p.party_type), f"/chart-of-accounts?highlight={p.id}")

    # Stock Items
    items = db.query(StockItem).filter(
        StockItem.company_id == company.id,
        StockItem.name.ilike(term),
        StockItem.is_active.is_(True),
    ).limit(limit).all()
    for si in items:
        add("stock_item", si.id, si.name, si.sku or si.unit_of_measure or "", f"/inventory?highlight={si.id}")

    # Account Groups
    groups = db.query(AccountGroup).filter(
        AccountGroup.company_id == company.id,
        AccountGroup.name.ilike(term),
    ).limit(limit).all()
    for ag in groups:
        add("account_group", ag.id, ag.name, ag.system_code or ag.nature, f"/chart-of-accounts?highlight={ag.id}")

    # Vouchers
    vouchers = db.query(Voucher).filter(
        Voucher.company_id == company.id,
        (Voucher.voucher_number.ilike(term) | Voucher.narration.ilike(term)),
    ).order_by(Voucher.voucher_date.desc()).limit(limit).all()
    for v in vouchers:
        add("voucher", v.id, v.voucher_number or v.id, v.narration or "", f"/vouchers/{v.id}")

    return {"results": results[:limit], "total": len(results)}
