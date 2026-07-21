"""CRUD for supporting master entities: Unit, CostCentre, CostCategory."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user
from app.models.masters import CostCategory, CostCentre, Unit
from app.models.user import Company, User
from app.schemas.masters import (
    CostCategoryCreate,
    CostCategoryOut,
    CostCentreCreate,
    CostCentreOut,
    UnitCreate,
    UnitOut,
)

router = APIRouter()


# ── Units ──────────────────────────────────────────────────────────────────

@router.get("/units", response_model=list[UnitOut])
def list_units(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    return db.query(Unit).filter(Unit.company_id == company.id).order_by(Unit.name).all()


@router.get("/units/{unit_id}", response_model=UnitOut)
def get_unit(
    unit_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    unit = db.get(Unit, unit_id)
    if not unit or unit.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unit not found")
    return unit


@router.post("/units", response_model=UnitOut, status_code=201)
def create_unit(
    payload: UnitCreate,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    unit = Unit(company_id=company.id, **payload.model_dump(exclude={"created_from"}))
    db.add(unit)
    db.commit()
    db.refresh(unit)
    from app.services.audit import log_action, serialize_entity
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="CREATE", entity_type="unit", entity_id=unit.id,
        new_value=serialize_entity(unit),
        description=f"Created unit {unit.name}" + (f" (from: {payload.created_from})" if payload.created_from else ""),
    )
    db.commit()
    return unit


# ── Cost Centres ───────────────────────────────────────────────────────────

@router.get("/cost-centres", response_model=list[CostCentreOut])
def list_cost_centres(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    return db.query(CostCentre).filter(CostCentre.company_id == company.id).order_by(CostCentre.name).all()


@router.post("/cost-centres", response_model=CostCentreOut, status_code=201)
def create_cost_centre(
    payload: CostCentreCreate,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    cc = CostCentre(company_id=company.id, **payload.model_dump())
    db.add(cc)
    db.commit()
    db.refresh(cc)
    return cc


# ── Cost Categories ────────────────────────────────────────────────────────

@router.get("/cost-categories", response_model=list[CostCategoryOut])
def list_cost_categories(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    return db.query(CostCategory).filter(CostCategory.company_id == company.id).order_by(CostCategory.name).all()


@router.post("/cost-categories", response_model=CostCategoryOut, status_code=201)
def create_cost_category(
    payload: CostCategoryCreate,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    cc = CostCategory(company_id=company.id, **payload.model_dump())
    db.add(cc)
    db.commit()
    db.refresh(cc)
    return cc
