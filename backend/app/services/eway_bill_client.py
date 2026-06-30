"""GSTN E-Way Bill API client.

Handles authentication, payload generation, and E-Way Bill operations
against the GSTN E-Way Bill portal.

E-Way Bill API uses a different authentication mechanism than E-Invoice.
"""
from __future__ import annotations

import base64
import json
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.accounting import GstRegistration
from app.models.eway_bill import EwayBill
from app.models.user import Company

logger = logging.getLogger(__name__)

# ─── In-memory token cache (per-process) ────────────────────────────────
_token_cache: dict[str, dict[str, Any]] = {}


class EwayBillError(Exception):
    """Raised when GSTN API returns an error."""

    def __init__(self, error_code: str, message: str, raw_response: dict | None = None):
        self.error_code = error_code
        self.message = message
        self.raw_response = raw_response
        super().__init__(f"[{error_code}] {message}")


def _get_base_url() -> str:
    return settings.eway_bill_api_url


def _get_auth_url() -> str:
    return settings.eway_bill_api_url + "/ewaybillapi/v1/auth"


def _get_eway_bill_url() -> str:
    return settings.eway_bill_api_url + "/ewaybillapi/v1/ewaybill"


def _get_cancel_url() -> str:
    return settings.eway_bill_api_url + "/ewaybillapi/v1/ewaybill"


def _get_vehicle_update_url() -> str:
    return settings.eway_bill_api_url + "/ewaybillapi/v1/ewaybill"


async def get_access_token(db: Session, gstin: str, username: str, password: str) -> str:
    """Authenticate with GSTN E-Way Bill API and return auth token.

    Caches the token for the process lifetime.
    """
    cached = _token_cache.get(gstin)
    if cached and cached["expires_at"] > datetime.now(timezone.utc):
        return cached["token"]

    url = f"{_get_auth_url()}"

    # E-Way Bill uses simple base64 encoded credentials
    credentials = f"{username}:{password}"
    encoded_credentials = base64.b64encode(credentials.encode()).decode()

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            url,
            json={},
            headers={
                "gstin": gstin,
                "password": password,
                "Content-Type": "application/json",
            },
        )

    data = resp.json()

    if resp.status_code != 200 or data.get("status") != 1:
        error_msg = data.get("message", "E-Way Bill authentication failed")
        error_code = str(data.get("status_code", "AUTH_FAILED"))
        raise EwayBillError(error_code, error_msg, data)

    auth_token = data.get("data", {}).get("authtoken", "")
    sek_b64 = data.get("data", {}).get("sek", "")

    from datetime import timedelta
    _token_cache[gstin] = {
        "token": auth_token,
        "sek": sek_b64,
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=5, minutes=30),
    }

    return auth_token


async def generate_eway_bill(
    db: Session,
    company_id: str,
    eway_bill_id: str,
    payload: dict[str, Any],
) -> EwayBill:
    """Generate E-Way Bill by submitting payload to GSTN."""
    from datetime import datetime as dt

    eway_bill = db.get(EwayBill, eway_bill_id)
    if not eway_bill or eway_bill.company_id != company_id:
        raise ValueError(f"E-Way Bill {eway_bill_id} not found")

    if eway_bill.status == "generated" and eway_bill.eway_bill_number:
        raise EwayBillError("ALREADY_GENERATED", f"E-Way Bill already generated: {eway_bill.eway_bill_number}")

    gst_reg = db.get(GstRegistration, eway_bill.gstin_id)
    if not gst_reg:
        raise ValueError("GST registration not found for E-Way Bill")

    # Update status
    eway_bill.status = "submitted"
    db.commit()

    try:
        auth_token = await get_access_token(
            db, gst_reg.gstin,
            settings.eway_bill_username,
            settings.eway_bill_password,
        )

        url = _get_eway_bill_url()

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={
                    "gstin": gst_reg.gstin,
                    "authtoken": auth_token,
                    "Content-Type": "application/json",
                },
            )

        data = resp.json()

        if resp.status_code != 200 or data.get("status") != 1:
            error_msg = data.get("message", "E-Way Bill generation failed")
            error_code = str(data.get("status_code", "GENERATION_FAILED"))
            eway_bill.status = "failed"
            eway_bill.error_message = f"[{error_code}] {error_msg}"
            db.commit()
            raise EwayBillError(error_code, error_msg, data)

        # Extract E-Way Bill data
        eb_data = data.get("data", {})
        eway_bill.eway_bill_number = eb_data.get("ewayBillNo")
        eway_bill.eway_bill_date = eb_data.get("ewayBillDate")
        eway_bill.valid_until = eb_data.get("validUpto")
        eway_bill.irn = eb_data.get("irn")
        eway_bill.status = "generated"
        eway_bill.generated_at = dt.now(timezone.utc)
        eway_bill.error_message = None
        db.commit()
        db.refresh(eway_bill)

        return eway_bill

    except EwayBillError:
        raise
    except httpx.HTTPError as e:
        eway_bill.status = "failed"
        eway_bill.error_message = f"Network error: {str(e)}"
        db.commit()
        raise EwayBillError("NETWORK_ERROR", f"Network error: {str(e)}")
    except Exception as e:
        eway_bill.status = "failed"
        eway_bill.error_message = f"Unexpected error: {str(e)}"
        db.commit()
        raise EwayBillError("UNKNOWN_ERROR", f"Unexpected error: {str(e)}")


