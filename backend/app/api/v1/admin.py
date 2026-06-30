"""Superadmin endpoints: user management and company management."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_current_user
from app.core.security import hash_password
from app.models.user import Company, CompanyMember, User
from app.schemas.user import AdminUserUpdate, CompanyOut, UserOut

router = APIRouter()


class AdminCreateUser(BaseModel):
    """Superadmin: create a new user."""
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    is_superadmin: bool = False


class AdminAssignCompany(BaseModel):
    """Superadmin: assign a user to a company with a role."""
    company_id: str
    role: str = "accountant"


def _require_superadmin(user: User):
    """Ensure the current user is a superadmin."""
    if not user.is_superadmin:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Superadmin access required",
        )


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: AdminCreateUser,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new user (superadmin only)."""
    _require_superadmin(user)
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="An account with this email already exists")
    new_user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        is_active=True,
        is_superadmin=payload.is_superadmin,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return UserOut.model_validate(new_user)


@router.get("/users", response_model=list[UserOut])
def list_users(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all users (superadmin only)."""
    _require_superadmin(user)
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [UserOut.model_validate(u) for u in users]


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(
    user_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get user details (superadmin only)."""
    _require_superadmin(user)
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserOut.model_validate(target)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    payload: AdminUserUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a user (superadmin only)."""
    _require_superadmin(user)

    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    # Can't deactivate yourself
    if user_id == user.id and payload.is_active is False:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate yourself",
        )

    # Check if this is the last superadmin
    if target.is_superadmin and payload.is_superadmin is False:
        superadmin_count = db.query(User).filter(User.is_superadmin.is_(True)).count()
        if superadmin_count <= 1:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove superadmin status from the last superadmin",
            )

    # Check if this is the last active superadmin when deactivating
    if payload.is_active is False and target.is_superadmin:
        active_superadmin_count = db.query(User).filter(
            User.is_superadmin.is_(True), User.is_active.is_(True)
        ).count()
        if active_superadmin_count <= 1:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate the last active superadmin",
            )

    # Check email uniqueness if changing
    if payload.email and payload.email != target.email:
        existing = db.query(User).filter(User.email == payload.email).first()
        if existing:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="An account with this email already exists",
            )
        target.email = payload.email

    if payload.name is not None:
        target.name = payload.name
    if payload.is_active is not None:
        target.is_active = payload.is_active
    if payload.is_superadmin is not None:
        target.is_superadmin = payload.is_superadmin

    db.commit()
    db.refresh(target)
    return UserOut.model_validate(target)


@router.delete("/users/{user_id}")
def deactivate_user(
    user_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft-delete (deactivate) a user (superadmin only)."""
    _require_superadmin(user)

    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    # Can't deactivate yourself
    if user_id == user.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate yourself",
        )

    # Check if this is the last active superadmin
    if target.is_superadmin:
        active_superadmin_count = db.query(User).filter(
            User.is_superadmin.is_(True), User.is_active.is_(True)
        ).count()
        if active_superadmin_count <= 1:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate the last active superadmin",
            )

    target.is_active = False
    db.commit()

    # Remove all company memberships
    db.query(CompanyMember).filter(CompanyMember.user_id == user_id).delete()
    db.commit()

    return {"message": f"User {target.email} has been deactivated"}


@router.post("/users/{user_id}/memberships")
def assign_to_company(
    user_id: str,
    payload: AdminAssignCompany,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Assign a user to a company with a role (superadmin only)."""
    _require_superadmin(user)

    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    company = db.get(Company, payload.company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Company not found")

    if payload.role not in ("accountant", "viewer", "owner"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid role")

    existing = db.query(CompanyMember).filter(
        CompanyMember.company_id == payload.company_id,
        CompanyMember.user_id == user_id,
    ).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="User is already a member of this company")

    member = CompanyMember(
        company_id=payload.company_id,
        user_id=user_id,
        role=payload.role,
    )
    db.add(member)
    db.commit()
    return {"message": f"User {target.email} added to {company.name} as {payload.role}"}


@router.get("/stats")
def get_stats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get system stats (superadmin only)."""
    _require_superadmin(user)

    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active.is_(True)).count()
    superadmin_count = db.query(User).filter(User.is_superadmin.is_(True)).count()
    total_companies = db.query(CompanyMember).distinct(CompanyMember.company_id).count()

    return {
        "total_users": total_users,
        "active_users": active_users,
        "superadmin_count": superadmin_count,
        "total_companies": total_companies,
    }


# ── Company management (superadmin only) ──────────────────────────────────


class AdminCompanyCreate(BaseModel):
    """Superadmin: create a new company."""
    name: str = Field(..., min_length=1, max_length=255)
    legal_name: str | None = None
    gstin: str | None = None
    state_code: str | None = None
    pan: str | None = None
    address: str | None = None


class AdminCompanyUpdate(BaseModel):
    """Superadmin: update a company."""
    name: str | None = None
    legal_name: str | None = None
    gstin: str | None = None
    state_code: str | None = None
    pan: str | None = None
    address: str | None = None
    is_active: bool | None = None


@router.get("/companies", response_model=list[CompanyOut])
def admin_list_companies(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all companies (superadmin only)."""
    _require_superadmin(user)
    companies = db.query(Company).order_by(Company.name).all()
    return companies


@router.post("/companies", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
def admin_create_company(
    payload: AdminCompanyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new company (superadmin only)."""
    _require_superadmin(user)

    if payload.gstin:
        existing = db.query(Company).filter(Company.gstin == payload.gstin).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A company with this GSTIN already exists",
            )

    company = Company(
        name=payload.name,
        legal_name=payload.legal_name,
        gstin=payload.gstin,
        state_code=payload.state_code,
        pan=payload.pan,
        address=payload.address,
    )
    db.add(company)
    db.flush()

    # Add superadmin as owner
    db.add(CompanyMember(company_id=company.id, user_id=user.id, role="owner"))
    # Auto-add all other superadmins as owners of this company
    superadmins = db.scalars(
        select(User).where(User.is_superadmin.is_(True), User.id != user.id)
    ).all()
    for sa in superadmins:
        db.add(CompanyMember(company_id=company.id, user_id=sa.id, role="owner"))
    db.commit()
    db.refresh(company)
    return company


@router.get("/companies/{company_id}", response_model=CompanyOut)
def admin_get_company(
    company_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get company details (superadmin only)."""
    _require_superadmin(user)
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Company not found")
    return company


@router.patch("/companies/{company_id}", response_model=CompanyOut)
def admin_update_company(
    company_id: str,
    payload: AdminCompanyUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a company (superadmin only)."""
    _require_superadmin(user)
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Company not found")

    data = payload.model_dump(exclude_unset=True)
    if "gstin" in data and data["gstin"] and data["gstin"] != company.gstin:
        clash = db.query(Company).filter(Company.gstin == data["gstin"]).first()
        if clash:
            raise HTTPException(
                status.HTTP_409_CONFLICT, detail="GSTIN already in use"
            )

    for k, v in data.items():
        setattr(company, k, v)

    db.commit()
    db.refresh(company)
    return company


@router.delete("/companies/{company_id}")
def admin_delete_company(
    company_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a company (superadmin only)."""
    _require_superadmin(user)
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Company not found")

    # Remove all memberships first
    db.query(CompanyMember).filter(CompanyMember.company_id == company_id).delete()
    db.delete(company)
    db.commit()

    return {"message": f"Company '{company.name}' has been deleted"}
