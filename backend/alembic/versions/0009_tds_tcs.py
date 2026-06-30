"""TDS/TCS: tds_tcs_sections, tds_tcs_entries, and tds_tcs_returns tables.

Revision ID: 0009_tds_tcs
Revises: 0008_bank_reconciliation
Create Date: 2026-06-29 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision: str = "0009_tds_tcs"
down_revision: str = "0008_bank_reconciliation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tds_tcs_sections",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("section_code", sa.String(10), nullable=False),
        sa.Column("section_name", sa.String(255), nullable=False),
        sa.Column("tds_tcs_type", sa.String(3), nullable=False),  # tds | tcs
        sa.Column("rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("threshold_limit", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", "section_code", "tds_tcs_type", name="uq_tds_tcs_section"),
    )
    op.create_index("ix_tds_tcs_sections_company_id", "tds_tcs_sections", ["company_id"])

    op.create_table(
        "tds_tcs_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("voucher_id", sa.String(36), sa.ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("party_id", sa.String(36), sa.ForeignKey("parties.id", ondelete="SET NULL"), nullable=True),
        sa.Column("section_id", sa.String(36), sa.ForeignKey("tds_tcs_sections.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("tds_tcs_type", sa.String(3), nullable=False),
        sa.Column("base_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("deducted_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("entry_date", sa.String(10), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("challan_number", sa.String(50), nullable=True),
        sa.Column("deposition_date", sa.String(10), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_tds_tcs_entries_company_id", "tds_tcs_entries", ["company_id"])
    op.create_index("ix_tds_tcs_entries_voucher_id", "tds_tcs_entries", ["voucher_id"])
    op.create_index("ix_tds_tcs_company_type", "tds_tcs_entries", ["company_id", "tds_tcs_type"])
    op.create_index("ix_tds_tcs_company_status", "tds_tcs_entries", ["company_id", "status"])

    op.create_table(
        "tds_tcs_returns",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("return_type", sa.String(3), nullable=False),  # tds | tcs
        sa.Column("quarter", sa.String(2), nullable=False),
        sa.Column("financial_year", sa.String(9), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("total_entries", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("total_tax", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("filing_date", sa.String(10), nullable=True),
        sa.Column("ack_number", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint(
            "company_id", "return_type", "quarter", "financial_year",
            name="uq_tds_tcs_return",
        ),
    )
    op.create_index("ix_tds_tcs_returns_company_id", "tds_tcs_returns", ["company_id"])


def downgrade() -> None:
    op.drop_index("ix_tds_tcs_returns_company_id", table_name="tds_tcs_returns")
    op.drop_table("tds_tcs_returns")

    op.drop_index("ix_tds_tcs_company_status", table_name="tds_tcs_entries")
    op.drop_index("ix_tds_tcs_company_type", table_name="tds_tcs_entries")
    op.drop_index("ix_tds_tcs_entries_voucher_id", table_name="tds_tcs_entries")
    op.drop_index("ix_tds_tcs_entries_company_id", table_name="tds_tcs_entries")
    op.drop_table("tds_tcs_entries")

    op.drop_index("ix_tds_tcs_sections_company_id", table_name="tds_tcs_sections")
    op.drop_table("tds_tcs_sections")
