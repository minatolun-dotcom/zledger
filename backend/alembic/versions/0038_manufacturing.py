"""Create manufacturing tables: bill_of_materials, bom_lines, production_orders

Revision ID: 0038
Revises: 0037
Create Date: 2026-07-08
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0038"
down_revision: Union[str, None] = "0037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bill_of_materials",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("finished_item_id", sa.String(36), sa.ForeignKey("stock_items.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("output_qty", sa.Numeric(18, 3), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.UniqueConstraint("company_id", "name", name="uq_bom_company_name"),
    )

    op.create_table(
        "bom_lines",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("bom_id", sa.String(36), sa.ForeignKey("bill_of_materials.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("stock_item_id", sa.String(36), sa.ForeignKey("stock_items.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("quantity", sa.Numeric(18, 3), nullable=False),
        sa.Column("rate", sa.Numeric(18, 2), nullable=True),
        sa.Column("wastage_pct", sa.Numeric(5, 2), nullable=False, server_default="0"),
    )

    op.create_table(
        "production_orders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("bom_id", sa.String(36), sa.ForeignKey("bill_of_materials.id", ondelete="RESTRICT"), index=True, nullable=False),
        sa.Column("order_number", sa.String(50), nullable=False),
        sa.Column("order_date", sa.String(10), nullable=False),
        sa.Column("planned_qty", sa.Numeric(18, 3), nullable=False),
        sa.Column("produced_qty", sa.Numeric(18, 3), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("narration", sa.String(512), nullable=True),
        sa.Column("voucher_id", sa.String(36), sa.ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("company_id", "order_number", name="uq_production_order_company_number"),
    )


def downgrade() -> None:
    op.drop_table("production_orders")
    op.drop_table("bom_lines")
    op.drop_table("bill_of_materials")
