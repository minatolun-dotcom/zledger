"""Supporting master entity schemas: Unit, CostCentre, CostCategory."""
from __future__ import annotations

from pydantic import BaseModel, Field


class UnitCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    description: str | None = None


class UnitOut(BaseModel):
    id: str
    name: str
    description: str | None
    is_active: bool


class CostCentreCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class CostCentreOut(BaseModel):
    id: str
    name: str
    description: str | None
    is_active: bool


class CostCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class CostCategoryOut(BaseModel):
    id: str
    name: str
    description: str | None
    is_active: bool
