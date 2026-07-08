"""Manufacturing endpoints: BOMs, production orders, cost reports."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user, require_role
from app.models.user import Company, User
from app.schemas.manufacturing import (
    BomCreate,
    BomOut,
    BomUpdate,
    ProductionOrderCreate,
    ProductionOrderOut,
    ProductionOrderUpdate,
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
    get_production_cost_report,
    get_production_order,
    list_boms,
    list_production_orders,
    update_bom,
)

router = APIRouter()


# ── BOM Endpoints ──────────────────────────────────────────────────────

@router.get("/boms", response_model=list[BomOut])
def list_boms_endpoint(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
    search: str | None = Query(default=None),
):
    return list_boms(db, company.id, search)


@router.post("/boms", response_model=BomOut, status_code=201)
def create_bom_endpoint(
    payload: BomCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    try:
        bom = create_bom(db, company.id, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    db.refresh(bom)
    return bom


@router.get("/boms/{bom_id}", response_model=BomOut)
def get_bom_endpoint(
    bom_id: str,
    company: Company = Depends(get_active_company),
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
):
    bom = update_bom(db, company.id, bom_id, payload)
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
):
    ok = delete_bom(db, company.id, bom_id)
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


@router.get("/boms/{bom_id}/availability")
def check_availability_endpoint(
    bom_id: str,
    planned_qty: float = Query(..., gt=0),
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    from app.services.manufacturing import check_material_availability
    return check_material_availability(db, company.id, bom_id, planned_qty)


# ── Production Order Endpoints ─────────────────────────────────────────

@router.get("/production-orders", response_model=list[ProductionOrderOut])
def list_orders_endpoint(
    company: Company = Depends(get_active_company),
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
    company: Company = Depends(get_active_company),
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
    if order.status != "draft":
        raise HTTPException(status_code=400, detail="Can only edit draft orders")
    if payload.order_date is not None:
        order.order_date = payload.order_date
    if payload.planned_qty is not None:
        order.planned_qty = payload.planned_qty
    if payload.narration is not None:
        order.narration = payload.narration
    db.commit()
    db.refresh(order)
    return order
    return order


@router.post("/production-orders/{order_id}/confirm", response_model=ProductionOrderOut)
def confirm_order_endpoint(
    order_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    try:
        order = confirm_production_order(db, company.id, order_id)
        db.commit()
        return order
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/production-orders/{order_id}/cancel", response_model=ProductionOrderOut)
def cancel_order_endpoint(
    order_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    try:
        order = cancel_production_order(db, company.id, order_id)
        db.commit()
        return order
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/boms/{bom_id}/stock-levels")
def bom_stock_levels_endpoint(
    bom_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Get current stock levels for all components in a BOM."""
    from app.models.manufacturing import BillOfMaterials
    from app.models.stock import StockBalance
    bom = db.get(BillOfMaterials, bom_id)
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


# ── Cost Reports ───────────────────────────────────────────────────────

@router.get("/reports/bom-analysis")
def bom_analysis_endpoint(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    return get_bom_cost_analysis(db, company.id)


@router.get("/reports/production-cost")
def production_cost_endpoint(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
    financial_year_id: str | None = Query(default=None),
):
    return get_production_cost_report(db, company.id, financial_year_id)


# ── Exports ────────────────────────────────────────────────────────────

@router.get("/reports/bom-analysis/pdf")
def bom_analysis_pdf_endpoint(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    from app.services.export import export_bom_analysis_pdf
    data = get_bom_cost_analysis(db, company.id)
    pdf = export_bom_analysis_pdf(company.name, data)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=bom_analysis.pdf"})


@router.get("/reports/bom-analysis/xlsx")
def bom_analysis_xlsx_endpoint(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    from app.services.export import export_bom_analysis_xlsx
    data = get_bom_cost_analysis(db, company.id)
    xlsx = export_bom_analysis_xlsx(company.name, data)
    return Response(content=xlsx, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename=bom_analysis.xlsx"})


@router.get("/reports/production-cost/pdf")
def production_cost_pdf_endpoint(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
    financial_year_id: str | None = Query(default=None),
):
    from app.services.export import export_production_cost_pdf
    data = get_production_cost_report(db, company.id, financial_year_id)
    pdf = export_production_cost_pdf(company.name, data)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=production_cost.pdf"})


@router.get("/reports/production-cost/xlsx")
def production_cost_xlsx_endpoint(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
    financial_year_id: str | None = Query(default=None),
):
    from app.services.export import export_production_cost_xlsx
    data = get_production_cost_report(db, company.id, financial_year_id)
    xlsx = export_production_cost_xlsx(company.name, data)
    return Response(content=xlsx, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename=production_cost.xlsx"})


@router.get("/production-orders/{order_id}/pdf")
def production_order_pdf_endpoint(
    order_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    from app.services.export import export_production_order_pdf
    order = get_production_order(db, company.id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    from app.schemas.manufacturing import ProductionOrderOut
    order_data = ProductionOrderOut.model_validate(order).model_dump()
    order_data["bom_name"] = order.bom.name
    from app.services.manufacturing import check_material_availability
    components = check_material_availability(db, company.id, order.bom_id, order.planned_qty)
    pdf = export_production_order_pdf(company.name, order_data, components)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=production_order_{order.order_number}.pdf"})
