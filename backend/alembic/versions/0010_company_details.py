"""Company details: phone, email, website, bank fields.

Revision ID: 0010_company_details
Revises: 0009_tds_tcs
Create Date: 2026-06-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0010_company_details"
down_revision = "0009_tds_tcs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("phone", sa.String(20), nullable=True))
    op.add_column("companies", sa.Column("email", sa.String(255), nullable=True))
    op.add_column("companies", sa.Column("website", sa.String(255), nullable=True))
    op.add_column("companies", sa.Column("bank_name", sa.String(255), nullable=True))
    op.add_column("companies", sa.Column("bank_account_number", sa.String(50), nullable=True))
    op.add_column("companies", sa.Column("bank_ifsc", sa.String(20), nullable=True))
    op.add_column("companies", sa.Column("bank_branch", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("companies", "bank_branch")
    op.drop_column("companies", "bank_ifsc")
    op.drop_column("companies", "bank_account_number")
    op.drop_column("companies", "bank_name")
    op.drop_column("companies", "website")
    op.drop_column("companies", "email")
    op.drop_column("companies", "phone")
