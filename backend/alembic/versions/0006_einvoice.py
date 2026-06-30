"""E-Invoice: e_invoices table for IRN, QR, and status tracking.

Revision ID: 0006_einvoice
Revises: 0005_compliance
Create Date: 2026-06-28 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision: str = "0006_einvoice"
down_revision: str = "0005_compliance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "e_invoices",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("voucher_id", sa.String(36), sa.ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("gstin_id", sa.String(36), sa.ForeignKey("gst_registrations.id", ondelete="RESTRICT"), nullable=False),
        # GSTN IRP response
        sa.Column("irn", sa.String(64), nullable=True),
        sa.Column("ack_no", sa.String(18), nullable=True),
        sa.Column("ack_dt", sa.String(19), nullable=True),
        sa.Column("signed_qr_code", sa.Text, nullable=True),
        sa.Column("signed_invoice", sa.Text, nullable=True),
        # Status
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("error_message", sa.Text, nullable=True),
        # Timestamps
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        # Cancel
        sa.Column("cancel_reason", sa.String(1), nullable=True),
        sa.Column("cancel_remark", sa.String(255), nullable=True),
        # Base columns
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", "voucher_id", name="uq_einvoice_company_voucher"),
    )


def downgrade() -> None:
    op.drop_table("e_invoices")
