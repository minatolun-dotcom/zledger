"""Recurring voucher template model."""
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class RecurringTemplate(UUIDPk, TimestampMixin, Base):
    """Recurring voucher template — auto-generates vouchers on schedule."""
    __tablename__ = "recurring_templates"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    voucher_type: Mapped[str] = mapped_column(String(30), nullable=False)
    frequency: Mapped[str] = mapped_column(String(20), nullable=False)  # daily, weekly, monthly, yearly
    next_run_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    last_run_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    template_payload = mapped_column(JSON(), nullable=False)  # full voucher payload
    created_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
