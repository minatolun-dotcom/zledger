"""Change import_jobs.content from Text to LargeBinary for Excel support

Revision ID: 0026
Revises: 0025
Create Date: 2026-07-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0026"
down_revision: Union[str, None] = "0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "import_jobs",
        "content",
        type_=sa.LargeBinary(),
        existing_type=sa.Text(),
        postgresql_using="content::bytea",
    )


def downgrade() -> None:
    op.alter_column(
        "import_jobs",
        "content",
        type_=sa.Text(),
        existing_type=sa.LargeBinary(),
        postgresql_using="content::text",
    )
