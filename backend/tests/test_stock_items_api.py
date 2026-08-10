"""Integration tests for stock item `tracking_mode` (batch / serial) support.

Covers the create/update/list round-trip plus validator rejection. Before
2026-08-10 the API silently dropped `tracking_mode` on create/update and
omitted it from responses, which broke the Batches/Serials UI filters.
"""
from __future__ import annotations

from tests.conftest import auth_header, create_company, register_user

ITEM_URL = "/api/inventory/items"


def _item_payload(**overrides) -> dict:
    payload = {
        "name": "Test Widget",
        "unit_of_measure": "Nos",
        "valuation_method": "weighted_avg",
        "gst_rate": 18,
        "item_type": "goods",
    }
    payload.update(overrides)
    return payload


def _setup(client) -> dict:
    """Register a user, create a company and return auth headers for it."""
    _, token = register_user(client, "stock@example.com")
    company = create_company(client, token)
    return auth_header(token, company["id"])


class TestStockItemTrackingMode:
    def test_create_item_defaults_to_none(self, client):
        headers = _setup(client)
        resp = client.post(ITEM_URL, json=_item_payload(), headers=headers)
        assert resp.status_code == 201
        body = resp.json()
        assert body["tracking_mode"] == "none"

    def test_create_item_with_batch_tracking(self, client):
        headers = _setup(client)
        resp = client.post(ITEM_URL, json=_item_payload(tracking_mode="batch"), headers=headers)
        assert resp.status_code == 201
        assert resp.json()["tracking_mode"] == "batch"

    def test_create_item_with_serial_tracking(self, client):
        headers = _setup(client)
        resp = client.post(ITEM_URL, json=_item_payload(tracking_mode="serial"), headers=headers)
        assert resp.status_code == 201
        assert resp.json()["tracking_mode"] == "serial"

    def test_create_item_rejects_invalid_tracking_mode(self, client):
        headers = _setup(client)
        resp = client.post(ITEM_URL, json=_item_payload(tracking_mode="lot"), headers=headers)
        assert resp.status_code == 422

    def test_update_item_changes_tracking_mode(self, client):
        headers = _setup(client)
        item_id = client.post(ITEM_URL, json=_item_payload(), headers=headers).json()["id"]

        # PATCH /items/{id} uses StockItemCreate as its body (full-replace
        # contract — the frontend sends the whole form), so send the full
        # payload with the tracking_mode changed.
        resp = client.patch(
            f"{ITEM_URL}/{item_id}",
            json=_item_payload(tracking_mode="serial"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["tracking_mode"] == "serial"
        assert resp.json()["name"] == "Test Widget"

    def test_update_item_rejects_invalid_tracking_mode(self, client):
        headers = _setup(client)
        item_id = client.post(ITEM_URL, json=_item_payload(), headers=headers).json()["id"]
        resp = client.patch(
            f"{ITEM_URL}/{item_id}",
            json=_item_payload(tracking_mode="trace"),
            headers=headers,
        )
        assert resp.status_code == 422

    def test_list_items_includes_tracking_mode(self, client):
        headers = _setup(client)
        client.post(
            ITEM_URL,
            json=_item_payload(name="Tracked Chip", tracking_mode="batch"),
            headers=headers,
        )
        resp = client.get(ITEM_URL, headers=headers)
        assert resp.status_code == 200
        items = resp.json()
        assert any(i["name"] == "Tracked Chip" and i["tracking_mode"] == "batch" for i in items)
