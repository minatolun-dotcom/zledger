"""initial: users, companies, company_members

Revision ID: 0001_init
Revises:
Create Date: 2026-06-27 00:00:00.000000

Tables for authentication and the multi-company tenancy model.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0001_init"
down_revision: str | None = None
branch_labels = None
depends_on = None


def _ts_columns() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_superadmin", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_ts_columns(),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "companies",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("legal_name", sa.String(length=255), nullable=True),
        sa.Column("gstin", sa.String(length=15), nullable=True),
        sa.Column("state_code", sa.String(length=2), nullable=True),
        sa.Column("pan", sa.String(length=10), nullable=True),
        sa.Column("address", sa.String(length=512), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="INR"),
        sa.Column("books_begin_from", sa.String(length=10), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_ts_columns(),
        sa.UniqueConstraint("gstin", name="uq_companies_gstin"),
    )
    op.create_index("ix_companies_gstin", "companies", ["gstin"], unique=True)

    op.create_table(
        "company_members",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "company_id",
            sa.String(length=36),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=32), nullable=False, server_default="accountant"),
        *_ts_columns(),
        sa.UniqueConstraint("company_id", "user_id", name="uq_company_user"),
    )
    op.create_index("ix_company_members_company_id", "company_members", ["company_id"])
    op.create_index("ix_company_members_user_id", "company_members", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_company_members_user_id", table_name="company_members")
    op.drop_index("ix_company_members_company_id", table_name="company_members")
    op.drop_table("company_members")
    op.drop_index("ix_companies_gstin", table_name="companies")
    op.drop_table("companies")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
