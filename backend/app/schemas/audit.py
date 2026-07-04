"""Audit log schemas."""
from __future__ import annotations

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: str
    company_id: str
    user_id: str | None = None
    action: str
    entity_type: str
    entity_id: str | None = None
    old_value: dict | None = None
    new_value: dict | None = None
    description: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    created_at: str | None = None
    # Enriched fields from joins
    user_email: str | None = None
    user_name: str | None = None


class AuditLogListOut(BaseModel):
    id: str
    action: str
    entity_type: str
    entity_id: str | None = None
    description: str | None = None
    user_email: str | None = None
    user_name: str | None = None
    created_at: str | None = None


class AuditLogPaginatedOut(BaseModel):
    items: list[AuditLogListOut]
    total: int
    limit: int
    offset: int
