"""Authentication endpoints: register, login, me, profile update, password change."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import (
    Permission,
    get_current_user,
    get_effective_permissions,
    get_active_company,
)
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import Company, CompanyMember, User
from app.schemas.auth import (
    CompanyBrief,
    LoginRequest,
    MeResponse,
    PermissionsResponse,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.user import PasswordChange, UserOut, UserUpdate

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )
    user = User(
        email=payload.email,
        name=payload.name,
        hashed_password=hash_password(payload.password),
        is_active=True,
        is_superadmin=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled"
        )
    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.is_superadmin:
        companies = db.scalars(select(Company).order_by(Company.name)).all()
        companies = [
            CompanyBrief(id=c.id, name=c.name, role="owner", logo_url=c.logo_url, modules=c.modules)
            for c in companies
        ]
    else:
        memberships = db.scalars(
            select(CompanyMember).where(CompanyMember.user_id == user.id)
        ).all()
        companies = [
            CompanyBrief(
                id=m.company.id, name=m.company.name, role=m.role,
                logo_url=m.company.logo_url, modules=m.company.modules,
            )
            for m in memberships
        ]
    return MeResponse(user=UserOut.model_validate(user), companies=companies)


@router.get("/me/permissions", response_model=PermissionsResponse)
def my_permissions(
    user: User = Depends(get_current_user),
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Return the caller's effective permissions within the active company."""
    perms = get_effective_permissions(user, company.id, db)
    role_str = "owner" if user.is_superadmin else (
        db.scalar(
            select(CompanyMember.role).where(
                CompanyMember.company_id == company.id,
                CompanyMember.user_id == user.id,
            )
        ) or "viewer"
    )
    return PermissionsResponse(
        role=role_str,
        permissions=sorted(p.value for p in perms),
    )


@router.patch("/me", response_model=UserOut)
def update_profile(
    payload: UserUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update own profile (name and/or email)."""
    if payload.email and payload.email != user.email:
        existing = db.scalar(select(User).where(User.email == payload.email))
        if existing:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="An account with this email already exists",
            )
        user.email = payload.email

    if payload.name is not None:
        user.name = payload.name

    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.patch("/me/password")
def change_password(
    payload: PasswordChange,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change own password."""
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password updated"}
