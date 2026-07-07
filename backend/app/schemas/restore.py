"""Schemas for backup restore endpoints."""
from __future__ import annotations

from pydantic import BaseModel


class RestoreUploadResponse(BaseModel):
    database_file: str
    uploads_file: str | None = None
    database_size: int
    uploads_size: int | None = None
    backup_info: dict


class RestoreExecuteRequest(BaseModel):
    database_file: str
    uploads_file: str | None = None
    confirm: str


class RestoreExecuteResponse(BaseModel):
    status: str
    message: str
