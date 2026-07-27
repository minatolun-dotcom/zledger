"""add_tds_tcs_certificate_model

Revision ID: 5e08b2775121
Revises: 2dfd7e70dfb6
Create Date: 2025-07-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '5e08b2775121'
down_revision = '2dfd7e70dfb6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'tds_tcs_certificates',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), onupdate=sa.text('now()'), nullable=False),
        sa.Column('company_id', sa.String(36), nullable=False),
        sa.Column('period_type', sa.String(10), nullable=False),
        sa.Column('period_value', sa.String(10), nullable=False),
        sa.Column('form_type', sa.String(10), nullable=False),
        sa.Column('party_id', sa.String(36), nullable=True),
        sa.Column('section_id', sa.String(36), nullable=False),
        sa.Column('total_base_amount', sa.Numeric(18, 2), nullable=False, server_default='0'),
        sa.Column('total_deducted_amount', sa.Numeric(18, 2), nullable=False, server_default='0'),
        sa.Column('certificate_number', sa.String(50), nullable=True),
        sa.Column('generated_date', sa.String(10), nullable=False),
        sa.Column('is_issued', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('issued_date', sa.String(10), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['party_id'], ['parties.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['section_id'], ['tds_tcs_sections.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_tds_tcs_cert_company_period', 'tds_tcs_certificates', ['company_id', 'period_type', 'period_value'])


def downgrade() -> None:
    op.drop_index('ix_tds_tcs_cert_company_period', table_name='tds_tcs_certificates')
    op.drop_table('tds_tcs_certificates')
