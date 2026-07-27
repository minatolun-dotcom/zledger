"""Audit log model: tracks all financial and configuration changes for compliance."""
from __future__ import annotations

from sqlalchemy import ForeignKey, Index, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class AuditLog(UUIDPk, TimestampMixin, Base):
    """Immutable audit trail for all significant actions in a company.
    
    Hash-chained for tamper evidence:
    - current_hash = SHA256(previous_hash + action + entity_type + entity_id + old_value + new_value + description + created_at)
    - previous_hash links to previous log entry in same company
    - Forms append-only hash chain; any tampering breaks the chain
    """
    __tablename__ = "audit_logs"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # CREATE | UPDATE | DELETE
    action: Mapped[str] = mapped_column(String(10), nullable=False)
    # voucher | ledger | member | company | gst_registration | hsn_sac | financial_year | party | e_invoice
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    # JSON snapshots of state before/after the change
    old_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Human-readable description
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Request metadata
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Hash chain for tamper evidence
    previous_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    __table_args__ = (
        Index("ix_audit_logs_entity", "entity_type", "entity_id"),
        Index("ix_audit_logs_created", "created_at"),
        Index("ix_audit_logs_company_created", "company_id", "created_at"),
    )
