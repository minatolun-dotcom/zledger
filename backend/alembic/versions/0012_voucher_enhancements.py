"""Voucher enhancements: party, item lines, totals, status.

Revision ID: 0012_voucher_enhancements
Revises: 0011_stock
Create Date: 2026-06-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0012_voucher_enhancements"
down_revision = "0011_stock"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Voucher table: add new columns ───────────────────────────────────
    op.add_column("vouchers", sa.Column("party_id", sa.String(36), sa.ForeignKey("parties.id", ondelete="SET NULL"), nullable=True))
    op.add_column("vouchers", sa.Column("subtotal", sa.Numeric(18, 2), nullable=False, server_default="0"))
    op.add_column("vouchers", sa.Column("discount_total", sa.Numeric(18, 2), nullable=False, server_default="0"))
    op.add_column("vouchers", sa.Column("tax_total", sa.Numeric(18, 2), nullable=False, server_default="0"))
    op.add_column("vouchers", sa.Column("grand_total", sa.Numeric(18, 2), nullable=False, server_default="0"))
    op.add_column("vouchers", sa.Column("status", sa.String(20), nullable=False, server_default="draft"))

    # Migrate is_posted → status
    op.execute("UPDATE vouchers SET status = 'posted' WHERE is_posted = true")
    op.execute("UPDATE vouchers SET status = 'draft' WHERE is_posted = false")

    # Drop old is_posted column
    op.drop_column("vouchers", "is_posted")

    # ── VoucherLine table: add new columns ───────────────────────────────
    op.add_column("voucher_lines", sa.Column("stock_item_id", sa.String(36), sa.ForeignKey("stock_items.id", ondelete="SET NULL"), nullable=True))
    op.add_column("voucher_lines", sa.Column("quantity", sa.Numeric(18, 3), nullable=True))
    op.add_column("voucher_lines", sa.Column("rate", sa.Numeric(18, 2), nullable=True))
    op.add_column("voucher_lines", sa.Column("discount_pct", sa.Numeric(5, 2), nullable=False, server_default="0"))
    op.add_column("voucher_lines", sa.Column("discount_amount", sa.Numeric(18, 2), nullable=False, server_default="0"))
    op.add_column("voucher_lines", sa.Column("line_total", sa.Numeric(18, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("voucher_lines", "line_total")
    op.drop_column("voucher_lines", "discount_amount")
    op.drop_column("voucher_lines", "discount_pct")
    op.drop_column("voucher_lines", "rate")
    op.drop_column("voucher_lines", "quantity")
    op.drop_column("voucher_lines", "stock_item_id")

    op.add_column("vouchers", sa.Column("is_posted", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.execute("UPDATE vouchers SET is_posted = true WHERE status = 'posted'")
    op.execute("UPDATE vouchers SET is_posted = false WHERE status != 'posted'")

    op.drop_column("vouchers", "status")
    op.drop_column("vouchers", "grand_total")
    op.drop_column("vouchers", "tax_total")
    op.drop_column("vouchers", "discount_total")
    op.drop_column("vouchers", "subtotal")
    op.drop_column("vouchers", "party_id")
