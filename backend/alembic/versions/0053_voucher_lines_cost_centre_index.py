"""Add index on voucher_lines.cost_centre_id.

Revision ID: 0053
Revises: 0052
Create Date: 2026-07-17 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0053"
down_revision = "0052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_voucher_lines_cost_centre_id",
        "voucher_lines",
        ["cost_centre_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_voucher_lines_cost_centre_id",
        table_name="voucher_lines",
    )
