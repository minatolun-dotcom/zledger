"""add status and approval_status to vouchers

Revision ID: 0045
Revises: 0044
Create Date: 2026-07-09

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '0045'
down_revision = '0044'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('vouchers', sa.Column('status', sa.String(20), nullable=False, server_default='posted'))
    op.add_column('vouchers', sa.Column('approval_status', sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column('vouchers', 'approval_status')
    op.drop_column('vouchers', 'status')
