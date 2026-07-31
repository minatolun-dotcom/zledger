"""Voucher version history: immutable snapshots for audit and rollback.

Every voucher update creates a version snapshot before applying changes.
Versions are immutable and form a complete audit trail.
"""
from __future__ import annotations

from sqlalchemy import ForeignKey, Index, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class VoucherVersion(UUIDPk, TimestampMixin, Base):
    """Immutable version snapshot of a voucher before modification.
    
    Created automatically on every voucher update or cancellation.
    Preserves complete state including all lines for audit trail.
    """
    __tablename__ = "voucher_versions"

    # Link to current voucher
    voucher_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vouchers.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Version sequence (1, 2, 3, ...)
    version_number: Mapped[int] = mapped_column(nullable=False)
    # Who made the change
    modified_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # What changed
    change_type: Mapped[str] = mapped_column(String(20), nullable=False)  # update | cancel | restore
    change_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Snapshot of voucher header at this version
    voucher_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Snapshot of all lines at this version
    lines_snapshot: Mapped[list] = mapped_column(JSON, nullable=False)
    
    # Metadata
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)

    __table_args__ = (
        Index("ix_voucher_versions_lookup", "voucher_id", "version_number"),
        Index("ix_voucher_versions_created", "created_at"),
    )
