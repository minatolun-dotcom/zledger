"""Unit tests for the GSTN e-invoice client resilience layer.

Covers _post_with_retry (exponential backoff on transient 429/5xx/network
errors, NO retry on business-level rejections) and _throttle (per-GSTIN
minimum call interval).
"""
import asyncio
import json

import httpx
import pytest

from app.services import einvoice_client
from app.services.einvoice_client import EinvoiceError, _post_with_retry, _throttle


class FakeResponse:
    def __init__(self, status_code: int, data: dict, content_type: str = "application/json"):
        self.status_code = status_code
        self._data = data
        self.headers = {"content-type": content_type}

    def json(self):
        return self._data

    @property
    def text(self):
        return json.dumps(self._data)


class FakeClient:
    """Fake httpx.AsyncClient whose post() pops from a queue of responses/exceptions."""

    def __init__(self, items: list):
        self.items = list(items)
        self.post_calls = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, json=None, headers=None, params=None):
        self.post_calls += 1
        if self.items:
            item = self.items.pop(0)
        else:
            item = FakeResponse(200, {"Status": 1})
        if isinstance(item, Exception):
            raise item
        return item


def _install_fake_client(monkeypatch, items: list) -> FakeClient:
    client = FakeClient(items)

    def _factory(*args, **kwargs):
        # httpx.AsyncClient is used as a synchronous constructor inside
        # `async with httpx.AsyncClient(...)` — the fake must return the
        # client object directly, not a coroutine.
        return client

    monkeypatch.setattr(einvoice_client.httpx, "AsyncClient", _factory)
    # Speed: never actually sleep during retry tests
    async def _noop_sleep(_):  # noqa: ANN001
        return None

    monkeypatch.setattr(einvoice_client.asyncio, "sleep", _noop_sleep)
    return client


class TestPostWithRetry:
    async def test_succeeds_immediately(self, monkeypatch):
        client = _install_fake_client(monkeypatch, [FakeResponse(200, {"Status": 1, "Data": {"Irn": "X"}})])
        status, data = await _post_with_retry("https://irp/Invoice", {}, {})
        assert status == 200
        assert data["Data"]["Irn"] == "X"
        assert client.post_calls == 1

    async def test_retries_on_503_then_succeeds(self, monkeypatch):
        client = _install_fake_client(
            monkeypatch,
            [
                FakeResponse(503, {"Message": "Service busy"}),
                FakeResponse(503, {"Message": "Still busy"}),
                FakeResponse(200, {"Status": 1}),
            ],
        )
        status, _ = await _post_with_retry("https://irp/Invoice", {}, {})
        assert status == 200
        assert client.post_calls == 3  # initial + 2 retries

    async def test_retries_on_429_rate_limit(self, monkeypatch):
        client = _install_fake_client(
            monkeypatch,
            [
                FakeResponse(429, {"Message": "Rate limited"}),
                FakeResponse(200, {"Status": 1}),
            ],
        )
        status, _ = await _post_with_retry("https://irp/Invoice", {}, {})
        assert status == 200
        assert client.post_calls == 2

    async def test_retries_on_network_error(self, monkeypatch):
        client = _install_fake_client(
            monkeypatch,
            [
                httpx.ConnectError("connection refused"),
                httpx.ReadTimeout("timed out"),
                FakeResponse(200, {"Status": 1}),
            ],
        )
        status, _ = await _post_with_retry("https://irp/Invoice", {}, {})
        assert status == 200
        assert client.post_calls == 3

    async def test_business_error_not_retried(self, monkeypatch):
        """HTTP 200 with Status != 1 is GSTN rejecting the payload — not transient."""
        client = _install_fake_client(
            monkeypatch,
            [FakeResponse(200, {"Status": 0, "ErrorCode": "2150", "Message": "Duplicate IRN"})],
        )
        status, data = await _post_with_retry("https://irp/Invoice", {}, {})
        assert status == 200
        assert data["ErrorCode"] == "2150"
        assert client.post_calls == 1  # no retry on business errors

    async def test_exhausts_attempts_then_raises(self, monkeypatch):
        client = _install_fake_client(monkeypatch, [FakeResponse(503, {})] * 10)
        with pytest.raises(EinvoiceError) as exc_info:
            await _post_with_retry("https://irp/Invoice", {}, {}, attempts=3)
        assert exc_info.value.error_code == "GSTN_UNAVAILABLE"
        assert client.post_calls == 3


