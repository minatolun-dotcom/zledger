"""Manufacturing models: BillOfMaterials, BomLine, ProductionOrder.

Bills of Materials define what raw materials go into a finished product.
Production Orders track actual manufacturing runs with material consumption.
"""
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class BillOfMaterials(UUIDPk, TimestampMixin, Base):
    """BOM: defines the recipe to produce a finished item."""
    __tablename__ = "bill_of_materials"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    finished_item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("stock_items.id", ondelete="RESTRICT"), nullable=False
    )
    output_qty: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    lines: Mapped[list["BomLine"]] = relationship("BomLine", back_populates="bom", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("company_id", "name", name="uq_bom_company_name"),)


class BomLine(UUIDPk, TimestampMixin, Base):
    """A single component line in a BOM."""
    __tablename__ = "bom_lines"

    bom_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("bill_of_materials.id", ondelete="CASCADE"), index=True, nullable=False
    )
    stock_item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("stock_items.id", ondelete="RESTRICT"), nullable=False
    )
    quantity: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False)
    rate: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    wastage_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)

    bom: Mapped["BillOfMaterials"] = relationship("BillOfMaterials", back_populates="lines")
    stock_item: Mapped["StockItem"] = relationship("StockItem")

    @property
    def item_name(self) -> str | None:
        return self.stock_item.name if self.stock_item else None


class ProductionOrder(UUIDPk, TimestampMixin, Base):
    """Tracks a manufacturing run: consume materials, produce finished goods."""
    __tablename__ = "production_orders"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    bom_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("bill_of_materials.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    order_number: Mapped[str] = mapped_column(String(50), nullable=False)
    order_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    planned_qty: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False)
    produced_qty: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False, default=0)
    # draft | completed | cancelled
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    narration: Mapped[str | None] = mapped_column(String(512), nullable=True)
    voucher_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    bom: Mapped["BillOfMaterials"] = relationship("BillOfMaterials")

    __table_args__ = (
        UniqueConstraint("company_id", "order_number", name="uq_production_order_company_number"),
    )
