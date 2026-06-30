# E-Invoice Integration Plan — Zledger (Phase 11)

## Overview
Integrate with GSTN's Invoice Registration Portal (IRP) to generate IRN (Invoice Reference Numbers), digitally signed QR codes, and signed invoices for B2B sales vouchers. This is mandatory for businesses with aggregate turnover > ₹5 crore.

## GSTN API Summary
- **Auth:** `POST /eivital/v1.04/auth` — AES-256 encrypted credentials, returns AuthToken + Sek (session encryption key)
- **IRN Generation:** `POST /eicore/v1.03/Invoice` — AES-256 encrypted payload, returns IRN + AckNo + SignedQRCode
- **IRN Cancel:** `POST /eicore/v1.03/Cancel` — cancel within 24 hours
- **IRN Search:** `GET /eicore/v1.03/Invoice/irn?irn={irn}` — retrieve existing IRN
- **Encryption:** AES-256-ECB with PKCS#7 padding (NOT CBC/GCM)
- **Sandbox:** `https://einvoice1-trial.nic.in`
- **Production:** `https://einvoice1.gst.gov.in`

## What Exists Already
- `EINVOICE_ENABLED` + `EINVOICE_ENV` in config (scaffolding only)
- `GstRegistration` model with GSTIN, legal name, state code
- `Party` model with GSTIN, state code, PAN, address
- `Voucher` model with compliance fields (place_of_supply, counterparty_gstin, counterparty_state_code)
- `VoucherLine` model with HSN/SAC, taxable_value, GST amounts
- `HsnSac` model with codes and rates

## Implementation Plan

### Step 1: Config & Dependencies
**Files:** `backend/app/core/config.py`, `backend/pyproject.toml`, `docker-compose.yml`, `.env`

- Add to `Settings`: `einvoice_gstin`, `einvoice_client_id`, `einvoice_client_secret`, `einvoice_username`, `einvoice_password`, `einvoice_api_url` (derived from env)
- Add dependencies: `pycryptodome` (AES-256), `httpx` (HTTP client), `qrcode` (QR code generation)
- Uncomment credential env vars in `.env` and `.env.example`
- Pass credential env vars through in `docker-compose.yml`

### Step 2: E-Invoice Model + Migration
**Files:** `backend/app/models/einvoice.py`, `backend/alembic/versions/0006_einvoice.py`

Create `e_invoices` table:
```
- id (UUID PK)
- company_id (FK → companies)
- voucher_id (FK → vouchers, unique per company)
- gstin_id (FK → gst_registrations)
- irn (string, 64 chars, nullable)
- ack_no (string, nullable)
- ack_dt (string, nullable)
- signed_qr_code (text, nullable — base64 QR image)
- signed_invoice (text, nullable)
- status (string: draft | submitted | generated | cancelled | failed)
- error_message (text, nullable)
- submitted_at (timestamp, nullable)
- generated_at (timestamp, nullable)
- cancelled_at (timestamp, nullable)
- cancel_reason (string, nullable)
- cancel_remark (string, nullable)
- created_at, updated_at (timestamps)
```

Register model in `models/__init__.py`.

### Step 3: GSTN API Client Service
**File:** `backend/app/services/einvoice_client.py`

Functions:
- `get_access_token(db, company_id)` → (token, sek) — authenticate with GSTN, cache token for 6 hours
- `generate_irn(db, company_id, voucher_id)` → EInvoice — encrypt payload, submit, parse response
- `cancel_irn(db, company_id, einvoice_id, reason, remark)` → EInvoice — cancel IRN
- `get_irn_status(db, company_id, irn)` → dict — search existing IRN
- `_aes_encrypt(data, key)` → bytes — AES-256-ECB encryption
- `_aes_decrypt(data, key)` → bytes — AES-256-ECB decryption

### Step 4: E-Invoice Payload Builder
**File:** `backend/app/services/einvoice_builder.py`

Functions:
- `build_einvoice_payload(db, company_id, voucher_id)` → dict — convert voucher data to GSTN v1.1 schema:
  - `Version`, `TranDtls`, `DocDtls`, `SellerDtls`, `BuyerDtls`, `ItemList[]`, `ValDtls`
  - Maps: voucher → DocDtls, company/gst_registration → SellerDtls, party → BuyerDtls, voucher_lines → ItemList
  - Date format: DD/MM/YYYY (not ISO)
  - State codes: 2-digit GSTIN format
  - HSN codes: 6-digit minimum

