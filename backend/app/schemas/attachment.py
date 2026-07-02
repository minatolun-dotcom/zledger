"""Attachment schemas."""
from __future__ import annotations

from pydantic import BaseModel


class AttachmentOut(BaseModel):
    id: str
    voucher_id: str
    original_filename: str
    mime_type: str
    file_size: int
    uploaded_by: str | None = None
    created_at: str | None = None


class AttachmentUploadResponse(BaseModel):
    id: str
    original_filename: str


class AttachmentCountResponse(BaseModel):
    count: int