async def cancel_eway_bill(
    db: Session,
    company_id: str,
    eway_bill_id: str,
    reason: str,
    remark: str,
) -> EwayBill:
    """Cancel an E-Way Bill."""
    from datetime import datetime as dt

    eway_bill = db.get(EwayBill, eway_bill_id)
    if not eway_bill or eway_bill.company_id != company_id:
        raise ValueError("E-Way Bill not found")

    if eway_bill.status != "generated":
        raise EwayBillError("INVALID_STATUS", f"Cannot cancel E-Way Bill with status: {eway_bill.status}")

    if not eway_bill.eway_bill_number:
        raise EwayBillError("NO_EB", "E-Way Bill has no number to cancel")

    gst_reg = db.get(GstRegistration, eway_bill.gstin_id)
    if not gst_reg:
        raise ValueError("GST registration not found")

    try:
        auth_token = await get_access_token(
            db, gst_reg.gstin,
            settings.eway_bill_username,
            settings.eway_bill_password,
        )

        url = f"{_get_cancel_url()}/cancel"

        cancel_payload = {
            "ewayBillNumber": eway_bill.eway_bill_number,
            "cancelRsnCode": int(reason),
            "cancelRmrk": remark,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url,
                json=cancel_payload,
                headers={
                    "gstin": gst_reg.gstin,
                    "authtoken": auth_token,
                    "Content-Type": "application/json",
                },
            )

        data = resp.json()

        if resp.status_code != 200 or data.get("status") != 1:
            error_msg = data.get("message", "Cancel failed")
            error_code = str(data.get("status_code", "CANCEL_FAILED"))
            raise EwayBillError(error_code, error_msg, data)

        eway_bill.status = "cancelled"
        eway_bill.cancelled_at = dt.now(timezone.utc)
        eway_bill.cancel_reason = reason
        eway_bill.cancel_remark = remark
        eway_bill.error_message = None
        db.commit()
        db.refresh(eway_bill)

        return eway_bill

    except EwayBillError:
        raise
    except Exception as e:
        raise EwayBillError("UNKNOWN_ERROR", f"Cancel error: {str(e)}")


async def update_vehicle(
    db: Session,
    company_id: str,
    eway_bill_id: str,
    vehicle_number: str,
    transport_mode: str | None = None,
    from_place: str | None = None,
    from_state: str | None = None,
    to_place: str | None = None,
    to_state: str | None = None,
) -> EwayBill:
    """Update vehicle details for an active E-Way Bill."""
    eway_bill = db.get(EwayBill, eway_bill_id)
    if not eway_bill or eway_bill.company_id != company_id:
        raise ValueError("E-Way Bill not found")

    if eway_bill.status != "generated":
        raise EwayBillError("INVALID_STATUS", f"Cannot update vehicle for E-Way Bill with status: {eway_bill.status}")

    gst_reg = db.get(GstRegistration, eway_bill.gstin_id)
    if not gst_reg:
        raise ValueError("GST registration not found")

    try:
        auth_token = await get_access_token(
            db, gst_reg.gstin,
            settings.eway_bill_username,
            settings.eway_bill_password,
        )

        url = f"{_get_vehicle_update_url()}/vehupddtls"

        vehicle_payload = {
            "ewbNo": eway_bill.eway_bill_number,
            "vehicleNo": vehicle_number,
            "fromPlace": from_place or eway_bill.from_place or "",
            "fromState": from_state or eway_bill.from_state or "",
            "toPlace": to_place or eway_bill.to_place or "",
            "toState": to_state or eway_bill.to_state or "",
            "transMode": transport_mode or eway_bill.transport_mode or "Road",
            "transDocNo": eway_bill.transport_doc_number or "",
            "transDocDt": eway_bill.transport_doc_date or "",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url,
                json=vehicle_payload,
                headers={
                    "gstin": gst_reg.gstin,
                    "authtoken": auth_token,
                    "Content-Type": "application/json",
                },
            )

        data = resp.json()

        if resp.status_code != 200 or data.get("status") != 1:
            error_msg = data.get("message", "Vehicle update failed")
            error_code = str(data.get("status_code", "VEHICLE_UPDATE_FAILED"))
            raise EwayBillError(error_code, error_msg, data)

        eway_bill.vehicle_number = vehicle_number
        if transport_mode:
            eway_bill.transport_mode = transport_mode
        if from_place:
            eway_bill.from_place = from_place
        if from_state:
            eway_bill.from_state = from_state
        if to_place:
            eway_bill.to_place = to_place
        if to_state:
            eway_bill.to_state = to_state
        db.commit()
        db.refresh(eway_bill)

        return eway_bill

    except EwayBillError:
        raise
    except Exception as e:
        raise EwayBillError("UNKNOWN_ERROR", f"Vehicle update error: {str(e)}")
