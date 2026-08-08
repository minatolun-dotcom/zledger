"""GSTN E-Invoice API client.

Handles authentication, payload encryption, IRN generation, cancellation,
and status queries against the NIC Invoice Registration Portal (IRP).

All encryption uses AES-256-ECB with PKCS#7 padding as required by GSTN.
Tokens are cached in-memory per process (swap to Redis for multi-worker setups).
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import random
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.accounting import GstRegistration
from app.models.einvoice import EInvoice
from app.models.user import Company

logger = logging.getLogger(__name__)

# ─── In-memory token cache (per-process) ────────────────────────────────
_token_cache: dict[str, dict[str, Any]] = {}  # gstin → {token, sek, expires_at}


class EinvoiceError(Exception):
    """Raised when GSTN API returns an error."""

    def __init__(self, error_code: str, message: str, raw_response: dict | None = None):
        self.error_code = error_code
        self.message = message
        self.raw_response = raw_response
        super().__init__(f"[{error_code}] {message}")

# ─── Resilience: rate limit + retry backoff ──────────────────────────────
# GSTN IRP is notoriously flaky: rate-limits (HTTP 429) and 5xx blips are
# routine during peak windows. We (1) throttle calls per GSTIN and (2) retry
# transient failures with exponential backoff + jitter so a single IRP hiccup
# does not fail an invoice.

MIN_CALL_INTERVAL_SECONDS = 1.0       # minimum gap between calls per GSTIN
RETRY_ATTEMPTS = 4                    # initial + 3 retries
RETRY_BASE_DELAY = 0.8                # seconds; doubles each attempt
RETRY_MAX_DELAY = 6.0
RETRYABLE_HTTP_STATUSES = frozenset({408, 429, 500, 502, 503, 504})

_rate_limit_lock = asyncio.Lock()
_last_call_at: dict[str, float] = {}  # gstin → monotonic timestamp of last call


async def _throttle(gstin: str) -> None:
    """Enforce a minimum gap between GSTN API calls for the same GSTIN."""
    async with _rate_limit_lock:
        last = _last_call_at.get(gstin, 0.0)
        wait = last + MIN_CALL_INTERVAL_SECONDS - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call_at[gstin] = time.monotonic()


async def _post_with_retry(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str],
    *,
    attempts: int = RETRY_ATTEMPTS,
    base_delay: float = RETRY_BASE_DELAY,
    max_delay: float = RETRY_MAX_DELAY,
) -> tuple[int, dict[str, Any]]:
    """POST JSON to GSTN with exponential backoff + jitter.

    Retries on httpx network/timeout errors and retryable HTTP statuses
    (429/5xx). Business-level errors (HTTP 200 with Status != 1) are NOT
    retried — they mean GSTN accepted the request but rejected the payload.
    Returns (status_code, parsed_json).
    """
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(url, json=payload, headers=headers)

            if resp.status_code in RETRYABLE_HTTP_STATUSES:
                try:
                    raw = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else None
                except ValueError:
                    raw = None
                last_error = EinvoiceError(
                    str(resp.status_code),
                    f"GSTN transient error (HTTP {resp.status_code})",
                    raw,
                )
            else:
                try:
                    return resp.status_code, resp.json()
                except ValueError:
                    return resp.status_code, {"Message": resp.text[:500]}
        except httpx.HTTPError as e:
            last_error = e

        if attempt < attempts:
            delay = min(base_delay * (2 ** (attempt - 1)), max_delay) + random.uniform(0, 0.25)
            logger.warning("GSTN request to %s failed (attempt %d/%d), retrying in %.2fs: %s",
                           url, attempt, attempts, delay, last_error)
            await asyncio.sleep(delay)

    raise EinvoiceError(
        "GSTN_UNAVAILABLE",
        f"GSTN request failed after {attempts} attempts: {last_error}",
    )


def _get_base_url() -> str:
    return settings.einvoice_api_url


def _aes_encrypt(data: bytes, key: bytes) -> bytes:
    """AES-256-ECB encrypt with PKCS#7 padding."""
    cipher = AES.new(key, AES.MODE_ECB)
    return cipher.encrypt(pad(data, AES.block_size))