### Step 5: E-Invoice Schemas
**File:** `backend/app/schemas/einvoice.py`

- `EInvoiceOut` — response model (id, irn, ack_no, ack_dt, status, signed_qr_code, etc.)
- `EInvoiceGenerateRequest` — request with voucher_id, gstin_id
- `EInvoiceCancelRequest` — request with cancel_reason, cancel_remark

### Step 6: E-Invoice API Router
**File:** `backend/app/api/v1/einvoice.py`

- `POST /api/einvoice/generate` — generate IRN for a voucher
- `POST /api/einvoice/{id}/cancel` — cancel an IRN
- `GET /api/einvoice/{id}` — get e-invoice details
- `GET /api/einvoice?voucher_id=...` — list e-invoices with filters
- `GET /api/einvoice/{id}/qr` — return QR code as PNG image
- `GET /api/einvoice/{id}/pdf` — return signed invoice PDF

Register in `api/v1/__init__.py`.

### Step 7: Frontend E-Invoice Page
**Files:** `frontend/src/pages/EInvoicePage.tsx`, `frontend/src/App.tsx`, `frontend/src/pages/DashboardPage.tsx`

- Add "E-Invoice" nav item to header
- E-Invoice list view with status badges (draft/generated/cancelled/failed)
- Generate button on voucher list (for eligible B2B sales vouchers)
- Detail view showing IRN, Ack No, QR code image, signed invoice
- Cancel button with reason/remark form
- QR code display as downloadable PNG

### Step 8: Tests
**Files:** `backend/tests/test_einvoice_service.py`, `backend/tests/test_einvoice_endpoints.py`

- Unit tests for `_aes_encrypt`/`_aes_decrypt` round-trip
- Unit tests for `build_einvoice_payload` (validate schema fields, date format, state codes)
- Unit tests for `generate_irn` with mocked GSTN API responses
- Integration tests for all API endpoints
- Tests for error handling (duplicate IRN, invalid credentials, network errors)

### Step 9: Documentation Updates
- Update `STATE.md`, `CHANGELOG.md`, `ROADMAP.md`, `TESTING.md`, `README.md`

## Key Technical Decisions
1. **Outbox pattern**: E-invoice generation should be async (background job) to avoid blocking voucher creation on slow GSTN API
2. **Token caching**: Store AuthToken + Sek in DB or Redis, refresh every 6 hours
3. **Idempotency**: Handle error 2102 (duplicate IRN) gracefully — store returned IRN as "already generated"
4. **QR code**: Generate PNG from `SignedQRCode` base64 string using `qrcode` library
5. **Sandbox-first**: All development against sandbox, production credentials separate

## File Change Summary
| File | Action |
|------|--------|
| `backend/app/core/config.py` | Add 5 credential settings |
| `backend/pyproject.toml` | Add pycryptodome, httpx, qrcode deps |
| `docker-compose.yml` | Pass credential env vars |
| `.env` / `.env.example` | Uncomment credential vars |
| `backend/app/models/einvoice.py` | NEW — EInvoice model |
| `backend/app/models/__init__.py` | Import EInvoice |
| `backend/alembic/versions/0006_einvoice.py` | NEW — migration |
| `backend/app/schemas/einvoice.py` | NEW — Pydantic schemas |
| `backend/app/services/einvoice_client.py` | NEW — GSTN API client |
| `backend/app/services/einvoice_builder.py` | NEW — payload builder |
| `backend/app/api/v1/einvoice.py` | NEW — API router |
| `backend/app/api/v1/__init__.py` | Register router |
| `frontend/src/pages/EInvoicePage.tsx` | NEW — e-invoice UI |
| `frontend/src/App.tsx` | Add route |
| `frontend/src/pages/DashboardPage.tsx` | Add nav item |
| `backend/tests/test_einvoice_service.py` | NEW — unit tests |
| `backend/tests/test_einvoice_endpoints.py` | NEW — integration tests |
| `STATE.md`, `CHANGELOG.md`, `ROADMAP.md`, `TESTING.md`, `README.md` | Update |
