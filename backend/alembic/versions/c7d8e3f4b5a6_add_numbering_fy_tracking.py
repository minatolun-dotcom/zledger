"""add per-FY tracking to voucher numbering

Revision ID: c7d8e3f4b5a6
Revises: b4e2f1a9c7d5
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa

revision = "c7d8e3f4b5a6"
down_revision = "b4e2f1a9c7d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The voucher-number sequence is per financial year (TallyPrime restarts
    # numbering each FY). The FY the current next_sequence belongs to is stored
    # so _next_voucher_number can reset the counter on FY rollover. Existing
    # rows (NULL) are treated as belonging to the current FY on first use.
    op.add_column("voucher_numbering", sa.Column("current_fy_year", sa.String(4), nullable=True))


def downgrade() -> None:
    op.drop_column("voucher_numbering", "current_fy_year")