def _aes_decrypt(data: bytes, key: bytes) -> bytes:
    """AES-256-ECB decrypt with PKCS#7 unpadding."""
    cipher = AES.new(key, AES.MODE_ECB)
    return unpad(cipher.decrypt(data), AES.block_size)


def _generate_app_key() -> str:
    """Generate a random 256-bit app key for authentication."""
    import secrets
    return base64.b64encode(secrets.token_bytes(32)).decode()


def _get_seller_dtls(db: Session, company_id: str, gstin_id: str) -> dict[str, Any]:
    """Fetch seller GST registration details for API payload."""
    reg = db.get(GstRegistration, gstin_id)
    if not reg or reg.company_id != company_id:
        raise ValueError(f"GST registration {gstin_id} not found for company {company_id}")

    address_parts = (reg.address or "").split(", ", 1)
    addr1 = address_parts[0] if address_parts else ""
    addr2 = address_parts[1] if len(address_parts) > 1 else ""
    loc = addr1 or "NA"

    return {
        "Gstin": reg.gstin,
        "LglNm": reg.legal_name,
        "TrdNm": reg.trade_name or reg.legal_name,
        "Addr1": addr1 or "NA",
        "Addr2": addr2,
        "Loc": loc or "NA",
        "Pin": 0,  # Will be overridden from company/party if available
        "Stcd": reg.state_code,
        "Ph": "",
        "Em": "",
    }


# ─── Public API ──────────────────────────────────────────────────────────


async def get_access_token(db: Session, gstin: str) -> tuple[str, str]:
    """Authenticate with GSTN and return (auth_token, sek).

    Caches the token for the process lifetime (6 hours validity).
    For production multi-worker setups, use Redis.
    """
    # Check cache
    cached = _token_cache.get(gstin)
    if cached and cached["expires_at"] > datetime.now(timezone.utc):
        return cached["token"], cached["sek"]

    client_id = settings.einvoice_client_id
    client_secret = settings.einvoice_client_secret
    username = settings.einvoice_username
    password = settings.einvoice_password

    if not all([client_id, client_secret, username, password]):
        raise ValueError("E-Invoice credentials not configured. Set EINVOICE_CLIENT_ID, "
                         "EINVOICE_CLIENT_SECRET, EINVOICE_USERNAME, EINVOICE_PASSWORD")

    app_key_b64 = _generate_app_key()
    app_key_bytes = base64.b64decode(app_key_b64)

    encrypted_username = base64.b64encode(_aes_encrypt(username.encode(), app_key_bytes)).decode()
    encrypted_password = base64.b64encode(_aes_encrypt(password.encode(), app_key_bytes)).decode()

    url = f"{_get_base_url()}/eivital/v1.04/auth"

    await _throttle(gstin)
    status_code, data = await _post_with_retry(
        url,
        {
            "UserName": encrypted_username,
            "Password": encrypted_password,
            "AppKey": app_key_b64,
            "ForceRefreshAccessToken": False,
        },
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "gstin": gstin,
            "Content-Type": "application/json",
        },
    )

    if status_code != 200 or data.get("Status") != 1:
        error_msg = data.get("Message", "Authentication failed")
        error_code = str(data.get("ErrorCode", "AUTH_FAILED"))
        raise EinvoiceError(error_code, error_msg, data)

    auth_token = data["Data"]["AuthToken"]
    sek_b64 = data["Data"]["Sek"]

    # Cache token (expires in ~6 hours; we cache for 5.5 hours to be safe)
    from datetime import timedelta
    _token_cache[gstin] = {
        "token": auth_token,
        "sek": sek_b64,
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=5, minutes=30),
    }

    return auth_token, sek_b64


