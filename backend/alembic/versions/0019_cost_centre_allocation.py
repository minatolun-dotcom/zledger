"""Add cost_centre_id to voucher_lines for cost centre allocation.

Revision ID: 0019
Revises: 0018
Create Date: 2026-06-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "voucher_lines",
        sa.Column("cost_centre_id", sa.String(36), sa.ForeignKey("cost_centres.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("voucher_lines", "cost_centre_id")
