"""Notification schemas."""
from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    user_id: str | None
    title: str
    message: str
    category: str
    link: str | None = None
    is_read: bool
    entity_type: str | None = None
    entity_id: str | None = None
    created_at: datetime | None = None


class NotificationCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)
    category: str = Field(default="info", pattern=r"^(info|warning|error|success|gst_due|approval_pending)$")
    link: str | None = None
    user_id: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
