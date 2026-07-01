"""Currency and ExchangeRate models for multi-currency support.

Company has a base currency (default INR). Ledgers can optionally be in a
foreign currency. Exchange rates are stored per-company per-day.
"""
from __future__ import annotations

from sqlalchemy import Date, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPk


SUPPORTED_CURRENCIES: dict[str, str] = {
    "INR": "₹",
    "USD": "$",
    "EUR": "€",
    "GBP": "£",
    "JPY": "¥",
    "AED": "د.إ",
    "SGD": "S$",
    "AUD": "A$",
    "CAD": "C$",
    "CHF": "CHF",
    "CNY": "¥",
    "MYR": "RM",
    "THB": "฿",
    "SAR": "﷼",
    "QAR": "﷼",
    "OMR": "﷼",
    "KWD": "د.ك",
    "BHD": "د.ب",
}


class ExchangeRate(UUIDPk, TimestampMixin, Base):
    """Daily exchange rate for a currency against the company's base currency.

    rate = how many units of base currency per 1 unit of foreign currency.
    e.g. base=INR, currency=USD, rate=83.50 means 1 USD = 83.50 INR.
    """
    __tablename__ = "exchange_rates"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(18, 4), nullable=False)
    rate_date: Mapped[str] = mapped_column(String(10), nullable=False)

    __table_args__ = (
        UniqueConstraint("company_id", "currency", "rate_date", name="uq_exrate_company_currency_date"),
    )
