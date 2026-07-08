"""Manufacturing service: BOM CRUD, production order lifecycle, cost tracking."""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.accounting import AccountGroup, Ledger
from app.models.manufacturing import BillOfMaterials, BomLine, ProductionOrder, ProductionOrderLine
from app.models.stock import StockBalance, StockEntry, StockItem
from app.models.voucher import Voucher, VoucherLine
from app.schemas.manufacturing import (
    BomCreate,
    BomUpdate,
    ProductionOrderCreate,
    ProductionOrderLineCreate,
)
from app.services.audit import log_action, _serialize_entity
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


# ── Multi-level BOM Resolution ─────────────────────────────────────────

def resolve_bom_requirements(
    db: Session, company_id: str, bom_id: str, qty: float, visited: set[str] | None = None
) -> list[dict]:
    """Recursively resolve all material requirements for a BOM.
    
    Returns a flat list of raw material requirements with:
    - stock_item_id: The raw material stock item
    - quantity: Total quantity needed
    - rate: Rate per unit
    - wastage_pct: Wastage percentage
    - level: Nesting level (0 = direct, 1 = sub-assembly, etc.)
    - sub_assembly: Name of sub-assembly if this came from one
    """
    if visited is None:
        visited = set()
    
    if bom_id in visited:
        raise ValueError(f"Circular BOM reference detected: {bom_id}")
    visited.add(bom_id)
    
    bom = db.query(BillOfMaterials).options(
        joinedload(BillOfMaterials.lines).joinedload(BomLine.stock_item)
    ).filter(
        BillOfMaterials.id == bom_id,
        BillOfMaterials.company_id == company_id,
    ).first()
    
    if not bom:
        return []
    
    output_qty = Decimal(str(bom.output_qty))
    requirements = []
    
    for line in bom.lines:
        line_qty = Decimal(str(line.quantity)) * Decimal(str(qty))
        # Apply wastage
        wastage = Decimal(str(line.wastage_pct or 0)) / 100
        total_qty = line_qty * (1 + wastage)
        
        # Get rate
        if line.rate:
            rate = Decimal(str(line.rate))
        else:
            balance = db.query(StockBalance).filter(
                StockBalance.company_id == company_id,
                StockBalance.stock_item_id == line.stock_item_id,
            ).first()
            rate = Decimal(str(balance.avg_rate)) if balance and balance.avg_rate else Decimal("0")
        
        if line.sub_bom_id:
            # This is a sub-assembly - recurse into it
            # The sub-assembly BOM produces line.stock_item_id
            # We need to resolve the sub-assembly's raw materials
            sub_requirements = resolve_bom_requirements(
                db, company_id, line.sub_bom_id, float(total_qty), visited.copy()
            )
            for sub_req in sub_requirements:
                sub_req["quantity"] = Decimal(str(sub_req["quantity"]))
                requirements.append(sub_req)
            # Also add the sub-assembly itself as a produced item
            requirements.append({
                "stock_item_id": line.stock_item_id,
                "quantity": total_qty,
                "rate": rate,
                "wastage_pct": line.wastage_pct or 0,
                "level": len(visited) - 1,
                "sub_assembly": line.item_name,
                "is_sub_assembly": True,
                "sub_bom_id": line.sub_bom_id,
            })
        else:
            # Raw material
            requirements.append({
                "stock_item_id": line.stock_item_id,
                "quantity": total_qty,
                "rate": rate,
                "wastage_pct": line.wastage_pct or 0,
                "level": len(visited) - 1,
                "sub_assembly": None,
                "is_sub_assembly": False,
                "sub_bom_id": None,
            })
    
    return requirements


# ── BOM CRUD ───────────────────────────────────────────────────────────

def create_bom(db: Session, company_id: str, payload: BomCreate, user_id: str | None = None) -> BillOfMaterials:
    if not payload.lines:
        raise ValueError("BOM must have at least one component line")
    # Validate sub_bom references exist and belong to same company
    for line in payload.lines:
        if line.sub_bom_id:
            sub_bom = db.get(BillOfMaterials, line.sub_bom_id)
            if not sub_bom or sub_bom.company_id != company_id:
                raise ValueError(f"Sub-assembly BOM not found: {line.sub_bom_id}")
            if sub_bom.id == payload.finished_item_id:
                raise ValueError("BOM cannot reference itself as sub-assembly")
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
            sub_bom_id=line.sub_bom_id,
        ))
    db.flush()
    log_action(db, company_id=company_id, user_id=user_id, action="CREATE",
               entity_type="bill_of_materials", entity_id=bom.id,
               new_value=_serialize_entity(bom, exclude={"lines"}),
               description=f"Created BOM '{payload.name}'")
    return get_bom(db, company_id, bom.id)


