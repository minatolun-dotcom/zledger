"""add BOM versioning

Revision ID: 0041
Revises: 0040
Create Date: 2026-07-08

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '0041'
down_revision = '0040'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add version column to bill_of_materials
    op.add_column('bill_of_materials', sa.Column('version', sa.Integer(), nullable=False, server_default='1'))
    
    # Create bom_versions table
    op.create_table(
        'bom_versions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('bom_id', sa.String(36), sa.ForeignKey('bill_of_materials.id', ondelete='CASCADE'), index=True, nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('finished_item_id', sa.String(36), nullable=False),
        sa.Column('output_qty', sa.Numeric(18, 3), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('lines_snapshot', sa.String(10000), nullable=False),
        sa.Column('changed_by', sa.String(36), nullable=True),
        sa.Column('change_notes', sa.String(512), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('bom_versions')
    op.drop_column('bill_of_materials', 'version')
