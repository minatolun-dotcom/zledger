"""Manufacturing endpoints: BOMs, production orders, cost reports, work centers, routings."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user, require_role
from app.models.user import Company, User
from app.schemas.manufacturing import (
    BomCreate,
    BomOut,
    BomUpdate,
    ManufacturingDashboardSummary,
    ProductionOrderCreate,
    ProductionOrderLineCreate,
    ProductionOrderOut,
    ProductionOrderUpdate,
    WorkCenterCreate,
    WorkCenterOut,
    RoutingCreate,
    RoutingOut,
    RoutingOperationOut,
)
from app.schemas.member import CompanyRole
from app.services.manufacturing import (
    cancel_production_order,
    confirm_production_order,
    create_bom,
    create_production_order,
    delete_bom,
    duplicate_bom,
    get_bom,
    get_bom_cost_analysis,
    get_manufacturing_dashboard_summary,
    get_production_cost_report,
    get_production_order,
    get_wastage_report,
    import_boms_from_csv,
    list_boms,
    list_production_orders,
    update_bom,
)
from app.services.notification import notify

router = APIRouter()


# ── BOM Endpoints ──────────────────────────────────────────────────────

@router.get("/boms", response_model=list[BomOut])
def list_boms_endpoint(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    search: str | None = Query(default=None),
):
    return list_boms(db, company.id, search)


@router.post("/boms", response_model=BomOut, status_code=201)
def create_bom_endpoint(
    payload: BomCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        bom = create_bom(db, company.id, payload, user_id=user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    db.refresh(bom)
    return bom


@router.post("/boms/import", response_model=list[BomOut], status_code=201)
def import_boms_endpoint(
    file: UploadFile = File(...),
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Import BOMs from a CSV file.
    
    CSV columns: name, finished_item_name, output_qty, component_name, component_qty, component_rate, component_wastage_pct
    """
    import csv
    import io
    content = file.file.read().decode("utf-8")
    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty")
    try:
        boms = import_boms_from_csv(db, company.id, rows)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    return boms


