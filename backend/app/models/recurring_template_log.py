"""Recurring template run log — history of every scheduled execution.

Lets users see WHY a template failed (and which voucher was generated on a
successful run) instead of only the latest error. Written by the shared
processor on every run (success and failure).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import UUIDPk


class RecurringTemplateLog(UUIDPk, Base):
    """One row per template execution (success or failure)."""

    __tablename__ = "recurring_template_logs"

    template_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("recurring_templates.id", ondelete="CASCADE"), index=True, nullable=False
    )
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    voucher_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
