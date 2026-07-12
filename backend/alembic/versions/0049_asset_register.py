"""Add fixed asset register tables (categories + register).

Revision ID: 0049_asset_register
Revises: 0048_add_reorder_level
Create Date: 2026-07-12 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0049"
down_revision = "0048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "asset_categories",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "company_id",
            sa.String(36),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("depreciation_method", sa.String(10), nullable=False, server_default="wdv"),
        sa.Column("rate_pct", sa.Float(), nullable=False, server_default="0"),
        sa.Column("useful_life_years", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "asset_register",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "company_id",
            sa.String(36),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "category_id",
            sa.String(36),
            sa.ForeignKey("asset_categories.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("asset_code", sa.String(50), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("purchase_date", sa.String(10), nullable=False),
        sa.Column("cost", sa.Float(), nullable=False, server_default="0"),
        sa.Column("salvage_value", sa.Float(), nullable=False, server_default="0"),
        sa.Column("accumulated_depreciation", sa.Float(), nullable=False, server_default="0"),
        sa.Column("wdv", sa.Float(), nullable=False, server_default="0"),
        sa.Column("put_to_use_date", sa.String(10), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_depreciated_fy_id", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("company_id", "asset_code", name="uq_asset_company_code"),
    )


def downgrade() -> None:
    op.drop_table("asset_register")
    op.drop_table("asset_categories")
