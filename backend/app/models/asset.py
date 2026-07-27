"""Fixed Asset Register and Asset Categories for depreciation tracking."""
from __future__ import annotations

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class AssetCategory(UUIDPk, TimestampMixin, Base):
    """Block-of-assets category with a depreciation method and annual rate.

    depreciation_method: "wdv" (Written Down Value) | "slm" (Straight Line).
    rate_pct: annual depreciation rate as a percentage (e.g. 12.5 for computers).
    useful_life_years: optional; if set, rate_pct is auto-calculated per Schedule II
    schedule_ii_class: optional Schedule II asset class for auto-rate enforcement
    """
    __tablename__ = "asset_categories"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    depreciation_method: Mapped[str] = mapped_column(String(10), nullable=False, default="wdv")
    rate_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    useful_life_years: Mapped[int | None] = mapped_column(Integer, nullable=True)
    schedule_ii_class: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

class AssetRegister(UUIDPk, TimestampMixin, Base):
    """Individual fixed asset with running depreciation and written-down value."""

    __tablename__ = "asset_register"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    category_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("asset_categories.id", ondelete="RESTRICT"), nullable=False
    )
    asset_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # YYYY-MM-DD
    purchase_date: Mapped[str] = mapped_column(String(10), nullable=False)
    cost: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    salvage_value: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    accumulated_depreciation: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    # Current written-down value (cost - accumulated_depreciation)
    wdv: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    # YYYY-MM-DD — date the asset was put to use; defaults to purchase_date
    put_to_use_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # active | disposed
    asset_status: Mapped[str] = mapped_column(String(10), nullable=False, default="active")
    disposal_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    disposal_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    disposal_pnl: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # FY for which depreciation was last posted (idempotency guard)
    last_depreciated_fy_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    __table_args__ = (
        UniqueConstraint("company_id", "asset_code", name="uq_asset_company_code"),
    )
