"""Audit log service: capture and query audit trail entries."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.user import User


def log_action(
    db: Session,
    *,
    company_id: str,
    user_id: str | None = None,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    old_value: dict[str, Any] | None = None,
    new_value: dict[str, Any] | None = None,
    description: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    """Create an audit log entry. Call this AFTER committing the change
    (or within the same transaction before commit).

    Args:
        db: Database session
        company_id: Company scope
        user_id: User who performed the action (None for system actions)
        action: CREATE, UPDATE, or DELETE
        entity_type: voucher, ledger, member, etc.
        entity_id: ID of the affected entity
        old_value: State before the change (for UPDATE/DELETE)
        new_value: State after the change (for CREATE/UPDATE)
        description: Human-readable summary
        ip_address: Request IP (optional)
        user_agent: Request user agent (optional)
    """
    entry = AuditLog(
        company_id=company_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=old_value,
        new_value=new_value,
        description=description,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(entry)
    db.flush()
    return entry


def _serialize_entity(obj: Any, exclude: set[str] | None = None) -> dict[str, Any]:
    """Serialize a SQLAlchemy model instance to a JSON-safe dict."""
    exclude = exclude or set()
    data: dict[str, Any] = {}
    for col in obj.__table__.columns:
        if col.name in exclude:
            continue
        val = getattr(obj, col.name)
        if hasattr(val, "isoformat"):
            val = val.isoformat()
        elif hasattr(val, "__float__"):
            val = float(val)
        data[col.name] = val
    return data


def serialize_entity(obj: Any, exclude: set[str] | None = None) -> dict[str, Any]:
    """Public wrapper: serialize any SQLAlchemy model instance for audit logging."""
    return _serialize_entity(obj, exclude=exclude)


def serialize_voucher(voucher: Any) -> dict[str, Any]:
    """Serialize a voucher for audit logging (includes lines)."""
    data = _serialize_entity(voucher, exclude={"lines"})
    lines = []
    for line in voucher.lines:
        line_data = _serialize_entity(line)
        lines.append(line_data)
    data["lines"] = lines
    return data


def serialize_member(member: Any, db: Session) -> dict[str, Any]:
    """Serialize a CompanyMember for audit logging (includes user info)."""
    data = _serialize_entity(member)
    user = db.get(User, member.user_id) if member.user_id else None
    data["user_email"] = user.email if user else None
    data["user_name"] = user.name if user else None
    return data
