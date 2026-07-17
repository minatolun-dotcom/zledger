"""User and company schemas."""
from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import ORMModel

GSTIN_REGEX = r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{3}$"
PAN_REGEX = r"^[A-Z]{5}[0-9]{4}[A-Z]$"
IFSC_REGEX = r"^[A-Z]{4}0[A-Z0-9]{6}$"


class CompanyMemberBrief(ORMModel):
    """Brief company membership info embedded in AdminUserOut."""
    company_id: str
    company_name: str
    role: str


class UserOut(ORMModel):
    id: str
    email: EmailStr
    name: str
    is_active: bool
    is_superadmin: bool


class AdminUserOut(UserOut):
    """User with membership info for admin pages."""
    memberships: list[CompanyMemberBrief] = []


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

    @field_validator("gstin")
    @classmethod
    def validate_gstin(cls, v):
        if v is None or v == "":
            return None
        v = v.strip()
        import re
        if not re.match(GSTIN_REGEX, v):
            raise ValueError("Invalid GSTIN format")
        return v

    @field_validator("pan")
    @classmethod
    def validate_pan(cls, v):
        if v is None or v == "":
            return None
        v = v.strip()
        import re
        if not re.match(PAN_REGEX, v):
            raise ValueError("Invalid PAN format")
        return v

    @field_validator("bank_ifsc")
    @classmethod
    def validate_ifsc(cls, v):
        if v is None or v == "":
            return None
        v = v.strip()
        import re
        if not re.match(IFSC_REGEX, v):
            raise ValueError("Invalid IFSC format")
        return v


class CompanyCreate(CompanyBase):
    modules: list[str] | None = None


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
    modules: list[str] | None = None


class CompanyOut(CompanyBase, ORMModel):
    id: str
    is_active: bool
    logo_url: str | None = None
    member_count: int = 0
    modules: list[str] = []


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
