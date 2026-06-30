"""Add cancel_reason and cancelled_at to vouchers for voucher cancellation workflow.

Revision ID: 0018
Revises: 0017
Create Date: 2026-06-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vouchers", sa.Column("cancel_reason", sa.String(1024), nullable=True))
    op.add_column("vouchers", sa.Column("cancelled_at", sa.String(30), nullable=True))


def downgrade() -> None:
    op.drop_column("vouchers", "cancelled_at")
    op.drop_column("vouchers", "cancel_reason")
