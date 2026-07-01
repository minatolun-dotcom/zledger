"""Add created_details column to import_jobs for detailed preview/undo

Revision ID: 0025
Revises: 0024
Create Date: 2026-07-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0025"
down_revision: Union[str, None] = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("import_jobs", sa.Column("created_details", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("import_jobs", "created_details")
