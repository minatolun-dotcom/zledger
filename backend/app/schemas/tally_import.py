"""Tally import schemas."""
from __future__ import annotations

from pydantic import BaseModel


class TallyImportPreview(BaseModel):
    job_id: str
    summary: dict


class ImportJobOut(BaseModel):
    id: str
    company_id: str
    user_id: str
    import_type: str
    filename: str | None
    status: str
    summary: dict | None
    errors: dict | None
    created_counts: dict | None
    created_details: dict | None = None
    total_value: float | None
    created_at: str | None
    updated_at: str | None


class ImportJobListOut(BaseModel):
    id: str
    import_type: str
    filename: str | None
    status: str
    summary: dict | None
    created_counts: dict | None
    created_at: str | None
