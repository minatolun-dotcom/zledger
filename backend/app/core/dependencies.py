"""FastAPI dependencies: current user, active company context, roles.

Company context is conveyed via the ``X-Company-Id`` header. A request is only
authorized for a company if the user is a member of it (or is a superadmin).
"""
from __future__ import annotations

from enum import Enum

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_token
from app.models.user import Company, CompanyMember, User
from app.schemas.member import CompanyRole


class Permission(str, Enum):
    """Granular capabilities. Each role is granted a set of these (see
    :data:`ROLE_PERMISSIONS`). Write-capable permissions imply their read twin."""

    # Read access
    VIEW_DASHBOARD = "view_dashboard"
    VIEW_ACCOUNTING = "view_accounting"
    VIEW_INVENTORY = "view_inventory"
    VIEW_MANUFACTURING = "view_manufacturing"
    VIEW_GST = "view_gst"
    VIEW_TDS_TCS = "view_tds_tcs"
    VIEW_REPORTS = "view_reports"
    VIEW_ASSETS = "view_assets"
    VIEW_LOANS = "view_loans"
    VIEW_PAYMENTS = "view_payments"
    VIEW_AUDIT_LOG = "view_audit_log"
    VIEW_MEMBERS = "view_members"

    # Write / operational access
    CREATE_VOUCHER = "create_voucher"
    EDIT_VOUCHER = "edit_voucher"
    CANCEL_VOUCHER = "cancel_voucher"
    MANAGE_COA = "manage_coa"
    MANAGE_INVENTORY = "manage_inventory"
    MANAGE_MANUFACTURING = "manage_manufacturing"
    MANAGE_GST = "manage_gst"
    MANAGE_TDS_TCS = "manage_tds_tcs"
    MANAGE_ASSETS = "manage_assets"
    MANAGE_LOANS = "manage_loans"
    MANAGE_PAYMENTS = "manage_payments"
    MANAGE_RECURRING = "manage_recurring"
    MANAGE_FIXED_ASSETS = "manage_fixed_assets"

    # Company administration
    MANAGE_MEMBERS = "manage_members"
    MANAGE_COMPANY = "manage_company"
    MANAGE_FINANCIAL_YEARS = "manage_financial_years"
    MANAGE_MODULES = "manage_modules"


