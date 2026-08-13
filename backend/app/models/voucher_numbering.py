"""VoucherNumbering model for per-company voucher number format configuration."""
from __future__ import annotations

from sqlalchemy import Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class VoucherNumbering(UUIDPk, TimestampMixin, Base):
    """Defines voucher number format per company and voucher type.

    Format supports tokens:
      {PREFIX} — the prefix (e.g. INV)
      {YEAR}   — 4-digit financial year (e.g. 2026)
      {SEQ}    — zero-padded sequence number
    """
    __tablename__ = "voucher_numbering"

    company_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    voucher_type: Mapped[str] = mapped_column(String(30), nullable=False)
    prefix: Mapped[str] = mapped_column(String(20), nullable=False)
    format_template: Mapped[str] = mapped_column(String(50), nullable=False, default="{PREFIX}-{YEAR}-{SEQ}")
    next_sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    fy_start_month: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    # The FY the current next_sequence belongs to — the sequence resets to 1
    # when the financial year rolls over (TallyPrime restarts numbering each
    # FY). Null for rows created before this column existed (treated as
    # belonging to the current FY on first use).
    current_fy_year: Mapped[str | None] = mapped_column(String(4), nullable=True)

    __table_args__ = (
        UniqueConstraint("company_id", "voucher_type", name="uq_voucher_numbering_company_type"),
    )
