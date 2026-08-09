"""Manufacturing service tests: BOM resolution, production confirm, batch enforcement, cancellation.

These run service-level (no HTTP) against the isolated test DB via the `db`
fixture, mirroring the patterns used elsewhere in backend/tests.
"""
from __future__ import annotations

import pytest

from app.models.batch import Batch, BatchLedger, Serial
from app.models.voucher import Voucher, VoucherLine
from app.models.manufacturing import (
    ProductionOrderLine,
    Routing,
    RoutingOperation,
    WorkCenter,
)
from app.models.stock import StockBalance, StockEntry, StockItem
from app.models.user import Company
from app.schemas.batch import SerialBulkCreate
from app.schemas.manufacturing import BomCreate, BomLineCreate, BomUpdate, ProductionOrderCreate
from app.services.batch import create_serials
from app.services.manufacturing import (
    cancel_production_order,
    confirm_production_order,
    create_bom,
    create_production_order,
    estimate_routing_labor,
    get_bom,
    get_bom_cost_analysis,
    resolve_bom_requirements,
    update_bom,
)


# ── Helpers ─────────────────────────────────────────────────────────────

def _company(db) -> Company:
    co = Company(name="Test Co", is_active=True)
    db.add(co)
    db.commit()
    db.refresh(co)
    return co


def _item(db, company_id: str, name: str, tracking_mode: str = "none",
          qty: float = 100, rate: float = 10) -> StockItem:
    item = StockItem(
        company_id=company_id, name=name, tracking_mode=tracking_mode,
        unit_of_measure="Nos", valuation_method="weighted_avg",
    )
    db.add(item)
    db.flush()
    bal = StockBalance(
        company_id=company_id, stock_item_id=item.id,
        quantity=qty, avg_rate=rate, total_value=qty * rate,
    )
    db.add(bal)
    db.flush()
    return item


def _batch(db, company_id: str, item: StockItem, number: str, qty: float = 50) -> Batch:
    b = Batch(
        company_id=company_id, stock_item_id=item.id, batch_number=number,
        quantity=qty, status="active",
    )
    db.add(b)
    db.flush()
    return b


def _bom(db, company_id: str, name: str, finished_item: StockItem,
         lines: list[BomLineCreate], output_qty: float = 1):
    return create_bom(
        db, company_id,
        BomCreate(name=name, finished_item_id=str(finished_item.id),
                  output_qty=output_qty, lines=lines),
    )


def _order(db, company_id: str, bom, planned_qty: float = 10,
           labor: float = 0, overhead: float = 0):
    payload = ProductionOrderCreate(
        bom_id=str(bom.id), order_date="2026-08-01", planned_qty=planned_qty,
        labor_cost=labor, overhead_cost=overhead,
    )
    # created_by is nullable — pass None to avoid needing a User row
    return create_production_order(db, company_id, None, payload)


# ── BOM resolution & versioning ─────────────────────────────────────────

def test_create_bom_and_resolve_requirements(db):
    co = _company(db)
    a = _item(db, co.id, "Raw A", rate=5)
    b = _item(db, co.id, "Raw B", rate=10)
    fin = _item(db, co.id, "Widget")

    bom = _bom(db, co.id, "Widget BOM", fin, [
        BomLineCreate(stock_item_id=str(a.id), quantity=2, rate=5),
        BomLineCreate(stock_item_id=str(b.id), quantity=3, rate=10, wastage_pct=10),
    ])

    reqs = resolve_bom_requirements(db, co.id, str(bom.id), 5)
    by_item = {r["stock_item_id"]: r for r in reqs}
    # A: 2 × 5 = 10, no wastage. B: 3 × 5 × 1.10 = 16.5
    assert float(by_item[str(a.id)]["quantity"]) == 10
    assert float(by_item[str(b.id)]["quantity"]) == pytest.approx(16.5)


