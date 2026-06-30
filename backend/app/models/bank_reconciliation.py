"""Bank reconciliation models: imported bank statements and reconciliation sessions.

Bank statements are imported from CSV files. Each line represents a bank transaction
that can be matched (reconciled) against existing vouchers in the ledger.
"""
from __future__ import annotations

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class BankStatementLine(UUIDPk, TimestampMixin, Base):
    """A single transaction line imported from a bank statement CSV."""

    __tablename__ = "bank_statement_lines"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    ledger_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("ledgers.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Bank statement fields
    transaction_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)  # bank reference / cheque no
    debit: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)  # withdrawal
    credit: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)  # deposit
    balance: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)  # running balance
    # Reconciliation fields
    is_reconciled: Mapped[bool] = mapped_column(default=False, nullable=False)
    voucher_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True
    )
    reconciled_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reconciled_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    voucher: Mapped["Voucher | None"] = relationship()

    __table_args__ = (
        Index("ix_bank_stmt_date", "company_id", "ledger_id", "transaction_date"),
    )


class BankReconciliation(UUIDPk, TimestampMixin, Base):
    """A reconciliation session: opening/closing balances for a bank statement period."""

    __tablename__ = "bank_reconciliations"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    ledger_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("ledgers.id", ondelete="CASCADE"), index=True, nullable=False
    )
    statement_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    opening_balance: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    closing_balance: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    # Number of reconciled lines in this session
    reconciled_count: Mapped[int] = mapped_column(default=0, nullable=False)
    is_finalized: Mapped[bool] = mapped_column(default=False, nullable=False)

    __table_args__ = (
        UniqueConstraint("company_id", "ledger_id", "statement_date", name="uq_bank_recon_date"),
    )


# Avoid circular import at module level
from app.models.voucher import Voucher  # noqa: E402, F401
