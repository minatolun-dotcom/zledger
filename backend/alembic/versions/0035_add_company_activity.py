"""add company_activity table for concurrent user visibility

Revision ID: 0035
Revises: 0034
Create Date: 2026-07-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0035'
down_revision: Union[str, None] = '0034'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'company_activity',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('company_id', sa.String(36), sa.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('current_page', sa.String(255), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
    )
    op.create_index('ix_company_activity_lookup', 'company_activity', ['company_id', 'last_seen_at'])


def downgrade() -> None:
    op.drop_index('ix_company_activity_lookup', table_name='company_activity')
    op.drop_table('company_activity')
