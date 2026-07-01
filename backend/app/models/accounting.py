"""Chart of Accounts models: FinancialYear, AccountGroup, Ledger, Party, HsnSac, GstRegistration.

Tally-style hierarchy: primary groups → sub-groups → ledgers.
Every monetary column uses Numeric(18,2) — no floats.
"""
from __future__ import annotations

from sqlalchemy import Boolean, Date, ForeignKey, JSON, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class FinancialYear(UUIDPk, TimestampMixin, Base):
    __tablename__ = "financial_years"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(20), nullable=False)  # e.g. "2025-26"
    start_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    end_date: Mapped[str] = mapped_column(String(10), nullable=False)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (UniqueConstraint("company_id", "name", name="uq_fy_company_name"),)


class AccountGroup(UUIDPk, TimestampMixin, Base):
    """Hierarchical account group. parent_id is NULL for primary groups."""
    __tablename__ = "account_groups"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    system_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    parent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("account_groups.id", ondelete="SET NULL"), nullable=True
    )
    # under_type: primary | sub — controls where this group sits in hierarchy
    group_type: Mapped[str] = mapped_column(String(20), nullable=False, default="sub")
    # nature: assets | liabilities | income | expenses | capital
    nature: Mapped[str] = mapped_column(String(20), nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    parent: Mapped[AccountGroup | None] = relationship(back_populates="children", remote_side="AccountGroup.id")
    children: Mapped[list[AccountGroup]] = relationship(back_populates="parent")
    ledgers: Mapped[list["Ledger"]] = relationship(back_populates="group")

    __table_args__ = (
        UniqueConstraint("company_id", "name", "parent_id", name="uq_ag_group_company"),
    )


class Ledger(UUIDPk, TimestampMixin, Base):
    """Individual ledger account under a group."""
    __tablename__ = "ledgers"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    system_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    group_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("account_groups.id", ondelete="RESTRICT"), nullable=False
    )
    # Opening balance — append-only ledger lines accumulate from here.
    opening_balance: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    # Dr | Cr
    opening_balance_type: Mapped[str] = mapped_column(String(2), nullable=False, default="Dr")
    gstin: Mapped[str | None] = mapped_column(String(15), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # System ledgers cannot be deleted or renamed
    is_protected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Optional Tally-style alias / mailing name
    alias: Mapped[str | None] = mapped_column(String(255), nullable=True)

    group: Mapped[AccountGroup] = relationship(back_populates="ledgers")

    __table_args__ = (UniqueConstraint("company_id", "name", name="uq_ledger_company_name"),)


class Party(UUIDPk, TimestampMixin, Base):
    """Customer or supplier — links to a ledger."""
    __tablename__ = "parties"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    party_type: Mapped[str] = mapped_column(String(20), nullable=False)  # customer | supplier | both
    ledger_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("ledgers.id", ondelete="SET NULL"), nullable=True
    )
    gstin: Mapped[str | None] = mapped_column(String(15), nullable=True)
    state_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    pan: Mapped[str | None] = mapped_column(String(10), nullable=True)
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    contact_person: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    ledger: Mapped[Ledger | None] = relationship()

    __table_args__ = (UniqueConstraint("company_id", "name", name="uq_party_company_name"),)


class HsnSac(UUIDPk, TimestampMixin, Base):
    """HSN (Harmonized System of Nomenclature) or SAC (Services Accounting Code).

    Each code has a GST rate and is used for GST calculation on voucher lines.
    """
    __tablename__ = "hsn_sac"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    code: Mapped[str] = mapped_column(String(20), nullable=False)  # HSN or SAC code
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    # GST rate as percentage (e.g., 18.00 for 18%)
    gst_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    # hsn | sac
    code_type: Mapped[str] = mapped_column(String(3), nullable=False, default="hsn")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (UniqueConstraint("company_id", "code", name="uq_hsn_sac_company_code"),)


class GstRegistration(UUIDPk, TimestampMixin, Base):
    """GST registration for a company. Supports multiple GSTINs per company.

    Each GSTIN is linked to a state and drives CGST/SGST vs IGST logic.
    """
    __tablename__ = "gst_registrations"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    gstin: Mapped[str] = mapped_column(String(15), nullable=False)
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    trade_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    state_code: Mapped[str] = mapped_column(String(2), nullable=False)
    pan: Mapped[str | None] = mapped_column(String(10), nullable=True)
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Is this the primary GSTIN for the company?
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (UniqueConstraint("company_id", "gstin", name="uq_gst_reg_company_gstin"),)


class GstReturn(UUIDPk, TimestampMixin, Base):
    """GST return filing record."""
    __tablename__ = "gst_returns"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    gstin_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("gst_registrations.id", ondelete="SET NULL"), nullable=True
    )
    return_type: Mapped[str] = mapped_column(String(20), nullable=False)  # gstr1 | gstr3b
    period: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    filed_date = mapped_column(Date(), nullable=True)
    ack_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    data_json = mapped_column(JSON(), nullable=True)

    __table_args__ = (
        UniqueConstraint("company_id", "gstin_id", "return_type", "period", name="uq_gst_return_company_period"),
    )
