"""Add is_rate_inclusive to voucher_lines for tax-inclusive pricing.

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0016"
down_revision = "0015_quick_create_masters"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "voucher_lines",
        sa.Column("is_rate_inclusive", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("voucher_lines", "is_rate_inclusive")
