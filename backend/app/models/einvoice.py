"""E-Invoice model: IRN generation, QR codes, and digital signatures via GSTN IRP."""
from __future__ import annotations

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class EInvoice(UUIDPk, TimestampMixin, Base):
    """Stores IRN and related data returned by the GSTN Invoice Registration Portal."""

    __tablename__ = "e_invoices"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    voucher_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False
    )
    gstin_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("gst_registrations.id", ondelete="RESTRICT"), nullable=False
    )

    # ─── GSTN IRP response fields ────────────────────────────────────────
    irn: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ack_no: Mapped[str | None] = mapped_column(String(18), nullable=True)
    ack_dt: Mapped[str | None] = mapped_column(String(19), nullable=True)  # DD/MM/YYYY HH:MM:SS
    signed_qr_code: Mapped[str | None] = mapped_column(Text, nullable=True)  # base64 QR image
    signed_invoice: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ─── Status tracking ─────────────────────────────────────────────────
    # draft → submitted → generated → cancelled | failed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ─── Timestamps ──────────────────────────────────────────────────────
    submitted_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    generated_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ─── Cancel details ──────────────────────────────────────────────────
    cancel_reason: Mapped[str | None] = mapped_column(String(1), nullable=True)  # 1=Duplicate, 2=Data Entry, 3=Order Cancelled, 4=Other
    cancel_remark: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        UniqueConstraint("company_id", "voucher_id", name="uq_einvoice_company_voucher"),
    )
