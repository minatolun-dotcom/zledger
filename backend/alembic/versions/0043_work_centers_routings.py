"""add work centers and routings

Revision ID: 0043
Revises: 0042
Create Date: 2026-07-08

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '0043'
down_revision = '0042'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create work_centers table
    op.create_table(
        'work_centers',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('company_id', sa.String(36), sa.ForeignKey('companies.id', ondelete='CASCADE'), index=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('department', sa.String(255), nullable=True),
        sa.Column('capacity', sa.Numeric(18, 2), nullable=False, server_default='1'),
        sa.Column('capacity_unit', sa.String(50), nullable=True),
        sa.Column('hourly_rate', sa.Numeric(18, 2), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('company_id', 'name', name='uq_work_center_company_name'),
    )

    # Create routings table
    op.create_table(
        'routings',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('company_id', sa.String(36), sa.ForeignKey('companies.id', ondelete='CASCADE'), index=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('finished_item_id', sa.String(36), sa.ForeignKey('stock_items.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('company_id', 'name', name='uq_routing_company_name'),
    )

    # Create routing_operations table
    op.create_table(
        'routing_operations',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('routing_id', sa.String(36), sa.ForeignKey('routings.id', ondelete='CASCADE'), index=True, nullable=False),
        sa.Column('step_number', sa.Integer(), nullable=False),
        sa.Column('work_center_id', sa.String(36), sa.ForeignKey('work_centers.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('description', sa.String(512), nullable=True),
        sa.Column('setup_time_minutes', sa.Numeric(18, 2), nullable=False, server_default='0'),
        sa.Column('run_time_per_unit_minutes', sa.Numeric(18, 2), nullable=False, server_default='0'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )

    # Add routing_id to bill_of_materials
    op.add_column('bill_of_materials', sa.Column('routing_id', sa.String(36), sa.ForeignKey('routings.id', ondelete='SET NULL'), nullable=True))


def downgrade() -> None:
    op.drop_column('bill_of_materials', 'routing_id')
    op.drop_table('routing_operations')
    op.drop_table('routings')
    op.drop_table('work_centers')