class TestThrottle:
    async def test_first_call_immediate_second_call_waiting(self, monkeypatch):
        sleeps: list[float] = []

        async def fake_sleep(seconds: float):
            sleeps.append(seconds)

        monkeypatch.setattr(einvoice_client.asyncio, "sleep", fake_sleep)
        # Isolate the module state for this test
        monkeypatch.setattr(einvoice_client, "_last_call_at", {})

        await _throttle("27ABCDE1234F1Z5")
        assert sleeps == [] or sleeps[0] <= 0

        # Second call happens immediately → must wait ~MIN_CALL_INTERVAL
        await _throttle("27ABCDE1234F1Z5")
        waits = [s for s in sleeps if s > 0]
        assert len(waits) == 1
        assert 0.8 <= waits[0] <= 1.2

    async def test_different_gstins_not_throttled_together(self, monkeypatch):
        sleeps: list[float] = []

        async def fake_sleep(seconds: float):
            sleeps.append(seconds)

        monkeypatch.setattr(einvoice_client.asyncio, "sleep", fake_sleep)
        monkeypatch.setattr(einvoice_client, "_last_call_at", {})

        await _throttle("GSTIN-A")
        await _throttle("GSTIN-B")
        # Second GSTIN is independent → no wait
        assert all(s <= 0 for s in sleeps)


class TestGenerateIrnFailureMarking:
    """Retry exhaustion must mark the e-invoice record failed (not leave it
    stuck in "submitted") — the pre-resilience network-error path did this."""

    async def test_retry_exhaustion_marks_einvoice_failed(self, db, monkeypatch):
        from app.models.accounting import GstRegistration
        from app.models.einvoice import EInvoice
        from app.models.voucher import Voucher
        from app.services.einvoice_client import EinvoiceError, generate_irn
        from tests.conftest import create_db_company

        co = create_db_company(db, "EINV Client 1")
        reg = GstRegistration(company_id=co.id, gstin="27AABCU9603R1ZM",
                              legal_name="Corp", state_code="27", is_primary=True)
        db.add(reg)
        db.commit()
        db.refresh(reg)
        v = Voucher(company_id=co.id, voucher_type="sales", voucher_number="S1",
                    voucher_date="2025-06-15")
        db.add(v)
        db.commit()
        db.refresh(v)
        einv = EInvoice(company_id=co.id, voucher_id=v.id, gstin_id=reg.id,
                        status="draft")
        db.add(einv)
        db.commit()
        db.refresh(einv)

        async def fake_access_token(db_, gstin):
            # AES-256 key must be 32 bytes — base64 of b"k"*32
            return "tok", __import__("base64").b64encode(b"k" * 32).decode()

        async def fake_post_retry(*args, **kwargs):
            raise EinvoiceError("GSTN_UNAVAILABLE", "GSTN request failed after 4 attempts")

        monkeypatch.setattr(einvoice_client, "get_access_token", fake_access_token)
        monkeypatch.setattr(einvoice_client, "_post_with_retry", fake_post_retry)

        with pytest.raises(EinvoiceError) as exc_info:
            await generate_irn(db, co.id, v.id, {"Version": "1.1"})
        assert exc_info.value.error_code == "GSTN_UNAVAILABLE"

        db.refresh(einv)
        assert einv.status == "failed"
        assert "GSTN request failed" in (einv.error_message or "")
