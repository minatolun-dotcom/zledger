"""add due_date to gst_returns

Revision ID: 0044
Revises: 0043
Create Date: 2026-07-09

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '0044'
down_revision = '0043'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('gst_returns', sa.Column('due_date', sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column('gst_returns', 'due_date')
