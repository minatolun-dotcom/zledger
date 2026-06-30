"""0005: Compliance fields + gst_returns table

Revision ID: 0005_compliance
Revises: 0004_gst
Create Date: 2026-06-28 00:00:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0005_compliance"
down_revision: str = "0004_gst"
branch_labels = None
depends_on = None


def _ts() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def upgrade() -> None:
    # Add compliance fields to vouchers
    op.add_column("vouchers", sa.Column("place_of_supply", sa.String(2), nullable=True))
    op.add_column("vouchers", sa.Column("document_type", sa.String(20), nullable=False, server_default="regular"))
    op.add_column("vouchers", sa.Column("counterparty_gstin", sa.String(15), nullable=True))
    op.add_column("vouchers", sa.Column("counterparty_state_code", sa.String(2), nullable=True))

    # Add taxable_value to voucher_lines
    op.add_column("voucher_lines", sa.Column("taxable_value", sa.Numeric(18, 2), nullable=True))

    # Create gst_returns table
    op.create_table(
        "gst_returns",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("gstin_id", sa.String(36), sa.ForeignKey("gst_registrations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("return_type", sa.String(20), nullable=False),  # gstr1 | gstr3b
        sa.Column("period", sa.String(7), nullable=False),  # YYYY-MM
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),  # draft | submitted | filed
        sa.Column("filed_date", sa.Date(), nullable=True),
        sa.Column("ack_number", sa.String(50), nullable=True),
        sa.Column("data_json", sa.JSON(), nullable=True),
        *_ts(),
        sa.UniqueConstraint("company_id", "gstin_id", "return_type", "period", name="uq_gst_return_company_period"),
    )
    op.create_index("ix_gst_returns_company_id", "gst_returns", ["company_id"])
    op.create_index("ix_gst_returns_period", "gst_returns", ["period"])


def downgrade() -> None:
    op.drop_index("ix_gst_returns_period", table_name="gst_returns")
    op.drop_index("ix_gst_returns_company_id", table_name="gst_returns")
    op.drop_table("gst_returns")

    op.drop_column("voucher_lines", "taxable_value")

    op.drop_column("vouchers", "counterparty_state_code")
    op.drop_column("vouchers", "counterparty_gstin")
    op.drop_column("vouchers", "document_type")
    op.drop_column("vouchers", "place_of_supply")
