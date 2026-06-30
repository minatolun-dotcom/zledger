"""Money helpers.

All monetary values across Zledger are represented as Python ``Decimal`` and
stored in PostgreSQL as ``Numeric(18, 2)``. We NEVER use ``float`` for money.

The rounding strategy here follows common Indian GST practice:
  - Per-line tax is computed on the taxable value, then rounded to 2 decimals
    using ROUND_HALF_UP (decimal default rounding in Python is banker's
    rounding, so we set the context explicitly).
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Context, Decimal

# Money scale: 2 decimal places for INR.
TWO_PLACES = Decimal("0.01")

# A decimal context that uses classic rounding (half-up), matching typical
# accounting expectations. Used explicitly on every quantize call so behavior
# does not depend on the global default context.
MONEY_CONTEXT = Context(rounding=ROUND_HALF_UP)

# Number of decimal places for quantities (stock etc.)
QTY_PLACES = Decimal("0.001")


def to_money(value: Decimal | int | str | float | None) -> Decimal:
    """Coerce a value to a 2-decimal Decimal, rounded half-up.

    Accepts ``str`` (preferred), ``Decimal``, ``int``. ``float`` is supported
    but discouraged — always prefer str/Decimal at boundaries.
    """
    if value is None or value == "":
        return Decimal("0")
    if isinstance(value, float):
        # Convert via str to avoid binary float artifacts (e.g. 0.1+0.2).
        value = str(value)
    return MONEY_CONTEXT.quantize(Decimal(value), TWO_PLACES)


def quantize_money(value: Decimal) -> Decimal:
    """Round a Decimal to 2 places, half-up. No coercion of input type."""
    return MONEY_CONTEXT.quantize(Decimal(value), TWO_PLACES)


def to_qty(value: Decimal | int | str | None) -> Decimal:
    """Coerce a quantity value to 3-decimal Decimal."""
    if value is None or value == "":
        return Decimal("0")
    return Decimal(str(value)).quantize(QTY_PLACES, rounding=ROUND_HALF_UP)


def add(a: Decimal | str | int, b: Decimal | str | int) -> Decimal:
    return to_money(Decimal(str(a)) + Decimal(str(b)))


def sum_money(values) -> Decimal:
    """Sum an iterable of money-like values as Decimal."""
    total = Decimal("0")
    for v in values:
        total += to_money(v)
    return to_money(total)


def money_is_zero(value: Decimal | str | int) -> bool:
    return to_money(value) == Decimal("0")
