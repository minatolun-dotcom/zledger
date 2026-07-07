"""Company activity tracking for concurrent user visibility and admin audit."""
from __future__ import annotations

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import UUIDPk


class CompanyActivity(UUIDPk, Base):
    """Tracks real-time user presence per company.

    Updated by the heartbeat endpoint every ~30 seconds.
    Used for active-user indicators and admin audit.
    """

    __tablename__ = "company_activity"
    __table_args__ = (
        Index("ix_company_activity_lookup", "company_id", "last_seen_at"),
    )

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    last_seen_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    current_page: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    company: Mapped["Company"] = relationship()
    user: Mapped["User"] = relationship()
