"""Manufacturing service: BOM CRUD, production order lifecycle, cost tracking."""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.accounting import AccountGroup, Ledger
from app.models.manufacturing import BillOfMaterials, BomLine, ProductionOrder
from app.models.stock import StockBalance, StockEntry, StockItem
from app.models.voucher import Voucher, VoucherLine
from app.schemas.manufacturing import (
    BomCreate,
    BomUpdate,
    ProductionOrderCreate,
)
from app.services.stock_valuation import update_stock_balance_weighted_avg


# ── Helpers ────────────────────────────────────────────────────────────

def _next_order_number(db: Session, company_id: str) -> str:
    """Generate next production order number: PRD-YYYY-NNNN."""
    from datetime import date
    today = date.today()
    fy_year = str(today.year) if today.month >= 4 else str(today.year - 1)
    prefix = f"PRD-{fy_year}-"
    last = (
        db.query(ProductionOrder.order_number)
        .filter(ProductionOrder.company_id == company_id)
        .filter(ProductionOrder.order_number.like(f"{prefix}%"))
        .order_by(ProductionOrder.order_number.desc())
        .first()
    )
    if last:
        seq = int(last[0].split("-")[-1]) + 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


def _get_or_create_ledger(db: Session, company_id: str, system_code: str, name: str, group_code: str) -> Ledger:
    """Get or create a system ledger by system_code."""
    ledger = db.query(Ledger).filter(
        Ledger.company_id == company_id,
        Ledger.system_code == system_code,
    ).first()
    if ledger:
        return ledger
    group = db.query(AccountGroup).filter(
        AccountGroup.company_id == company_id,
        AccountGroup.system_code == group_code,
    ).first()
    if not group:
        group = AccountGroup(
            company_id=company_id, name=name.replace(" A/c", ""),
            system_code=group_code, group_type="sub", nature="expenses",
            is_system=True, parent_id=None,
        )
        db.add(group)
        db.flush()
    ledger = Ledger(
        company_id=company_id, name=name, system_code=system_code,
        group_id=group.id, opening_balance=0, opening_balance_type="Dr",
        is_active=True, is_protected=True,
    )
    db.add(ledger)
    db.flush()
    return ledger


# ── BOM CRUD ───────────────────────────────────────────────────────────

def create_bom(db: Session, company_id: str, payload: BomCreate) -> BillOfMaterials:
    if not payload.lines:
        raise ValueError("BOM must have at least one component line")
    bom = BillOfMaterials(
        company_id=company_id,
        name=payload.name,
        finished_item_id=payload.finished_item_id,
        output_qty=payload.output_qty,
    )
    db.add(bom)
    db.flush()
    for line in payload.lines:
        db.add(BomLine(
            bom_id=bom.id,
            stock_item_id=line.stock_item_id,
            quantity=line.quantity,
            rate=line.rate,
            wastage_pct=line.wastage_pct,
        ))
    db.flush()
    return get_bom(db, company_id, bom.id)


def get_bom(db: Session, company_id: str, bom_id: str) -> BillOfMaterials | None:
    from app.models.stock import StockItem
    bom = db.query(BillOfMaterials).options(
        joinedload(BillOfMaterials.lines).joinedload(BomLine.stock_item)
    ).filter(
        BillOfMaterials.id == bom_id,
        BillOfMaterials.company_id == company_id,
    ).first()
    return bom


def list_boms(db: Session, company_id: str, search: str | None = None) -> list[BillOfMaterials]:
    q = db.query(BillOfMaterials).options(
        joinedload(BillOfMaterials.lines).joinedload(BomLine.stock_item)
    ).filter(BillOfMaterials.company_id == company_id)
    if search:
        q = q.filter(BillOfMaterials.name.ilike(f"%{search}%"))
    return q.order_by(BillOfMaterials.name).all()


def update_bom(db: Session, company_id: str, bom_id: str, payload: BomUpdate) -> BillOfMaterials | None:
    bom = get_bom(db, company_id, bom_id)
    if not bom:
        return None
    if payload.name is not None:
        bom.name = payload.name
    if payload.finished_item_id is not None:
        bom.finished_item_id = payload.finished_item_id
    if payload.output_qty is not None:
        bom.output_qty = payload.output_qty
    if payload.is_active is not None:
        bom.is_active = payload.is_active
    if payload.lines is not None:
        db.query(BomLine).filter(BomLine.bom_id == bom.id).delete()
        for line in payload.lines:
            db.add(BomLine(
                bom_id=bom.id,
                stock_item_id=line.stock_item_id,
                quantity=line.quantity,
                rate=line.rate,
                wastage_pct=line.wastage_pct,
            ))
    db.flush()
    return get_bom(db, company_id, bom_id)


