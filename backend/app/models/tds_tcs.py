"""TDS/TCS models: Tax Deducted/Collected at Source for Indian compliance.

TDS (Tax Deducted at Source): Company deducts tax when making payments to vendors.
TCS (Tax Collected at Source): Company collects tax when receiving payments from buyers.
"""
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Index, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class TdsTcsSection(UUIDPk, TimestampMixin, Base):
    """Defines a TDS or TCS section with its rate and threshold."""

    __tablename__ = "tds_tcs_sections"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    section_code: Mapped[str] = mapped_column(String(10), nullable=False)  # e.g., 194C, 194J, 206C
    section_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # tds | tcs
    tds_tcs_type: Mapped[str] = mapped_column(String(3), nullable=False)
    # Rate as percentage (e.g., 1.00 for 1%, 10.00 for 10%)
    rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    # Minimum transaction amount before deduction applies
    threshold_limit: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (
        UniqueConstraint("company_id", "section_code", "tds_tcs_type", name="uq_tds_tcs_section"),
    )


class TdsTcsEntry(UUIDPk, TimestampMixin, Base):
    """Records a TDS deduction or TCS collection event against a voucher."""

    __tablename__ = "tds_tcs_entries"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    voucher_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vouchers.id", ondelete="CASCADE"), index=True, nullable=False
    )
    party_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("parties.id", ondelete="SET NULL"), nullable=True
    )
    section_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tds_tcs_sections.id", ondelete="RESTRICT"), nullable=False
    )
    tds_tcs_type: Mapped[str] = mapped_column(String(3), nullable=False)  # tds | tcs
    base_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    deducted_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    entry_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    # pending | deposited | filed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    challan_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    deposition_date: Mapped[str | None] = mapped_column(String(10), nullable=True)

    __table_args__ = (
        Index("ix_tds_tcs_company_type", "company_id", "tds_tcs_type"),
        Index("ix_tds_tcs_company_status", "company_id", "status"),
    )


class TdsTcsReturn(UUIDPk, TimestampMixin, Base):
    """Quarterly TDS/TCS return filing record."""

    __tablename__ = "tds_tcs_returns"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    return_type: Mapped[str] = mapped_column(String(3), nullable=False)  # tds | tcs
    quarter: Mapped[str] = mapped_column(String(2), nullable=False)  # Q1, Q2, Q3, Q4
    financial_year: Mapped[str] = mapped_column(String(9), nullable=False)  # e.g., 2025-26
    # draft | filed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    total_entries: Mapped[int] = mapped_column(default=0, nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    total_tax: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    filing_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    ack_number: Mapped[str | None] = mapped_column(String(50), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "company_id", "return_type", "quarter", "financial_year",
            name="uq_tds_tcs_return",
        ),
    )
