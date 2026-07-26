"""add item_type to stock_items

Revision ID: 0056_abc123_item_type
Revises: 70db5bf0315a
Create Date: 2026-07-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0056_abc123_item_type"
down_revision: Union[str, None] = "70db5bf0315a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stock_items",
        sa.Column("item_type", sa.String(10), nullable=False, server_default="goods"),
    )


def downgrade() -> None:
    op.drop_column("stock_items", "item_type")
