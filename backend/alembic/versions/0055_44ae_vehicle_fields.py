"""add vehicle_count and months_used for 44AE

Revision ID: 70db5bf0315a
Revises: 0054
Create Date: 2026-07-21 21:08:06.646018

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '70db5bf0315a'
down_revision: Union[str, None] = '0054'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('income_tax_regime_configs', sa.Column('vehicle_count', sa.Integer(), nullable=True))
    op.add_column('income_tax_regime_configs', sa.Column('months_used', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('income_tax_regime_configs', 'months_used')
    op.drop_column('income_tax_regime_configs', 'vehicle_count')
