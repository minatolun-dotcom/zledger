"""CRUD for supporting master entities: Unit, CostCentre, CostCategory."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company
from app.models.masters import CostCategory, CostCentre, Unit
from app.models.user import Company
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


@router.post("/units", response_model=UnitOut, status_code=201)
def create_unit(
    payload: UnitCreate,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    unit = Unit(company_id=company.id, **payload.model_dump())
    db.add(unit)
    db.commit()
    db.refresh(unit)
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
