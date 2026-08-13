"""add debit-note support to bill_adjustments

Revision ID: b4e2f1a9c7d5
Revises: c9d41e2f8a63
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa

revision = "b4e2f1a9c7d5"
down_revision = "c9d41e2f8a63"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Debit notes adjust purchase bills — the same attribution ledger, but the
    # existing credit_note_voucher_id column must become nullable (a debit-note
    # row has no credit note) and a sibling debit_note_voucher_id column is added.
    op.alter_column("bill_adjustments", "credit_note_voucher_id", existing_type=sa.String(36), nullable=True)
    op.add_column("bill_adjustments", sa.Column("debit_note_voucher_id", sa.String(36), nullable=True))
    op.create_index("ix_bill_adjustments_debit_note_voucher_id", "bill_adjustments", ["debit_note_voucher_id"])


def downgrade() -> None:
    op.drop_index("ix_bill_adjustments_debit_note_voucher_id", table_name="bill_adjustments")
    op.drop_column("bill_adjustments", "debit_note_voucher_id")
    op.alter_column("bill_adjustments", "credit_note_voucher_id", existing_type=sa.String(36), nullable=False)
