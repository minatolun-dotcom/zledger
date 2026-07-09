"""batch and serial tracking

Revision ID: 0046
Revises: 0045
Create Date: 2026-07-09

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '0046'
down_revision = '0045'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add tracking_mode to stock_items
    op.add_column('stock_items', sa.Column('tracking_mode', sa.String(20), nullable=False, server_default='none'))

    # Create batches table FIRST (before adding FK columns that reference it)
    op.create_table(
        'batches',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('company_id', sa.String(36), sa.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('stock_item_id', sa.String(36), sa.ForeignKey('stock_items.id', ondelete='RESTRICT'), nullable=False, index=True),
        sa.Column('batch_number', sa.String(100), nullable=False),
        sa.Column('manufacturing_date', sa.String(10), nullable=True),
        sa.Column('expiry_date', sa.String(10), nullable=True),
        sa.Column('quantity', sa.Numeric(18, 3), nullable=False, server_default='0'),
        sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        sa.UniqueConstraint('company_id', 'stock_item_id', 'batch_number', name='uq_batch_company_item_number'),
    )

    # Create batch_ledger table
    op.create_table(
        'batch_ledger',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('company_id', sa.String(36), sa.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('batch_id', sa.String(36), sa.ForeignKey('batches.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('stock_entry_id', sa.String(36), sa.ForeignKey('stock_entries.id', ondelete='SET NULL'), nullable=True),
        sa.Column('production_order_id', sa.String(36), sa.ForeignKey('production_orders.id', ondelete='SET NULL'), nullable=True),
        sa.Column('entry_type', sa.String(10), nullable=False),
        sa.Column('quantity', sa.Numeric(18, 3), nullable=False),
        sa.Column('rate', sa.Numeric(18, 2), nullable=False, server_default='0'),
        sa.Column('reference', sa.String(255), nullable=True),
    )

    # Now add batch_id to stock_entries (batches table exists now)
    op.add_column('stock_entries', sa.Column('batch_id', sa.String(36), sa.ForeignKey('batches.id', ondelete='SET NULL'), nullable=True))

    # Add batch_id to production_order_lines
    op.add_column('production_order_lines', sa.Column('batch_id', sa.String(36), sa.ForeignKey('batches.id', ondelete='SET NULL'), nullable=True))


def downgrade() -> None:
    op.drop_column('production_order_lines', 'batch_id')
    op.drop_column('stock_entries', 'batch_id')
    op.drop_table('batch_ledger')
    op.drop_table('batches')
    op.drop_column('stock_items', 'tracking_mode')
