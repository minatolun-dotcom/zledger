"""E-Way Bill model: GSTN E-Way Bill generation, cancellation, and transport tracking."""
from __future__ import annotations

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class EwayBill(UUIDPk, TimestampMixin, Base):
    """Stores E-Way Bill data generated via GSTN portal."""

    __tablename__ = "eway_bills"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    voucher_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False
    )
    gstin_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("gst_registrations.id", ondelete="RESTRICT"), nullable=False
    )

    # ─── E-Way Bill details ──────────────────────────────────────────────
    eway_bill_number: Mapped[str | None] = mapped_column(String(12), nullable=True)
    eway_bill_date: Mapped[str | None] = mapped_column(String(10), nullable=True)  # YYYY-MM-DD
    valid_until: Mapped[str | None] = mapped_column(String(10), nullable=True)  # YYYY-MM-DD
    irn: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # ─── Supply details ──────────────────────────────────────────────────
    # Supply types: O, SEZWP, SEZwOP, EXP, INW, SKD, JOBW, JOBOR
    supply_type: Mapped[str] = mapped_column(String(3), nullable=False, default="O")
    # Sub-supply types: 0-8
    sub_supply_type: Mapped[str] = mapped_column(String(2), nullable=False, default="0")
    document_type: Mapped[str] = mapped_column(String(3), nullable=False, default="INV")
    document_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    document_date: Mapped[str | None] = mapped_column(String(10), nullable=True)  # YYYY-MM-DD

    # ─── From / To ───────────────────────────────────────────────────────
    from_gstin: Mapped[str | None] = mapped_column(String(15), nullable=True)
    from_trd_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    from_state: Mapped[str | None] = mapped_column(String(2), nullable=True)
    from_addr1: Mapped[str | None] = mapped_column(String(200), nullable=True)
    from_addr2: Mapped[str | None] = mapped_column(String(200), nullable=True)
    from_place: Mapped[str | None] = mapped_column(String(100), nullable=True)
    from_pincode: Mapped[int] = mapped_column(Integer, nullable=True, default=0)
    to_gstin: Mapped[str | None] = mapped_column(String(15), nullable=True)
    to_trd_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    to_state: Mapped[str | None] = mapped_column(String(2), nullable=True)
    to_addr1: Mapped[str | None] = mapped_column(String(200), nullable=True)
    to_addr2: Mapped[str | None] = mapped_column(String(200), nullable=True)
    to_place: Mapped[str | None] = mapped_column(String(100), nullable=True)
    to_pincode: Mapped[int] = mapped_column(Integer, nullable=True, default=0)

    # ─── Item details ────────────────────────────────────────────────────
    hsn_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    item_description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    quantity: Mapped[float | None] = mapped_column(Numeric(18, 3), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(3), nullable=True)
    taxable_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    cgst_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    sgst_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    igst_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    cess_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    total_value: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)

    # ─── Transport details ───────────────────────────────────────────────
    # Transport modes: Road, Rail, Air, Ship
    transport_mode: Mapped[str | None] = mapped_column(String(10), nullable=True)
    transporter_id: Mapped[str | None] = mapped_column(String(15), nullable=True)
    transporter_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    transport_doc_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    transport_doc_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    vehicle_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    vehicle_type: Mapped[str | None] = mapped_column(String(5), nullable=True)  # O, R
    distance_km: Mapped[int] = mapped_column(Integer, nullable=True, default=0)

    # ─── Status tracking ─────────────────────────────────────────────────
    # draft → generated → cancelled | failed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ─── Timestamps ──────────────────────────────────────────────────────
    generated_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ─── Cancel details ──────────────────────────────────────────────────
    cancel_reason: Mapped[str | None] = mapped_column(String(1), nullable=True)
    cancel_remark: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        UniqueConstraint("company_id", "voucher_id", name="uq_eway_bill_company_voucher"),
    )
