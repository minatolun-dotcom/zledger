"""Member management schemas: invite, role change, member listing."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, EmailStr, Field


class CompanyRole(str, Enum):
    owner = "owner"
    accountant = "accountant"
    viewer = "viewer"


# Roles that can be assigned via the API (owner is only auto-assigned at company creation)
ASSIGNABLE_ROLES = {CompanyRole.accountant, CompanyRole.viewer}


class MemberAddRequest(BaseModel):
    """Add an existing user to a company."""
    email: EmailStr
    role: CompanyRole = CompanyRole.accountant


class MemberRoleUpdate(BaseModel):
    """Change a member's role."""
    role: CompanyRole


class MemberOut(BaseModel):
    """Member with user details."""
    id: str
    company_id: str
    user_id: str
    role: str
    user_email: str | None = None
    user_name: str | None = None
    user_is_active: bool | None = None
    created_at: str | None = None
