"""Notification service — create, list, mark read."""
from __future__ import annotations

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.notification import Notification
from app.schemas.notification import NotificationCreate


def create_notification(db: Session, company_id: str, data: NotificationCreate) -> Notification:
    """Create a new notification."""
    n = Notification(
        company_id=company_id,
        user_id=data.user_id,
        title=data.title,
        message=data.message,
        category=data.category,
        link=data.link,
        entity_type=data.entity_type,
        entity_id=data.entity_id,
        is_read=False,
    )
    db.add(n)
    db.flush()
    return n


def list_notifications(
    db: Session, company_id: str, user_id: str | None = None, unread_only: bool = False
) -> list[Notification]:
    """List notifications for a company, optionally filtered by user and read status."""
    q = db.query(Notification).filter(Notification.company_id == company_id)
    if user_id:
        q = q.filter(Notification.user_id == user_id)
    if unread_only:
        q = q.filter(Notification.is_read == False)
    return q.order_by(Notification.created_at.desc()).limit(50).all()


def unread_count(db: Session, company_id: str, user_id: str | None = None) -> int:
    """Get count of unread notifications."""
    q = db.query(func.count(Notification.id)).filter(
        Notification.company_id == company_id,
        Notification.is_read == False,
    )
    if user_id:
        q = q.filter(Notification.user_id == user_id)
    return q.scalar() or 0


def mark_read(db: Session, company_id: str, notification_id: str) -> Notification | None:
    """Mark a single notification as read."""
    n = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.company_id == company_id,
    ).first()
    if n:
        n.is_read = True
        db.flush()
    return n


def mark_all_read(db: Session, company_id: str, user_id: str | None = None) -> int:
    """Mark all notifications as read. Returns count updated."""
    q = db.query(Notification).filter(
        Notification.company_id == company_id,
        Notification.is_read == False,
    )
    if user_id:
        q = q.filter(Notification.user_id == user_id)
    count = q.update({"is_read": True})
    db.flush()
    return count
