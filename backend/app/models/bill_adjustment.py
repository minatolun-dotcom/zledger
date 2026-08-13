"""Bill adjustment model — persisted credit/debit-note adjustments to bill references.

A credit note adjusted against an invoice bill (`POST /bills/credit-note/{id}/adjust/{bill_id}`)
or a debit note against a purchase bill (`POST /bills/debit-note/{id}/adjust/{bill_id}`)
previously only mutated `bill_references.adjusted_amount` with no record of which
note did it — so cancelling (or deleting) the note left the bill's outstanding
permanently understated.

This table is the attribution ledger. The amount stored matches the exact signed
value applied to `adjusted_amount` — NEGATIVE (it reduces the bill's outstanding) —
so undoing a cancel is a pure subtraction and legacy pre-migration adjustments
(no row here) survive untouched.
"""
from __future__ import annotations

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class BillAdjustment(UUIDPk, TimestampMixin, Base):
    """Links a credit/debit-note voucher to the bill reference it adjusted."""

    __tablename__ = "bill_adjustments"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    bill_reference_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("bill_references.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Exactly one of these is set: credit notes adjust sales bills, debit notes
    # adjust purchase bills.
    credit_note_voucher_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("vouchers.id", ondelete="CASCADE"), index=True, nullable=True
    )
    debit_note_voucher_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("vouchers.id", ondelete="CASCADE"), index=True, nullable=True
    )
    # Signed amount applied to bill_references.adjusted_amount (note total, capped).
    amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
