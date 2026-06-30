"""Inventory: stock_groups, stock_items, stock_entries tables.

Revision ID: 0011_stock
Revises: 0010_company_details
Create Date: 2026-06-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0011_stock"
down_revision = "0010_company_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stock_groups",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String(512), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("company_id", "name", name="uq_stock_group_company_name"),
    )

    op.create_table(
        "stock_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("stock_group_id", sa.String(36), sa.ForeignKey("stock_groups.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("sku", sa.String(100), nullable=True),
        sa.Column("hsn_sac_code", sa.String(20), nullable=True),
        sa.Column("unit_of_measure", sa.String(20), nullable=False, server_default="Nos"),
        sa.Column("opening_qty", sa.Numeric(18, 3), nullable=False, server_default="0"),
        sa.Column("opening_rate", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("valuation_method", sa.String(20), nullable=False, server_default="weighted_avg"),
        sa.Column("gst_rate", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("company_id", "name", name="uq_stock_item_company_name"),
    )

    op.create_table(
        "stock_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("stock_item_id", sa.String(36), sa.ForeignKey("stock_items.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("entry_type", sa.String(10), nullable=False),
        sa.Column("quantity", sa.Numeric(18, 3), nullable=False),
        sa.Column("rate", sa.Numeric(18, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("entry_date", sa.String(10), nullable=False),
        sa.Column("reference", sa.String(255), nullable=True),
        sa.Column("narration", sa.String(512), nullable=True),
        sa.Column("voucher_id", sa.String(36), sa.ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("stock_entries")
    op.drop_table("stock_items")
    op.drop_table("stock_groups")
