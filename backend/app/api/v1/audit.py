"""Audit log endpoints: list and retrieve audit trail entries."""
from __future__ import annotations

from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, require_company_role
from app.models.audit import AuditLog
from app.models.user import Company, User
from app.schemas.audit import AuditLogListOut, AuditLogOut, AuditLogPaginatedOut
from app.core.dependencies import get_current_user, require_company_role

router = APIRouter()


def _enrich(entry: AuditLog, db: Session) -> dict:
    """Add user email/name to audit log entry."""
    user = db.get(User, entry.user_id) if entry.user_id else None
    return AuditLogOut(
        id=entry.id,
        company_id=entry.company_id,
        user_id=entry.user_id,
        action=entry.action,
        entity_type=entry.entity_type,
        entity_id=entry.entity_id,
        old_value=entry.old_value,
        new_value=entry.new_value,
        description=entry.description,
        ip_address=entry.ip_address,
        user_agent=entry.user_agent,
        created_at=entry.created_at.isoformat() if entry.created_at else None,
        user_email=user.email if user else None,
        user_name=user.name if user else None,
    ).model_dump()


@router.get("", response_model=AuditLogPaginatedOut)
def list_audit_logs(
    entity_type: str | None = None,
    action: str | None = None,
    entity_id: str | None = None,
    user_id: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    search: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    company: Company = Depends(require_company_role("owner", "accountant")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List audit log entries for the company. Requires accountant or owner role."""
    if not user.is_superadmin:
        from app.models.user import CompanyMember
        membership = db.query(CompanyMember).filter(
            CompanyMember.company_id == company.id,
            CompanyMember.user_id == user.id,
        ).first()
        if not membership or membership.role not in ("owner", "accountant"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only owners and accountants can view audit logs",
            )

    q = db.query(AuditLog).filter(AuditLog.company_id == company.id)
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    if action:
        q = q.filter(AuditLog.action == action)
    if entity_id:
        q = q.filter(AuditLog.entity_id == entity_id)
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    if from_date:
        from datetime import datetime as dt
        q = q.filter(AuditLog.created_at >= dt.combine(from_date, dt.min.time()))
    if to_date:
        from datetime import datetime as dt
        q = q.filter(AuditLog.created_at <= dt.combine(to_date, dt.max.time()))
    if search:
        q = q.filter(AuditLog.description.ilike(f"%{search}%"))

    total = q.count()
    entries = q.order_by(desc(AuditLog.created_at)).offset(offset).limit(limit).all()

    result = []
    for entry in entries:
        user_obj = db.get(User, entry.user_id) if entry.user_id else None
        result.append(AuditLogListOut(
            id=entry.id,
            action=entry.action,
            entity_type=entry.entity_type,
            entity_id=entry.entity_id,
            description=entry.description,
            user_email=user_obj.email if user_obj else None,
            user_name=user_obj.name if user_obj else None,
            created_at=entry.created_at.isoformat() if entry.created_at else None,
        ).model_dump())
    return AuditLogPaginatedOut(items=result, total=total, limit=limit, offset=offset)


@router.get("/{log_id}", response_model=AuditLogOut)
def get_audit_log(
    log_id: str,
    company: Company = Depends(require_company_role("owner", "accountant")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single audit log entry with full old/new values."""
    if not user.is_superadmin:
        from app.models.user import CompanyMember
        membership = db.query(CompanyMember).filter(
            CompanyMember.company_id == company.id,
            CompanyMember.user_id == user.id,
        ).first()
        if not membership or membership.role not in ("owner", "accountant"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only owners and accountants can view audit logs",
            )

    entry = db.get(AuditLog, log_id)
    if not entry or entry.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Audit log entry not found")
    return _enrich(entry, db)
