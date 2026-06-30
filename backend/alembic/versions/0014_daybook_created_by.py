"""Add created_by to vouchers for Day Book

Revision ID: 0014_daybook_created_by
Revises: 0013_coa_system_codes
Create Date: 2026-06-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0014_daybook_created_by"
down_revision = "0013_coa_system_codes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vouchers", sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_vouchers_created_by", "vouchers", ["created_by"])


def downgrade() -> None:
    op.drop_index("ix_vouchers_created_by", table_name="vouchers")
    op.drop_column("vouchers", "created_by")
