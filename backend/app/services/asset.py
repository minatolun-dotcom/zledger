"""Fixed Asset Register service: categories, register, and depreciation.

Depreciation follows Indian practice:
- WDV (Written Down Value): annual depreciation = opening WDV * rate%.
- SLM (Straight Line): annual depreciation = (cost - salvage) * rate%.

Both are apportioned by the number of days the asset was in use during the
financial year. Running depreciation updates each asset's accumulated
depreciation and written-down value, and posts a single journal voucher that
debits "Depreciation Expense" and credits "Accumulated Depreciation". Because
the Balance Sheet nets credit balances within the Fixed Assets group, and the
P&L nets the expense group, no report code changes are required.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.accounting import AccountGroup, FinancialYear, Ledger
from app.models.asset import AssetCategory, AssetRegister
from app.models.user import Company
from app.schemas.asset import (
    AssetCategoryCreate,
    AssetCategoryOut,
    AssetRegisterCreate,
    AssetRegisterOut,
    DepreciationRunRequest,
    DepreciationRunResponse,
    DepreciationScheduleLine,
    DepreciationScheduleResponse,
)
from app.schemas.voucher import VoucherCreate, VoucherLineIn


# ─── Schedule II Helper ──────────────────────────────────────────────────────

# Schedule II useful lives (years) by asset class
# Based on Companies Act 2013, Schedule II (as amended)
SCHEDULE_II_USEFUL_LIVES = {
    # Buildings
    "buildings_factory": 30,
    "buildings_office": 60,
    "buildings_road_boundary": 5,
    "buildings_temporary": 3,
    # Plant & Machinery
    "plant_machinery_general": 15,
    "plant_machinery_continuous_process": 8,
    "plant_machinery_cement_chemical": 10,
    "plant_machinery_textile": 10,
    "plant_machinery_paper": 12,
    "plant_machinery_sugar": 10,
    "plant_machinery_steel": 12,
    "plant_machinery_electric": 20,
    "plant_machinery_medical": 13,
    "plant_machinery_lab": 10,
    "plant_machinery_computers": 3,
    "plant_machinery_software": 3,
    # Furniture & Fixtures
    "furniture_fixtures": 10,
    "furniture_electric": 10,
    # Vehicles
    "motor_vehicles_goods": 8,
    "motor_vehicles_passenger": 10,
    "motor_vehicles_scooters": 10,
    # Office Equipment
    "office_equipment": 5,
    "office_equipment_ac": 5,
    # Electrical Installations
    "electrical_installations": 10,
    # Intangible
    "intangible_software": 3,
    "intangible_patents": 10,
    "intangible_trademarks": 10,
    # Ships
    "ships_speed_boats": 13,
    "ships_barges": 28,
    # Aircraft
    "aircraft": 20,
    # Default
    "default": 10,
}


def get_schedule_ii_useful_life(asset_class: str | None) -> int | None:
    """Get Schedule II useful life in years for an asset class.
    Returns None if class not recognized (user must specify manually)."""
    if not asset_class:
        return None
    return SCHEDULE_II_USEFUL_LIVES.get(asset_class.lower(), SCHEDULE_II_USEFUL_LIVES.get("default"))


def compute_schedule_ii_rate(useful_life_years: int, method: str = "wdv", residual_rate: float = 0.05) -> float:
    """Compute annual depreciation rate per Schedule II.
    For WDV: rate = 1 - (residual_rate)^(1/useful_life)
    For SLM: rate = (1 - residual_rate) / useful_life * 100
    """
    if useful_life_years <= 0:
        return 0.0
    if method.lower() == "wdv":
        # WDV: rate = 1 - (residual)^(1/n) where residual = 5%
        residual = 0.05
        rate = 1 - (residual ** (1 / useful_life_years))
        return round(rate * 100, 2)
    else:
        # SLM: straight line over useful life with 5% residual
        rate = (1 - 0.05) / useful_life_years
        return round(rate * 100, 2)


def auto_compute_rate_if_needed(category: "AssetCategory") -> float:
    """Auto-compute rate_pct from Schedule II if useful_life_years or schedule_ii_class is set.
    Returns the computed rate (or existing rate_pct if no auto-compute possible).
    """
    rate = category.rate_pct
    if category.schedule_ii_class:
        life = get_schedule_ii_useful_life(category.schedule_ii_class)
        if life:
            rate = compute_schedule_ii_rate(life, category.depreciation_method)
    elif category.useful_life_years:
        rate = compute_schedule_ii_rate(category.useful_life_years, category.depreciation_method)
    return rate


def _category_to_dict(c: AssetCategory) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "depreciation_method": c.depreciation_method,
        "rate_pct": float(c.rate_pct),
        "useful_life_years": c.useful_life_years,
        "schedule_ii_class": c.schedule_ii_class,
        "is_active": c.is_active,
    }


def create_category(db: Session, company_id: str, payload: AssetCategoryCreate) -> dict:
    """Create a new asset category with auto-computed Schedule II rate if applicable."""
    c = AssetCategory(
        company_id=company_id,
        name=payload.name,
        depreciation_method=payload.depreciation_method,
        rate_pct=payload.rate_pct,
        useful_life_years=payload.useful_life_years,
        schedule_ii_class=payload.schedule_ii_class,
        is_active=payload.is_active,
    )
    # Auto-compute rate if schedule_ii_class or useful_life_years provided
    if c.schedule_ii_class or c.useful_life_years:
        c.rate_pct = auto_compute_rate_if_needed(c)
    db.add(c)
    db.commit()
    db.refresh(c)
    return _category_to_dict(c)


def get_categories(db: Session, company_id: str) -> list[dict]:
    """Get all asset categories for a company."""
    cats = db.query(AssetCategory).filter(AssetCategory.company_id == company_id).order_by(AssetCategory.name).all()
    return [_category_to_dict(c) for c in cats]


def update_category(
    db: Session, company_id: str, category_id: str, payload: "AssetCategoryUpdate"
) -> dict:
    c = db.get(AssetCategory, category_id)
    if not c or c.company_id != company_id:
        from fastapi import HTTPException, status
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Category not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    # Auto-compute rate if schedule_ii_class or useful_life_years changed
    if c.schedule_ii_class or c.useful_life_years:
        c.rate_pct = auto_compute_rate_if_needed(c)
    db.commit()
    db.refresh(c)
    return _category_to_dict(c)


def delete_category(db: Session, company_id: str, category_id: str) -> None:
    c = db.get(AssetCategory, category_id)
    if not c or c.company_id != company_id:
        from fastapi import HTTPException, status

        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Category not found")
    linked = (
        db.query(AssetRegister)
        .filter(AssetRegister.category_id == category_id)
        .first()
    )
    if linked:
        from fastapi import HTTPException, status

        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete category with linked assets",
        )
    db.delete(c)
    db.commit()
# ─── Asset Register ─────────────────────────────────────────────────────────


def _asset_to_dict(a: AssetRegister) -> dict:
    return {
        "id": a.id,
        "category_id": a.category_id,
        "asset_code": a.asset_code,
        "name": a.name,
        "purchase_date": a.purchase_date,
        "cost": float(a.cost),
        "salvage_value": float(a.salvage_value),
        "accumulated_depreciation": float(a.accumulated_depreciation),
        "wdv": float(a.wdv),
        "put_to_use_date": a.put_to_use_date,
        "is_active": a.is_active,
    }


def get_register(
    db: Session, company_id: str, category_id: str | None = None, is_active: bool | None = None
) -> list[dict]:
    q = db.query(AssetRegister).filter(AssetRegister.company_id == company_id)
    if category_id:
        q = q.filter(AssetRegister.category_id == category_id)
    if is_active is not None:
        q = q.filter(AssetRegister.is_active.is_(is_active))
    rows = q.order_by(AssetRegister.name).all()
    return [_asset_to_dict(a) for a in rows]


def create_asset(db: Session, company_id: str, payload: AssetRegisterCreate) -> dict:
    cat = db.get(AssetCategory, payload.category_id)
    if not cat or cat.company_id != company_id:
        from fastapi import HTTPException, status

        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Category not found")
    data = payload.model_dump()
    put_to_use = data.get("put_to_use_date") or data["purchase_date"]
    a = AssetRegister(
        company_id=company_id,
        category_id=payload.category_id,
        asset_code=payload.asset_code,
        name=payload.name,
        purchase_date=payload.purchase_date,
        cost=payload.cost,
        salvage_value=payload.salvage_value,
        wdv=payload.cost,
        put_to_use_date=put_to_use,
        is_active=payload.is_active,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return _asset_to_dict(a)


def update_asset(
    db: Session, company_id: str, asset_id: str, payload: "AssetRegisterUpdate"
) -> dict:
    a = db.get(AssetRegister, asset_id)
    if not a or a.company_id != company_id:
        from fastapi import HTTPException, status

        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Asset not found")
    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data:
        cat = db.get(AssetCategory, payload.category_id)
        if not cat or cat.company_id != company_id:
            from fastapi import HTTPException, status

            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Category not found")
    for k, v in data.items():
        setattr(a, k, v)
    # Re-derive WDV from the (possibly edited) cost minus accumulated depreciation
    a.wdv = float(a.cost) - float(a.accumulated_depreciation)
    db.commit()
    db.refresh(a)
    return _asset_to_dict(a)


def delete_asset(db: Session, company_id: str, asset_id: str) -> None:
    a = db.get(AssetRegister, asset_id)
    if not a or a.company_id != company_id:
        from fastapi import HTTPException, status

        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Asset not found")
    db.delete(a)
    db.commit()


# ─── Depreciation ───────────────────────────────────────────────────────────


def _depreciation_for_fy(
    asset: AssetRegister, category: AssetCategory, fy: FinancialYear
) -> Decimal:
    """Depreciation for one asset across the given financial year (days-apportioned)."""
    eff_start = asset.put_to_use_date or asset.purchase_date
    try:
        eff_start_d = date.fromisoformat(eff_start)
        fy_start = date.fromisoformat(fy.start_date)
        fy_end = date.fromisoformat(fy.end_date)
    except (ValueError, TypeError):
        return Decimal("0")

    if eff_start_d > fy_end:
        return Decimal("0")

    period_start = max(eff_start_d, fy_start)
    if period_start > fy_end:
        return Decimal("0")

    days_in_use = (fy_end - period_start).days + 1
    days_in_fy = (fy_end - fy_start).days + 1
    if days_in_fy <= 0:
        return Decimal("0")

    rate = Decimal(str(category.rate_pct)) / Decimal("100")
    if rate <= 0:
        return Decimal("0")

    if category.depreciation_method == "slm":
        base = Decimal(str(asset.cost)) - Decimal(str(asset.salvage_value))
        annual = base * rate
        max_dep = base - Decimal(str(asset.accumulated_depreciation))
    else:  # wdv
        base = Decimal(str(asset.wdv))
        annual = base * rate
        max_dep = base - Decimal(str(asset.salvage_value))

    dep = (annual * Decimal(days_in_use)) / Decimal(days_in_fy)
    # Never depreciate below salvage value
    dep = min(dep, max_dep)
    if dep < 0:
        dep = Decimal("0")
    return dep.quantize(Decimal("0.01"))


def get_depreciation_schedule(
    db: Session, company_id: str, financial_year_id: str
) -> DepreciationScheduleResponse:
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company_id:
        from fastapi import HTTPException, status

        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    cats = {
        c.id: c
        for c in db.query(AssetCategory).filter(AssetCategory.company_id == company_id).all()
    }
    assets = (
        db.query(AssetRegister)
        .filter(AssetRegister.company_id == company_id, AssetRegister.is_active.is_(True))
        .all()
    )

    lines: list[DepreciationScheduleLine] = []
    total = Decimal("0")
    for a in assets:
        cat = cats.get(a.category_id)
        if not cat or not cat.is_active:
            continue
        dep = _depreciation_for_fy(a, cat, fy)
        if dep <= 0:
            continue
        opening = Decimal(str(a.wdv))
        closing = opening - dep
        total += dep
        lines.append(
            DepreciationScheduleLine(
                asset_id=a.id,
                asset_code=a.asset_code,
                name=a.name,
                category=cat.name,
                method=cat.depreciation_method,
                opening_wdv=float(opening),
                depreciation=float(dep),
                closing_wdv=float(closing),
            )
        )
    return DepreciationScheduleResponse(
        financial_year_id=financial_year_id,
        total_depreciation=float(total),
        lines=lines,
    )


def run_depreciation(
    db: Session,
    company: Company,
    req: DepreciationRunRequest,
    user_id: str,
) -> DepreciationRunResponse:
    fy = db.get(FinancialYear, req.financial_year_id)
    if not fy or fy.company_id != company.id:
        from fastapi import HTTPException, status

        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    schedule = get_depreciation_schedule(db, company.id, req.financial_year_id)

    assets = {
        a.id: a
        for a in db.query(AssetRegister)
        .filter(AssetRegister.company_id == company.id, AssetRegister.is_active.is_(True))
        .all()
    }

    # Only depreciate assets not already depreciated for this FY. The voucher
    # amount reflects *applied* depreciation, so re-runs are safely idempotent.
    applied_lines: list[DepreciationScheduleLine] = []
    applied_total = Decimal("0")
    for line in schedule.lines:
        a = assets.get(line.asset_id)
        if not a:
            continue
        if a.last_depreciated_fy_id == fy.id and not req.force:
            continue
        dep = Decimal(str(line.depreciation))
        a.accumulated_depreciation = float(Decimal(str(a.accumulated_depreciation)) + dep)
        a.wdv = float(Decimal(str(a.wdv)) - dep)
        a.last_depreciated_fy_id = fy.id
        applied_total += dep
        applied_lines.append(line)

    db.commit()

    voucher_id: str | None = None
    message = "No new depreciation to post for this financial year"
    if applied_total > 0:
        expense_ledger = _get_or_create_ledger(
            db,
            company.id,
            "SYS_DEPRECIATION_EXPENSE",
            "Depreciation Expense",
            "GRP_INDIRECT_EXPENSES",
        )
        acc_dep_ledger = _get_or_create_ledger(
            db,
            company.id,
            "SYS_ACCUMULATED_DEPRECIATION",
            "Accumulated Depreciation",
            "GRP_FIXED_ASSETS",
        )

        from app.services.voucher_service import create_voucher as service_create_voucher

        voucher_data = VoucherCreate(
            voucher_type="journal",
            voucher_date=fy.end_date,
            narration=f"Depreciation for FY {fy.name}",
            lines=[
                VoucherLineIn(
                    ledger_id=expense_ledger.id,
                    debit=float(applied_total),
                    credit=0,
                ),
                VoucherLineIn(
                    ledger_id=acc_dep_ledger.id,
                    debit=0,
                    credit=float(applied_total),
                ),
            ],
        )
        voucher = service_create_voucher(db, company, voucher_data, user_id)
        voucher_id = voucher.id
        message = "Depreciation posted as journal voucher"

    return DepreciationRunResponse(
        financial_year_id=fy.id,
        voucher_id=voucher_id,
        total_depreciation=float(applied_total),
        lines=applied_lines,
        message=message,
    )
