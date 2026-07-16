"""Add bank account fields to ledger.

Revision ID: 0050_add_bank_fields_to_ledger
Revises: 0049
Create Date: 2026-07-16 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0050"
down_revision = "0049"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS bank_name VARCHAR(255)")
    op.execute("ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(50)")
    op.execute("ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR(20)")
    op.execute("ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS bank_branch VARCHAR(255)")


def downgrade() -> None:
    op.drop_column("ledgers", "bank_branch")
    op.drop_column("ledgers", "bank_ifsc")
    op.drop_column("ledgers", "bank_account_number")
    op.drop_column("ledgers", "bank_name")
