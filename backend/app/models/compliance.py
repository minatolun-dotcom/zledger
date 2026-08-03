"""Compliance models: Ind-AS schedule mapping, income-tax regime config,
ICAI NCE templates, and saved compliance report runs.

These support the Indian compliance feature set:
  - Ind-AS / Companies Act Schedule III presentation of financial statements
  - Income-tax computation under old & new (115BAC) regimes
  - ICAI NCE-format statement rendering
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class IndASSchedule(UUIDPk, TimestampMixin, Base):
    """Maps a COA account group (by system_code) to a Companies Act Schedule III
    / Ind-AS presentation heading.

    schedule_part: "I" (Equity & Liabilities) or "II" (Assets).
    """

    __tablename__ = "indas_schedules"
    __table_args__ = (UniqueConstraint("company_id", "system_code", name="uq_indas_company_code"),)

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    system_code: Mapped[str] = mapped_column(String(50), nullable=False)
    schedule_part: Mapped[str] = mapped_column(String(10), nullable=False)
    schedule_heading: Mapped[str] = mapped_column(String(120), nullable=False)
    sub_heading: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    company: Mapped["app.models.user.Company"] = relationship("Company")  # type: ignore[name-defined]


class IncomeTaxRegimeConfig(UUIDPk, TimestampMixin, Base):
    """Per-company, per-FY income-tax regime election and presumptive section.

    If presumptive_section is set (44AD / 44ADA / 44AE) the engine applies the
    presumptive / deemed-profit computation instead of the regular slab.
    For 44AE (goods carriage), vehicle_count and months_used are required.
    """

    __tablename__ = "income_tax_regime_configs"
    __table_args__ = (
        UniqueConstraint("company_id", "regime", "financial_year", name="uq_itr_company_regime_fy"),
    )

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    regime: Mapped[str] = mapped_column(String(10), nullable=False)  # old | new
    financial_year: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g. 2025-26 or "[E2E] FY Edited"
    presumptive_section: Mapped[str | None] = mapped_column(String(10), nullable=True)  # 44AD|44ADA|44AE
    vehicle_count: Mapped[int | None] = mapped_column(nullable=True)  # 44AE: number of heavy goods vehicles
    months_used: Mapped[int | None] = mapped_column(nullable=True)  # 44AE: months vehicle was used (1-12)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    company: Mapped["app.models.user.Company"] = relationship("Company")  # type: ignore[name-defined]


class IcaiNceTemplate(UUIDPk, TimestampMixin, Base):
    """Defines an ICAI NCE-statement layout (JSON) for a company."""

    __tablename__ = "icai_nce_templates"

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    template_name: Mapped[str] = mapped_column(String(120), nullable=False)
    statement_type: Mapped[str] = mapped_column(String(30), nullable=False)  # balance_sheet|profit_loss|notes
    layout_json: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    company: Mapped["app.models.user.Company"] = relationship("Company")  # type: ignore[name-defined]


class ComplianceReport(UUIDPk, TimestampMixin, Base):
    """A saved compliance report run (computation output snapshot)."""

    __tablename__ = "compliance_reports"

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    report_type: Mapped[str] = mapped_column(String(40), nullable=False)  # income_tax|schedule_iii|indas_pl|icai_nce|gst_status
    regime: Mapped[str | None] = mapped_column(String(10), nullable=True)
    financial_year: Mapped[str | None] = mapped_column(String(50), nullable=True)
    format: Mapped[str] = mapped_column(String(10), default="json", nullable=False)  # json|pdf|xlsx
    data_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    company: Mapped["app.models.user.Company"] = relationship("Company")  # type: ignore[name-defined]
