"""Add logo_filename to companies

Revision ID: 0032
Revises: 0031
Create Date: 2026-07-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0032"
down_revision: Union[str, None] = "0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("logo_filename", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("companies", "logo_filename")
