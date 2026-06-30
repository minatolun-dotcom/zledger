"""0002: chart of accounts — financial_years, account_groups, ledgers, parties

Revision ID: 0002_coa
Revises: 0001_init
Create Date: 2026-06-28 00:00:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0002_coa"
down_revision: str = "0001_init"
branch_labels = None
depends_on = None


def _ts() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def upgrade() -> None:
    # --- financial_years ---
    op.create_table(
        "financial_years",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(20), nullable=False),
        sa.Column("start_date", sa.String(10), nullable=False),
        sa.Column("end_date", sa.String(10), nullable=False),
        sa.Column("is_closed", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_ts(),
        sa.UniqueConstraint("company_id", "name", name="uq_fy_company_name"),
    )

    # --- account_groups (self-referential) ---
    op.create_table(
        "account_groups",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("parent_id", sa.String(36), sa.ForeignKey("account_groups.id", ondelete="SET NULL"), nullable=True),
        sa.Column("group_type", sa.String(20), nullable=False, server_default="sub"),
        sa.Column("nature", sa.String(20), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_ts(),
        sa.UniqueConstraint("company_id", "name", "parent_id", name="uq_ag_group_company"),
    )

    # --- ledgers ---
    op.create_table(
        "ledgers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("group_id", sa.String(36), sa.ForeignKey("account_groups.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("opening_balance", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("opening_balance_type", sa.String(2), nullable=False, server_default="Dr"),
        sa.Column("gstin", sa.String(15), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("alias", sa.String(255), nullable=True),
        *_ts(),
        sa.UniqueConstraint("company_id", "name", name="uq_ledger_company_name"),
    )

    # --- parties ---
    op.create_table(
        "parties",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("party_type", sa.String(20), nullable=False),
        sa.Column("ledger_id", sa.String(36), sa.ForeignKey("ledgers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("gstin", sa.String(15), nullable=True),
        sa.Column("state_code", sa.String(2), nullable=True),
        sa.Column("pan", sa.String(10), nullable=True),
        sa.Column("address", sa.String(512), nullable=True),
        sa.Column("contact_person", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_ts(),
        sa.UniqueConstraint("company_id", "name", name="uq_party_company_name"),
    )


def downgrade() -> None:
    op.drop_table("parties")
    op.drop_table("ledgers")
    op.drop_table("account_groups")
    op.drop_table("financial_years")
