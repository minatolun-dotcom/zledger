"""add sub_bom_id to bom_lines

Revision ID: 23d7a3edd4cf
Revises: 0038
Create Date: 2026-07-08

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '23d7a3edd4cf'
down_revision = '0038'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('bom_lines', sa.Column('sub_bom_id', sa.String(36), sa.ForeignKey('bill_of_materials.id', ondelete='SET NULL'), nullable=True))


def downgrade() -> None:
    op.drop_column('bom_lines', 'sub_bom_id')
