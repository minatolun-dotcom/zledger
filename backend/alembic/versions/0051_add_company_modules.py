"""Add modules column to companies.

Revision ID: 0051_add_company_modules
Revises: 0050
Create Date: 2026-07-17 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None

ALL_MODULES = (
    '["core","reports","fixed_assets","inventory","manufacturing",'
    '"batches","gst","tds_tcs","bank_reconciliation","payments","import_export"]'
)


def upgrade() -> None:
    op.execute(f"ALTER TABLE companies ADD COLUMN IF NOT EXISTS modules TEXT DEFAULT '{ALL_MODULES}'")
    op.execute(f"UPDATE companies SET modules = '{ALL_MODULES}' WHERE modules IS NULL")


def downgrade() -> None:
    op.drop_column("companies", "modules")
