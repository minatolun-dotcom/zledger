"""Notification service — create, list, mark read."""
from __future__ import annotations

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.notification import Notification
from app.schemas.notification import NotificationCreate

BACKUP_HEALTH_ENTITY = "backup_health"


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


def notify(
    db: Session,
    company_id: str,
    title: str,
    message: str,
    *,
    category: str = "info",
    link: str | None = None,
    user_id: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> Notification:
    """Convenience wrapper — create a notification without importing schemas."""
    data = NotificationCreate(
        title=title,
        message=message,
        category=category,
        link=link,
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    return create_notification(db, company_id, data)


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


def backup_health_alert(
    db: Session,
    *,
    title: str,
    message: str,
    link: str = "/admin/backups",
    entity_id: str,
) -> int:
    """Raise an in-app alert for every company that has a superadmin member.

    Backup management is superadmin-only, so scoping the alert to companies
    with a superadmin avoids amplifying one failure into a notification for
    every company in the instance.

    Dedupes by (entity_type, entity_id) so a repeated cron pass for the same
    failure (same sync-status timestamp / progress error) does not spam the
    bell. Returns the number of notifications created.
    """
    from sqlalchemy import select
    from app.models.user import Company, CompanyMember, User

    superadmin_company_ids = {
        row[0]
        for row in db.execute(
            select(CompanyMember.company_id)
            .join(User, User.id == CompanyMember.user_id)
            .where(User.is_superadmin.is_(True))
        ).all()
    }
    companies = (
        db.query(Company)
        .filter(Company.is_active.is_(True), Company.id.in_(superadmin_company_ids))
        .all()
        if superadmin_company_ids
        else []
    )
    created = 0
    for company in companies:
        exists = db.query(Notification.id).filter(
            Notification.company_id == company.id,
            Notification.entity_type == BACKUP_HEALTH_ENTITY,
            Notification.entity_id == entity_id,
        ).first()
        if exists:
            continue
        create_notification(
            db,
            company.id,
            NotificationCreate(
                title=title,
                message=message,
                category="error",
                link=link,
                entity_type=BACKUP_HEALTH_ENTITY,
                entity_id=entity_id,
            ),
        )
        created += 1
    return created
