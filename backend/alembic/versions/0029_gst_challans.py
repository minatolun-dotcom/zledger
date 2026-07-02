"""Create gst_challans table for GST challan/payment tracking

Revision ID: 0029
Revises: 0028
Create Date: 2026-07-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0029"
down_revision: Union[str, None] = "0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "gst_challans",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("gstin_id", sa.String(36), sa.ForeignKey("gst_registrations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("gst_return_id", sa.String(36), sa.ForeignKey("gst_returns.id", ondelete="SET NULL"), nullable=True),
        sa.Column("challan_number", sa.String(50), nullable=False),
        sa.Column("challan_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("cgst_amount", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("sgst_amount", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("igst_amount", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("cess_amount", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("interest", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("late_fee", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("bank_name", sa.String(255), nullable=True),
        sa.Column("payment_mode", sa.String(50), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'unapplied'")),
        sa.Column("remarks", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("gst_challans")
