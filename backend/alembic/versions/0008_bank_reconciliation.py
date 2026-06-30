"""Bank Reconciliation: bank_statement_lines and bank_reconciliations tables.

Revision ID: 0008_bank_reconciliation
Revises: 0007_audit_log
Create Date: 2026-06-29 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision: str = "0008_bank_reconciliation"
down_revision: str = "0007_audit_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bank_statement_lines",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ledger_id", sa.String(36), sa.ForeignKey("ledgers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("transaction_date", sa.String(10), nullable=False),
        sa.Column("description", sa.String(512), nullable=False),
        sa.Column("reference", sa.String(255), nullable=True),
        sa.Column("debit", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("credit", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("balance", sa.Numeric(18, 2), nullable=True),
        sa.Column("is_reconciled", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("voucher_id", sa.String(36), sa.ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reconciled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reconciled_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_bank_stmt_lines_company_id", "bank_statement_lines", ["company_id"])
    op.create_index("ix_bank_stmt_lines_ledger_id", "bank_statement_lines", ["ledger_id"])
    op.create_index("ix_bank_stmt_date", "bank_statement_lines", ["company_id", "ledger_id", "transaction_date"])

    op.create_table(
        "bank_reconciliations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ledger_id", sa.String(36), sa.ForeignKey("ledgers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("statement_date", sa.String(10), nullable=False),
        sa.Column("opening_balance", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("closing_balance", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("reconciled_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_finalized", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", "ledger_id", "statement_date", name="uq_bank_recon_date"),
    )
    op.create_index("ix_bank_recon_company_id", "bank_reconciliations", ["company_id"])
    op.create_index("ix_bank_recon_ledger_id", "bank_reconciliations", ["ledger_id"])


def downgrade() -> None:
    op.drop_index("ix_bank_recon_ledger_id", table_name="bank_reconciliations")
    op.drop_index("ix_bank_recon_company_id", table_name="bank_reconciliations")
    op.drop_table("bank_reconciliations")

    op.drop_index("ix_bank_stmt_date", table_name="bank_statement_lines")
    op.drop_index("ix_bank_stmt_lines_ledger_id", table_name="bank_statement_lines")
    op.drop_index("ix_bank_stmt_lines_company_id", table_name="bank_statement_lines")
    op.drop_table("bank_statement_lines")