def test_confirm_production_creates_entries_and_balanced_journal(db):
    co = _company(db)
    a = _item(db, co.id, "Raw A", rate=5)
    b = _item(db, co.id, "Raw B", rate=10)
    fin = _item(db, co.id, "Widget")

    bom = _bom(db, co.id, "Widget BOM", fin, [
        BomLineCreate(stock_item_id=str(a.id), quantity=2, rate=5),
        BomLineCreate(stock_item_id=str(b.id), quantity=3, rate=10),
    ])
    order = _order(db, co.id, bom, planned_qty=10)

    confirmed = confirm_production_order(db, co.id, str(order.id))

    assert confirmed.status == "completed"
    assert float(confirmed.produced_qty) == 10
    # Material cost: (20 × 5) + (30 × 10) = 400
    assert float(confirmed.material_cost) == pytest.approx(400)

    # 2 outward + 1 inward stock entries
    entries = db.query(StockEntry).filter(
        StockEntry.company_id == co.id,
        StockEntry.reference == confirmed.order_number,
    ).all()
    assert len(entries) == 3
    outward = [e for e in entries if e.entry_type == "outward"]
    inward = [e for e in entries if e.entry_type == "inward"]
    assert len(outward) == 2 and len(inward) == 1
    assert float(inward[0].quantity) == 10
    assert float(inward[0].rate) == pytest.approx(40)

    # Wastage lines tracked
    lines = db.query(ProductionOrderLine).filter(
        ProductionOrderLine.production_order_id == order.id
    ).all()
    assert {float(l.planned_qty) for l in lines} == {20, 30}

    # Journal is balanced: Dr CoP 400, Cr Purchases 400
    voucher = db.get(Voucher, confirmed.voucher_id)
    assert voucher is not None
    vlines = db.query(VoucherLine).filter(VoucherLine.voucher_id == voucher.id).all()
    assert sum(float(vl.debit) for vl in vlines) == pytest.approx(400)
    assert sum(float(vl.credit) for vl in vlines) == pytest.approx(400)

    # Stock balances reduced
    bal_a = db.query(StockBalance).filter(
        StockBalance.company_id == co.id, StockBalance.stock_item_id == a.id
    ).first()
    assert float(bal_a.quantity) == pytest.approx(80)


def test_confirm_requires_batch_for_batch_tracked_item(db):
    co = _company(db)
    c = _item(db, co.id, "Batch Chip", tracking_mode="batch", qty=50, rate=20)
    fin = _item(db, co.id, "Board")
    _batch(db, co.id, c, "B-001", 50)

    bom = _bom(db, co.id, "Board BOM", fin, [
        BomLineCreate(stock_item_id=str(c.id), quantity=2, rate=20),
    ])
    order = _order(db, co.id, bom, planned_qty=5)

    with pytest.raises(ValueError, match="Select a batch"):
        confirm_production_order(db, co.id, str(order.id))


def test_confirm_with_batch_allocation_consumes_batch(db):
    co = _company(db)
    c = _item(db, co.id, "Batch Chip", tracking_mode="batch", qty=50, rate=20)
    fin = _item(db, co.id, "Board")
    batch = _batch(db, co.id, c, "B-001", 50)

    bom = _bom(db, co.id, "Board BOM", fin, [
        BomLineCreate(stock_item_id=str(c.id), quantity=2, rate=20),
    ])
    order = _order(db, co.id, bom, planned_qty=5)  # consumes 10 chips

    confirmed = confirm_production_order(
        db, co.id, str(order.id),
        batch_allocations=[{
            "stock_item_id": str(c.id), "batch_id": str(batch.id), "quantity": 10,
        }],
    )

    db.refresh(batch)
    assert float(batch.quantity) == pytest.approx(40)
    ledger = db.query(BatchLedger).filter(BatchLedger.batch_id == batch.id).all()
    assert any(e.entry_type == "outward" and float(e.quantity) == 10 for e in ledger)
    assert confirmed.status == "completed"


