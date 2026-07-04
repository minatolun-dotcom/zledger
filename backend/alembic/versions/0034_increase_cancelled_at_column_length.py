"""increase cancelled_at column from VARCHAR(30) to VARCHAR(40)

Revision ID: 0034
Revises: 0033
Create Date: 2026-07-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0034'
down_revision: Union[str, None] = '0033'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'vouchers', 'cancelled_at',
        existing_type=sa.String(30),
        type_=sa.String(40),
    )


def downgrade() -> None:
    op.alter_column(
        'vouchers', 'cancelled_at',
        existing_type=sa.String(40),
        type_=sa.String(30),
    )
