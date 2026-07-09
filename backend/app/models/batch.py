"""Batch and Serial tracking models.

Batch tracks groups of identical items (e.g., a production lot).
Serial tracks individual items by unique serial number.
BatchLedger records every movement of a batch through the system.
"""
from __future__ import annotations

from sqlalchemy import ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class Batch(UUIDPk, TimestampMixin, Base):
    """A batch (lot) of a stock item, optionally with manufacturing/expiry dates."""
    __tablename__ = "batches"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    stock_item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("stock_items.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    batch_number: Mapped[str] = mapped_column(String(100), nullable=False)
    manufacturing_date: Mapped[str | None] = mapped_column(String(10), nullable=True)  # YYYY-MM-DD
    expiry_date: Mapped[str | None] = mapped_column(String(10), nullable=True)  # YYYY-MM-DD
    quantity: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False, default=0)
    # active | exhausted | expired
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")

    stock_item: Mapped["StockItem"] = relationship("StockItem")
    ledger_entries: Mapped[list["BatchLedger"]] = relationship(
        "BatchLedger", back_populates="batch", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("company_id", "stock_item_id", "batch_number", name="uq_batch_company_item_number"),
    )


class BatchLedger(UUIDPk, TimestampMixin, Base):
    """Records every inward/outward movement of a batch."""
    __tablename__ = "batch_ledger"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    batch_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("batches.id", ondelete="CASCADE"), index=True, nullable=False
    )
    stock_entry_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("stock_entries.id", ondelete="SET NULL"), nullable=True
    )
    production_order_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("production_orders.id", ondelete="SET NULL"), nullable=True
    )
    # inward | outward
    entry_type: Mapped[str] = mapped_column(String(10), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)

    batch: Mapped["Batch"] = relationship("Batch", back_populates="ledger_entries")
    stock_entry: Mapped["StockEntry | None"] = relationship("StockEntry")
    production_order: Mapped["ProductionOrder | None"] = relationship("ProductionOrder")
