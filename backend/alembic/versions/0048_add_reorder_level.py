"""Add reorder_level to stock_items for low stock alerts.

Revision ID: 0048_add_reorder_level
Revises: 0047_add_notifications_table
Create Date: 2026-07-10 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "stock_items",
        sa.Column("reorder_level", sa.Numeric(18, 3), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("stock_items", "reorder_level")
