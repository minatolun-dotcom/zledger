"""add_recurring_template_logs

Revision ID: c9d41e2f8a63
Revises: a7c3e91b2d48
Create Date: 2026-08-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9d41e2f8a63'
down_revision: Union[str, None] = 'a7c3e91b2d48'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if not bind.dialect.has_table(bind, "recurring_template_logs"):
        op.create_table(
            "recurring_template_logs",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("template_id", sa.String(length=36), nullable=False),
            sa.Column("run_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("voucher_number", sa.String(length=50), nullable=True),
            sa.Column("error", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["template_id"], ["recurring_templates.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_recurring_template_logs_template_id", "recurring_template_logs", ["template_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.has_table(bind, "recurring_template_logs"):
        op.drop_index("ix_recurring_template_logs_template_id", table_name="recurring_template_logs")
        op.drop_table("recurring_template_logs")
