"""Add multi-currency support: exchange_rates table, currency fields on ledgers/vouchers

Revision ID: 0023
Revises: 0022
Create Date: 2026-07-01 11:30:44.841594
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create exchange_rates table
    op.create_table(
        "exchange_rates",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("rate", sa.Numeric(18, 4), nullable=False),
        sa.Column("rate_date", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "currency", "rate_date", name="uq_exrate_company_currency_date"),
    )

    # Add currency column to ledgers
    op.add_column("ledgers", sa.Column("currency", sa.String(3), nullable=True))

    # Add currency and exchange_rate to vouchers
    op.add_column("vouchers", sa.Column("currency", sa.String(3), nullable=True))
    op.add_column("vouchers", sa.Column("exchange_rate", sa.Numeric(18, 4), nullable=True))

    # Add fc_debit and fc_credit to voucher_lines
    op.add_column("voucher_lines", sa.Column("fc_debit", sa.Numeric(18, 2), nullable=True))
    op.add_column("voucher_lines", sa.Column("fc_credit", sa.Numeric(18, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("voucher_lines", "fc_credit")
    op.drop_column("voucher_lines", "fc_debit")
    op.drop_column("vouchers", "exchange_rate")
    op.drop_column("vouchers", "currency")
    op.drop_column("ledgers", "currency")
    op.drop_table("exchange_rates")
