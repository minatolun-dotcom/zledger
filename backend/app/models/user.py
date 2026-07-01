"""User and Company models, and the membership that links them.

Tenancy model: multi-company, single-tenant. One deployment hosts many
companies; users are shared and can be members of several companies.
"""
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class User(UUIDPk, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # System-level superuser (the bootstrap admin). Company-level roles live on
    # the CompanyMember association.
    is_superadmin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    memberships: Mapped[list["CompanyMember"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Company(UUIDPk, TimestampMixin, Base):
    __tablename__ = "companies"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    legal_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Primary GSTIN + state of the business. Multi-GSTIN (per branch) is added
    # via the GstRegistration table in Phase 3/5.
    gstin: Mapped[str | None] = mapped_column(String(15), unique=True, nullable=True, index=True)
    # Indian state code (01..38), e.g. 27 = Maharashtra. Drives CGST/SGST vs IGST.
    state_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    pan: Mapped[str | None] = mapped_column(String(10), nullable=True)
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bank_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bank_account_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    bank_ifsc: Mapped[str | None] = mapped_column(String(20), nullable=True)
    bank_branch: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Books begin date: transactions before this are rejected.
    books_begin_from: Mapped[str | None] = mapped_column(String(10), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    memberships: Mapped[list["CompanyMember"]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )


class CompanyMember(UUIDPk, TimestampMixin, Base):
    """Association of a user with a company, carrying a role."""

    __tablename__ = "company_members"
    __table_args__ = (
        UniqueConstraint("company_id", "user_id", name="uq_company_user"),
    )

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # owner | accountant | viewer
    role: Mapped[str] = mapped_column(String(32), default="accountant", nullable=False)

    company: Mapped[Company] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(back_populates="memberships")
