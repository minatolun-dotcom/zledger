"""add budget tables (idempotent)

The Budget/BudgetPeriod/BudgetAllocation/BudgetAlert models exist but no
migration ever created their tables — a schema drift that crashes ledger
deletion on fresh installs (the ORM cascade SELECTs budget_allocations) and
leaves the tables missing anywhere migrations rebuilt the schema. Existing
deployments already have the tables, so each create is guarded by an
existence check and is a no-op there.

Revision ID: f7867905e7e7
Revises: c7d8e3f4b5a6
Create Date: 2026-08-14 11:48:55.979256

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f7867905e7e7'
down_revision: Union[str, None] = 'c7d8e3f4b5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    return sa.inspect(bind).has_table(name)


def _create_budgets() -> None:
    op.create_table('budgets',
    sa.Column('company_id', sa.String(length=36), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('financial_year', sa.String(length=20), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=False),
    sa.Column('description', sa.String(length=512), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('budget_type', sa.String(length=50), nullable=False),
    sa.Column('approval_status', sa.String(length=20), nullable=False),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('approved_by', sa.String(length=36), nullable=True),
    sa.Column('approval_date', sa.Date(), nullable=True),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('company_id', 'financial_year', name='uq_budget_company_year'),
    sa.UniqueConstraint('company_id', 'name', name='uq_budget_company_name')
    )
    op.create_index(op.f('ix_budgets_company_id'), 'budgets', ['company_id'], unique=False)


def _create_budget_periods() -> None:
    op.create_table('budget_periods',
    sa.Column('budget_id', sa.String(length=36), nullable=False),
    sa.Column('name', sa.String(length=50), nullable=False),
    sa.Column('period_type', sa.String(length=20), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=False),
    sa.Column('budget_amount', sa.Float(), nullable=False),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['budget_id'], ['budgets.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_budget_periods_budget_id'), 'budget_periods', ['budget_id'], unique=False)


def _create_budget_alerts() -> None:
    op.create_table('budget_alerts',
    sa.Column('budget_id', sa.String(length=36), nullable=False),
    sa.Column('ledger_id', sa.String(length=36), nullable=True),
    sa.Column('cost_centre_id', sa.String(length=36), nullable=True),
    sa.Column('alert_type', sa.String(length=50), nullable=False),
    sa.Column('threshold_percentage', sa.Float(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['budget_id'], ['budgets.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['cost_centre_id'], ['cost_centres.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['ledger_id'], ['ledgers.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_budget_alerts_budget_id'), 'budget_alerts', ['budget_id'], unique=False)


def _create_budget_allocations() -> None:
    op.create_table('budget_allocations',
    sa.Column('budget_id', sa.String(length=36), nullable=False),
    sa.Column('period_id', sa.String(length=36), nullable=False),
    sa.Column('ledger_id', sa.String(length=36), nullable=True),
    sa.Column('cost_centre_id', sa.String(length=36), nullable=True),
    sa.Column('group_type', sa.String(length=50), nullable=True),
    sa.Column('group_id', sa.String(length=36), nullable=True),
    sa.Column('budget_amount', sa.Float(), nullable=False),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['budget_id'], ['budgets.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['cost_centre_id'], ['cost_centres.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['ledger_id'], ['ledgers.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['period_id'], ['budget_periods.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_budget_allocations_budget_id'), 'budget_allocations', ['budget_id'], unique=False)
    op.create_index(op.f('ix_budget_allocations_period_id'), 'budget_allocations', ['period_id'], unique=False)


def upgrade() -> None:
    if not _has_table('budgets'):
        _create_budgets()
    if not _has_table('budget_periods'):
        _create_budget_periods()
    if not _has_table('budget_alerts'):
        _create_budget_alerts()
    if not _has_table('budget_allocations'):
        _create_budget_allocations()


def downgrade() -> None:
    if _has_table('budget_allocations'):
        op.drop_table('budget_allocations')
    if _has_table('budget_alerts'):
        op.drop_table('budget_alerts')
    if _has_table('budget_periods'):
        op.drop_table('budget_periods')
    if _has_table('budgets'):
        op.drop_table('budgets')
