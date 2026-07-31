"""Create bill_references table

Revision ID: a1b2c3d4e5f6
Revises: 5853d22c1af4
Create Date: 2026-07-31

The BillReference model (bill-wise accounting) was added with its service
logic but the table was never migrated — every Sales/Purchase voucher save
failed at flush with `relation "bill_references" does not exist`.
"""
import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "5853d22c1af4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bill_references",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "company_id",
            sa.String(length=36),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "invoice_voucher_id",
            sa.String(length=36),
            sa.ForeignKey("vouchers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("reference_type", sa.String(length=20), nullable=False, server_default="new_ref"),
        sa.Column("bill_number", sa.String(length=50), nullable=False),
        sa.Column("bill_date", sa.String(length=10), nullable=False),
        sa.Column("due_date", sa.String(length=10), nullable=True),
        sa.Column("original_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("adjusted_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("paid_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("outstanding_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column(
            "party_id",
            sa.String(length=36),
            sa.ForeignKey("parties.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("is_advance", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("idx_bill_refs_company_party", "bill_references", ["company_id", "party_id"])
    op.create_index("idx_bill_refs_company_status", "bill_references", ["company_id", "status"])
    op.create_index(
        "idx_bill_refs_company_outstanding",
        "bill_references",
        ["company_id", "status", "outstanding_amount"],
    )
    op.create_index("ix_bill_references_company_id", "bill_references", ["company_id"])
    op.create_index("ix_bill_references_invoice_voucher_id", "bill_references", ["invoice_voucher_id"])
    op.create_index("ix_bill_references_party_id", "bill_references", ["party_id"])


def downgrade() -> None:
    op.drop_index("ix_bill_references_party_id", table_name="bill_references")
    op.drop_index("ix_bill_references_invoice_voucher_id", table_name="bill_references")
    op.drop_index("ix_bill_references_company_id", table_name="bill_references")
    op.drop_index("idx_bill_refs_company_outstanding", table_name="bill_references")
    op.drop_index("idx_bill_refs_company_status", table_name="bill_references")
    op.drop_index("idx_bill_refs_company_party", table_name="bill_references")
    op.drop_table("bill_references")