async def generate_irn(
    db: Session,
    company_id: str,
    voucher_id: str,
    einvoice_payload: dict[str, Any],
) -> EInvoice:
    """Generate IRN for a voucher by submitting its e-invoice payload to GSTN.

    Returns the updated EInvoice record with IRN data.
    """
    from datetime import datetime as dt

    # Find or create EInvoice record
    einvoice = db.query(EInvoice).filter(
        EInvoice.company_id == company_id,
        EInvoice.voucher_id == voucher_id,
    ).first()

    if not einvoice:
        raise ValueError(f"No e-invoice record found for voucher {voucher_id}")

    if einvoice.status == "generated" and einvoice.irn:
        raise EinvoiceError("ALREADY_GENERATED", f"IRN already generated: {einvoice.irn}")

    # Get seller GSTIN from the e-invoice record
    gst_reg = db.get(GstRegistration, einvoice.gstin_id)
    if not gst_reg:
        raise ValueError("GST registration not found for e-invoice")

    # Update status
    einvoice.status = "submitted"
    einvoice.submitted_at = dt.now(timezone.utc)
    db.commit()

    try:
        # Get auth token
        auth_token, sek_b64 = await get_access_token(db, gst_reg.gstin)
        sek_bytes = base64.b64decode(sek_b64)

        # Encrypt the payload
        payload_json = json.dumps(einvoice_payload, separators=(",", ":"))
        encrypted_data = base64.b64encode(
            _aes_encrypt(payload_json.encode(), sek_bytes)
        ).decode()

        # Submit to GSTN (throttled + retried on transient 429/5xx/network errors)
        url = f"{_get_base_url()}/eicore/v1.03/Invoice"
        client_id = settings.einvoice_client_id
        client_secret = settings.einvoice_client_secret

        await _throttle(gst_reg.gstin)
        status_code, data = await _post_with_retry(
            url,
            {"Data": encrypted_data},
            {
                "client_id": client_id,
                "client_secret": client_secret,
                "gstin": gst_reg.gstin,
                "AuthToken": auth_token,
                "Content-Type": "application/json",
            },
        )

        if status_code != 200 or data.get("Status") != 1:
            error_msg = data.get("Message", "IRN generation failed")
            error_code = str(data.get("ErrorCode", "IRN_FAILED"))
            einvoice.status = "failed"
            einvoice.error_message = f"[{error_code}] {error_msg}"
            db.commit()
            raise EinvoiceError(error_code, error_msg, data)

        # Decrypt response
        encrypted_response = data["Data"]
        decrypted_response = _aes_decrypt(
            base64.b64decode(encrypted_response), sek_bytes
        )
        result = json.loads(decrypted_response)

        # Extract IRN data
        einvoice.irn = result.get("Irn")
        einvoice.ack_no = result.get("AckNo")
        einvoice.ack_dt = result.get("AckDt")
        einvoice.signed_qr_code = result.get("SignedQRCode")
        einvoice.signed_invoice = result.get("SignedInvoice")
        einvoice.status = "generated"
        einvoice.generated_at = dt.now(timezone.utc)
        einvoice.error_message = None
        db.commit()
        db.refresh(einvoice)

        return einvoice

    except EinvoiceError as e:
        # Retry exhaustion (GSTN_UNAVAILABLE) must surface as a failed
        # e-invoice, not leave the record stuck in "submitted".
        if e.error_code == "GSTN_UNAVAILABLE":
            einvoice.status = "failed"
            einvoice.error_message = e.message
            db.commit()
        raise
    except httpx.HTTPError as e:
        einvoice.status = "failed"
        einvoice.error_message = f"Network error: {str(e)}"
        db.commit()
        raise EinvoiceError("NETWORK_ERROR", f"Network error: {str(e)}")
    except Exception as e:
        einvoice.status = "failed"
        einvoice.error_message = f"Unexpected error: {str(e)}"
        db.commit()
        raise EinvoiceError("UNKNOWN_ERROR", f"Unexpected error: {str(e)}")


