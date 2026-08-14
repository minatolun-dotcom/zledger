"""Add credit_limit and maintain_bill_wise to parties

Tally-prime party master: credit limit + the toggle that controls whether
sales/purchase vouchers against this party create bill-wise references.

Revision ID: e4b7c1a2d9f0
Revises: f7867905e7e7
Create Date: 2026-08-14
"""
from alembic import op
import sqlalchemy as sa

revision = "e4b7c1a2d9f0"
down_revision = "f7867905e7e7"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return column in [c["name"] for c in insp.get_columns(table)]


def upgrade() -> None:
    if not _has_column("parties", "credit_limit"):
        op.add_column("parties", sa.Column("credit_limit", sa.Numeric(18, 2), nullable=True))
    if not _has_column("parties", "maintain_bill_wise"):
        op.add_column(
            "parties",
            sa.Column("maintain_bill_wise", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        )


def downgrade() -> None:
    if _has_column("parties", "credit_limit"):
        op.drop_column("parties", "credit_limit")
    if _has_column("parties", "maintain_bill_wise"):
        op.drop_column("parties", "maintain_bill_wise")
