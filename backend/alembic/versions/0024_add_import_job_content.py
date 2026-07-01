"""Create import_jobs table and add content column

Revision ID: 0024
Revises: 0023
Create Date: 2026-07-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0024"
down_revision: Union[str, None] = "0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "import_jobs",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("import_type", sa.String(20), nullable=False),
        sa.Column("filename", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("summary", sa.JSON(), nullable=True),
        sa.Column("errors", sa.JSON(), nullable=True),
        sa.Column("created_counts", sa.JSON(), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("total_value", sa.Numeric(18, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("import_jobs")