def test_invalid_batch_rejected(db):
    co = _company(db)
    c = _item(db, co.id, "Batch Chip", tracking_mode="batch", qty=50, rate=20)
    other = _item(db, co.id, "Other Chip", tracking_mode="batch", qty=50, rate=20)
    fin = _item(db, co.id, "Board")
    wrong_batch = _batch(db, co.id, other, "B-OTHER", 50)

    bom = _bom(db, co.id, "Board BOM", fin, [
        BomLineCreate(stock_item_id=str(c.id), quantity=2, rate=20),
    ])
    order = _order(db, co.id, bom, planned_qty=5)

    with pytest.raises(ValueError, match="Invalid batch"):
        confirm_production_order(
            db, co.id, str(order.id),
            batch_allocations=[{
                "stock_item_id": str(c.id), "batch_id": str(wrong_batch.id), "quantity": 10,
            }],
        )


def test_batch_allocation_quantity_must_match_actual(db):
    co = _company(db)
    c = _item(db, co.id, "Batch Chip", tracking_mode="batch", qty=50, rate=20)
    fin = _item(db, co.id, "Board")
    batch = _batch(db, co.id, c, "B-001", 50)

    bom = _bom(db, co.id, "Board BOM", fin, [
        BomLineCreate(stock_item_id=str(c.id), quantity=2, rate=20),
    ])
    order = _order(db, co.id, bom, planned_qty=5)  # consumes 10 chips

    with pytest.raises(ValueError, match="does not match"):
        confirm_production_order(
            db, co.id, str(order.id),
            batch_allocations=[{
                "stock_item_id": str(c.id), "batch_id": str(batch.id), "quantity": 7,
            }],
        )


def test_duplicate_bom_with_deleted_sub_assembly_raises(db):
    co = _company(db)
    sub_raw = _item(db, co.id, "Sub Raw", rate=3)
    sub_fin = _item(db, co.id, "Sub Assembly")
    parent_fin = _item(db, co.id, "Parent Product")

    sub = _bom(db, co.id, "Sub BOM", sub_fin, [
        BomLineCreate(stock_item_id=str(sub_raw.id), quantity=1, rate=3),
    ])
    parent = _bom(db, co.id, "Parent BOM", parent_fin, [
        BomLineCreate(stock_item_id=str(sub_fin.id), quantity=1, rate=0,
                      sub_bom_id=str(sub.id)),
    ])

    from app.services.manufacturing import delete_bom, duplicate_bom
    assert delete_bom(db, co.id, str(sub.id)) is True

    with pytest.raises(ValueError, match="Sub-assembly BOM not found"):
        duplicate_bom(db, co.id, str(parent.id), "Parent Copy")


def _work_center(db, company_id: str, name: str, rate: float = 0) -> WorkCenter:
    wc = WorkCenter(
        company_id=company_id, name=name, capacity=1,
        capacity_unit="units/hr", hourly_rate=rate,
    )
    db.add(wc)
    db.flush()
    return wc


def _routing(db, company_id: str, name: str, finished_item: StockItem,
             ops: list[tuple[int, WorkCenter, float, float]]) -> Routing:
    r = Routing(company_id=company_id, name=name, finished_item_id=finished_item.id)
    db.add(r)
    db.flush()
    for step, wc, setup, run in ops:
        db.add(RoutingOperation(
            routing_id=r.id, step_number=step, work_center_id=wc.id,
            setup_time_minutes=setup, run_time_per_unit_minutes=run,
        ))
    db.flush()
    return r


# ── Serial tracking ────────────────────────────────────────────────────

def test_confirm_requires_serial_allocation(db):
    co = _company(db)
    s = _item(db, co.id, "Serial Chip", tracking_mode="serial", qty=50, rate=20)
    fin = _item(db, co.id, "Board")

    bom = _bom(db, co.id, "Board BOM", fin, [
        BomLineCreate(stock_item_id=str(s.id), quantity=2, rate=20),
    ])
    order = _order(db, co.id, bom, planned_qty=3)  # consumes 6 serials

    with pytest.raises(ValueError, match="Select serial numbers"):
        confirm_production_order(db, co.id, str(order.id))