async def cancel_irn(
    db: Session,
    company_id: str,
    einvoice_id: str,
    reason: str,
    remark: str,
) -> EInvoice:
    """Cancel an IRN within 24 hours of generation."""
    from datetime import datetime as dt

    einvoice = db.get(EInvoice, einvoice_id)
    if not einvoice or einvoice.company_id != company_id:
        raise ValueError("E-Invoice not found")
    if einvoice.status != "generated":
        raise EinvoiceError("INVALID_STATUS", f"Cannot cancel e-invoice with status: {einvoice.status}")
    if not einvoice.irn:
        raise EinvoiceError("NO_IRN", "E-Invoice has no IRN to cancel")

    gst_reg = db.get(GstRegistration, einvoice.gstin_id)
    if not gst_reg:
        raise ValueError("GST registration not found")

    try:
        auth_token, sek_b64 = await get_access_token(db, gst_reg.gstin)
        sek_bytes = base64.b64decode(sek_b64)

        # Build cancel payload
        cancel_payload = {
            "Irn": einvoice.irn,
            "Rsn": reason,
            "Rmks": remark,
        }
        payload_json = json.dumps(cancel_payload, separators=(",", ":"))
        encrypted_data = base64.b64encode(
            _aes_encrypt(payload_json.encode(), sek_bytes)
        ).decode()

        url = f"{_get_base_url()}/eicore/v1.03/Cancel"

        await _throttle(gst_reg.gstin)
        status_code, data = await _post_with_retry(
            url,
            {"Data": encrypted_data},
            {
                "client_id": settings.einvoice_client_id,
                "client_secret": settings.einvoice_client_secret,
                "gstin": gst_reg.gstin,
                "AuthToken": auth_token,
                "Content-Type": "application/json",
            },
        )

        if status_code != 200 or data.get("Status") != 1:
            error_msg = data.get("Message", "Cancel failed")
            error_code = str(data.get("ErrorCode", "CANCEL_FAILED"))
            raise EinvoiceError(error_code, error_msg, data)

        einvoice.status = "cancelled"
        einvoice.cancelled_at = dt.now(timezone.utc)
        einvoice.cancel_reason = reason
        einvoice.cancel_remark = remark
        einvoice.error_message = None
        db.commit()
        db.refresh(einvoice)

        return einvoice

    except EinvoiceError:
        raise
    except Exception as e:
        raise EinvoiceError("UNKNOWN_ERROR", f"Cancel error: {str(e)}")


async def get_irn_status(db: Session, company_id: str, irn: str) -> dict[str, Any]:
    """Query IRN status from GSTN."""
    # Find the e-invoice by IRN
    einvoice = db.query(EInvoice).filter(
        EInvoice.company_id == company_id,
        EInvoice.irn == irn,
    ).first()

    if not einvoice:
        raise ValueError(f"E-Invoice with IRN {irn} not found")

    gst_reg = db.get(GstRegistration, einvoice.gstin_id)
    if not gst_reg:
        raise ValueError("GST registration not found")

    auth_token, _ = await get_access_token(db, gst_reg.gstin)

    url = f"{_get_base_url()}/eicore/v1.03/Invoice/irn"
    await _throttle(gst_reg.gstin)
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                url,
                params={"irn": irn},
                headers={
                    "client_id": settings.einvoice_client_id,
                    "client_secret": settings.einvoice_client_secret,
                    "gstin": gst_reg.gstin,
                    "AuthToken": auth_token,
                },
            )
        data = resp.json()
    except httpx.HTTPError as e:
        raise EinvoiceError("GSTN_UNAVAILABLE", f"IRN status query network error: {e}")
    if resp.status_code != 200 or data.get("Status") != 1:
        error_msg = data.get("Message", "IRN status query failed")
        error_code = str(data.get("ErrorCode", "QUERY_FAILED"))
        raise EinvoiceError(error_code, error_msg, data)

    return data.get("Data", {})
