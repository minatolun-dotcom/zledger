"""Add stock_balances table for running inventory valuation.

Revision ID: 0020
Revises: 0019
Create Date: 2026-06-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stock_balances",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("stock_item_id", sa.String(36), sa.ForeignKey("stock_items.id", ondelete="RESTRICT"), index=True, nullable=False),
        sa.Column("quantity", sa.Numeric(18, 3), nullable=False, server_default="0"),
        sa.Column("avg_rate", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("total_value", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("last_entry_date", sa.String(10), nullable=True),
        sa.UniqueConstraint("company_id", "stock_item_id", name="uq_stock_balance_company_item"),
    )


def downgrade() -> None:
    op.drop_table("stock_balances")
