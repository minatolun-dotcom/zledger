"""Inventory models: StockGroup, StockItem, StockEntry.

Stock Items belong to Stock Groups. Stock Entries track inward/outward movements.
Every monetary column uses Numeric(18,2) — no floats.
"""
from __future__ import annotations

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class StockGroup(UUIDPk, TimestampMixin, Base):
    """Category for stock items (e.g. Raw Materials, Finished Goods)."""
    __tablename__ = "stock_groups"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (UniqueConstraint("company_id", "name", name="uq_stock_group_company_name"),)


class StockItem(UUIDPk, TimestampMixin, Base):
    """Individual stock item tracked in inventory."""
    __tablename__ = "stock_items"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    stock_group_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("stock_groups.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hsn_sac_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    unit_of_measure: Mapped[str] = mapped_column(String(20), nullable=False, default="Nos")
    opening_qty: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False, default=0)
    opening_rate: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    # valuation: fifo | weighted_avg
    valuation_method: Mapped[str] = mapped_column(String(20), nullable=False, default="weighted_avg")
    gst_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (UniqueConstraint("company_id", "name", name="uq_stock_item_company_name"),)


class StockEntry(UUIDPk, TimestampMixin, Base):
    """Inward or outward stock movement."""
    __tablename__ = "stock_entries"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    stock_item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("stock_items.id", ondelete="RESTRICT"), nullable=False
    )
    # inward | outward
    entry_type: Mapped[str] = mapped_column(String(10), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    entry_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    narration: Mapped[str | None] = mapped_column(String(512), nullable=True)
    voucher_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True
    )


class StockBalance(UUIDPk, TimestampMixin, Base):
    """Running balance per stock item — maintained on each stock entry/posting."""
    __tablename__ = "stock_balances"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    stock_item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("stock_items.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    quantity: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False, default=0)
    avg_rate: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    total_value: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    last_entry_date: Mapped[str | None] = mapped_column(String(10), nullable=True)

    __table_args__ = (UniqueConstraint("company_id", "stock_item_id", name="uq_stock_balance_company_item"),)