def duplicate_bom(db: Session, company_id: str, source_bom_id: str, new_name: str) -> BillOfMaterials:
    """Create a new BOM by copying an existing one."""
    source = get_bom(db, company_id, source_bom_id)
    if not source:
        raise ValueError("Source BOM not found")
    # Ensure unique name
    existing = db.query(BillOfMaterials).filter(
        BillOfMaterials.company_id == company_id,
        BillOfMaterials.name == new_name,
    ).first()
    if existing:
        counter = 2
        while db.query(BillOfMaterials).filter(
            BillOfMaterials.company_id == company_id,
            BillOfMaterials.name == f"{new_name} ({counter})",
        ).first():
            counter += 1
        new_name = f"{new_name} ({counter})"
    payload = BomCreate(
        name=new_name,
        finished_item_id=source.finished_item_id,
        output_qty=source.output_qty,
        lines=[
            {
                "stock_item_id": str(line.stock_item_id),
                "quantity": line.quantity,
                "rate": line.rate,
                "wastage_pct": line.wastage_pct,
                "sub_bom_id": str(line.sub_bom_id) if line.sub_bom_id else None,
            }
            for line in source.lines
        ],
    )
    return create_bom(db, company_id, payload)


def import_boms_from_csv(db: Session, company_id: str, rows: list[dict]) -> list[BillOfMaterials]:
    """Import BOMs from CSV rows.
    
    Expected CSV columns:
    - name: BOM name
    - finished_item_name: Name of the finished product (looked up by name)
    - output_qty: Output quantity per batch
    - component_name: Component stock item name (looked up by name)
    - component_qty: Quantity of component per unit
    - component_rate: Rate per unit (optional)
    - component_wastage_pct: Wastage percentage (optional, default 0)
    
    Multiple components per BOM are handled by having multiple rows with the same BOM name.
    """
    from app.models.stock import StockItem
    
    created_boms = []
    bom_groups: dict[str, list[dict]] = {}
    
    for row in rows:
        bom_name = row.get("name", "").strip()
        if not bom_name:
            continue
        if bom_name not in bom_groups:
            bom_groups[bom_name] = []
        bom_groups[bom_name].append(row)
    
    for bom_name, bom_rows in bom_groups.items():
        first_row = bom_rows[0]
        finished_item_name = first_row.get("finished_item_name", "").strip()
        output_qty = float(first_row.get("output_qty", 1) or 1)
        
        # Look up finished item by name
        finished_item = db.query(StockItem).filter(
            StockItem.company_id == company_id,
            StockItem.name == finished_item_name,
        ).first()
        if not finished_item:
            raise ValueError(f"Finished item not found: {finished_item_name}")
        
        lines = []
        for row in bom_rows:
            component_name = row.get("component_name", "").strip()
            if not component_name:
                continue
            component = db.query(StockItem).filter(
                StockItem.company_id == company_id,
                StockItem.name == component_name,
            ).first()
            if not component:
                raise ValueError(f"Component not found: {component_name}")
            
            lines.append({
                "stock_item_id": str(component.id),
                "quantity": float(row.get("component_qty", 1) or 1),
                "rate": float(row["component_rate"]) if row.get("component_rate") else None,
                "wastage_pct": float(row.get("component_wastage_pct", 0) or 0),
            })
        
        if lines:
            payload = BomCreate(
                name=bom_name,
                finished_item_id=str(finished_item.id),
                output_qty=output_qty,
                lines=lines,
            )
            bom = create_bom(db, company_id, payload)
            created_boms.append(bom)
    
    return created_boms


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


def update_bom(db: Session, company_id: str, bom_id: str, payload: BomUpdate, user_id: str | None = None, change_notes: str | None = None) -> BillOfMaterials | None:
    bom = get_bom(db, company_id, bom_id)
    if not bom:
        return None
    
    # Save current version before updating
    import json
    from app.models.manufacturing import BomVersion
    current_lines = []
    for line in bom.lines:
        current_lines.append({
            "stock_item_id": str(line.stock_item_id),
            "quantity": float(line.quantity),
            "rate": float(line.rate) if line.rate else None,
            "wastage_pct": float(line.wastage_pct),
            "sub_bom_id": str(line.sub_bom_id) if line.sub_bom_id else None,
        })
    
    version_snapshot = BomVersion(
        bom_id=bom.id,
        version=bom.version,
        name=bom.name,
        finished_item_id=str(bom.finished_item_id),
        output_qty=float(bom.output_qty),
        is_active=bom.is_active,
        lines_snapshot=json.dumps(current_lines),
        changed_by=user_id,
        change_notes=change_notes,
    )
    db.add(version_snapshot)
    
    # Increment version
    bom.version += 1
    
    # Apply updates
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
                sub_bom_id=line.sub_bom_id,
            ))
    db.flush()
    log_action(db, company_id=company_id, user_id=user_id, action="UPDATE",
               entity_type="bill_of_materials", entity_id=bom.id,
               new_value=_serialize_entity(bom, exclude={"lines"}),
               description=f"Updated BOM '{bom.name}' to version {bom.version}")
    return get_bom(db, company_id, bom_id)


