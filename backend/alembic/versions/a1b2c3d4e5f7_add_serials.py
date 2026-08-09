"""add serials table for serial-tracked items

Revision ID: a1b2c3d4e5f7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-09

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = 'a1b2c3d4e5f7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'serials',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('company_id', sa.String(36), sa.ForeignKey('companies.id', ondelete='CASCADE'), index=True, nullable=False),
        sa.Column('stock_item_id', sa.String(36), sa.ForeignKey('stock_items.id', ondelete='RESTRICT'), index=True, nullable=False),
        sa.Column('serial_number', sa.String(100), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='in_stock'),
        sa.Column('stock_entry_id', sa.String(36), sa.ForeignKey('stock_entries.id', ondelete='SET NULL'), nullable=True),
        sa.Column('production_order_id', sa.String(36), sa.ForeignKey('production_orders.id', ondelete='SET NULL'), index=True, nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('company_id', 'stock_item_id', 'serial_number', name='uq_serial_company_item_number'),
    )


def downgrade() -> None:
    op.drop_table('serials')
