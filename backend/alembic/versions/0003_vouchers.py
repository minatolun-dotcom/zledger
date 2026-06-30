"""0003: vouchers and voucher_lines

Revision ID: 0003_vouchers
Revises: 0002_coa
Create Date: 2026-06-28 00:00:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0003_vouchers"
down_revision: str = "0002_coa"
branch_labels = None
depends_on = None


def _ts() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def upgrade() -> None:
    op.create_table(
        "vouchers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("voucher_type", sa.String(30), nullable=False),
        sa.Column("voucher_number", sa.String(50), nullable=False),
        sa.Column("voucher_date", sa.String(10), nullable=False),
        sa.Column("narration", sa.String(1024), nullable=True),
        sa.Column("reference", sa.String(255), nullable=True),
        sa.Column("is_posted", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_ts(),
        sa.UniqueConstraint("company_id", "voucher_type", "voucher_number", name="uq_voucher_type_number"),
    )
    op.create_index("ix_vouchers_company_date", "vouchers", ["company_id", "voucher_date"])

    op.create_table(
        "voucher_lines",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("voucher_id", sa.String(36), sa.ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ledger_id", sa.String(36), sa.ForeignKey("ledgers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("debit", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("credit", sa.Numeric(18, 2), nullable=False, server_default="0"),
        *_ts(),
    )
    op.create_index("ix_voucher_lines_voucher_id", "voucher_lines", ["voucher_id"])
    op.create_index("ix_voucher_lines_ledger_id", "voucher_lines", ["ledger_id"])


def downgrade() -> None:
    op.drop_index("ix_voucher_lines_ledger_id", table_name="voucher_lines")
    op.drop_index("ix_voucher_lines_voucher_id", table_name="voucher_lines")
    op.drop_table("voucher_lines")
    op.drop_index("ix_vouchers_company_date", table_name="vouchers")
    op.drop_table("vouchers")
