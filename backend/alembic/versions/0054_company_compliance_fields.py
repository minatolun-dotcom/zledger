"""Add Indian compliance fields to Company + compliance tables.

Revision ID: 0054
Revises: 0053
Create Date: 2026-07-18 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0054"
down_revision = "0053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Company compliance fields ──────────────────────────────────────────
    op.add_column("companies", sa.Column("tan", sa.String(10), nullable=True))
    op.add_column("companies", sa.Column("cin", sa.String(21), nullable=True))
    op.add_column(
        "companies",
        sa.Column(
            "constitution",
            sa.String(30),
            nullable=True,
            comment="proprietorship|partnership|llp|private_limited|public_limited|huf|trust|society|others",
        ),
    )
    op.add_column(
        "companies",
        sa.Column("income_tax_regime", sa.String(10), nullable=True, server_default="old"),
    )
    op.add_column(
        "companies",
        sa.Column("audit_required", sa.Boolean(), nullable=True, server_default=sa.false()),
    )

    # ── Compliance reference / run tables ───────────────────────────────────
    op.create_table(
        "indas_schedules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("system_code", sa.String(50), nullable=False),
        sa.Column("schedule_part", sa.String(10), nullable=False, comment="I|II for Schedule III"),
        sa.Column("schedule_heading", sa.String(120), nullable=False),
        sa.Column("sub_heading", sa.String(120), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("company_id", "system_code"),
    )

    op.create_table(
        "income_tax_regime_configs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("regime", sa.String(10), nullable=False, comment="old|new"),
        sa.Column("financial_year", sa.String(9), nullable=False, comment="e.g. 2025-26"),
        sa.Column("presumptive_section", sa.String(10), nullable=True, comment="44AD|44ADA|44AE|null"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("company_id", "regime", "financial_year"),
    )

    op.create_table(
        "icai_nce_templates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("template_name", sa.String(120), nullable=False),
        sa.Column("statement_type", sa.String(30), nullable=False, comment="balance_sheet|profit_loss|notes"),
        sa.Column("layout_json", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "compliance_reports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("report_type", sa.String(40), nullable=False, comment="income_tax|schedule_iii|indas_pl|icai_nce|gst_status"),
        sa.Column("regime", sa.String(10), nullable=True),
        sa.Column("financial_year", sa.String(9), nullable=True),
        sa.Column("format", sa.String(10), nullable=False, server_default="json", comment="json|pdf|xlsx"),
        sa.Column("data_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("compliance_reports")
    op.drop_table("icai_nce_templates")
    op.drop_table("income_tax_regime_configs")
    op.drop_table("indas_schedules")
    op.drop_column("companies", "audit_required")
    op.drop_column("companies", "income_tax_regime")
    op.drop_column("companies", "constitution")
    op.drop_column("companies", "cin")
    op.drop_column("companies", "tan")
