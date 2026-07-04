"""Shared schema helpers."""
from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ORMModel(BaseModel):
    """Base with ORM mode + UTC-aware datetime serialization."""

    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    """A simple page wrapper for list responses."""

    items: list[T]
    total: int


class BulkActionResult(BaseModel):
    """Response for bulk operations (delete, cancel, etc.)."""

    processed: int
    errors: list[str] = []


class BulkDeleteRequest(BaseModel):
    """Request body for bulk delete operations."""

    ids: list[str]
