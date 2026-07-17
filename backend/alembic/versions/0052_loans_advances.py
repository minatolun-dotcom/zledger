"""Create loans and loan_payments tables.

Revision ID: 0052
Revises: 0051
Create Date: 2026-07-17 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "loans",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("loan_type", sa.String(20), nullable=False),
        sa.Column("party_name", sa.String(255), nullable=False),
        sa.Column("party_ledger_id", sa.String(36), sa.ForeignKey("ledgers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("loan_ledger_id", sa.String(36), sa.ForeignKey("ledgers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("principal_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("interest_rate", sa.Float, nullable=False, server_default="0"),
        sa.Column("interest_type", sa.String(10), nullable=False, server_default="none"),
        sa.Column("disbursement_date", sa.String(10), nullable=False),
        sa.Column("due_date", sa.String(10), nullable=True),
        sa.Column("emi_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("tenure_months", sa.Integer, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("outstanding_balance", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("accrued_interest", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("disbursement_voucher_id", sa.String(36), sa.ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_loans_company_type", "loans", ["company_id", "loan_type"])
    op.create_index("ix_loans_company_status", "loans", ["company_id", "status"])

    op.create_table(
        "loan_payments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("loan_id", sa.String(36), sa.ForeignKey("loans.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("payment_date", sa.String(10), nullable=False),
        sa.Column("total_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("interest_portion", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("principal_portion", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("is_manual_interest", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("voucher_id", sa.String(36), sa.ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_loan_payments_loan", "loan_payments", ["loan_id"])


def downgrade() -> None:
    op.drop_table("loan_payments")
    op.drop_table("loans")
