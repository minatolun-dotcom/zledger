"""Fixed Asset Register API: categories, register, and depreciation."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import (
    get_active_company,
    get_current_user,
    pagination_params,
    Pagination,
    require_role,
)
from app.models.asset import AssetCategory, AssetRegister
from app.models.user import Company, User
from app.schemas.asset import (
    AssetCategoryCreate,
    AssetCategoryOut,
    AssetCategoryUpdate,
    AssetRegisterCreate,
    AssetRegisterOut,
    AssetRegisterUpdate,
    DepreciationRunRequest,
    DepreciationRunResponse,
    DepreciationScheduleResponse,
)
from app.schemas.member import CompanyRole
from app.services import asset as asset_service

router = APIRouter(tags=["fixed-assets"])


# ─── Categories ──────────────────────────────────────────────────────────


@router.get("/categories", response_model=list[AssetCategoryOut])
def list_categories(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
    pagination: Pagination = Depends(pagination_params),
    response: Response = None,
):
    items = [AssetCategoryOut(**c) for c in asset_service.get_categories(db, company.id)]
    total = len(items)
    if pagination.limit is not None:
        items = items[pagination.offset : pagination.offset + pagination.limit]
        if response is not None:
            response.headers.update(pagination.header(total))
    return items


@router.get("/categories/{category_id}", response_model=AssetCategoryOut)
def get_category(
    category_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    cat = db.get(AssetCategory, category_id)
    if not cat or cat.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Category not found")
    return AssetCategoryOut(
        id=cat.id,
        name=cat.name,
        depreciation_method=cat.depreciation_method,
        rate_pct=float(cat.rate_pct),
        useful_life_years=cat.useful_life_years,
        is_active=cat.is_active,
    )


@router.post("/categories", response_model=AssetCategoryOut, status_code=201)
def create_category(
    payload: AssetCategoryCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    return AssetCategoryOut(**asset_service.create_category(db, company.id, payload))


@router.patch("/categories/{category_id}", response_model=AssetCategoryOut)
def update_category(
    category_id: str,
    payload: AssetCategoryUpdate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    return AssetCategoryOut(
        **asset_service.update_category(db, company.id, category_id, payload)
    )


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(
    category_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    asset_service.delete_category(db, company.id, category_id)


# ─── Asset Register ────────────────────────────────────────────────────────


@router.get("/assets", response_model=list[AssetRegisterOut])
def list_assets(
    category_id: str | None = None,
    is_active: bool | None = None,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
    pagination: Pagination = Depends(pagination_params),
    response: Response = None,
):
    items = [
        AssetRegisterOut(**a)
        for a in asset_service.get_register(db, company.id, category_id, is_active)
    ]
    total = len(items)
    if pagination.limit is not None:
        items = items[pagination.offset : pagination.offset + pagination.limit]
        if response is not None:
            response.headers.update(pagination.header(total))
    return items


@router.get("/assets/{asset_id}", response_model=AssetRegisterOut)
def get_asset(
    asset_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    a = db.get(AssetRegister, asset_id)
    if not a or a.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return AssetRegisterOut(
        id=a.id,
        category_id=a.category_id,
        asset_code=a.asset_code,
        name=a.name,
        purchase_date=a.purchase_date,
        cost=float(a.cost),
        salvage_value=float(a.salvage_value),
        accumulated_depreciation=float(a.accumulated_depreciation),
        wdv=float(a.wdv),
        put_to_use_date=a.put_to_use_date,
        is_active=a.is_active,
    )


@router.post("/assets", response_model=AssetRegisterOut, status_code=201)
def create_asset(
    payload: AssetRegisterCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    return AssetRegisterOut(**asset_service.create_asset(db, company.id, payload))


@router.patch("/assets/{asset_id}", response_model=AssetRegisterOut)
def update_asset(
    asset_id: str,
    payload: AssetRegisterUpdate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    return AssetRegisterOut(
        **asset_service.update_asset(db, company.id, asset_id, payload)
    )


@router.delete("/assets/{asset_id}", status_code=204)
def delete_asset(
    asset_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    asset_service.delete_asset(db, company.id, asset_id)


# ─── Depreciation ──────────────────────────────────────────────────────────


@router.get("/depreciation/schedule", response_model=DepreciationScheduleResponse)
def depreciation_schedule(
    financial_year_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    return asset_service.get_depreciation_schedule(db, company.id, financial_year_id)


@router.post("/depreciation/run", response_model=DepreciationRunResponse)
def run_depreciation(
    payload: DepreciationRunRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return asset_service.run_depreciation(db, company, payload, user.id or "system")
