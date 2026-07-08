"""create production_order_lines table

Revision ID: 0040
Revises: 23d7a3edd4cf
Create Date: 2026-07-08

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '0040'
down_revision = '23d7a3edd4cf'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'production_order_lines',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('production_order_id', sa.String(36), sa.ForeignKey('production_orders.id', ondelete='CASCADE'), index=True, nullable=False),
        sa.Column('stock_item_id', sa.String(36), sa.ForeignKey('stock_items.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('planned_qty', sa.Numeric(18, 3), nullable=False),
        sa.Column('actual_qty', sa.Numeric(18, 3), nullable=False, server_default='0'),
        sa.Column('rate', sa.Numeric(18, 2), nullable=False, server_default='0'),
        sa.Column('wastage_pct', sa.Numeric(8, 2), nullable=False, server_default='0'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('production_order_lines')
