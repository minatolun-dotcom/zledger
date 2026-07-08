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
    version: Mapped[int] = mapped_column(default=1, nullable=False)
    routing_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("routings.id", ondelete="SET NULL"), nullable=True
    )

    lines: Mapped[list["BomLine"]] = relationship(
        "BomLine", back_populates="bom", cascade="all, delete-orphan",
        foreign_keys="BomLine.bom_id"
    )

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
    # If set, this component is a sub-assembly produced by another BOM
    sub_bom_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("bill_of_materials.id", ondelete="SET NULL"), nullable=True
    )

    bom: Mapped["BillOfMaterials"] = relationship(
        "BillOfMaterials", back_populates="lines", foreign_keys=[bom_id]
    )
    stock_item: Mapped["StockItem"] = relationship("StockItem")
    sub_bom: Mapped["BillOfMaterials | None"] = relationship(
        "BillOfMaterials", foreign_keys=[sub_bom_id]
    )

    @property
    def item_name(self) -> str | None:
        return self.stock_item.name if self.stock_item else None

    @property
    def sub_bom_name(self) -> str | None:
        return self.sub_bom.name if self.sub_bom else None


class BomVersion(UUIDPk, TimestampMixin, Base):
    """Snapshot of a BOM at a specific version."""
    __tablename__ = "bom_versions"

    bom_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("bill_of_materials.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version: Mapped[int] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    finished_item_id: Mapped[str] = mapped_column(String(36), nullable=False)
    output_qty: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False)
    # JSON snapshot of lines
    lines_snapshot: Mapped[str] = mapped_column(String(10000), nullable=False)
    changed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    change_notes: Mapped[str | None] = mapped_column(String(512), nullable=True)


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
    # draft | in_progress | completed | cancelled
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    narration: Mapped[str | None] = mapped_column(String(512), nullable=True)
    voucher_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Cost breakdown
    material_cost: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    labor_cost: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    overhead_cost: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    # Scheduling
    planned_start_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    planned_end_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    actual_start_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    actual_end_date: Mapped[str | None] = mapped_column(String(10), nullable=True)

    bom: Mapped["BillOfMaterials"] = relationship("BillOfMaterials")
    lines: Mapped[list["ProductionOrderLine"]] = relationship(
        "ProductionOrderLine", back_populates="production_order", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("company_id", "order_number", name="uq_production_order_company_number"),
    )


class ProductionOrderLine(UUIDPk, TimestampMixin, Base):
    """Tracks actual consumption per component in a production order."""
    __tablename__ = "production_order_lines"

    production_order_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("production_orders.id", ondelete="CASCADE"), index=True, nullable=False
    )
    stock_item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("stock_items.id", ondelete="RESTRICT"), nullable=False
    )
    planned_qty: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False)
    actual_qty: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False, default=0)
    rate: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    # Calculated wastage percentage: ((actual - planned) / planned) * 100
    wastage_pct: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=0)

    production_order: Mapped["ProductionOrder"] = relationship("ProductionOrder", back_populates="lines")
    stock_item: Mapped["StockItem"] = relationship("StockItem")

    @property
    def item_name(self) -> str | None:
        return self.stock_item.name if self.stock_item else None


class WorkCenter(UUIDPk, TimestampMixin, Base):
    """A work center: machine, assembly line, or workstation."""
    __tablename__ = "work_centers"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    capacity: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=1)
    capacity_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)  # hours/day, units/day
    hourly_rate: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (UniqueConstraint("company_id", "name", name="uq_work_center_company_name"),)


class Routing(UUIDPk, TimestampMixin, Base):
    """A routing defines the sequence of operations to produce a finished item."""
    __tablename__ = "routings"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    finished_item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("stock_items.id", ondelete="RESTRICT"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    operations: Mapped[list["RoutingOperation"]] = relationship(
        "RoutingOperation", back_populates="routing", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("company_id", "name", name="uq_routing_company_name"),)


class RoutingOperation(UUIDPk, TimestampMixin, Base):
    """A single operation step in a routing."""
    __tablename__ = "routing_operations"

    routing_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("routings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    step_number: Mapped[int] = mapped_column(nullable=False)
    work_center_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("work_centers.id", ondelete="RESTRICT"), nullable=False
    )
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    setup_time_minutes: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    run_time_per_unit_minutes: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)

    routing: Mapped["Routing"] = relationship("Routing", back_populates="operations")
    work_center: Mapped["WorkCenter"] = relationship("WorkCenter")
