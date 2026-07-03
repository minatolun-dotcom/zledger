"""Restore cancel_reason and cancelled_at columns to vouchers

Revision ID: 0033
Revises: 0032
Create Date: 2026-07-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("vouchers", sa.Column("cancel_reason", sa.String(1024), nullable=True))
    op.add_column("vouchers", sa.Column("cancelled_at", sa.String(30), nullable=True))


def downgrade():
    op.drop_column("vouchers", "cancelled_at")
    op.drop_column("vouchers", "cancel_reason")