# Permission sets granted to each role. Higher roles inherit lower roles' perms.
_ROLE_PERMISSION_MAP: dict[CompanyRole, set[Permission]] = {
    CompanyRole.viewer: {
        Permission.VIEW_DASHBOARD,
        Permission.VIEW_ACCOUNTING,
        Permission.VIEW_INVENTORY,
        Permission.VIEW_MANUFACTURING,
        Permission.VIEW_GST,
        Permission.VIEW_TDS_TCS,
        Permission.VIEW_REPORTS,
        Permission.VIEW_ASSETS,
        Permission.VIEW_LOANS,
        Permission.VIEW_PAYMENTS,
        Permission.VIEW_MEMBERS,
    },
    CompanyRole.accountant: {
        Permission.VIEW_DASHBOARD,
        Permission.VIEW_ACCOUNTING,
        Permission.VIEW_INVENTORY,
        Permission.VIEW_MANUFACTURING,
        Permission.VIEW_GST,
        Permission.VIEW_TDS_TCS,
        Permission.VIEW_REPORTS,
        Permission.VIEW_ASSETS,
        Permission.VIEW_LOANS,
        Permission.VIEW_PAYMENTS,
        Permission.VIEW_MEMBERS,
        Permission.VIEW_AUDIT_LOG,
        Permission.CREATE_VOUCHER,
        Permission.EDIT_VOUCHER,
        Permission.CANCEL_VOUCHER,
        Permission.MANAGE_COA,
        Permission.MANAGE_INVENTORY,
        Permission.MANAGE_MANUFACTURING,
        Permission.MANAGE_GST,
        Permission.MANAGE_TDS_TCS,
        Permission.MANAGE_ASSETS,
        Permission.MANAGE_LOANS,
        Permission.MANAGE_PAYMENTS,
        Permission.MANAGE_RECURRING,
        Permission.MANAGE_FIXED_ASSETS,
    },
    CompanyRole.admin: {
        Permission.VIEW_DASHBOARD,
        Permission.VIEW_ACCOUNTING,
        Permission.VIEW_INVENTORY,
        Permission.VIEW_MANUFACTURING,
        Permission.VIEW_GST,
        Permission.VIEW_TDS_TCS,
        Permission.VIEW_REPORTS,
        Permission.VIEW_ASSETS,
        Permission.VIEW_LOANS,
        Permission.VIEW_PAYMENTS,
        Permission.VIEW_MEMBERS,
        Permission.VIEW_AUDIT_LOG,
        Permission.CREATE_VOUCHER,
        Permission.EDIT_VOUCHER,
        Permission.CANCEL_VOUCHER,
        Permission.MANAGE_COA,
        Permission.MANAGE_INVENTORY,
        Permission.MANAGE_MANUFACTURING,
        Permission.MANAGE_GST,
        Permission.MANAGE_TDS_TCS,
        Permission.MANAGE_ASSETS,
        Permission.MANAGE_LOANS,
        Permission.MANAGE_PAYMENTS,
        Permission.MANAGE_RECURRING,
        Permission.MANAGE_FIXED_ASSETS,
        Permission.MANAGE_MEMBERS,
        Permission.MANAGE_COMPANY,
    },
    CompanyRole.owner: {
        Permission.VIEW_DASHBOARD,
        Permission.VIEW_ACCOUNTING,
        Permission.VIEW_INVENTORY,
        Permission.VIEW_MANUFACTURING,
        Permission.VIEW_GST,
        Permission.VIEW_TDS_TCS,
        Permission.VIEW_REPORTS,
        Permission.VIEW_ASSETS,
        Permission.VIEW_LOANS,
        Permission.VIEW_PAYMENTS,
        Permission.VIEW_AUDIT_LOG,
        Permission.VIEW_MEMBERS,
        Permission.CREATE_VOUCHER,
        Permission.EDIT_VOUCHER,
        Permission.CANCEL_VOUCHER,
        Permission.MANAGE_COA,
        Permission.MANAGE_INVENTORY,
        Permission.MANAGE_MANUFACTURING,
        Permission.MANAGE_GST,
        Permission.MANAGE_TDS_TCS,
        Permission.MANAGE_ASSETS,
        Permission.MANAGE_LOANS,
        Permission.MANAGE_PAYMENTS,
        Permission.MANAGE_RECURRING,
        Permission.MANAGE_FIXED_ASSETS,
        Permission.MANAGE_MEMBERS,
        Permission.MANAGE_COMPANY,
        Permission.MANAGE_FINANCIAL_YEARS,
        Permission.MANAGE_MODULES,
    },
}

# Superadmins get every permission.
SUPERADMIN_PERMISSIONS: set[Permission] = set(Permission)


def get_permissions_for_role(role: CompanyRole | str) -> set[Permission]:
    """Return the permission set granted to ``role``."""
    try:
        r = role if isinstance(role, CompanyRole) else CompanyRole(role)
    except ValueError:
        return set()
    return _ROLE_PERMISSION_MAP.get(r, set())


def get_effective_permissions(
    user: User, company_id: str | None, db: Session
) -> set[Permission]:
    """Resolve the effective permission set for a user in a company context."""
    if user.is_superadmin:
        return SUPERADMIN_PERMISSIONS
    if not company_id:
        return set()
    role_str = _get_user_role(user, company_id, db)
    return get_permissions_for_role(role_str)

# Role hierarchy: lower index = less privilege
_ROLE_HIERARCHY: list[CompanyRole] = [
    CompanyRole.viewer,
    CompanyRole.accountant,
    CompanyRole.admin,
    CompanyRole.owner,
]


def get_current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    user = db.get(User, user_id) if user_id else None
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user


def get_active_company(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    x_company_id: str | None = Header(default=None, alias="X-Company-Id"),
) -> Company:
    """Resolve the company for this request from the X-Company-Id header.

    Requires the user to be a member of the company (superadmins bypass).
    """
    if not x_company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Company-Id header is required",
        )
    company = db.get(Company, x_company_id)
    if not company or not company.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Company not found"
        )

    if not user.is_superadmin:
        is_member = (
            db.query(CompanyMember)
            .filter(CompanyMember.company_id == company.id, CompanyMember.user_id == user.id)
            .first()
        )
        if not is_member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this company",
            )
    return company


def get_current_membership(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    company: Company = Depends(get_active_company),
) -> CompanyMember | None:
    """Return the CompanyMember row for the current user, or None for superadmins.

    Useful when you need the user's role in the current company context.
    Superadmins get None (they bypass role checks).
    """
    if user.is_superadmin:
        return None
    return (
        db.query(CompanyMember)
        .filter(
            CompanyMember.company_id == company.id,
            CompanyMember.user_id == user.id,
        )
        .first()
    )


