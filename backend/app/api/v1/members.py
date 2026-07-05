"""Member management endpoints: add, list, change role, remove."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user, get_current_membership
from app.models.user import Company, CompanyMember, User
from app.schemas.member import ASSIGNABLE_ROLES, CompanyRole, MemberAddRequest, MemberOut, MemberRoleUpdate
from app.schemas.common import BulkActionResult, BulkDeleteRequest
from app.services.audit import log_action, serialize_member

router = APIRouter()


def _serialize_member(m: CompanyMember, db: Session) -> dict:
    """Serialize a CompanyMember with user details."""
    user = db.get(User, m.user_id)
    return MemberOut(
        id=m.id,
        company_id=m.company_id,
        user_id=m.user_id,
        role=m.role,
        user_email=user.email if user else None,
        user_name=user.name if user else None,
        user_is_active=user.is_active if user else None,
        created_at=m.created_at.isoformat() if m.created_at else None,
    ).model_dump()


def _require_owner(
    user: User,
    membership: CompanyMember | None,
):
    """Ensure the current user is an owner (or superadmin)."""
    if user.is_superadmin:
        return
    if not membership or membership.role != CompanyRole.owner:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Only company owners can manage members",
        )


# ─── Endpoints ───────────────────────────────────────────────────────────


@router.get("", response_model=list[MemberOut])
def list_members(
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all members of the company. Requires owner or accountant role."""
    membership = db.query(CompanyMember).filter(
        CompanyMember.company_id == company.id,
        CompanyMember.user_id == user.id,
    ).first()

    if not user.is_superadmin:
        if not membership or membership.role not in (CompanyRole.owner, CompanyRole.accountant):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Only owners and accountants can list members",
            )

    members = db.query(CompanyMember).filter(
        CompanyMember.company_id == company.id,
    ).all()

    return [_serialize_member(m, db) for m in members]


@router.post("", response_model=MemberOut, status_code=201)
def add_member(
    payload: MemberAddRequest,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add an existing user to the company. Requires owner role."""
    membership = db.query(CompanyMember).filter(
        CompanyMember.company_id == company.id,
        CompanyMember.user_id == user.id,
    ).first()
    _require_owner(user, membership)

    # Find user by email
    target_user = db.query(User).filter(User.email == payload.email).first()
    if not target_user:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail=f"No user found with email {payload.email}",
        )
    if not target_user.is_active:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Cannot add an inactive user",
        )

    # Check not already a member
    existing = db.query(CompanyMember).filter(
        CompanyMember.company_id == company.id,
        CompanyMember.user_id == target_user.id,
    ).first()
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"User {payload.email} is already a member of this company",
        )

    # Validate role (owner can't be assigned via add)
    if payload.role == CompanyRole.owner:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Owner role cannot be assigned. Company creator is automatically the owner.",
        )

    member = CompanyMember(
        company_id=company.id,
        user_id=target_user.id,
        role=payload.role.value,
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    # Audit log
    log_action(
        db,
        company_id=company.id,
        user_id=user.id,
        action="CREATE",
        entity_type="member",
        entity_id=member.id,
        new_value=serialize_member(member, db),
        description=f"Added {target_user.email} as {payload.role.value}",
    )
    db.commit()

    return _serialize_member(member, db)


@router.patch("/{user_id}", response_model=MemberOut)
def update_member_role(
    user_id: str,
    payload: MemberRoleUpdate,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change a member's role. Requires owner role."""
    membership = db.query(CompanyMember).filter(
        CompanyMember.company_id == company.id,
        CompanyMember.user_id == user.id,
    ).first()
    _require_owner(user, membership)

    # Can't change own role (owner can't demote themselves)
    if user_id == user.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role. Transfer ownership first.",
        )

    target_member = db.query(CompanyMember).filter(
        CompanyMember.company_id == company.id,
        CompanyMember.user_id == user_id,
    ).first()
    if not target_member:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Can't change owner's role
    if target_member.role == CompanyRole.owner:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Cannot change the owner's role",
        )

    # Can't change superadmin's role
    target_user = db.get(User, target_member.user_id)
    if target_user and target_user.is_superadmin:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Cannot change a superadmin's role",
        )

    # Validate new role
    if payload.role == CompanyRole.owner:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Owner role cannot be assigned. Transfer ownership first.",
        )

    old_role = target_member.role
    target_user_obj = db.get(User, target_member.user_id)
    target_member.role = payload.role.value
    db.commit()
    db.refresh(target_member)

    # Audit log
    log_action(
        db,
        company_id=company.id,
        user_id=user.id,
        action="UPDATE",
        entity_type="member",
        entity_id=target_member.id,
        old_value={"role": old_role},
        new_value={"role": payload.role.value},
        description=f"Changed {target_user_obj.email if target_user_obj else 'unknown'} role from {old_role} to {payload.role.value}",
    )
    db.commit()

    return _serialize_member(target_member, db)