@router.get("/boms/{bom_id}", response_model=BomOut)
def get_bom_endpoint(
    bom_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    bom = get_bom(db, company.id, bom_id)
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    return bom


@router.patch("/boms/{bom_id}", response_model=BomOut)
def update_bom_endpoint(
    bom_id: str,
    payload: BomUpdate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    bom = update_bom(db, company.id, bom_id, payload, user_id=user.id)
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    db.commit()
    db.refresh(bom)
    return bom


@router.delete("/boms/{bom_id}", status_code=204)
def delete_bom_endpoint(
    bom_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ok = delete_bom(db, company.id, bom_id, user_id=user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="BOM not found or has production orders")
    db.commit()


@router.post("/boms/{bom_id}/duplicate", response_model=BomOut, status_code=201)
def duplicate_bom_endpoint(
    bom_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    source = get_bom(db, company.id, bom_id)
    if not source:
        raise HTTPException(status_code=404, detail="BOM not found")
    new_name = f"{source.name} (Copy)"
    bom = duplicate_bom(db, company.id, bom_id, new_name)
    db.commit()
    db.refresh(bom)
    return bom


@router.get("/boms/{bom_id}/versions")
def bom_versions_endpoint(
    bom_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    from app.models.manufacturing import BomVersion
    from app.schemas.manufacturing import BomVersionOut
    bom = get_bom(db, company.id, bom_id)
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    versions = (
        db.query(BomVersion)
        .filter(BomVersion.bom_id == bom_id)
        .order_by(BomVersion.version.desc())
        .all()
    )
    return [BomVersionOut.model_validate(v) for v in versions]


@router.post("/boms/{bom_id}/restore/{version_id}", response_model=BomOut)
def restore_bom_version_endpoint(
    bom_id: str,
    version_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Restore a BOM to a previous version."""
    import json
    from app.models.manufacturing import BomVersion
    from app.schemas.manufacturing import BomCreate, BomLineCreate
    from app.services.audit import log_action, _serialize_entity
    bom = get_bom(db, company.id, bom_id)
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    version = db.query(BomVersion).filter(
        BomVersion.id == version_id,
        BomVersion.bom_id == bom_id,
    ).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    # Parse lines snapshot
    lines_data = json.loads(version.lines_snapshot)
    # Update BOM with version data
    from app.models.manufacturing import BomLine
    bom.name = version.name
    bom.finished_item_id = version.finished_item_id
    bom.output_qty = version.output_qty
    bom.is_active = version.is_active
    db.query(BomLine).filter(BomLine.bom_id == bom.id).delete()
    for line_data in lines_data:
        db.add(BomLine(
            bom_id=bom.id,
            stock_item_id=line_data["stock_item_id"],
            quantity=line_data["quantity"],
            rate=line_data.get("rate"),
            wastage_pct=line_data.get("wastage_pct", 0),
            sub_bom_id=line_data.get("sub_bom_id"),
        ))
    bom.version += 1
    db.flush()
    log_action(db, company_id=company.id, user_id=user.id, action="UPDATE",
               entity_type="bill_of_materials", entity_id=bom.id,
               new_value=_serialize_entity(bom, exclude={"lines"}),
               description=f"Restored BOM '{bom.name}' to version {version.version}")
    db.commit()
    db.refresh(bom)
    return get_bom(db, company.id, bom.id)


@router.get("/boms/{bom_id}/availability")
def check_availability_endpoint(
    bom_id: str,
    planned_qty: float = Query(..., gt=0),
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    from app.services.manufacturing import check_material_availability
    return check_material_availability(db, company.id, bom_id, planned_qty)


# ── Production Order Endpoints ─────────────────────────────────────────

@router.get("/production-orders", response_model=list[ProductionOrderOut])
def list_orders_endpoint(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    order_status: str | None = Query(default=None, alias="status"),
):
    return list_production_orders(db, company.id, order_status)


@router.post("/production-orders", response_model=ProductionOrderOut, status_code=201)
def create_order_endpoint(
    payload: ProductionOrderCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        order = create_production_order(db, company.id, user.id, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    db.refresh(order)
    return order


@router.get("/production-orders/{order_id}", response_model=ProductionOrderOut)
def get_order_endpoint(
    order_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    order = get_production_order(db, company.id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    return order


@router.patch("/production-orders/{order_id}", response_model=ProductionOrderOut)
def update_order_endpoint(
    order_id: str,
    payload: ProductionOrderUpdate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    order = get_production_order(db, company.id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    # Draft orders: full edit. In-progress orders: only produced_qty and scheduling.
    if order.status == "draft":
        if payload.order_date is not None:
            order.order_date = payload.order_date
        if payload.planned_qty is not None:
            order.planned_qty = payload.planned_qty
        if payload.narration is not None:
            order.narration = payload.narration
        if payload.labor_cost is not None:
            order.labor_cost = payload.labor_cost
        if payload.overhead_cost is not None:
            order.overhead_cost = payload.overhead_cost
    elif order.status == "in_progress":
        # Allow partial production updates
        if payload.produced_qty is not None:
            order.produced_qty = payload.produced_qty
        if payload.actual_start_date is not None:
            order.actual_start_date = payload.actual_start_date
        if payload.actual_end_date is not None:
            order.actual_end_date = payload.actual_end_date
    else:
        raise HTTPException(status_code=400, detail=f"Cannot edit order in '{order.status}' status")
    # Scheduling fields can always be updated
    if payload.planned_start_date is not None:
        order.planned_start_date = payload.planned_start_date
    if payload.planned_end_date is not None:
        order.planned_end_date = payload.planned_end_date
    db.commit()
    db.refresh(order)
    return order


@router.post("/production-orders/{order_id}/start", response_model=ProductionOrderOut)
def start_order_endpoint(
    order_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Transition a draft order to in_progress status."""
    order = get_production_order(db, company.id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    if order.status != "draft":
        raise HTTPException(status_code=400, detail="Can only start draft orders")
    from datetime import date
    order.status = "in_progress"
    order.actual_start_date = order.actual_start_date or date.today().isoformat()
    db.commit()
    db.refresh(order)
    return order


@router.post("/production-orders/{order_id}/confirm", response_model=ProductionOrderOut)
def confirm_order_endpoint(
    order_id: str,
    actual_quantities: list[ProductionOrderLineCreate] | None = None,
    batch_allocations: list[dict] | None = None,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    try:
        order = confirm_production_order(db, company.id, order_id, actual_quantities, batch_allocations)
        db.commit()

        notify(
            db, company.id,
            title="Production Order Completed",
            message=f"Order {order.order_number} confirmed — {order.planned_qty} units produced",
            category="success",
            link="/manufacturing",
            entity_type="production_order",
            entity_id=order.id,
        )
        db.commit()

        return order
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/production-orders/{order_id}/cancel", response_model=ProductionOrderOut)
def cancel_order_endpoint(
    order_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        order = cancel_production_order(db, company.id, order_id, user_id=user.id)
        db.commit()
        return order
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/boms/{bom_id}/stock-levels")
def bom_stock_levels_endpoint(
    bom_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Get current stock levels for all components in a BOM."""
    from sqlalchemy.orm import joinedload
    from app.models.manufacturing import BillOfMaterials
    from app.models.stock import StockBalance
    bom = db.query(BillOfMaterials).options(
        joinedload(BillOfMaterials.lines)
    ).filter(BillOfMaterials.id == bom_id).first()
    if not bom or bom.company_id != company.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    result = []
    for line in bom.lines:
        balance = db.query(StockBalance).filter(
            StockBalance.company_id == company.id,
            StockBalance.stock_item_id == line.stock_item_id,
        ).first()
        result.append({
            "stock_item_id": str(line.stock_item_id),
            "item_name": line.item_name,
            "quantity_per_unit": float(line.quantity),
            "current_stock": float(balance.quantity if balance else 0),
        })
    return result


@router.get("/boms/{bom_id}/pdf")
def bom_pdf_endpoint(
    bom_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Export a single BOM as PDF."""
    from app.models.manufacturing import BillOfMaterials
    from app.models.stock import StockBalance, StockItem
    from app.schemas.manufacturing import BomOut
    bom = db.get(BillOfMaterials, bom_id)
    if not bom or bom.company_id != company.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    bom_data = BomOut.model_validate(bom).model_dump()
    # Look up finished item name
    finished_item = db.get(StockItem, bom.finished_item_id)
    bom_data["finished_item_name"] = finished_item.name if finished_item else "—"
    for line_data in bom_data["lines"]:
        line_model = next((l for l in bom.lines if str(l.id) == line_data["id"]), None)
        if line_model:
            line_data["item_name"] = line_model.item_name
    stock_levels = []
    for line in bom.lines:
        balance = db.query(StockBalance).filter(
            StockBalance.company_id == company.id,
            StockBalance.stock_item_id == line.stock_item_id,
        ).first()
        stock_levels.append({
            "stock_item_id": str(line.stock_item_id),
            "current_stock": float(balance.quantity if balance else 0),
        })
    from app.services.export import export_bom_detail_pdf
    pdf = export_bom_detail_pdf(company.name, bom_data, stock_levels, company_id=company.id, db=db)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=bom_{bom.name}.pdf"})


# ── Cost Reports ───────────────────────────────────────────────────────

@router.get("/reports/bom-analysis")
def bom_analysis_endpoint(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    return get_bom_cost_analysis(db, company.id)


@router.get("/reports/production-cost")
def production_cost_endpoint(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    financial_year_id: str | None = Query(default=None),
):
    return get_production_cost_report(db, company.id, financial_year_id)


@router.get("/reports/wastage")
def wastage_report_endpoint(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    return get_wastage_report(db, company.id)


# ── Exports ────────────────────────────────────────────────────────────

@router.get("/reports/bom-analysis/pdf")
def bom_analysis_pdf_endpoint(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    from app.services.export import export_bom_analysis_pdf
    data = get_bom_cost_analysis(db, company.id)
    pdf = export_bom_analysis_pdf(company.name, data, company_id=company.id, db=db)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=bom_analysis.pdf"})


@router.get("/reports/bom-analysis/xlsx")
def bom_analysis_xlsx_endpoint(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    from app.services.export import export_bom_analysis_xlsx
    data = get_bom_cost_analysis(db, company.id)
    xlsx = export_bom_analysis_xlsx(company.name, data)
    return Response(content=xlsx, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename=bom_analysis.xlsx"})


@router.get("/reports/production-cost/pdf")
def production_cost_pdf_endpoint(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    financial_year_id: str | None = Query(default=None),
):
    from app.services.export import export_production_cost_pdf
    data = get_production_cost_report(db, company.id, financial_year_id)
    pdf = export_production_cost_pdf(company.name, data, company_id=company.id, db=db)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=production_cost.pdf"})


@router.get("/reports/production-cost/xlsx")
def production_cost_xlsx_endpoint(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    financial_year_id: str | None = Query(default=None),
):
    from app.services.export import export_production_cost_xlsx
    data = get_production_cost_report(db, company.id, financial_year_id)
    xlsx = export_production_cost_xlsx(company.name, data)
    return Response(content=xlsx, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename=production_cost.xlsx"})


@router.get("/reports/wastage/pdf")
def wastage_pdf_endpoint(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    from app.services.export import export_wastage_pdf
    data = get_wastage_report(db, company.id)
    pdf = export_wastage_pdf(company.name, data, company_id=company.id, db=db)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=wastage_report.pdf"})


@router.get("/reports/wastage/xlsx")
def wastage_xlsx_endpoint(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    from app.services.export import export_wastage_xlsx
    data = get_wastage_report(db, company.id)
    xlsx = export_wastage_xlsx(company.name, data)
    return Response(content=xlsx, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename=wastage_report.xlsx"})


@router.get("/production-orders/{order_id}/pdf")
def production_order_pdf_endpoint(
    order_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    from app.services.export import export_production_order_pdf
    from app.models.manufacturing import ProductionOrderLine
    order = get_production_order(db, company.id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    from app.schemas.manufacturing import ProductionOrderOut
    order_data = ProductionOrderOut.model_validate(order).model_dump()
    order_data["bom_name"] = order.bom.name
    from app.services.manufacturing import check_material_availability
    components = check_material_availability(db, company.id, order.bom_id, order.planned_qty)
    
    # Get wastage lines if order is completed
    wastage_lines = None
    if order.status == "completed":
        from app.schemas.manufacturing import ProductionOrderLineOut
        pols = db.query(ProductionOrderLine).filter(
            ProductionOrderLine.production_order_id == order.id
        ).all()
        wastage_lines = [ProductionOrderLineOut.model_validate(pol).model_dump() for pol in pols]
    
    pdf = export_production_order_pdf(company.name, order_data, components, wastage_lines, company_id=company.id, db=db)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=production_order_{order.order_number}.pdf"})


# ── Work Center Endpoints ──────────────────────────────────────────────

@router.get("/work-centers", response_model=list[WorkCenterOut])
def list_work_centers_endpoint(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    from app.models.manufacturing import WorkCenter
    return db.query(WorkCenter).filter(WorkCenter.company_id == company.id).all()


@router.post("/work-centers", response_model=WorkCenterOut, status_code=201)
def create_work_center_endpoint(
    payload: WorkCenterCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    from app.models.manufacturing import WorkCenter
    wc = WorkCenter(company_id=company.id, **payload.model_dump())
    db.add(wc)
    db.commit()
    db.refresh(wc)
    return wc


@router.patch("/work-centers/{wc_id}", response_model=WorkCenterOut)
def update_work_center_endpoint(
    wc_id: str,
    payload: WorkCenterCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    from app.models.manufacturing import WorkCenter
    wc = db.query(WorkCenter).filter(WorkCenter.id == wc_id, WorkCenter.company_id == company.id).first()
    if not wc:
        raise HTTPException(status_code=404, detail="Work center not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(wc, k, v)
    db.commit()
    db.refresh(wc)
    return wc


@router.delete("/work-centers/{wc_id}", status_code=204)
def delete_work_center_endpoint(
    wc_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    from app.models.manufacturing import WorkCenter
    wc = db.query(WorkCenter).filter(WorkCenter.id == wc_id, WorkCenter.company_id == company.id).first()
    if not wc:
        raise HTTPException(status_code=404, detail="Work center not found")
    db.delete(wc)
    db.commit()


# ── Routing Endpoints ──────────────────────────────────────────────────

@router.get("/routings", response_model=list[RoutingOut])
def list_routings_endpoint(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    from app.models.manufacturing import Routing, RoutingOperation, WorkCenter
    routings = db.query(Routing).filter(Routing.company_id == company.id).all()
    result = []
    for r in routings:
        ops = db.query(RoutingOperation).filter(RoutingOperation.routing_id == r.id).order_by(RoutingOperation.step_number).all()
        ops_out = []
        for op in ops:
            wc = db.get(WorkCenter, op.work_center_id)
            ops_out.append(RoutingOperationOut(
                id=op.id, routing_id=op.routing_id, step_number=op.step_number,
                work_center_id=op.work_center_id, work_center_name=wc.name if wc else None,
                description=op.description, setup_time_minutes=float(op.setup_time_minutes),
                run_time_per_unit_minutes=float(op.run_time_per_unit_minutes),
            ))
        result.append(RoutingOut(
            id=r.id, company_id=r.company_id, name=r.name,
            finished_item_id=r.finished_item_id, is_active=r.is_active,
            operations=ops_out, created_at=r.created_at, updated_at=r.updated_at,
        ))
    return result


@router.post("/routings", response_model=RoutingOut, status_code=201)
def create_routing_endpoint(
    payload: RoutingCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    from app.models.manufacturing import Routing, RoutingOperation
    routing = Routing(company_id=company.id, name=payload.name, finished_item_id=payload.finished_item_id)
    db.add(routing)
    db.flush()
    for op in payload.operations:
        db.add(RoutingOperation(routing_id=routing.id, **op.model_dump()))
    db.commit()
    db.refresh(routing)
    return routing


@router.delete("/routings/{routing_id}", status_code=204)
def delete_routing_endpoint(
    routing_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    from app.models.manufacturing import Routing, RoutingOperation
    routing = db.query(Routing).filter(Routing.id == routing_id, Routing.company_id == company.id).first()
    if not routing:
        raise HTTPException(status_code=404, detail="Routing not found")
    db.query(RoutingOperation).filter(RoutingOperation.routing_id == routing_id).delete()
    db.delete(routing)
    db.commit()


# ── Dashboard ─────────────────────────────────────────────────────────


@router.get("/dashboard", response_model=ManufacturingDashboardSummary)
def manufacturing_dashboard_endpoint(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    return get_manufacturing_dashboard_summary(db, company.id)
