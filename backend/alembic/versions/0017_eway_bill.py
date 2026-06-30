"""Add eway_bills table for GSTN E-Way Bill integration.

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "eway_bills",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("voucher_id", sa.String(36), sa.ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("gstin_id", sa.String(36), sa.ForeignKey("gst_registrations.id", ondelete="RESTRICT"), nullable=False),
        # E-Way Bill details
        sa.Column("eway_bill_number", sa.String(12), nullable=True),
        sa.Column("eway_bill_date", sa.String(10), nullable=True),
        sa.Column("valid_until", sa.String(10), nullable=True),
        sa.Column("irn", sa.String(64), nullable=True),
        # Supply details
        sa.Column("supply_type", sa.String(3), nullable=False, server_default="O"),
        sa.Column("sub_supply_type", sa.String(2), nullable=False, server_default="0"),
        sa.Column("document_type", sa.String(3), nullable=False, server_default="INV"),
        sa.Column("document_number", sa.String(50), nullable=True),
        sa.Column("document_date", sa.String(10), nullable=True),
        # From / To
        sa.Column("from_gstin", sa.String(15), nullable=True),
        sa.Column("from_trd_name", sa.String(100), nullable=True),
        sa.Column("from_state", sa.String(2), nullable=True),
        sa.Column("from_addr1", sa.String(200), nullable=True),
        sa.Column("from_addr2", sa.String(200), nullable=True),
        sa.Column("from_place", sa.String(100), nullable=True),
        sa.Column("from_pincode", sa.Integer(), nullable=True),
        sa.Column("to_gstin", sa.String(15), nullable=True),
        sa.Column("to_trd_name", sa.String(100), nullable=True),
        sa.Column("to_state", sa.String(2), nullable=True),
        sa.Column("to_addr1", sa.String(200), nullable=True),
        sa.Column("to_addr2", sa.String(200), nullable=True),
        sa.Column("to_place", sa.String(100), nullable=True),
        sa.Column("to_pincode", sa.Integer(), nullable=True),
        # Item details
        sa.Column("hsn_code", sa.String(8), nullable=True),
        sa.Column("item_description", sa.String(200), nullable=True),
        sa.Column("quantity", sa.Numeric(18, 3), nullable=True),
        sa.Column("unit", sa.String(3), nullable=True),
        sa.Column("taxable_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("cgst_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("sgst_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("igst_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("cess_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("total_value", sa.Numeric(18, 2), nullable=False, server_default="0"),
        # Transport details
        sa.Column("transport_mode", sa.String(10), nullable=True),
        sa.Column("transporter_id", sa.String(15), nullable=True),
        sa.Column("transporter_name", sa.String(100), nullable=True),
        sa.Column("transport_doc_number", sa.String(20), nullable=True),
        sa.Column("transport_doc_date", sa.String(10), nullable=True),
        sa.Column("vehicle_number", sa.String(20), nullable=True),
        sa.Column("vehicle_type", sa.String(5), nullable=True),
        sa.Column("distance_km", sa.Integer(), nullable=True),
        # Status
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("error_message", sa.Text(), nullable=True),
        # Timestamps
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        # Cancel details
        sa.Column("cancel_reason", sa.String(1), nullable=True),
        sa.Column("cancel_remark", sa.String(255), nullable=True),
        sa.UniqueConstraint("company_id", "voucher_id", name="uq_eway_bill_company_voucher"),
    )


def downgrade() -> None:
    op.drop_table("eway_bills")