def test_confirm_with_serial_allocation_marks_issued(db):
    co = _company(db)
    s = _item(db, co.id, "Serial Chip", tracking_mode="serial", qty=50, rate=20)
    fin = _item(db, co.id, "Board")
    serials = create_serials(db, co.id, SerialBulkCreate(
        stock_item_id=str(s.id), count=6, prefix="CHIP",
    ))

    bom = _bom(db, co.id, "Board BOM", fin, [
        BomLineCreate(stock_item_id=str(s.id), quantity=2, rate=20),
    ])
    order = _order(db, co.id, bom, planned_qty=3)

    confirmed = confirm_production_order(
        db, co.id, str(order.id),
        serial_allocations=[{
            "stock_item_id": str(s.id),
            "serial_numbers": [x.serial_number for x in serials],
        }],
    )
    assert confirmed.status == "completed"

    db.refresh(serials[0])
    assert serials[0].status == "issued"
    assert serials[0].production_order_id == order.id
    remaining_in_stock = db.query(Serial).filter(
        Serial.company_id == co.id,
        Serial.stock_item_id == s.id,
        Serial.status == "in_stock",
    ).count()
    assert remaining_in_stock == 0


def test_serial_count_must_match_consumption(db):
    co = _company(db)
    s = _item(db, co.id, "Serial Chip", tracking_mode="serial", qty=50, rate=20)
    fin = _item(db, co.id, "Board")
    serials = create_serials(db, co.id, SerialBulkCreate(
        stock_item_id=str(s.id), count=6, prefix="CHIP",
    ))

    bom = _bom(db, co.id, "Board BOM", fin, [
        BomLineCreate(stock_item_id=str(s.id), quantity=2, rate=20),
    ])
    order = _order(db, co.id, bom, planned_qty=3)  # needs 6 serials

    with pytest.raises(ValueError, match="Select 6 serial"):
        confirm_production_order(
            db, co.id, str(order.id),
            serial_allocations=[{
                "stock_item_id": str(s.id),
                "serial_numbers": [serials[0].serial_number],
            }],
        )


def test_finished_serial_goods_auto_create_serials(db):
    co = _company(db)
    raw = _item(db, co.id, "Raw", rate=10)
    fin = _item(db, co.id, "Serial Board", tracking_mode="serial")

    bom = _bom(db, co.id, "Board BOM", fin, [
        BomLineCreate(stock_item_id=str(raw.id), quantity=2, rate=10),
    ])
    order = _order(db, co.id, bom, planned_qty=3)  # produces 3 serials

    confirmed = confirm_production_order(db, co.id, str(order.id))
    assert confirmed.status == "completed"

    created = db.query(Serial).filter(
        Serial.company_id == co.id,
        Serial.stock_item_id == fin.id,
    ).all()
    assert len(created) == 3
    assert all(x.status == "in_stock" for x in created)
    assert len({x.serial_number for x in created}) == 3


# ── Partial production ─────────────────────────────────────────────────

def test_confirm_partial_production(db):
    co = _company(db)
    raw = _item(db, co.id, "Raw", rate=10)
    fin = _item(db, co.id, "Widget")

    bom = _bom(db, co.id, "Widget BOM", fin, [
        BomLineCreate(stock_item_id=str(raw.id), quantity=2, rate=10),
    ])
    order = _order(db, co.id, bom, planned_qty=10)  # full output 10

    confirmed = confirm_production_order(db, co.id, str(order.id), produced_qty=3)
    assert confirmed.status == "completed"
    assert float(confirmed.produced_qty) == pytest.approx(3)

    inward = db.query(StockEntry).filter(
        StockEntry.company_id == co.id,
        StockEntry.stock_item_id == fin.id,
        StockEntry.entry_type == "inward",
        StockEntry.reference == order.order_number,
    ).first()
    assert float(inward.quantity) == pytest.approx(3)


