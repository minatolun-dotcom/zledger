"""FastAPI dependencies: current user, active company context, roles.

Company context is conveyed via the ``X-Company-Id`` header. A request is only
authorized for a company if the user is a member of it (or is a superadmin).
"""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_token
from app.models.user import Company, CompanyMember, User
from app.schemas.member import CompanyRole

# Role hierarchy: lower index = less privilege
_ROLE_HIERARCHY: list[CompanyRole] = [
    CompanyRole.viewer,
    CompanyRole.accountant,
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
