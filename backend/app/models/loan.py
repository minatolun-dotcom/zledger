"""Loan and Advance tracking with automatic voucher integration."""
from __future__ import annotations

from sqlalchemy import Boolean, Float, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class Loan(UUIDPk, TimestampMixin, Base):
    """A loan or advance — given, taken, or employee advance.

    loan_type: "given" | "taken" | "employee_advance"
    interest_type: "simple" | "compound" | "none"
    status: "active" | "closed" | "overdue"
    """

    __tablename__ = "loans"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    loan_type: Mapped[str] = mapped_column(String(20), nullable=False)
    party_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Optional link to an existing ledger in COA
    party_ledger_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("ledgers.id", ondelete="SET NULL"), nullable=True
    )
    # Auto-created ledger for this specific loan
    loan_ledger_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("ledgers.id", ondelete="SET NULL"), nullable=True
    )
    principal_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    interest_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    interest_type: Mapped[str] = mapped_column(String(10), nullable=False, default="none")
    # YYYY-MM-DD
    disbursement_date: Mapped[str] = mapped_column(String(10), nullable=False)
    due_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    emi_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    tenure_months: Mapped[int | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    outstanding_balance: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    accrued_interest: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    # Voucher created when loan was disbursed
    disbursement_voucher_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    payments: Mapped[list["LoanPayment"]] = relationship(
        back_populates="loan", cascade="all, delete-orphan"
    )


class LoanPayment(UUIDPk, TimestampMixin, Base):
    """A repayment against a loan — auto-creates a voucher."""

    __tablename__ = "loan_payments"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    loan_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("loans.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # YYYY-MM-DD
    payment_date: Mapped[str] = mapped_column(String(10), nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    interest_portion: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    principal_portion: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    is_manual_interest: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Voucher auto-created for this repayment
    voucher_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    loan: Mapped[Loan] = relationship(back_populates="payments")
