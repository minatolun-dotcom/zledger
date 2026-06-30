"""Company endpoints: create, list (for current user), get, update.

Membership: the creating user becomes an ``owner`` of the new company.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_current_user
from app.models.user import Company, CompanyMember, User
from app.schemas.user import CompanyCreate, CompanyOut, CompanyUpdate
from app.services.coa import seed_groups, seed_default_ledgers, seed_system_ledgers
from app.services.gst import seed_gst_ledgers

router = APIRouter()


@router.get("", response_model=list[CompanyOut])
def list_my_companies(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """List companies the current user belongs to."""
    if user.is_superadmin:
        rows = db.scalars(select(Company).order_by(Company.name)).all()
    else:
        rows = (
            db.query(Company)
            .join(CompanyMember, CompanyMember.company_id == Company.id)
            .filter(CompanyMember.user_id == user.id)
            .order_by(Company.name)
            .all()
        )
    return rows


@router.post("", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
def create_company(
    payload: CompanyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.gstin:
        existing = db.scalar(select(Company).where(Company.gstin == payload.gstin))
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A company with this GSTIN already exists",
            )
    company = Company(**payload.model_dump())
    db.add(company)
    db.flush()
    db.add(
        CompanyMember(
            company_id=company.id, user_id=user.id, role="owner"
        )
    )
    # Auto-add all superadmins as owners of this company
    superadmins = db.scalars(
        select(User).where(User.is_superadmin.is_(True), User.id != user.id)
    ).all()
    for sa in superadmins:
        db.add(CompanyMember(company_id=company.id, user_id=sa.id, role="owner"))
    db.commit()
    db.refresh(company)
    seed_groups(db, company.id)
    seed_default_ledgers(db, company.id)
    seed_gst_ledgers(db, company.id)
    seed_system_ledgers(db, company.id)
    return company


@router.get("/{company_id}", response_model=CompanyOut)
def get_company(
    company_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Company not found")
    _ensure_member(user, company, db)
    return company


@router.patch("/{company_id}", response_model=CompanyOut)
def update_company(
    company_id: str,
    payload: CompanyUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Company not found")
    _ensure_member(user, company, db)

    data = payload.model_dump(exclude_unset=True)
    if "gstin" in data and data["gstin"] and data["gstin"] != company.gstin:
        clash = db.scalar(select(Company).where(Company.gstin == data["gstin"]))
        if clash:
            raise HTTPException(
                status.HTTP_409_CONFLICT, detail="GSTIN already in use"
            )
    for k, v in data.items():
        setattr(company, k, v)
    db.commit()
    db.refresh(company)
    return company


def _ensure_member(user: User, company: Company, db: Session) -> None:
    if user.is_superadmin:
        return
    is_member = db.scalar(
        select(CompanyMember).where(
            CompanyMember.company_id == company.id, CompanyMember.user_id == user.id
        )
    )
    if not is_member:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not a member")
