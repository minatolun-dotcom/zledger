"""add voucher version and reversal link

Revision ID: 5853d22c1af4
Revises: 9e9dd2e46a7c
Create Date: 2026-07-31 09:30:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '5853d22c1af4'
down_revision = 'e8513d9ca506'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create immutable voucher version snapshots + reversal links.

    Recreated from the Phase 2 VoucherVersion model — the original file was
    lost before its upgrade ever ran against production (the DB was stamped
    to this revision without applying the schema changes).
    """
    op.create_table(
        "voucher_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "voucher_id",
            sa.String(36),
            sa.ForeignKey("vouchers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column(
            "modified_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("change_type", sa.String(20), nullable=False),
        sa.Column("change_reason", sa.Text(), nullable=True),
        sa.Column("voucher_snapshot", sa.JSON(), nullable=False),
        sa.Column("lines_snapshot", sa.JSON(), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
    )
    op.create_index(
        "ix_voucher_versions_voucher_id", "voucher_versions", ["voucher_id"]
    )
    op.create_index(
        "ix_voucher_versions_lookup", "voucher_versions", ["voucher_id", "version_number"]
    )
    op.create_index(
        "ix_voucher_versions_created", "voucher_versions", ["created_at"]
    )

    op.add_column(
        "vouchers",
        sa.Column(
            "original_voucher_id",
            sa.String(36),
            sa.ForeignKey("vouchers.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "vouchers",
        sa.Column(
            "reversed_by_voucher_id",
            sa.String(36),
            sa.ForeignKey("vouchers.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("vouchers", "reversed_by_voucher_id")
    op.drop_column("vouchers", "original_voucher_id")
    op.drop_index("ix_voucher_versions_created", table_name="voucher_versions")
    op.drop_index("ix_voucher_versions_lookup", table_name="voucher_versions")
    op.drop_index("ix_voucher_versions_voucher_id", table_name="voucher_versions")
    op.drop_table("voucher_versions")
