# Architecture

## System Design
- **Pattern:** Layered Architecture
- **Frontend:** React SPA $\rightarrow$ API $\rightarrow$ Service $\rightarrow$ Model $\rightarrow$ DB.
- **Tenancy:** Multi-company, single-tenant (One deployment, many companies).
- **Core Logic:** Strict double-entry bookkeeping.

## Tech Stack
- **Backend:** Python (FastAPI), SQLAlchemy 2.0, Alembic.
- **Database:** PostgreSQL 16.
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, React Query, Zustand.
- **Deployment:** Docker Compose (Nginx serving SPA, FastAPI API, PostgreSQL).

## Key Design Decisions
- **Money:** All monetary values use `Numeric(18,2)` in Postgres and `Decimal` in Python. No floats.
- **Integrity:** Ledger lines are append-only.
- **GST:** Explicit half-up rounding for GST calculations.
- **Company Scoping:** All API requests must be scoped to a company via a company context.

## Folder Structure
- `backend/app/api/v1/`: API routes.
- `backend/app/services/`: Business logic (where accounting rules live).
- `backend/app/models/`: SQLAlchemy ORM models.
- `backend/app/schemas/`: Pydantic validation.
- `frontend/src/`: React application.
- `frontend/src/pages/vouchers/shared/QuickCreate/`: Reusable Quick Create framework for inline master creation from voucher entry (configs, modal, select wrapper).

## Quick Create Framework
- **Purpose:** Allows users to create missing masters (Ledger, Party, Stock Item, Stock Group, Unit, Cost Centre, Cost Category) directly from voucher entry without leaving the form.
- **Components:**
  - `QuickCreate/configs.ts` — Central registry: API path, fields, validation per entity type.
  - `QuickCreate/Modal.tsx` — Dynamic form modal rendering per-entity fields with async option loading (e.g. account groups for Ledger).
  - `QuickCreate/Select.tsx` — Native `<select>` augmented with a "+" button; opens modal, auto-selects new item on success.
- **Data flow:** Modal submit → API POST → `onItemCreated` callback appends to parent state → select re-renders with new option → `onChange(newItem.id)` auto-selects.
- **Supported entities (7):** `ledger`, `party`, `stock_item`, `stock_group`, `unit`, `cost_centre`, `cost_category`.
- **Backing models:** Unit, CostCentre, CostCategory in `models/masters.py`; API at `/api/masters/*`.

## E-Way Bill Integration
- **GSTN E-Way Bill API client** with authentication, payload generation, cancellation, and vehicle update.
- **Triggered on** sales/purchase voucher posting when value > ₹50,000.
- **Model:** `EwayBill` in `models/eway_bill.py` — stores E-Way Bill number, validity, transport details, status.
- **API:** `/api/v1/eway-bill` — 6 endpoints for full lifecycle management.

## Voucher Cancellation
- **Posted vouchers** can be cancelled with a reason.
- **Reversal entry** automatically created: swaps debit/credit for all original lines (including GST lines).
- **Stock entries** deleted for sales/purchase cancellations.
- **Audit trail** logged with cancellation reason.

## Cost Centre System
- **Optional `cost_centre_id`** on every VoucherLine for expense/income allocation.
- **Cost Centre P&L report** breaks down results by cost centre.
- **Backing model:** `CostCentre` in `models/masters.py`.

## Stock Valuation
- **Weighted Average:** running average rate across all purchases.
- **FIFO:** first-in-first-out lot tracking (simplified).
- **Stock Balance table** (`StockBalance`) maintained on each stock entry/posting.
- **Auto-update** when sales/purchase vouchers are posted.
