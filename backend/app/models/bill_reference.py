"""Bill reference model for bill-wise accounting.

Tracks outstanding invoices (sales/purchase) with their bill details,
settlement status, and enables Tally-style bill allocation.
"""
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class BillReference(UUIDPk, TimestampMixin, Base):
    """Bill reference for invoice-wise outstanding tracking.
    
    Created automatically when Sales/Purchase voucher is saved.
    Links to payment_allocations for settlement tracking.
    """
    __tablename__ = "bill_references"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    
    # The invoice voucher this bill refers to
    invoice_voucher_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vouchers.id", ondelete="CASCADE"), index=True, nullable=False
    )
    
    # Bill type: 'new_ref', 'against_ref', 'advance', 'on_account', 'others'
    reference_type: Mapped[str] = mapped_column(String(20), nullable=False, default="new_ref")
    
    # Bill details
    bill_number: Mapped[str] = mapped_column(String(50), nullable=False)
    bill_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    due_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    
    # Amounts
    original_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    adjusted_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)  # Via Cr/Dr notes
    paid_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    outstanding_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    
    # Status: 'open', 'partial', 'paid', 'cancelled'
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    
    # Party (customer/supplier)
    party_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("parties.id", ondelete="SET NULL"), index=True, nullable=True
    )
    
    # Flags
    is_advance: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    
    # Relationships
    invoice_voucher: Mapped["Voucher"] = relationship(foreign_keys="BillReference.invoice_voucher_id")
    party: Mapped["Party | None"] = relationship()
    
    __table_args__ = (
        Index("idx_bill_refs_company_party", "company_id", "party_id"),
        Index("idx_bill_refs_company_status", "company_id", "status"),
        Index("idx_bill_refs_company_outstanding", "company_id", "status", "outstanding_amount"),
    )