def test_confirm_rejects_overproduction(db):
    co = _company(db)
    raw = _item(db, co.id, "Raw", rate=10)
    fin = _item(db, co.id, "Widget")

    bom = _bom(db, co.id, "Widget BOM", fin, [
        BomLineCreate(stock_item_id=str(raw.id), quantity=2, rate=10),
    ])
    order = _order(db, co.id, bom, planned_qty=10)

    with pytest.raises(ValueError, match="cannot exceed"):
        confirm_production_order(db, co.id, str(order.id), produced_qty=11)


# ── Routing wiring ─────────────────────────────────────────────────────

def test_bom_routing_persist_and_clear(db):
    co = _company(db)
    raw = _item(db, co.id, "Raw", rate=5)
    fin = _item(db, co.id, "Widget")
    wc = _work_center(db, co.id, "Assembly", rate=600)
    routing = _routing(db, co.id, "Widget Routing", fin, [(1, wc, 30, 2)])

    bom = _bom(db, co.id, "Widget BOM", fin, [
        BomLineCreate(stock_item_id=str(raw.id), quantity=1, rate=5),
    ])
    # Attach the routing
    updated = update_bom(
        db, co.id, str(bom.id),
        BomUpdate(routing_id=str(routing.id)),
        user_id=None,
    )
    assert updated.routing_id == routing.id
    assert updated.routing_name == "Widget Routing"

    # Clear the routing
    cleared = update_bom(
        db, co.id, str(bom.id),
        BomUpdate(routing_id=None),
        user_id=None,
    )
    assert cleared.routing_id is None


def test_bom_routing_mismatch_rejected(db):
    co = _company(db)
    raw = _item(db, co.id, "Raw", rate=5)
    fin = _item(db, co.id, "Widget")
    other = _item(db, co.id, "Other Product")
    wc = _work_center(db, co.id, "Assembly", rate=600)
    routing = _routing(db, co.id, "Other Routing", other, [(1, wc, 10, 1)])

    bom = _bom(db, co.id, "Widget BOM", fin, [
        BomLineCreate(stock_item_id=str(raw.id), quantity=1, rate=5),
    ])
    with pytest.raises(ValueError, match="different finished item"):
        update_bom(
            db, co.id, str(bom.id),
            BomUpdate(routing_id=str(routing.id)),
            user_id=None,
        )


def test_estimate_routing_labor(db):
    co = _company(db)
    fin = _item(db, co.id, "Widget")
    wc1 = _work_center(db, co.id, "Assembly", rate=600)  # ₹10/min
    wc2 = _work_center(db, co.id, "Finishing", rate=300)  # ₹5/min
    routing = _routing(db, co.id, "Widget Routing", fin, [
        (1, wc1, 30, 2),
        (2, wc2, 0, 1),
    ])

    est = estimate_routing_labor(db, co.id, routing.id, 10)
    # op1: (30 + 20) min × ₹10 = 500; op2: 10 min × ₹5 = 50 → total 550
    assert float(est["estimated_labor_cost"]) == pytest.approx(550)
    assert len(est["operations"]) == 2


def test_cancel_completed_order_restores_stock_and_batches(db):
    co = _company(db)
    a = _item(db, co.id, "Raw A", rate=5)
    c = _item(db, co.id, "Batch Chip", tracking_mode="batch", qty=50, rate=20)
    fin = _item(db, co.id, "Board")
    batch = _batch(db, co.id, c, "B-001", 50)

    bom = _bom(db, co.id, "Board BOM", fin, [
        BomLineCreate(stock_item_id=str(a.id), quantity=1, rate=5),
        BomLineCreate(stock_item_id=str(c.id), quantity=2, rate=20),
    ])
    order = _order(db, co.id, bom, planned_qty=5)  # consumes 5 × A, 10 × C

    confirmed = confirm_production_order(
        db, co.id, str(order.id),
        batch_allocations=[{
            "stock_item_id": str(c.id), "batch_id": str(batch.id), "quantity": 10,
        }],
    )
    db.refresh(batch)
    assert float(batch.quantity) == pytest.approx(40)

    cancelled = cancel_production_order(db, co.id, str(order.id), user_id=None)
    assert cancelled.status == "cancelled"

    # Batch quantity restored
    db.refresh(batch)
    assert float(batch.quantity) == pytest.approx(50)

    # Stock balances restored
    bal_a = db.query(StockBalance).filter(
        StockBalance.company_id == co.id, StockBalance.stock_item_id == a.id
    ).first()
    assert float(bal_a.quantity) == pytest.approx(100)
    bal_c = db.query(StockBalance).filter(
        StockBalance.company_id == co.id, StockBalance.stock_item_id == c.id
    ).first()
    assert float(bal_c.quantity) == pytest.approx(50)

    # Linked journal voucher cancelled
    voucher = db.get(Voucher, confirmed.voucher_id)
    assert voucher is not None and voucher.cancelled_at is not None


