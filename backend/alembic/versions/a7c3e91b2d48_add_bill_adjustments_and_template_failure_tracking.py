"""add_bill_adjustments_and_template_failure_tracking

Revision ID: a7c3e91b2d48
Revises: e8513d9ca506
Create Date: 2026-08-13 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c3e91b2d48'
down_revision: Union[str, None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Attribution ledger for credit-note → bill-reference adjustments, so a
    # cancelled credit note can restore the invoice's outstanding.
    bind = op.get_bind()
    if not bind.dialect.has_table(bind, "bill_adjustments"):
        op.create_table(
            "bill_adjustments",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("company_id", sa.String(length=36), nullable=False),
            sa.Column("bill_reference_id", sa.String(length=36), nullable=False),
            sa.Column("credit_note_voucher_id", sa.String(length=36), nullable=False),
            sa.Column("amount", sa.Numeric(18, 2), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["bill_reference_id"], ["bill_references.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["credit_note_voucher_id"], ["vouchers.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_bill_adjustments_company_id", "bill_adjustments", ["company_id"])
        op.create_index("ix_bill_adjustments_bill_reference_id", "bill_adjustments", ["bill_reference_id"])
        op.create_index("ix_bill_adjustments_credit_note_voucher_id", "bill_adjustments", ["credit_note_voucher_id"])

    # Recurring-template failure tracking: after 3 consecutive failures the
    # cron auto-pauses the template instead of retrying silently forever.
    bind = op.get_bind()
    if bind.dialect.has_table(bind, "recurring_templates"):
        cols = [c["name"] for c in bind.dialect.get_columns(bind, "recurring_templates", None)]
        if "consecutive_failures" not in cols:
            op.add_column(
                "recurring_templates",
                sa.Column("consecutive_failures", sa.Integer(), server_default="0", nullable=False),
            )
        if "last_error" not in cols:
            op.add_column(
                "recurring_templates",
                sa.Column("last_error", sa.String(length=500), nullable=True),
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.has_table(bind, "bill_adjustments"):
        op.drop_index("ix_bill_adjustments_credit_note_voucher_id", table_name="bill_adjustments")
        op.drop_index("ix_bill_adjustments_bill_reference_id", table_name="bill_adjustments")
        op.drop_index("ix_bill_adjustments_company_id", table_name="bill_adjustments")
        op.drop_table("bill_adjustments")
    if bind.dialect.has_table(bind, "recurring_templates"):
        op.drop_column("recurring_templates", "last_error")
        op.drop_column("recurring_templates", "consecutive_failures")