def delete_bom(db: Session, company_id: str, bom_id: str, user_id: str | None = None) -> bool:
    bom = get_bom(db, company_id, bom_id)
    if not bom:
        return False
    ref_count = db.query(ProductionOrder).filter(ProductionOrder.bom_id == bom.id).count()
    if ref_count > 0:
        return False
    bom_name = bom.name
    bom_data = _serialize_entity(bom, exclude={"lines"})
    db.query(BomLine).filter(BomLine.bom_id == bom.id).delete()
    db.delete(bom)
    db.flush()
    log_action(db, company_id=company_id, user_id=user_id, action="DELETE",
               entity_type="bill_of_materials", entity_id=bom_id,
               old_value=bom_data, description=f"Deleted BOM '{bom_name}'")
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
    
    Handles multi-level BOMs by recursively resolving all sub-assemblies.
    Returns list of raw materials with required qty, available qty, and sufficient flag.
    """
    from app.models.stock import StockBalance, StockItem

    bom = db.query(BillOfMaterials).filter(
        BillOfMaterials.id == bom_id,
        BillOfMaterials.company_id == company_id,
    ).first()
    if not bom:
        return []

    # Resolve all requirements recursively
    requirements = resolve_bom_requirements(db, company_id, bom_id, planned_qty)
    
    # Aggregate by stock_item_id (only raw materials, not sub-assemblies)
    aggregated: dict[str, dict] = {}
    for req in requirements:
        if req["is_sub_assembly"]:
            continue
        item_id = req["stock_item_id"]
        if item_id not in aggregated:
            aggregated[item_id] = {
                "stock_item_id": item_id,
                "required_qty": Decimal("0"),
            }
        aggregated[item_id]["required_qty"] += req["quantity"]
    
    results = []
    for item_id, data in aggregated.items():
        balance = db.query(StockBalance).filter(
            StockBalance.company_id == company_id,
            StockBalance.stock_item_id == item_id,
        ).first()
        available = Decimal(str(balance.quantity)) if balance else Decimal("0")
        item = db.get(StockItem, item_id)
        results.append({
            "stock_item_id": item_id,
            "item_name": item.name if item else "",
            "required_qty": float(data["required_qty"].quantize(Decimal("0.001"))),
            "available_qty": float(available),
            "sufficient": available >= data["required_qty"],
        })
    return results


def confirm_production_order(
    db: Session, company_id: str, order_id: str,
    actual_quantities: list[ProductionOrderLineCreate] | None = None,
) -> ProductionOrder:
    """Execute production: create stock entries + journal voucher.
    
    Handles multi-level BOMs by recursively resolving all sub-assemblies.
    If actual_quantities provided, tracks wastage per component.
    """
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
    
    # Resolve all requirements recursively
    requirements = resolve_bom_requirements(db, company_id, order.bom_id, order.planned_qty)
    
    # Track sub-assemblies to produce (inward entries)
    sub_assemblies_to_produce: dict[str, Decimal] = {}
    
    # Process requirements - group by stock_item_id for raw materials
    raw_materials: dict[str, dict] = {}
    for req in requirements:
        item_id = req["stock_item_id"]
        if req["is_sub_assembly"]:
            # Track sub-assemblies to produce
            if item_id not in sub_assemblies_to_produce:
                sub_assemblies_to_produce[item_id] = Decimal("0")
            sub_assemblies_to_produce[item_id] += req["quantity"]
        else:
            # Aggregate raw materials
            if item_id not in raw_materials:
                raw_materials[item_id] = {
                    "quantity": Decimal("0"),
                    "rate": req["rate"],
                }
            raw_materials[item_id]["quantity"] += req["quantity"]

    # Build lookup for actual quantities
    actual_qty_lookup: dict[str, Decimal] = {}
    if actual_quantities:
        for aq in actual_quantities:
            actual_qty_lookup[aq.stock_item_id] = Decimal(str(aq.actual_qty))

    # Create outward stock entries for raw materials + ProductionOrderLines
    purchases_ledger = db.query(Ledger).filter(
        Ledger.company_id == company_id,
        Ledger.system_code == "SYS_PURCHASES",
    ).first()
    
    for item_id, mat in raw_materials.items():
        planned_qty = mat["quantity"]
        rate = mat["rate"]
        
        # Use actual quantity if provided, otherwise use planned
        actual_qty = actual_qty_lookup.get(item_id, planned_qty)
        
        # Calculate wastage percentage
        if planned_qty > 0:
            wastage_pct = float(((actual_qty - planned_qty) / planned_qty) * 100)
        else:
            wastage_pct = 0.0
        
        # Create ProductionOrderLine for wastage tracking
        pol = ProductionOrderLine(
            production_order_id=order.id,
            stock_item_id=item_id,
            planned_qty=float(planned_qty),
            actual_qty=float(actual_qty),
            rate=float(rate),
            wastage_pct=wastage_pct,
        )
        db.add(pol)
        
        # Use actual quantity for stock entry
        total_amount = (actual_qty * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total_material_cost += total_amount

        se = StockEntry(
            company_id=company_id, stock_item_id=item_id,
            entry_type="outward", quantity=float(actual_qty),
            rate=float(rate), total_amount=float(total_amount),
            entry_date=order.order_date, reference=order.order_number,
            narration=f"Production: {bom.name}",
        )
        db.add(se)
        update_stock_balance_weighted_avg(
            db, company_id, item_id,
            "outward", float(actual_qty), float(rate), order.order_date,
        )

        # Credit raw material's purchase ledger
        if purchases_ledger:
            db.add(VoucherLine(
                voucher_id=voucher.id, ledger_id=purchases_ledger.id,
                debit=0, credit=float(total_amount),
            ))

    # Create inward stock entries for sub-assemblies
    for item_id, qty in sub_assemblies_to_produce.items():
        # Find the BOM for this sub-assembly to get its cost
        sub_bom = db.query(BillOfMaterials).filter(
            BillOfMaterials.finished_item_id == item_id,
            BillOfMaterials.company_id == company_id,
        ).first()
        
        # Calculate sub-assembly cost from its raw materials
        sub_requirements = resolve_bom_requirements(db, company_id, sub_bom.id, float(qty))
        sub_cost = Decimal("0")
        for sub_req in sub_requirements:
            if not sub_req["is_sub_assembly"]:
                sub_cost += sub_req["quantity"] * sub_req["rate"]
        
        sub_rate = (sub_cost / qty).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if qty > 0 else Decimal("0")
        
        se = StockEntry(
            company_id=company_id, stock_item_id=item_id,
            entry_type="inward", quantity=float(qty),
            rate=float(sub_rate), total_amount=float(sub_cost),
            entry_date=order.order_date, reference=order.order_number,
            narration=f"Sub-assembly production: {sub_bom.name if sub_bom else item_id}",
        )
        db.add(se)
        update_stock_balance_weighted_avg(
            db, company_id, item_id,
            "inward", float(qty), float(sub_rate), order.order_date,
        )

    # Produce finished goods (inward stock entry)
    finished_qty = (planned * output_qty).quantize(Decimal("0.001"))
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
    log_action(db, company_id=company_id, user_id=order.created_by, action="UPDATE",
               entity_type="production_order", entity_id=order.id,
               new_value=_serialize_entity(order),
               description=f"Confirmed production order {order.order_number}")
    return order


def cancel_production_order(db: Session, company_id: str, order_id: str, user_id: str | None = None) -> ProductionOrder:
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
    log_action(db, company_id=company_id, user_id=user_id, action="UPDATE",
               entity_type="production_order", entity_id=order.id,
               new_value=_serialize_entity(order),
               description=f"Cancelled production order {order.order_number}")
    return order


def get_wastage_report(db: Session, company_id: str) -> list[dict]:
    """Return wastage report: actual vs planned consumption per component."""
    from app.models.stock import StockItem
    
    # Get all completed production orders with lines
    orders = db.query(ProductionOrder).filter(
        ProductionOrder.company_id == company_id,
        ProductionOrder.status == "completed",
    ).all()
    
    # Aggregate wastage by stock item
    wastage_data: dict[str, dict] = {}
    
    for order in orders:
        for line in order.lines:
            item_id = line.stock_item_id
            if item_id not in wastage_data:
                item = db.get(StockItem, item_id)
                wastage_data[item_id] = {
                    "stock_item_id": item_id,
                    "item_name": item.name if item else "",
                    "total_planned_qty": 0.0,
                    "total_actual_qty": 0.0,
                    "total_wastage_qty": 0.0,
                    "bom_count": 0,
                }
            wastage_data[item_id]["total_planned_qty"] += float(line.planned_qty)
            wastage_data[item_id]["total_actual_qty"] += float(line.actual_qty)
            wastage_data[item_id]["total_wastage_qty"] += float(line.actual_qty) - float(line.planned_qty)
            wastage_data[item_id]["bom_count"] += 1
    
    # Calculate wastage percentage
    result = []
    for item_id, data in wastage_data.items():
        if data["total_planned_qty"] > 0:
            data["wastage_pct"] = (data["total_wastage_qty"] / data["total_planned_qty"]) * 100
        else:
            data["wastage_pct"] = 0.0
        result.append(data)
    
    return sorted(result, key=lambda x: abs(x["wastage_pct"]), reverse=True)


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
