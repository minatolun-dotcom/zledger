"""0004: GST models (hsn_sac, gst_registrations) and GST fields on voucher_lines

Revision ID: 0004_gst
Revises: 0003_vouchers
Create Date: 2026-06-28 00:00:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0004_gst"
down_revision: str = "0003_vouchers"
branch_labels = None
depends_on = None


def _ts() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def upgrade() -> None:
    # Create HSN/SAC table
    op.create_table(
        "hsn_sac",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("description", sa.String(512), nullable=False),
        sa.Column("gst_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("code_type", sa.String(3), nullable=False, server_default="hsn"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_ts(),
        sa.UniqueConstraint("company_id", "code", name="uq_hsn_sac_company_code"),
    )
    op.create_index("ix_hsn_sac_company_id", "hsn_sac", ["company_id"])

    # Create GST Registrations table
    op.create_table(
        "gst_registrations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("gstin", sa.String(15), nullable=False),
        sa.Column("legal_name", sa.String(255), nullable=False),
        sa.Column("trade_name", sa.String(255), nullable=True),
        sa.Column("state_code", sa.String(2), nullable=False),
        sa.Column("pan", sa.String(10), nullable=True),
        sa.Column("address", sa.String(512), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_ts(),
        sa.UniqueConstraint("company_id", "gstin", name="uq_gst_reg_company_gstin"),
    )
    op.create_index("ix_gst_registrations_company_id", "gst_registrations", ["company_id"])

    # Add GST fields to voucher_lines
    op.add_column("voucher_lines", sa.Column("hsn_sac_id", sa.String(36), sa.ForeignKey("hsn_sac.id", ondelete="SET NULL"), nullable=True))
    op.add_column("voucher_lines", sa.Column("is_inter_state", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("voucher_lines", sa.Column("is_reverse_charge", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("voucher_lines", sa.Column("cgst_amount", sa.Numeric(18, 2), nullable=True))
    op.add_column("voucher_lines", sa.Column("sgst_amount", sa.Numeric(18, 2), nullable=True))
    op.add_column("voucher_lines", sa.Column("igst_amount", sa.Numeric(18, 2), nullable=True))
    op.create_index("ix_voucher_lines_hsn_sac_id", "voucher_lines", ["hsn_sac_id"])


def downgrade() -> None:
    # Remove GST fields from voucher_lines
    op.drop_index("ix_voucher_lines_hsn_sac_id", table_name="voucher_lines")
    op.drop_column("voucher_lines", "igst_amount")
    op.drop_column("voucher_lines", "sgst_amount")
    op.drop_column("voucher_lines", "cgst_amount")
    op.drop_column("voucher_lines", "is_reverse_charge")
    op.drop_column("voucher_lines", "is_inter_state")
    op.drop_column("voucher_lines", "hsn_sac_id")

    # Drop GST Registrations table
    op.drop_index("ix_gst_registrations_company_id", table_name="gst_registrations")
    op.drop_table("gst_registrations")

    # Drop HSN/SAC table
    op.drop_index("ix_hsn_sac_company_id", table_name="hsn_sac")
    op.drop_table("hsn_sac")