def test_bom_cost_analysis_includes_wastage(db):
    co = _company(db)
    a = _item(db, co.id, "Raw A", rate=5)
    fin = _item(db, co.id, "Widget")

    _bom(db, co.id, "Widget BOM", fin, [
        BomLineCreate(stock_item_id=str(a.id), quantity=2, rate=5, wastage_pct=10),
    ])

    analysis = get_bom_cost_analysis(db, co.id)
    assert len(analysis) == 1
    # 2 × 5 × 1.10 = 11.0 total; cost per unit (output 1) = 11.0
    assert float(analysis[0]["total_material_cost"]) == pytest.approx(11.0)
    assert float(analysis[0]["cost_per_unit"]) == pytest.approx(11.0)


def test_update_bom_preserves_sub_bom(db):
    co = _company(db)
    sub_raw = _item(db, co.id, "Sub Raw", rate=3)
    sub_fin = _item(db, co.id, "Sub Assembly")
    parent_raw = _item(db, co.id, "Parent Raw", rate=7)
    parent_fin = _item(db, co.id, "Parent Product")

    sub = _bom(db, co.id, "Sub BOM", sub_fin, [
        BomLineCreate(stock_item_id=str(sub_raw.id), quantity=1, rate=3),
    ])
    parent = _bom(db, co.id, "Parent BOM", parent_fin, [
        BomLineCreate(stock_item_id=str(parent_raw.id), quantity=1, rate=7),
    ])

    # Attach the sub-assembly to the parent
    updated = update_bom(
        db, co.id, str(parent.id),
        BomUpdate(
            name="Parent BOM", finished_item_id=str(parent_fin.id),
            lines=[
                BomLineCreate(stock_item_id=str(sub_fin.id), quantity=2, rate=0,
                              sub_bom_id=str(sub.id)),
            ],
        ),
        user_id=None,
    )
    assert updated is not None
    assert updated.lines[0].sub_bom_id == sub.id

    # A second update without touching lines keeps the sub-assembly link
    updated2 = update_bom(
        db, co.id, str(parent.id),
        BomUpdate(
            name="Parent BOM v2", finished_item_id=str(parent_fin.id),
            lines=[
                BomLineCreate(stock_item_id=str(sub_fin.id), quantity=2, rate=0,
                              sub_bom_id=str(sub.id)),
            ],
        ),
        user_id=None,
    )
    assert updated2.lines[0].sub_bom_id == sub.id


def test_update_bom_rejects_self_sub_bom(db):
    co = _company(db)
    raw = _item(db, co.id, "Raw", rate=3)
    fin = _item(db, co.id, "Product")

    bom = _bom(db, co.id, "BOM", fin, [
        BomLineCreate(stock_item_id=str(raw.id), quantity=1, rate=3),
    ])
    with pytest.raises(ValueError, match="itself"):
        update_bom(
            db, co.id, str(bom.id),
            BomUpdate(
                name="BOM", finished_item_id=str(fin.id),
                lines=[BomLineCreate(stock_item_id=str(fin.id), quantity=1,
                                     rate=0, sub_bom_id=str(bom.id))],
            ),
            user_id=None,
        )
