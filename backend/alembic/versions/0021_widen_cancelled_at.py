"""Widen cancelled_at column on vouchers from VARCHAR(30) to VARCHAR(50).

Revision ID: 0021
Revises: 0020
Create Date: 2026-06-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("vouchers", "cancelled_at", type_=sa.String(50))


def downgrade() -> None:
    op.alter_column("vouchers", "cancelled_at", type_=sa.String(30))