def require_company_role(*allowed: str):
    """Dependency factory: require the user's role in the active company to be
    one of ``allowed`` (superadmins always pass)."""

    def _check(
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
        company: Company = Depends(get_active_company),
    ) -> Company:
        if user.is_superadmin:
            return company
        membership = (
            db.query(CompanyMember)
            .filter(
                CompanyMember.company_id == company.id,
                CompanyMember.user_id == user.id,
            )
            .first()
        )
        if not membership or membership.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role for this company",
            )
        return company

    return _check


def _get_user_role(user: User, company_id: str, db: Session) -> str:
    """Return the user's effective role string for a company.

    - Superadmins always return 'owner'.
    - Members return their assigned role.
    - Non-members return 'viewer' (should not reach here in normal flow).
    """
    if user.is_superadmin:
        return "owner"
    membership = (
        db.query(CompanyMember)
        .filter(
            CompanyMember.company_id == company_id,
            CompanyMember.user_id == user.id,
        )
        .first()
    )
    return membership.role if membership else "viewer"


def require_role(min_role: CompanyRole):
    """Dependency factory: require the user's role to be >= ``min_role``.

    Hierarchy: viewer < accountant < owner.
    Superadmins always pass.

    Usage::

        @router.post("/things", dependencies=[Depends(require_role(CompanyRole.accountant))])
        def create_thing(...): ...
    """
    min_idx = _ROLE_HIERARCHY.index(min_role)
    allowed = _ROLE_HIERARCHY[min_idx:]

    def _check(
        user: User = Depends(get_current_user),
        company: Company = Depends(get_active_company),
        db: Session = Depends(get_db),
    ) -> Company:
        if user.is_superadmin:
            return company
        membership = (
            db.query(CompanyMember)
            .filter(
                CompanyMember.company_id == company.id,
                CompanyMember.user_id == user.id,
            )
            .first()
        )
        if not membership or CompanyRole(membership.role) not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires at least {min_role.value} role",
            )
        return company

    return _check


def require_permission(permission: Permission):
    """Dependency factory: require a specific :class:`Permission`.

    Superadmins always pass. The user's effective permissions are derived from
    their role in the active company.

    Usage::

        @router.post("/vouchers", dependencies=[Depends(require_permission(Permission.CREATE_VOUCHER))])
        def create_voucher(...): ...
    """

    def _check(
        user: User = Depends(get_current_user),
        company: Company = Depends(get_active_company),
        db: Session = Depends(get_db),
    ) -> Company:
        if user.is_superadmin:
            return company
        perms = get_effective_permissions(user, company.id, db)
        if permission not in perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {permission.value}",
            )
        return company

    return _check


def require_module(module_id: str):
    """Dependency factory: require that the active company has ``module_id`` enabled.

    Must be used alongside ``get_active_company`` (or a dependency that resolves
    the company). Superadmins always pass.

    Usage::

        @router.get("/things", dependencies=[Depends(require_module("manufacturing"))])
        def list_things(...): ...
    """

    def _check(
        user: User = Depends(get_current_user),
        company: Company = Depends(get_active_company),
    ) -> Company:
        if user.is_superadmin:
            return company
        if module_id not in company.modules:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Module '{module_id}' is not enabled for this company",
            )
        return company

    return _check


_MAX_PAGE_SIZE = 1000


class Pagination:
    """Optional limit/offset pagination.

    When ``limit`` is omitted the caller receives the full result set (the
    previous behaviour, which the frontend relies on for client-side
    filtering). When provided, results are sliced and a ``X-Total-Count``
    header is set so clients can build paginated UIs.
    """

    def __init__(
        self,
        limit: int | None = None,
        offset: int = 0,
    ) -> None:
        if limit is not None and limit < 1:
            raise ValueError("limit must be >= 1")
        if offset < 0:
            raise ValueError("offset must be >= 0")
        self.limit = min(limit, _MAX_PAGE_SIZE) if limit is not None else None
        self.offset = offset

    def apply(self, query):
        """Apply limit/offset to a SQLAlchemy query (returns a new query)."""
        q = query
        if self.offset:
            q = q.offset(self.offset)
        if self.limit is not None:
            q = q.limit(self.limit)
        return q

    def header(self, total: int) -> dict[str, str]:
        return {"X-Total-Count": str(total)}


def pagination_params(
    limit: int | None = None,
    offset: int = 0,
) -> Pagination:
    """FastAPI dependency factory for ``Pagination``."""
    return Pagination(limit=limit, offset=offset)
