"""Remove status/cancel fields, add round_off_to. Auto-post existing drafts.

Revision ID: 0022
Revises: 0021
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE vouchers SET status = 'posted' WHERE status = 'draft'")
    op.drop_column("vouchers", "status")
    op.drop_column("vouchers", "cancel_reason")
    op.drop_column("vouchers", "cancelled_at")
    op.add_column("vouchers", sa.Column("round_off_to", sa.Numeric(18, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("vouchers", "round_off_to")
    op.add_column("vouchers", sa.Column("cancelled_at", sa.String(50), nullable=True))
    op.add_column("vouchers", sa.Column("cancel_reason", sa.String(1024), nullable=True))
    op.add_column("vouchers", sa.Column("status", sa.String(20), nullable=False, server_default="draft"))
    op.execute("UPDATE vouchers SET status = 'draft'")
