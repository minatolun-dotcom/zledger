"""Budget models for financial controls and planning."""
from __future__ import annotations

from sqlalchemy import Boolean, Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class Budget(UUIDPk, TimestampMixin, Base):
    """Budget master containing budget name, year, dates, and status."""

    __tablename__ = "budgets"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    financial_year: Mapped[str] = mapped_column(String(20), nullable=False)
    start_date: Mapped[str] = mapped_column(Date, nullable=False)
    end_date: Mapped[str] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Draft")  # Draft, Active, Closed
    budget_type: Mapped[str] = mapped_column(String(50), nullable=False)  # ledger, cost_centre, group, project
    approval_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, approved, rejected
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    approval_date: Mapped[str | None] = mapped_column(Date, nullable=True)

    # Relationships
    company = relationship("Company", back_populates="budgets")
    budget_periods = relationship("BudgetPeriod", back_populates="budget")
    allocations = relationship("BudgetAllocation", back_populates="budget")
    alerts = relationship("BudgetAlert", back_populates="budget")
    created_by_user = relationship("User", foreign_keys=[created_by], backref="created_budgets")
    approved_by_user = relationship("User", foreign_keys=[approved_by], backref="approved_budgets")

    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_budget_company_name"),
        UniqueConstraint("company_id", "financial_year", name="uq_budget_company_year"),
    )


class BudgetPeriod(UUIDPk, TimestampMixin, Base):
    """Budget period (monthly, quarterly, annual) within a budget."""

    __tablename__ = "budget_periods"

    budget_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("budgets.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)  # April, Q1, Annual
    period_type: Mapped[str] = mapped_column(String(20), nullable=False)  # monthly, quarterly, annual
    start_date: Mapped[str] = mapped_column(Date, nullable=False)
    end_date: Mapped[str] = mapped_column(Date, nullable=False)
    budget_amount: Mapped[float] = mapped_column(default=0, nullable=False)

    budget = relationship("Budget", back_populates="budget_periods")
    allocations = relationship("BudgetAllocation", back_populates="period")


class BudgetAllocation(UUIDPk, TimestampMixin, Base):
    """Individual budget allocation to a ledger, group, or cost centre."""

    __tablename__ = "budget_allocations"

    budget_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("budgets.id", ondelete="CASCADE"), index=True, nullable=False
    )
    period_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("budget_periods.id", ondelete="CASCADE"), index=True, nullable=False
    )
    ledger_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("ledgers.id", ondelete="SET NULL"), nullable=True
    )
    cost_centre_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("cost_centres.id", ondelete="SET NULL"), nullable=True
    )
    group_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # group, project
    group_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    budget_amount: Mapped[float] = mapped_column(default=0, nullable=False)

    budget = relationship("Budget", back_populates="allocations")
    period = relationship("BudgetPeriod", back_populates="allocations")
    ledger = relationship("Ledger", back_populates="budget_allocations")
    cost_centre = relationship("CostCentre", back_populates="budget_allocations")


class BudgetAlert(UUIDPk, TimestampMixin, Base):
    """Budget alerts and warnings for overspending/under spending."""

    __tablename__ = "budget_alerts"

    budget_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("budgets.id", ondelete="CASCADE"), index=True, nullable=False
    )
    ledger_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("ledgers.id", ondelete="SET NULL"), nullable=True
    )
    cost_centre_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("cost_centres.id", ondelete="SET NULL"), nullable=True
    )
    alert_type: Mapped[str] = mapped_column(String(50), nullable=False)  # warning, error, info
    threshold_percentage: Mapped[float] = mapped_column(nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    budget = relationship("Budget", back_populates="alerts")
    ledger = relationship("Ledger", back_populates="budget_alerts")
    cost_centre = relationship("CostCentre", back_populates="budget_alerts")