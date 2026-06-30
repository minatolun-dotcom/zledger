"""Unit tests for money utility functions: to_money, quantize_money, to_qty, add, sum_money, money_is_zero."""
from decimal import Decimal

from app.utils.money import add, money_is_zero, quantize_money, sum_money, to_money, to_qty


class TestToMoney:
    def test_integer(self):
        assert to_money(100) == Decimal("100.00")

    def test_string(self):
        assert to_money("49.99") == Decimal("49.99")

    def test_decimal(self):
        assert to_money(Decimal("123.456")) == Decimal("123.46")

    def test_none_returns_zero(self):
        assert to_money(None) == Decimal("0.00")

    def test_empty_string_returns_zero(self):
        assert to_money("") == Decimal("0.00")

    def test_half_up_rounding(self):
        assert to_money("1.005") == Decimal("1.01")
        assert to_money("2.005") == Decimal("2.01")
        assert to_money("1.015") == Decimal("1.02")

    def test_half_down_rounding(self):
        assert to_money("1.004") == Decimal("1.00")
        assert to_money("2.004") == Decimal("2.00")

    def test_float_via_string(self):
        result = to_money(0.1 + 0.2)
        assert result == Decimal("0.30")

    def test_negative(self):
        assert to_money("-10.50") == Decimal("-10.50")

    def test_zero(self):
        assert to_money(0) == Decimal("0.00")


class TestQuantizeMoney:
    def test_basic(self):
        assert quantize_money(Decimal("10.1")) == Decimal("10.10")

    def test_rounding(self):
        assert quantize_money(Decimal("1.005")) == Decimal("1.01")

    def test_already_two_places(self):
        assert quantize_money(Decimal("5.50")) == Decimal("5.50")


class TestToQty:
    def test_integer(self):
        assert to_qty(10) == Decimal("10.000")

    def test_string(self):
        assert to_qty("3.14159") == Decimal("3.142")

    def test_none_returns_zero(self):
        assert to_qty(None) == Decimal("0.000")

    def test_empty_string_returns_zero(self):
        assert to_qty("") == Decimal("0.000")

    def test_half_up_rounding(self):
        assert to_qty("1.0005") == Decimal("1.001")


class TestAdd:
    def test_basic(self):
        assert add("10.50", "20.30") == Decimal("30.80")

    def test_with_integers(self):
        assert add(10, 20) == Decimal("30.00")

    def test_rounding(self):
        assert add("0.01", "0.02") == Decimal("0.03")


class TestSumMoney:
    def test_basic(self):
        assert sum_money(["10.00", "20.00", "30.00"]) == Decimal("60.00")

    def test_empty(self):
        assert sum_money([]) == Decimal("0.00")

    def test_with_decimals(self):
        assert sum_money([Decimal("1.50"), Decimal("2.50")]) == Decimal("4.00")

    def test_rounding(self):
        assert sum_money(["0.01", "0.02", "0.03"]) == Decimal("0.06")


class TestMoneyIsZero:
    def test_zero(self):
        assert money_is_zero(0) is True

    def test_zero_decimal(self):
        assert money_is_zero(Decimal("0.00")) is True

    def test_nonzero(self):
        assert money_is_zero("0.01") is False

    def test_negative(self):
        assert money_is_zero("-1.00") is False
