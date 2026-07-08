"""ImportJob model for tracking data imports (Tally, CSV, etc.)."""
from __future__ import annotations

from sqlalchemy import JSON, LargeBinary, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


class ImportJob(UUIDPk, TimestampMixin, Base):
    """Tracks an import session: file uploaded, parsed, and records created."""
    __tablename__ = "import_jobs"

    company_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    # tally | csv
    import_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # The source filename
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # pending | parsed | importing | completed | failed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    # Summary counts of what was parsed/found
    summary = mapped_column(JSON(), nullable=True)
    # Detailed errors during import
    errors = mapped_column(JSON(), nullable=True)
    # Summary of what was created
    created_counts = mapped_column(JSON(), nullable=True)
    # Detailed list of created items with names/ids for undo and preview
    created_details = mapped_column(JSON(), nullable=True)
    # Raw content (Tally XML or Excel binary) for deferred import
    content: Mapped[bytes | None] = mapped_column(LargeBinary(), nullable=True)
    # Total monetary value imported
    total_value: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    # Detailed operational logs with timestamps
    logs = mapped_column(JSON(), nullable=True)
