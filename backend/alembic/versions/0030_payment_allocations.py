"""Add due_date to vouchers and create payment_allocations table

Revision ID: 0030
Revises: 0029
Create Date: 2026-07-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0030"
down_revision: Union[str, None] = "0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add due_date to vouchers
    op.add_column("vouchers", sa.Column("due_date", sa.String(10), nullable=True))

    # Create payment_allocations table
    op.create_table(
        "payment_allocations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("invoice_voucher_id", sa.String(36), sa.ForeignKey("vouchers.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("payment_voucher_id", sa.String(36), sa.ForeignKey("vouchers.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("allocation_date", sa.String(10), nullable=False),
        sa.Column("remarks", sa.String(500), nullable=True),
    )
    op.create_index("ix_payment_alloc_invoice", "payment_allocations", ["invoice_voucher_id"])
    op.create_index("ix_payment_alloc_payment", "payment_allocations", ["payment_voucher_id"])


def downgrade() -> None:
    op.drop_table("payment_allocations")
    op.drop_column("vouchers", "due_date")
