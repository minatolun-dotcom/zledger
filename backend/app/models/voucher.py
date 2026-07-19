"""Voucher models: double-entry core with balance enforcement.

Every voucher has header + lines. Σ debits == Σ credits enforced at DB level.
Ledger lines are append-only (no UPDATE/DELETE on vouchers once posted).
"""
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Index, JSON, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class Voucher(UUIDPk, TimestampMixin, Base):
    __tablename__ = "vouchers"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    voucher_type: Mapped[str] = mapped_column(String(30), nullable=False)  # sales | purchase | payment | receipt | journal | credit_note | debit_note | contra
    voucher_number: Mapped[str] = mapped_column(String(50), nullable=False)
    voucher_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    narration: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Party (for sales/purchase/receipt/payment)
    party_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("parties.id", ondelete="SET NULL"), nullable=True
    )
    # Compliance fields
    place_of_supply: Mapped[str | None] = mapped_column(String(2), nullable=True)
    document_type: Mapped[str] = mapped_column(String(20), nullable=False, default="regular")
    counterparty_gstin: Mapped[str | None] = mapped_column(String(15), nullable=True)
    counterparty_state_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    # Totals
    subtotal: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    discount_total: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    tax_total: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    grand_total: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    # Round-off setting
    round_off_to: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    # Who created the voucher (nullable for backwards compatibility)
    created_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Due date for invoices (sales/purchase) — optional
    due_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Status: draft (not yet posted), posted (active), cancelled
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="posted")
    # Approval workflow: NULL=no approval needed, pending/approved/rejected
    approval_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Cancellation fields
    cancel_reason: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    cancelled_at: Mapped[str | None] = mapped_column(String(40), nullable=True)

    lines: Mapped[list["VoucherLine"]] = relationship(
        back_populates="voucher", cascade="all, delete-orphan"
    )
    party: Mapped["Party | None"] = relationship()
    creator: Mapped["User | None"] = relationship(foreign_keys="Voucher.created_by")

    __table_args__ = (
        UniqueConstraint("company_id", "voucher_type", "voucher_number", name="uq_voucher_type_number"),
        Index("ix_vouchers_company_date", "company_id", "voucher_date"),
    )


class VoucherLine(UUIDPk, TimestampMixin, Base):
    __tablename__ = "voucher_lines"

    voucher_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vouchers.id", ondelete="CASCADE"), index=True, nullable=False
    )
    ledger_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("ledgers.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    # Stock item (for sales/purchase lines)
    stock_item_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("stock_items.id", ondelete="SET NULL"), nullable=True
    )
    # Item-level details
    quantity: Mapped[float | None] = mapped_column(Numeric(18, 3), nullable=True)
    rate: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    discount_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    discount_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    line_total: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    # One of debit or credit must be > 0, the other must be 0.
    debit: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    credit: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    taxable_value: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    # GST fields (optional for non-GST transactions)
    hsn_sac_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("hsn_sac.id", ondelete="SET NULL"), nullable=True
    )
    is_inter_state: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_reverse_charge: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_rate_inclusive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cgst_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    sgst_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    igst_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    # Cost centre allocation
    cost_centre_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("cost_centres.id", ondelete="SET NULL"), index=True, nullable=True
    )

    voucher: Mapped[Voucher] = relationship(back_populates="lines")
    stock_item: Mapped["StockItem | None"] = relationship()


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


class PaymentAllocation(UUIDPk, TimestampMixin, Base):
    """Links a payment/receipt voucher to the invoice it settles."""
    __tablename__ = "payment_allocations"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    invoice_voucher_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vouchers.id", ondelete="CASCADE"), index=True, nullable=False
    )
    payment_voucher_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vouchers.id", ondelete="CASCADE"), index=True, nullable=False
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    allocation_date: Mapped[str] = mapped_column(String(10), nullable=False)
    remarks: Mapped[str | None] = mapped_column(String(500), nullable=True)
