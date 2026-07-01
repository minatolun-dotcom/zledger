"""User and company schemas."""
from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel


class UserOut(ORMModel):
    id: str
    email: EmailStr
    name: str
    is_active: bool
    is_superadmin: bool


class CompanyBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    legal_name: str | None = None
    gstin: str | None = Field(default=None, max_length=15)
    state_code: str | None = Field(default=None, max_length=2)
    pan: str | None = Field(default=None, max_length=10)
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    bank_name: str | None = None
    bank_account_number: str | None = None
    bank_ifsc: str | None = None
    bank_branch: str | None = None
    books_begin_from: str | None = None


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    legal_name: str | None = None
    gstin: str | None = Field(default=None, max_length=15)
    state_code: str | None = Field(default=None, max_length=2)
    pan: str | None = Field(default=None, max_length=10)
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    bank_name: str | None = None
    bank_account_number: str | None = None
    bank_ifsc: str | None = None
    bank_branch: str | None = None
    books_begin_from: str | None = None
    is_active: bool | None = None


class CompanyOut(CompanyBase, ORMModel):
    id: str
    is_active: bool


class CompanyMemberOut(ORMModel):
    id: str
    company_id: str
    user_id: str
    role: str
    user: UserOut


# ─── Profile Management ──────────────────────────────────────────────────


class UserUpdate(BaseModel):
    """Update own profile (name and/or email)."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None


class PasswordChange(BaseModel):
    """Change own password."""
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


# ─── Superadmin User Management ──────────────────────────────────────────


class AdminUserUpdate(BaseModel):
    """Superadmin: update any user."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None
    is_active: bool | None = None
    is_superadmin: bool | None = None