def delete_bom(db: Session, company_id: str, bom_id: str) -> bool:
    bom = get_bom(db, company_id, bom_id)
    if not bom:
        return False
    ref_count = db.query(ProductionOrder).filter(ProductionOrder.bom_id == bom.id).count()
    if ref_count > 0:
        return False
    db.query(BomLine).filter(BomLine.bom_id == bom.id).delete()
    db.delete(bom)
    db.flush()
    return True


# ── Production Orders ──────────────────────────────────────────────────

def create_production_order(
    db: Session, company_id: str, user_id: str, payload: ProductionOrderCreate,
) -> ProductionOrder:
    bom = db.query(BillOfMaterials).filter(
        BillOfMaterials.id == payload.bom_id,
        BillOfMaterials.company_id == company_id,
    ).first()
    if not bom:
        raise ValueError("BOM not found")
    if not bom.is_active:
        raise ValueError("BOM is inactive")
    order = ProductionOrder(
        company_id=company_id,
        bom_id=payload.bom_id,
        order_number=_next_order_number(db, company_id),
        order_date=payload.order_date,
        planned_qty=payload.planned_qty,
        narration=payload.narration,
        created_by=user_id,
    )
    db.add(order)
    db.flush()
    return order


def get_production_order(db: Session, company_id: str, order_id: str) -> ProductionOrder | None:
    return db.query(ProductionOrder).options(
        joinedload(ProductionOrder.bom)
    ).filter(
        ProductionOrder.id == order_id,
        ProductionOrder.company_id == company_id,
    ).first()


def list_production_orders(
    db: Session, company_id: str, status: str | None = None,
) -> list[ProductionOrder]:
    q = db.query(ProductionOrder).options(
        joinedload(ProductionOrder.bom)
    ).filter(ProductionOrder.company_id == company_id)
    if status:
        q = q.filter(ProductionOrder.status == status)
    return q.order_by(ProductionOrder.order_date.desc()).all()


def check_material_availability(
    db: Session, company_id: str, bom_id: str, planned_qty: float,
) -> list[dict]:
    """Check if raw materials are available for a BOM at given quantity.

    Returns list of components with required qty, available qty, and sufficient flag.
    """
    from app.models.stock import StockBalance, StockItem

    bom = db.query(BillOfMaterials).options(
        joinedload(BillOfMaterials.lines)
    ).filter(
        BillOfMaterials.id == bom_id,
        BillOfMaterials.company_id == company_id,
    ).first()
    if not bom:
        return []

    planned = Decimal(str(planned_qty))
    output_qty = Decimal(str(bom.output_qty))

    results = []
    for line in bom.lines:
        required = (Decimal(str(line.quantity)) * planned *
                    (1 + Decimal(str(line.wastage_pct or 0)) / 100))
        balance = db.query(StockBalance).filter(
            StockBalance.company_id == company_id,
            StockBalance.stock_item_id == line.stock_item_id,
        ).first()
        available = Decimal(str(balance.quantity)) if balance else Decimal("0")
        item = db.get(StockItem, line.stock_item_id)
        results.append({
            "stock_item_id": line.stock_item_id,
            "item_name": item.name if item else "",
            "required_qty": float(required.quantize(Decimal("0.001"))),
            "available_qty": float(available),
            "sufficient": available >= required,
        })
    return results


