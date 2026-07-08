"""add manufacturing cost breakdown, scheduling, in_progress status

Revision ID: 0042
Revises: 0041
Create Date: 2026-07-08

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '0042'
down_revision = '0041'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add cost breakdown columns
    op.add_column('production_orders', sa.Column('material_cost', sa.Numeric(18, 2), nullable=False, server_default='0'))
    op.add_column('production_orders', sa.Column('labor_cost', sa.Numeric(18, 2), nullable=False, server_default='0'))
    op.add_column('production_orders', sa.Column('overhead_cost', sa.Numeric(18, 2), nullable=False, server_default='0'))
    
    # Add scheduling columns
    op.add_column('production_orders', sa.Column('planned_start_date', sa.String(10), nullable=True))
    op.add_column('production_orders', sa.Column('planned_end_date', sa.String(10), nullable=True))
    op.add_column('production_orders', sa.Column('actual_start_date', sa.String(10), nullable=True))
    op.add_column('production_orders', sa.Column('actual_end_date', sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column('production_orders', 'actual_end_date')
    op.drop_column('production_orders', 'actual_start_date')
    op.drop_column('production_orders', 'planned_end_date')
    op.drop_column('production_orders', 'planned_start_date')
    op.drop_column('production_orders', 'overhead_cost')
    op.drop_column('production_orders', 'labor_cost')
    op.drop_column('production_orders', 'material_cost')
