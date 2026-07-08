"""Create voucher_numbering table for personalized voucher number formats."""
from alembic import op
import sqlalchemy as sa

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "voucher_numbering",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("voucher_type", sa.String(30), nullable=False),
        sa.Column("prefix", sa.String(20), nullable=False),
        sa.Column("format_template", sa.String(50), nullable=False, server_default="{PREFIX}-{YEAR}-{SEQ}"),
        sa.Column("next_sequence", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("fy_start_month", sa.Integer(), nullable=False, server_default="4"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("company_id", "voucher_type", name="uq_voucher_numbering_company_type"),
    )
    op.create_index("ix_voucher_numbering_company_id", "voucher_numbering", ["company_id"])


def downgrade() -> None:
    op.drop_index("ix_voucher_numbering_company_id")
    op.drop_table("voucher_numbering")
