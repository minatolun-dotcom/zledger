"""Currency and ExchangeRate schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


class ExchangeRateCreate(BaseModel):
    currency: str = Field(..., min_length=3, max_length=3)
    rate: float = Field(..., gt=0)
    rate_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")


class ExchangeRateUpdate(BaseModel):
    rate: float = Field(..., gt=0)


class ExchangeRateOut(BaseModel):
    id: str
    currency: str
    rate: float
    rate_date: str


class SupportedCurrencyOut(BaseModel):
    code: str
    symbol: str