@router.delete("/{user_id}", status_code=204)
def remove_member(
    user_id: str,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a member from the company. Requires owner role."""
    membership = db.query(CompanyMember).filter(
        CompanyMember.company_id == company.id,
        CompanyMember.user_id == user.id,
    ).first()
    _require_owner(user, membership)

    # Can't remove yourself
    if user_id == user.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove yourself from the company",
        )

    target_member = db.query(CompanyMember).filter(
        CompanyMember.company_id == company.id,
        CompanyMember.user_id == user_id,
    ).first()
    if not target_member:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Can't remove the owner
    if target_member.role == CompanyRole.owner:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the company owner",
        )

    # Can't remove a superadmin
    target_user_obj = db.get(User, target_member.user_id)
    if target_user_obj and target_user_obj.is_superadmin:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove a superadmin from the company",
        )

    # Capture old state for audit
    target_user_obj = db.get(User, target_member.user_id)
    old_value = serialize_member(target_member, db)
    desc_text = f"Removed {target_user_obj.email if target_user_obj else 'unknown'} from company"

    db.delete(target_member)
    db.commit()

    # Audit log
    log_action(
        db,
        company_id=company.id,
        user_id=user.id,
        action="DELETE",
        entity_type="member",
        entity_id=target_member.id,
        old_value=old_value,
        description=desc_text,
    )
    db.commit()


# ── Bulk Operations ─────────────────────────────────────────────────────

class BulkRoleUpdateRequest(BulkDeleteRequest):
    role: CompanyRole


@router.post("/bulk-remove", response_model=BulkActionResult)
def bulk_remove_members(
    payload: BulkDeleteRequest,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bulk remove members from the company. Requires owner role."""
    membership = db.query(CompanyMember).filter(
        CompanyMember.company_id == company.id,
        CompanyMember.user_id == user.id,
    ).first()
    _require_owner(user, membership)

    processed = 0
    errors: list[str] = []
    for uid in payload.ids:
        if uid == user.id:
            errors.append("Cannot remove yourself")
            continue
        target = db.query(CompanyMember).filter(
            CompanyMember.company_id == company.id,
            CompanyMember.user_id == uid,
        ).first()
        if not target:
            errors.append(f"Member {uid} not found")
            continue
        if target.role == CompanyRole.owner:
            errors.append("Cannot remove the company owner")
            continue
        target_user_obj = db.get(User, target.user_id)
        if target_user_obj and target_user_obj.is_superadmin:
            errors.append("Cannot remove a superadmin")
            continue
        old_value = serialize_member(target, db)
        log_action(
            db, company_id=company.id, user_id=user.id,
            action="DELETE", entity_type="member", entity_id=target.id,
            old_value=old_value,
            description=f"Bulk removed {target_user_obj.email if target_user_obj else 'unknown'}",
        )
        db.delete(target)
        processed += 1
    db.commit()
    return BulkActionResult(processed=processed, errors=errors)


@router.post("/bulk-role", response_model=BulkActionResult)
def bulk_change_role(
    payload: BulkRoleUpdateRequest,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bulk change member roles. Requires owner role."""
    membership = db.query(CompanyMember).filter(
        CompanyMember.company_id == company.id,
        CompanyMember.user_id == user.id,
    ).first()
    _require_owner(user, membership)

    processed = 0
    errors: list[str] = []
    for uid in payload.ids:
        target = db.query(CompanyMember).filter(
            CompanyMember.company_id == company.id,
            CompanyMember.user_id == uid,
        ).first()
        if not target:
            errors.append(f"Member {uid} not found")
            continue
        if target.role == CompanyRole.owner:
            errors.append("Cannot change the owner's role")
            continue
        target_user_obj = db.get(User, target.user_id)
        if target_user_obj and target_user_obj.is_superadmin:
            errors.append("Cannot change a superadmin's role")
            continue
        if payload.role == CompanyRole.owner:
            errors.append("Cannot assign owner role via bulk operation")
            continue
        old_role = target.role
        target.role = payload.role
        target_user_obj = db.get(User, target.user_id)
        log_action(
            db, company_id=company.id, user_id=user.id,
            action="UPDATE", entity_type="member", entity_id=target.id,
            old_value={"role": old_role}, new_value={"role": payload.role},
            description=f"Bulk changed role of {target_user_obj.email if target_user_obj else 'unknown'} from {old_role} to {payload.role}",
        )
        processed += 1
    db.commit()
    return BulkActionResult(processed=processed, errors=errors)
