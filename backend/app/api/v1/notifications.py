"""Notification endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, require_role
from app.models.user import Company
from app.schemas.member import CompanyRole
from app.schemas.notification import NotificationCreate, NotificationOut
from app.services.notification import (
    create_notification,
    list_notifications,
    mark_all_read,
    mark_read,
    unread_count,
)

router = APIRouter()


@router.get("", response_model=list[NotificationOut])
def list_notifications_endpoint(
    unread_only: bool = False,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    return list_notifications(db, company.id, unread_only=unread_only)


@router.get("/unread-count")
def unread_count_endpoint(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    return {"count": unread_count(db, company.id)}


@router.post("", response_model=NotificationOut, status_code=201)
def create_notification_endpoint(
    payload: NotificationCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    n = create_notification(db, company.id, payload)
    db.commit()
    db.refresh(n)
    return n


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read_endpoint(
    notification_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    n = mark_read(db, company.id, notification_id)
    if not n:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Notification not found")
    db.commit()
    db.refresh(n)
    return n


@router.post("/read-all")
def mark_all_read_endpoint(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    count = mark_all_read(db, company.id)
    db.commit()
    return {"marked": count}