def confirm_production_order(db: Session, company_id: str, order_id: str) -> ProductionOrder:
    """Execute production: create stock entries + journal voucher."""
    order = db.query(ProductionOrder).filter(
        ProductionOrder.id == order_id,
        ProductionOrder.company_id == company_id,
    ).first()
    if not order:
        raise ValueError("Production order not found")
    if order.status != "draft":
        raise ValueError(f"Cannot confirm order in '{order.status}' status")

    bom = db.query(BillOfMaterials).options(
        joinedload(BillOfMaterials.lines)
    ).filter(BillOfMaterials.id == order.bom_id).first()
    if not bom or not bom.is_active:
        raise ValueError("BOM not found or inactive")

    planned = Decimal(str(order.planned_qty))
    output_qty = Decimal(str(bom.output_qty))

    # Create journal voucher
    cost_ledger = _get_or_create_ledger(
        db, company_id, "SYS_COST_OF_PRODUCTION", "Cost of Production", "GRP_DIRECT_EXPENSES"
    )
    voucher = Voucher(
        company_id=company_id,
        voucher_type="journal",
        voucher_number=f"PRD-{order.order_number}",
        voucher_date=order.order_date,
        narration=f"Production: {bom.name} × {order.planned_qty}",
        created_by=order.created_by,
    )
    db.add(voucher)
    db.flush()

    total_material_cost = Decimal("0")

    # Consume raw materials (outward stock entries)
    for line in bom.lines:
        consumed_qty = (Decimal(str(line.quantity)) * planned *
                        (1 + Decimal(str(line.wastage_pct or 0)) / 100))
        # Use line rate if set, else item's average rate
        if line.rate:
            rate = Decimal(str(line.rate))
        else:
            item = db.get(StockItem, line.stock_item_id)
            balance = db.query(StockBalance).filter(
                StockBalance.company_id == company_id,
                StockBalance.stock_item_id == line.stock_item_id,
            ).first()
            rate = Decimal(str(balance.avg_rate)) if balance and balance.avg_rate else Decimal(str(item.opening_rate or 0))

        total_amount = (consumed_qty * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total_material_cost += total_amount

        se = StockEntry(
            company_id=company_id, stock_item_id=line.stock_item_id,
            entry_type="outward", quantity=float(consumed_qty),
            rate=float(rate), total_amount=float(total_amount),
            entry_date=order.order_date, reference=order.order_number,
            narration=f"Production: {bom.name}",
        )
        db.add(se)
        update_stock_balance_weighted_avg(
            db, company_id, line.stock_item_id,
            "outward", float(consumed_qty), float(rate), order.order_date,
        )

        # Credit raw material's purchase ledger
        item = db.get(StockItem, line.stock_item_id)
        if item:
            # Find the purchase ledger for this item's group
            stock_group = item.stock_group_id
            # Use Purchases ledger as default credit
            purchases_ledger = db.query(Ledger).filter(
                Ledger.company_id == company_id,
                Ledger.system_code == "SYS_PURCHASES",
            ).first()
            if purchases_ledger:
                db.add(VoucherLine(
                    voucher_id=voucher.id, ledger_id=purchases_ledger.id,
                    debit=0, credit=float(total_amount),
                ))

    # Produce finished goods (inward stock entry)
    finished_qty = (planned * output_qty).quantize(Decimal("0.001"))
    # Cost per unit of finished product
    finished_item = db.get(StockItem, bom.finished_item_id)
    finished_rate = (total_material_cost / finished_qty).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if finished_qty > 0 else Decimal("0")

    se = StockEntry(
        company_id=company_id, stock_item_id=bom.finished_item_id,
        entry_type="inward", quantity=float(finished_qty),
        rate=float(finished_rate), total_amount=float(total_material_cost),
        entry_date=order.order_date, reference=order.order_number,
        narration=f"Production: {bom.name}",
    )
    db.add(se)
    update_stock_balance_weighted_avg(
        db, company_id, bom.finished_item_id,
        "inward", float(finished_qty), float(finished_rate), order.order_date,
    )

    # Debit cost of production
    db.add(VoucherLine(
        voucher_id=voucher.id, ledger_id=cost_ledger.id,
        debit=float(total_material_cost), credit=0,
    ))

    # Update order
    order.produced_qty = float(finished_qty)
    order.status = "completed"
    order.voucher_id = voucher.id

    db.flush()
    return order


def cancel_production_order(db: Session, company_id: str, order_id: str) -> ProductionOrder:
    """Cancel a production order. If completed, reverse stock entries."""
    order = db.query(ProductionOrder).filter(
        ProductionOrder.id == order_id,
        ProductionOrder.company_id == company_id,
    ).first()
    if not order:
        raise ValueError("Production order not found")
    if order.status == "cancelled":
        raise ValueError("Order is already cancelled")
    if order.status == "completed":
        # Reverse stock entries
        existing_entries = db.query(StockEntry).filter(
            StockEntry.company_id == company_id,
            StockEntry.reference == order.order_number,
        ).all()
        for se in existing_entries:
            reverse_type = "inward" if se.entry_type == "outward" else "outward"
            reverse_se = StockEntry(
                company_id=company_id, stock_item_id=se.stock_item_id,
                entry_type=reverse_type, quantity=se.quantity,
                rate=se.rate, total_amount=se.total_amount,
                entry_date=order.order_date, reference=f"REV-{order.order_number}",
                narration=f"Reversal: {order.order_number}",
            )
            db.add(reverse_se)
            update_stock_balance_weighted_avg(
                db, company_id, se.stock_item_id,
                reverse_type, float(se.quantity), float(se.rate), order.order_date,
            )
        # Cancel linked voucher
        if order.voucher_id:
            voucher = db.get(Voucher, order.voucher_id)
            if voucher and not voucher.cancelled_at:
                from app.services.voucher_service import cancel_voucher
                cancel_voucher(db, voucher, "Production order cancelled", order.created_by or "system")

    order.status = "cancelled"
    db.flush()
    return order


# ── Cost Reports ───────────────────────────────────────────────────────

def get_bom_cost_analysis(db: Session, company_id: str) -> list[dict]:
    """Return cost analysis per BOM: total material cost, cost per unit."""
    boms = db.query(BillOfMaterials).options(
        joinedload(BillOfMaterials.lines)
    ).filter(
        BillOfMaterials.company_id == company_id,
        BillOfMaterials.is_active.is_(True),
    ).all()

    results = []
    for bom in boms:
        total_cost = Decimal("0")
        components = []
        for line in bom.lines:
            if line.rate:
                rate = Decimal(str(line.rate))
            else:
                balance = db.query(StockBalance).filter(
                    StockBalance.company_id == company_id,
                    StockBalance.stock_item_id == line.stock_item_id,
                ).first()
                rate = Decimal(str(balance.avg_rate)) if balance and balance.avg_rate else Decimal("0")
            line_cost = (Decimal(str(line.quantity)) * rate).quantize(Decimal("0.01"))
            total_cost += line_cost
            item = db.get(StockItem, line.stock_item_id)
            components.append({
                "stock_item_id": line.stock_item_id,
                "stock_item_name": item.name if item else "",
                "quantity": float(line.quantity),
                "rate": float(rate),
                "wastage_pct": float(line.wastage_pct or 0),
                "line_cost": float(line_cost),
            })
        output_qty = Decimal(str(bom.output_qty))
        cost_per_unit = (total_cost / output_qty).quantize(Decimal("0.01")) if output_qty > 0 else Decimal("0")
        finished_item = db.get(StockItem, bom.finished_item_id)
        results.append({
            "bom_id": bom.id,
            "bom_name": bom.name,
            "finished_item_id": bom.finished_item_id,
            "finished_item_name": finished_item.name if finished_item else "",
            "output_qty": float(bom.output_qty),
            "total_material_cost": float(total_cost),
            "cost_per_unit": float(cost_per_unit),
            "components": components,
        })
    return results


def get_production_cost_report(db: Session, company_id: str, financial_year_id: str | None = None) -> list[dict]:
    """Return production cost breakdown per order."""
    q = db.query(ProductionOrder).options(
        joinedload(ProductionOrder.bom)
    ).filter(ProductionOrder.company_id == company_id)

    if financial_year_id:
        from app.models.accounting import FinancialYear
        fy = db.get(FinancialYear, financial_year_id)
        if fy:
            q = q.filter(
                ProductionOrder.order_date >= fy.start_date,
                ProductionOrder.order_date <= fy.end_date,
            )

    orders = q.order_by(ProductionOrder.order_date.desc()).all()
    results = []
    for order in orders:
        entries = db.query(StockEntry).filter(
            StockEntry.company_id == company_id,
            StockEntry.reference == order.order_number,
        ).all()
        material_cost = sum(
            Decimal(str(e.total_amount))
            for e in entries if e.entry_type == "outward"
        )
        results.append({
            "order_id": order.id,
            "order_number": order.order_number,
            "order_date": order.order_date,
            "bom_id": order.bom_id,
            "bom_name": order.bom.name if order.bom else "",
            "planned_qty": order.planned_qty,
            "produced_qty": order.produced_qty,
            "status": order.status,
            "material_cost": float(material_cost),
            "cost_per_unit": float(
                (material_cost / Decimal(str(order.produced_qty or 1)))
                .quantize(Decimal("0.01"))
            ),
        })
    return results
