"""add_asset_disposal_columns

Revision ID: 9e9dd2e46a7b
Revises: 5e08b2775121
Create Date: 2026-07-27 11:35:41.102131

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9e9dd2e46a7b'
down_revision: Union[str, None] = '5e08b2775121'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('asset_register', sa.Column('asset_status', sa.String(length=10), server_default='active', nullable=False))
    op.add_column('asset_register', sa.Column('disposal_date', sa.String(length=10), nullable=True))
    op.add_column('asset_register', sa.Column('disposal_amount', sa.Float(), nullable=True))
    op.add_column('asset_register', sa.Column('disposal_pnl', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('asset_register', 'disposal_pnl')
    op.drop_column('asset_register', 'disposal_amount')
    op.drop_column('asset_register', 'disposal_date')
    op.drop_column('asset_register', 'asset_status')
