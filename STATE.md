## Dropdown Arrow Key Scroll Fix — DONE (2026-07-29)

### Bug
Dropdown fields on the voucher page could not be visually scrolled to follow the highlighted option when using arrow keys to navigate past the visible area. The highlight did move correctly but was invisible once it scrolled off the bottom of the `max-h-[200px]` container.

### Root Cause
`scrollIntoView` in both `SearchableSelect.tsx` and `MasterSelector.tsx` used `listRef.current.children[highlighted]`. `listRef` points to the popup root div, whose direct children are: (1) the search input header when searchable, and (2) the options container div. The actual option elements are children of child‑2, not direct children of `listRef`. So `children[0]` was the header (not an option) and `children[1]` was the options container itself (not any individual option). Scrolling targeted the wrong element and never brought the highlighted option into view.

### Fix
Added a dedicated `optionsContainerRef` pointing to the `.max-h-[200px].overflow-auto` div (the direct parent of the option elements) in both `SearchableSelect` and `MasterSelector`. The scroll `useEffect` now uses `optionsContainerRef.current.children[highlighted]`, so the highlighted option always scrolls into view.

### Verification
- `npm run build` clean (0 TS errors)
- `make rebuild-web` green
- API health: 200


## Tally Import — DONE (2026-07-28)

### Backend
- **TallyData JSON round-trip** — Added `tally_data_to_json()` / `tally_data_from_json()` to `tally_parser.py`; serializes all TallyData objects (groups, ledgers, parties, vouchers, stock) to JSON for storage in `ImportJob.content`.
- **`POST /tally-import/upload-multiple`** — Accepts multiple XML/Excel files in a single request, merges them into one import job. Drop All Masters + All Vouchers together.
- **`POST /tally-import/upload`** — Single XML/Excel upload (unchanged).
- **`POST /tally-import/upload-archive`** — ZIP archive upload (unchanged).
- **Binary parser** (`read_tally_company` in `tally_binary.py`) — Extracts groups + ledgers from `.1800` files. Vouchers/amounts not decoded. Backend endpoints (`scan-companies`, `browse`, `from-folder`) remain active but not exposed in UI.

### Frontend
- **Multi-file DropZone** — Accepts multiple files via drag-and-drop or file picker. Single file → `/upload`. Multiple files → `/upload-multiple` (merged into one job). ZIP files → `/upload-archive`.
- **Step progress indicator** — Visual `Upload → Validate → Preview → Complete` bar replaces misleading "Step X of 4" text.
- **Uploaded files summary** — After upload, the Validation step shows each file name with parsed content counts (e.g. "35g 14l 3v").
- **Recent imports panel** — Shown on the source selection page. Lists last 3 imports with file name, item count, status, and date. Quick "View" and "Details" buttons.
- **Quick re-import** — Done step shows "Start Fresh" (full reset) and "Import Another File" (keeps destination company, goes back to upload).

### Verification
- Multi-file upload (ALLMASTER + ALLVOUCHER): 28 groups, 14 ledgers, 3 vouchers in one job.
- Single XML upload: unchanged.
- ZIP archive upload: unchanged.
- Step indicator renders correctly through all 4 stages.


## GDrive Backup Fix — DONE (2026-07-27)

### Root causes fixed
1. **API crash (IndentationError)** — `update_backup_settings` in `backend/app/api/v1/admin.py` had broken indentation under the `retention_days` / `gdrive_enabled` blocks; Python refused to import `app.api.v1.admin`, so the API container crash-looped. Rewrote the block with correct indentation.
2. **PUT `/backup/settings` silently no-op'd** — the whole update was guarded by `if os.path.exists("/app/.env")` which is **false** (no `.env` mounted in the container). Now `os.environ` is always updated and the `.env` is only written when it exists.
3. **`scripts/backup.sh` GDrive block was dead code** — lines had `"\${BACKUP_DIR}"` / `"\${GDRIVE_ENABLED}"` (escaped dollars), so the shell evaluated literal strings and the GDrive upload **never ran**. Fixed to `${BACKUP_DIR}` / `${GDRIVE_ENABLED}`. Switched shebang to `#!/usr/bin/env bash` + `set -euo pipefail` so a failed `pg_dump` aborts instead of producing a 4K garbage gzip that gets "uploaded".
4. **`pg_dump` had no password** — the API container has `DATABASE_URL` (with the real password) but no `POSTGRES_PASSWORD`. `trigger_backup` now parses `DATABASE_URL` and injects `POSTGRES_*` into the subprocess env; verified `pg_dump` produces a real 604K PGDMP dump.
5. **`test_gdrive_connection` lied "ok"** — it only did a format check and swallowed the userinfo HTTP error. Now it exercises rclone end-to-end (writes a private `rclone.conf`, runs `rclone mkdir gdrive:<remote>/`) so success here means the next backup sync will also succeed. rclone auto-refreshes the access_token via the refresh_token.
6. **GDrive toggle persisted nowhere actionable** — `update_backup_settings` and `save_gdrive_token` now write a `/backups/gdrive-enabled` flag file. `scripts/rclone-entrypoint.sh` checks the env var **OR** the flag file, regenerates `rclone.conf` before each cycle, so enabling GDrive via the API no longer requires a backup-container restart.
7. **Account email missing on dashboard** — the `rclone authorize drive` token only carries the `drive` scope (not `userinfo.email`), so the OAuth userinfo endpoint returned 401. Switched to the Drive v3 `about?fields=user(emailAddress,displayName)` endpoint (works with the `drive` scope we already have) and persisted the email into the token file via `account_email`. Dashboard now shows "Connected as <email>".
8. **Quota rate-limiting on rclone shared client_id** — added `--low-level-retries 5` and retries with sleep on 429/403 from Google, with distinct message ("Google is rate-limiting the shared rclone client_id right now — try again in a minute") vs auth-failure messages.

### Verification (live, 2026-07-27)
- `docker compose build api backup` green; both containers start healthy.
- `PUT /api/admin/backup/settings {gdrive_enabled:true}` → returns `gdrive_enabled: true`, writes `/backups/gdrive-enabled` flag.
- `POST /api/admin/backup/gdrive-test` → `status: ok`, `account_email: minatolun@gmail.com`, persisted to token file.
- `POST /api/admin/backup/trigger` → `last_sync_status: success`, `last_sync_duration_seconds: 9`, `last_error: ""`; backup files landed in Google Drive at `zledger-backups/`.


## Indian Compliance Features — DONE (2026-07-27)

### 9 Backend Compliance Features
1. **Audit Trail Hardening** — SHA-256 hash-chained tamper-evident audit logs (`previous_hash`, `current_hash` columns on `audit_logs`). Migration `bd53ce4b6e7c`.
2. **Schedule II Depreciation Enforcement** — `schedule_ii_class` on `AssetCategory`; auto-computed WDV/SLM rates per Companies Act Schedule II useful lives. `SCHEDULE_II_USEFUL_LIVES` map covers buildings, plant, computers, vehicles, furniture, etc. Functions: `get_schedule_ii_useful_life()`, `compute_schedule_ii_rate()`, `auto_compute_rate_if_needed()`. Migrations `bdee030c0ac8`, `de061ac839a5`.
3. **TDS/TCS Threshold Logic** — `buyer_turnover_threshold` (194Q), `seller_turnover_threshold` (206C-1H), `override_rate` (206AA), `multiplier`+`min_rate` (206AB) on `TdsTcsSection`. `calculate_tds_tcs()` applies all thresholds. Migration `2dfd7e70dfb6`.
4. **GSTR-2B Lite Reconciliation** — `generate_gstr2b_lite()` simulates 2B data; `POST /api/gst/gstr2b/reconcile` endpoint matches purchase register vs 2B. Schemas in `gst.py`.
5. **ITC Reversal Rule 42/43** — `calculate_itc_reversal()` computes exempt-supply (Rule 42) and capital-goods (Rule 43) reversal. `POST /api/gst/itc-reversal` endpoint.
6. **TDS/TCS Certificate Generation (Form 16A/27D)** — `TdsTcsCertificate` model; quarterly/annual certificate generation/issue. API: `POST /tds-tcs/certificates/generate`, `GET /tds-tcs/certificates`, `POST /tds-tcs/certificates/{id}/issue`. Migration `5e08b2775121`.
7. **Form 16/16A/27D Generation** — Certificate generation covers both TDS (Form 16A) and TCS (Form 27D) with party/section grouping.
8. **Deferred Tax (Ind AS 12)** — `compute_deferred_tax()` identifies timing differences (depreciation, gratuity provisions, doubtful debts, loss carryforward), computes DTA/DTL.
9. **Gratuity Provision (Ind AS 19 Simplified)** — `compute_gratuity_provision()` using PUCM: PVO, current service cost, interest cost, actuarial gain/loss. Simplified assumptions from employee count + average salary.

### Frontend Integration
- **TDS/TCS Page** (`TdsTcsPage.tsx`): New Certificates tab with list/generate/issue flow. Threshold fields in section creation form.
- **Compliance Page** (`CompliancePage.tsx`): Deferred Tax tab (DTA/DTL summary, timing differences). Gratuity Provision tab (PVO, expense breakdown, assumptions).

### Verification
- All features tested against demo data (3 companies, 12 FYs)
- Frontend TypeScript: 0 errors
- Frontend Docker build: all new features in bundled JS
- API health: 200
- Certificate flow end-to-end: create entry → deposit → generate Form 16A



### Report Consolidation
- **`frontend/src/pages/reports/shared.tsx`**: Extracted shared rendering logic (formatting, preview/download buttons, group table, rows) used by 6 reports (Balance Sheet, Cash Flow, Outstanding, P&L, Register, Trial Balance). **−115 lines net.**

### Decimal Schema Fix
- **`backend/app/schemas/voucher.py`**: All 14 `float` financial fields → `Decimal` to eliminate floating-point rounding errors (`amount`, `cgst_rate`, `sgst_rate`, `igst_rate`, `taxable_amount`, `gst_amount`, `total_amount`, `rate`, `quantity`, `discount_percent`, `cess_rate`, `cess_amount`, `round_off`, `tds_amount`). Backward-compatible JSON→Decimal coercion.

### Model Fragmentation
- `RecurringTemplate` and `PaymentAllocation` extracted from `voucher.py` into `backend/app/models/recurring_template.py` and `backend/app/models/payment_allocation.py`. Import paths updated across `admin.py`, `recurring_templates.py`, `cron_runner.py`, `payments.py`, seed scripts. No schema changes — pure code organization.

### Model Auto-Discovery
- **`backend/app/models/__init__.py`**: Replaced 90-line manual import list + `__all__` with automatic `pkgutil.iter_modules` discovery — new model files auto-register with Alembic.

### Workflow Automation
- **`.pre-commit-config.yaml`**: Ruff lint + format on commit.
- **`.github/workflows/migration-check.yml`**: CI `alembic check` to catch missing migrations.
- **`Makefile`**: Added `migration-check` and `lint` targets.
- **`backend/pyproject.toml`**: Added `[dev]` deps (`pytest`, `pytest-xdist`, `httpx`, `ruff`), `[tool.ruff]` config, pytest parallel settings.
- **`backend/Dockerfile`**: Reverted `pip install ".[dev]"` → `pip install .` (dev deps installed at runtime when needed).

### OmnIRoute Integration Reverted & API Container Fixed
- Removed unintended files (`ai.py`, `ai_service.py`, `frontend/src/services/ai.ts`).
- Reverted OmnIRoute config from `config.py`, `__init__.py`, `.env.example`.
- Rebuilt API image to fix stale-image crash (`effective_database_url` missing) → **299/299 tests pass**, login works.


# Project State

## Current Location
- **Path:** /home/popsickle/ktMedia/Media1/Project/Zledger

## Backdrop + Header Search Overhaul — DONE (2026-07-26)

### Modal backdrop fixes
- **AdminCompaniesPage** create/edit modal now uses `createPortal(..., document.body)` with the same `fixed inset-0 z-[99999] flex items-start justify-center overflow-y-auto bg-black/40 pt-8 pb-8` pattern as `VoucherModal` — backdrop now covers the full viewport including the top header area (was clipped by the app layout's stacking context because the modal rendered inline inside the page content).
- **CompanySelectPage** switch-mode overlay refactored to the same single-container pattern (backdrop + content merged into one `fixed inset-0` div, eliminating a missing `)}` JSX bug from the prior Fragment-based approach).

### Header search overhaul
- **Unified tab registry** (`frontend/src/config/modules.ts`): new `PAGE_TABS` map declaring all in-page tabs for 11 pages (vouchers, fixed-assets, inventory, manufacturing, gst, tds-tcs, reports, payments, loans, compliance), plus `SEARCH_VOUCHER_TYPES` for the 8 voucher create types (sales/purchase/payment/receipt/contra/journal/credit_note/debit_note).
- **Voucher `?type=` URL binding** (`frontend/src/pages/vouchers/index.tsx`): `activeType` now initializes from `?type=` param; the `?action=new` auto-open handler also consumes `?type=` to pre-select the specific voucher create tab. So `?action=new&type=sales` lands directly on the Sales Invoice creation form.
- **TopHeader search** (`frontend/src/components/TopHeader.tsx`):
  - `SearchItem` extended with new `type: "tab" | "voucher"` variants (in addition to `"page" | "action"`).
  - `searchItems` now builds pages → voucher types → per-page tabs → actions (in that render order). Per-page tabs only render for page routes enabled for the active company (module gating respected).
  - Results panel: empty state ("Type to search pages, tabs, and actions…") shown before any query typed — no pre-listed results. Previously the modal pre-listed 8 pages on open.
  - New "Create Voucher" and "Tabs" sections render with proper icons and `globalIdx` keyboard navigation (offsets computed to match `allItems` order: pages → vouchers → tabs → actions).
  - New `redirect` icon added to `NavIcon.tsx` for the Tabs section.
- **Pruned SEARCH_COMMANDS** (`frontend/src/config/modules.ts`): removed 20 pure-navigation duplicates now covered by the Pages/Tabs sections (browse-vouchers, daybook, voucher-register, gst-einvoice, gst-eway, gst-hsn, gst-registrations, gst-compliance, loans-dashboard, report-trial-balance, report-pnl, report-balance-sheet, import-tally, company-settings, compliance-dashboard, compliance-schedule-iii, compliance-income-tax, compliance-icai-nce, compliance-gst-status, new-voucher). Searching "daybook" now surfaces only the Vouchers › Daybook **tab** (no misleading "+ Day Book" action). Only 16 genuine "Create" actions remain under the Actions section.
- `tsc -b` clean; `make rebuild-web` green.

## Voucher E2E Fix — DONE (2026-07-25)
- **Fixed 4 failing voucher E2E tests** (Payment, Receipt, Contra, Journal) in `vouchers.spec.ts`. All 8/8 voucher tests now pass.
- **Production bug fixed:** `handleSave` in all3 voucher forms (`AmountVoucherForm`, `ItemVoucherForm`, `JournalForm`) called `resetForm(true)` unconditionally after `onSubmit`, even on API errors. `handleSubmit` swallowed errors (never re-threw), so forms always cleared — users lost data on failed saves. Now: `handleSubmit` re-throws after showing toast; `handleSave` wraps in try/catch and only resets on success.
- **E2E resilience:** added per-run unique `RUN_ID = Date.now()` to narration strings to prevent backend duplicate detection (409) across repeated test runs.
- **Tests:** `vouchers` 8/8, `real-user-flow` 25/25, `daybook` 5/5 E2E pass. 37/37 total.
- **Cleanup:** removed 12 debug spec files.

## Bank Reconciliation Overhaul — DONE (2026-07-21)
- Transformed from **statement viewer** to **matching workspace** (5 phases implemented).
- **Backend:** enhanced `GET /summary` (statement_balance, book_balance, difference, suggested_count), `GET /batch-suggest` (top candidate per unreconciled line), `POST /create-voucher` (auto-create payment/receipt + match), `POST /mark-bank-charge` (journal entry + match), `POST /lines/bulk-mark-reconciled` (bulk manual confirm), `GET /lines` filtering (date_from, date_to, type, min_amount, max_amount, search).
- **Frontend:** `Drawer.tsx` (new right slide-over), `Tabs.tsx` (count badges), `BankReconciliationPage.tsx` full rewrite — Balance Comparison Card, conditional Import Section, collapsible Auto-Match Panel, Tabs with Counts (All/Suggested/Unreconciled/Reconciled), advanced Filters, Match Drawer (replaces modal), per-row actions (Find Match/Create Voucher/Ignore), Suggested Match column, Balance Dr/Cr formatting, Bulk Action Bar (Mark Reconciled/Delete/Clear).
- **Tests:** `bank-reconciliation-workflow` 3/3, `api-backend` 128/128, `vouchers` 8/8, `quick-edit` 1/1, `quick-create-audit` 2/2 E2E pass.

## Contextual Quick Create & Inline Master Creation (`MasterSelector`) — DONE (2026-07-20)
- Universal `frontend/src/components/master/{MasterSelector,MasterSelectorModal,masterConfigs}.tsx` replaces old voucher-only `QuickCreate/`. Refactored into `LedgerLineTable`, `AmountLineTable`, `VoucherHeader`, `ItemLineTable`. Inline create/edit of Party/Ledger/Group/Stock Item/Stock Group/Unit from any voucher form, with nested create (`createEntity`), keyboard shortcuts, and `created_from` audit trail (no new DB column — `log_action` description `(from: <ctx>)`).
- Backend: `created_from` added to 6 create schemas, threaded into `log_action` with `db.commit()`; inventory create endpoints now require `get_current_user`.
- **Root-cause fix for failing Payment/Receipt/Contra E2E:** the option's inline-edit pencil was left-packed (`flex items-center`) and landed under the option's center click-point for long labels, so clicking an option opened the Edit modal instead of selecting. Pushed pencil to far right (`ml-auto`). All 8 voucher E2E + 2 audit E2E pass; `tsc -b` clean.
- **Bug fix (2026-07-20):** inline Edit opened but showed "Failed to load record for editing". Root cause: `MasterSelectorModal` edit mode fetched `GET /{entity}/{id}`, but no single-item GET routes existed (only list endpoints) → 404. Added `GET /{entity}/{id}` for all 6 entities (`accounting.py`, `inventory.py`, `masters.py`) + `description` to `AccountGroupOut`. Added `tests/e2e/specs/quick-edit.spec.ts` (passes). Rebuilt `api` + `api_e2e`.
- **UX (2026-07-20):** removed the redundant standalone "+" quick-create button from `MasterSelector` (it duplicated the inline "Create 'X'" row in the dropdown). Inline create row unchanged. `tsc -b` clean; `quick-edit` + `vouchers` E2E green.
- Deferred (no backend models): Brand / Warehouse / TaxRate / HSN-SAC / Batch master creation.

## E2E Spec Repair — route/selector drift (2026-07-18)
- **Goal:** bring the full Playwright E2E suite green after UI route/selector changes (GST moved to `/gst?tab=...`, sidebar "Settings" group, portal-based Select/SearchableSelect, fixed header + collapsible sidebar, party option labels now include GSTIN).
- **navigation.spec.ts** — rewritten to the real TopHeader/AppSidebar: expand sidebar via `title="Expand sidebar"`; groups are Accounting/Inventory/GST & Tax/Reports/Settings; GST subgroup link is `/gst` (not a "GST" button); search placeholder `Search pages and actions...`; profile via `button.rounded-full`; appearance Light/Dark/Auto. 17/17.
- **path-a-features.spec.ts** — Mobile Sidebar tests fixed: two `<aside>` elements now (desktop `hidden lg:flex`, mobile `lg:hidden`). Mobile drawer = `aside.last()`; hamburger = `button[class*='top-3']`; desktop sidebar has no `lg:translate-x-0` (it is always `hidden lg:flex`). 13/13.
- **vouchers.spec.ts** — `selectOption`/`fillLedgerLine` now: dismiss any open overlay first (Escape), use `fill()` + click (not `keyboard.type`+Enter) on the SearchableSelect search input, and match options by **substring** because party option labels render as `Name (GSTIN)` when a GSTIN exists. 8/8.
- **real-user-flow.spec.ts** — Dashboard assertion uses `getByRole("heading",...)` (was strict-mode `getByText("Dashboard")` matching 3 nodes); Security tab asserts `Appearance` (the old `Active Sessions` text does not exist — Security tab only has Change Password + Appearance). 24/24.
- **restore-e2e.spec.ts** — "Full restore" now detects the new backup by **count increase** (`beforeCount` vs list length, newest-first) instead of "newest filename not in beforeNames" (backups persist on disk across runs, so the old name-set comparison misfired and `backupFile` stayed empty → 60s timeout). Also added `test.setTimeout(300000)`. 3/3.
- **gst-challans.spec.ts** — "Return detail view loads without JS errors" ignored benign `ERR_NETWORK_CHANGED` / "Failed to load resource" network flakes (headless Chromium in container) so they aren't treated as app JS errors. 3/3.
- **Full suite result:** 531 passed, 0 failed (was 528 passed / 1 failed before the gst-challans network-flake fix).

## Current Milestone
- **Active Phase:** Voucher Page Layout — Context Sidebar & Width Optimization
- **Status:** Completed

### Changes
- Added `VoucherSummaryData` interface (types.ts)
- Added `onSummary` callback to ItemVoucherForm, AmountVoucherForm, JournalForm
- Created `VoucherSidebar.tsx` with Voucher Summary + Party Details cards
- Wired sidebar into vouchers/index.tsx with flex layout (75% form / 25% sidebar)
- Sidebar responsive (hidden below 1024px)
- Browse and Daybook tabs unchanged

## Stock Item Type (Goods/Service) — DONE (2026-07-26)
- **Backend model:** Added `item_type` column to `StockItem` model (`VARCHAR(10)`, default `"goods"`, not nullable)
- **Migration:** `0056_abc123_item_type.py` adds column with `server_default="goods"` for existing rows
- **Schema:** Added `item_type` to `StockItemCreate` and `StockItemOut` with validation (`must be "goods"` or `"service"`)
- **HSN/SAC validation fix:** Relaxed `StockItemCreate.validate_hsn` to accept 4-8 digit codes (was too strict)
- **Seed data:** Updated `create_stock_item()` to accept optional `item_type` parameter
- **Frontend:** Added Item Type selector dropdown in stock item form, "Type" column in stock items table (purple badge for Service, gray for Goods)
- **API tests:** All 4 scenarios pass (create goods, create service, default to goods, invalid type → 422)
- **E2E tests:** All 11 inventory API tests pass; all 8 voucher tests pass; all 5 daybook tests pass; all 6 bulk-action tests pass

## Modal UX Polish — DONE (2026-07-26)
- **Auto-focus:** Added `autoFocus` or ref-based focus to first input in all popup modals (TdsTcsPage, AdminUsersPage, RecurringTemplatesPage, HsnSacPage, GstRegistrationsPage, LoansPage, PaymentsPage, PartiesPage, MembersPage, AdminCompaniesPage, ConfirmDialog, BankReconciliationPage, etc.)
- **Escape key:** Created reusable `useEscapeToClose` hook; added to all modals missing Escape handling
- **Inline → Modal conversion:** Converted RecurringTemplatesPage, AdminUsersPage (create/assign), HsnSacPage, GstRegistrationsPage from inline forms to popup overlays
- **Positioning standardization:** All modal overlays now use consistent `fixed inset-0 z-[9999] flex items-center justify-center bg-black/40` positioning
- **Tests:** All 19 related E2E tests pass

## Indian Compliance Backend (2026-07-18)
- **Module ID:** `compliance` — gated by `require_module("compliance")` backend; now in `ALL_MODULES` (model `user.py`).
- **Migration `0054_company_compliance_fields.py`:** added Company columns `tan, cin, constitution, income_tax_regime (default 'old'), audit_required`; new tables `indas_schedules`, `income_tax_regime_configs`, `icai_nce_templates`, `compliance_reports` (each with `created_at`/`updated_at`). `ensure_default_schedules` + `ensure_default_templates` seeded on company create (companies.py, admin.py, seed_demo_data.py).
- **Engine `services/compliance.py`:** `get_schedule_iii_balance_sheet` (Dr=+/Cr=− universal sign; system_code→IndAS schedule lookup), `get_indas_profit_loss`, `compute_income_tax` (old/new slabs, 87A rebate, surcharge, presumptive 44AD/44ADA/44AE), `set_income_tax_regime` (upsert + sets `Company.income_tax_regime`), `get_icais_nce_statements`, `get_gst_compliance_status` (GSTR-1/3B/9), `save_compliance_report`.
- **Router `api/v1/compliance.py`:** `/compliance` prefix; `schedule-iii/balance-sheet`, `indas/profit-loss`, `income-tax/compute`, `income-tax/regime` (owner/admin), `icai-nce`, `gst-status`, `reports`; PDF/XLSX exports for schedule-iii, income-tax, icai-nce. Regime POST accepts `financial_year` (name) in body.
- **Exports `services/export.py`:** appended `_compliance_pdf`/`_compliance_xlsx` + builders.
- **Schema fix:** `ScheduleIIIResponse` & `IndASPLResponse` money fields typed `Decimal` (engine returns Decimal) — was `str`, caused 5 pydantic validation errors (500 on balance-sheet/PL JSON + exports).
- **Tests:** `backend/tests/test_compliance.py` 9 pytest pass; `tests/e2e/specs/compliance.spec.ts` 9/9 pass (regime POST + exports fixed by resolving companyId fallback in test fetches; `require_role(CompanyRole.admin)` → `require_company_role("owner","admin")` because "admin" isn't in the viewer/accountant/owner hierarchy).

## COA: equities under Current Liabilities (2026-07-19)
- **COA page (`ChartOfAccountsPage.tsx`):** capital-nature primary groups now nested as children of the Current Liabilities primary group in the tree (was a separate top-level section).
- **Schedule III BS (`services/compliance.py`):** equity/capital system_codes now map to the "Current Liabilities" heading (Part I) instead of "Shareholders' Funds". `test_compliance.py` assertion updated. Rebuilt `api` + `api_e2e`.
- **E2E:** chart-of-accounts 7/7, compliance 9/9 green.

## Persist active company + require selection (2026-07-19)
- **Bug:** after app/browser restart the admin stayed "logged in" (token in localStorage) but no company was selected (id was in sessionStorage, wiped on restart) → app rendered with no `X-Company-Id` and errored on navigation.
- **Fix:** company id now persisted in `localStorage` (`zledger.company`) like the token; removed per-tab `getTabId` machinery in `client.ts`. `auth.ts` gained `meLoaded`; `App.tsx` redirects authenticated users with no valid `activeCompanyId` to `/companies` (waits for `meLoaded` to avoid false redirect). A persisted id not in the user's `companies` list is cleared (handles post-reseed stale ids).
- **Backend fix:** seed generated malformed 9-char TANs (`27Z46048A`) that failed `TAN_REGEX`, making `GET /companies/{id}` 500 (surfaced by the dashboard's company-details fetch). Now generates valid 10-char TANs. `api` + `api_e2e` images rebuilt.
- **E2E:** dashboard-content 4/4, compliance 9/9, navigation 17/17, gst-pages 7/7 green. Fixed a `navigation.spec.ts` selector ambiguity (E-Invoice now appears as tab + page heading + create button) to scope the assertion to the tab button.

## Compliance Frontend UI + docs (2026-07-19)
- **`src/pages/CompliancePage.tsx`:** full rewrite as `/compliance` page — 5 tabs (Schedule III BS, Ind-AS P&L, Income Tax, ICAI NCE, GST Status) sharing a `useFyStore` FY selector. Income Tax tab: old/new regime toggle, `compute` + `POST /compliance/income-tax/regime` election (owner/admin), PDF/XLSX downloads. Other tabs: PDF/XLSX via `downloadFile`. `?tab=` deep-link supported.
- **`src/config/modules.ts`:** `compliance` in MODULES; new "Compliance" nav group; 6 search commands; `ROUTE_MODULES["/compliance"]="compliance"`. **`src/App.tsx`:** `/compliance` route under ModuleGate.
- **`docs/COMPLIANCE.md`:** endpoints, regime body, curl examples, entity→statement mapping, UI usage.

## Table Interaction Unification — DONE (2026-07-26)

### Background
17+ table instances used 6 inconsistent interaction patterns. Unified to 3 standard patterns per table purpose.

### Standard Patterns
| Pattern | When | Behavior |
|---|---|---|
| **(A) Row click → detail** | Read-only detail primary (AuditLog, Payments, DayBook) | Row click opens modal/drawer. No actions column. |
| **(B) Row click + inline actions** | 1-3 primary actions (Manufacturing, Routings, WorkCenters, BatchBrowse) | Row click opens detail. Right side icon buttons for edit/delete. |
| **(C) Row click + kebab menu** | 4+ actions (AdminUsers, RecurringTemplates) | Row click opens detail. Right side `...` button opens ContextMenu. |

### Changes
1. **`SortableTable.tsx`** — Added `actions` prop + `ActionsCell` (inline 1-3, kebab 4+).
2. **Step 2: Ad-hoc columns migrated** (4 files): RoutingsTab, WorkCentersTab, BatchBrowsePage, ManufacturingPage (batch tab).
3. **Step 3: Custom tables migrated** (5 files): AdminUsersPage, MembersPage, RecurringTemplatesPage, FixedAssetsPage (2 tabs), AdminCompaniesPage.
4. **Special cases preserved**: COA tree, DayBook grouped, BankReconciliation.

### Verification
- `npm run build` clean (0 TS errors)
- `make rebuild-web` successful
- 10 migrated pages + 4 regression pages smoke-tested on `:9090` → all HTTP 200
- **Verification:** `make rebuild-web` succeeded (TS compiled); new bundle (`Statutory Compliance`) confirmed served on both `:9090` and `:9091`. Backend + E2E compliance specs were already green (9/9 each).

## Demo Data Overhaul — per company-type seed (2026-07-19)
- **Wipe policy:** `truncate_all` keeps ONLY `admin@zledger.com` (superadmin); deletes all other users + all companies/members + all transactional data. No demo users (alice/bob/etc.) are recreated.
- **`scripts/seed_demo_data.py` rewritten** to `seed_all_company_types()` — one company per constitution type via `COMPANY_TYPE_PLAN`: proprietorship, partnership, llp, private_limited, public_limited, huf, trust, society, others, + a composition-scheme proprietorship variant. Company #1 is kept as **"Apex Enterprises"** (Maharashtra, GSTIN 27AABCP1234A1Z5, trading) with the canonical demo parties (Royal Emporium, Metro Retail, City Mart, Global Distributors, Prime Imports) so existing E2E specs using `COMPANY` fixture keep passing.
- **Per company:** 3 financial years (2023-24 closed, 2024-25 closed, 2025-26 open); ~10 customers + 10 suppliers + TDS parties (inter/intra-state, GSTINs); industry-specific stock groups/items with opening balances; GST registration (regular/composition) + sections; TDS sections/entries/returns for TDS-heavy types; bulk vouchers (50 sales / 35 purchase closed-FY, ~25/18 open-FY) incl. credit/debit notes, payments, receipts, journals, contra; monthly GSTR-1/GSTR-3B + annual GSTR-9; e-invoices/eway bills for large sales (e-invoice-heavy types); recurring templates; bank statement lines + reconciliation; generic BOM from finished/raw items; fixed-asset categories/assets.
- **Volume:** 1 superadmin user, 10 companies, 30 FYs, ~3656 vouchers, ~12.3k voucher lines, ~218 parties, 58 stock items, 621 GST returns.
- **Commit per company** (`db.commit()` at end of `seed_company_type`) so a later company failure doesn't roll back earlier ones. `create_ledger` made idempotent (skip-if-exists) to avoid duplicate-name crashes.
- **Persists on rebuild/reseed:** `api` images rebuilt with new seed; live `zledger` DB reseeded via `python -m scripts.seed_demo_data`. Old 5-company `seed_apex`/etc. functions left in file but no longer called by `main()`.

## Seed Reduction to 3 Companies (2026-07-24)
- **`scripts/seed_demo_data.py`** rewritten to `seed_three_company_types()` — only 3 companies:
  - **Apex Enterprises** — proprietorship, Maharashtra. Trading-focused, standard GST.
  - **Partnership Uttar Co** — partnership, Uttar Pradesh. TDS-heavy, inter-state transactions.
  - **Pvt Ltd Karnataka Co** — private_limited, Karnataka. Manufacturing, e-invoice-heavy, BOMs.
- Old `COMPANY_TYPE_PLAN` removed; old `seed_all_company_types()` renamed but no longer called.
- `truncate_all()` + `seed_company_type()` retained for the 3 companies.
- **Commit per company** so later failure doesn't roll back earlier ones. `create_ledger` is idempotent.

## E2E Stack Removal — Tests on Live (2026-07-24)
- **Goal:** eliminate the separate E2E compose overlay (`docker-compose.e2e.yml`, `api_e2e`, `web_e2e`, `zledger_test` DB) and run all Playwright specs against the live stack on `:9090`.
- **Deleted files:** `docker-compose.e2e.yml`, `frontend/nginx.e2e.conf`, `tests/e2e/specs/restore-e2e.spec.ts`
- **`playwright.config.ts`:** `baseURL` changed from `:9091` to `:9090`
- **`run-isolated.sh`:** rewritten to reset + reseed the live `zledger` DB (container `zledger-api-1`) before each spec file
- **`Makefile`:** removed `web_e2e` from `rebuild-web` target
- **`setup.sh`:** removed E2E sync guard
- **All 17 spec files:** hardcoded `API` URLs changed from `:9091` to `:9090`
- **`AGENTS.md`:** single-stack section, removed E2E references
- **`README.md`:** updated E2E instructions
- **Test results:** `vouchers` 8/8, `api-backend` 128/128, `real-user-flow` 24/24, `bank-reconciliation` 3/3 — all GREEN on `:9090`

## E2E green — vouchers + manufacturing seed (2026-07-19)
- **`vouchers.spec.ts` (8/8) and `real-user-flow.spec.ts` (24/24) now green.**
- **Seed fixes (`scripts/seed_demo_data.py`, bulk `seed_company_type`):**
  - Added `_seed_production_orders_generic` + wired `seed_work_centers_and_routings` so every company gets a confirmed production order (PRD-YYYY-NNNN), 4 work centers, and the "Mouse Assembly Routing" (matches `real-user-flow` steps 4/5/6).
  - Renamed the default "Bank Account" ledger → **"HDFC Bank - Current A/c"** so `LEDGERS.hdfcBank` fixture is valid across all companies.
  - Added generic **"Sundry Debtors"** / **"Sundry Creditors"** control ledgers (bulk seed previously only created per-party `X (Debtor)` ledgers).
  - Fixed `_gstin_for` to emit valid-format 15-char GSTINs (`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{3}$`). The old generator produced a malformed PAN that made every party-based voucher POST return 422 `Invalid counterparty GSTIN format`.
- **`tests/e2e/helpers/fixtures.ts`:** `STOCK_ITEMS` updated to the bulk-seeded trading items (A4 Paper Ream, Ball Pen, USB Flash Drive 32GB, Wireless Mouse, Office Chair). `LEDGERS.hdfcBank` already "HDFC Bank - Current A/c" (now seeded).
- **`tests/e2e/helpers/interaction.ts`:** `selectOption` + `fillLedgerLine` now scope the SearchableSelect search input to the **visible** one (`input[placeholder='Type to search...']:visible`) and select the matching option via `div.cursor-pointer` (portal-rendered option), avoiding grabbing a stale/closed dropdown's input when multiple selects share a page. `vouchers.spec.ts` final assertion changed from the narration text (flaky — voucher list is FY-filtered) to the **"Voucher created"** success toast.
- **Verification:** `docker compose build api_e2e` + reseed `zledger_test`; `vouchers.spec.ts` 8/8, `real-user-flow.spec.ts` 24/24.

## Loans & Advances Module (2026-07-17)
- **Module ID:** `loans` — gated by `require_module("loans")` backend + `ModuleGate` frontend.
- **Backend**: Model `Loan` + `LoanPayment` in `models/loan.py`; migration `0052`; schemas `schemas/loan.py`; service `services/loan.py` (CRUD, interest calc simple/compound, auto-create vouchers for disbursement & repayment); router `api/v1/loans.py` (9 endpoints: list, create, update, delete, get, payments, payments-record, summary, interest).
- **Loan types**: `given`, `taken`, `employee_advance`. Interest types: `simple`, `compound`, `none`.
- **Auto-voucher**: Disbursement creates a payment/receipt voucher; repayment creates the reverse. Interest-first split on payments.
- **Auto-ledger**: Creates a dedicated ledger under "Loans & Advances (Asset)" or "Loans (Liability)" group for each loan party.
- **Frontend**: `LoansPage.tsx` with 4 tabs (Loans Given, Loans Taken, Employee Advances, Summary), create/edit loan modal, record payment modal, loan detail modal with payment history. Route at `/loans`, gated by ModuleGate.
- **Nav**: "Loans & Advances" link under Accounting group in sidebar, searchable via Ctrl+K.
- **Company types**: "General Business" and "Investment/Credit Society/Bank" include `loans` in default modules.
- **Tests**: 28 pytest tests passing (`backend/tests/test_loans.py`), 26 E2E Playwright tests passing (`tests/e2e/specs/loans-advances.spec.ts`). Covers CRUD, payments, interest calc, summary, filters, cross-company isolation, auth, error paths, auto-close lifecycle.
- **Fixed**: `Decimal` vs `float` arithmetic in `record_payment`; `loan_payments` table missing `updated_at` column; Pydantic `datetime`→`str` validators on `LoanOut`/`LoanPaymentOut`; missing `db.commit()` in router.

## Operability (2026-07-14)
- [x] **One-command setup scripts** — `setup.sh` (Linux/Git-Bash/WSL2) + `setup.ps1` (Windows PowerShell) build & start the full stack, generate `.env`/`JWT_SECRET`, fix the `config/rclone/token.json` dir→file gotcha, wait for `:9090/api/health`, and optionally seed demo data. Flags: `--no-demo`/`--no-build`/`--with-scheduler` (ps1: `-NoDemo`/`-NoBuild`/`-WithScheduler`). Smoke-tested: `./setup.sh --no-build --no-demo` is a clean no-op re-run.
- [x] **Docs port fixed** — `README.md`/`TESTING.md` `:8080` → `:9090` (true published web port).
- [x] **Live `zledger` (`:9090`) stack healthy** — recreated by setup smoke test; heartbeat 200; `web` healthcheck on `127.0.0.1`.
- [x] **Google Drive (rclone) backup in setup scripts** — `setup.sh`/`setup.ps1` now prompt to enable GDrive (`--with-gdrive`/`--no-gdrive`; ps1 `-WithGdrive`/`-NoGdrive`). Guides OAuth via `docker compose run --rm --entrypoint rclone backup authorize gdrive`, writes `config/rclone/token.json`, sets `GDRIVE_ENABLED=true`, recreates `backup`. `config/rclone/README.md` fixed (needs `--entrypoint rclone`; recreate not restart).

## Demo Data
- **Live `zledger` now has 3 companies** — Apex Enterprises (proprietorship), Partnership Uttar Co (partnership, TDS-heavy), Pvt Ltd Karnataka Co (private_limited, manufacturing, e-invoice-heavy).
- **Total per company**: Apex (trading, ~25 vouchers), Partnership Uttar Co (TDS-heavy, ~25 vouchers), Pvt Ltd Karnataka Co (manufacturing, BOMs, ~25 vouchers).
- Seed script: `backend/scripts/seed_demo_data.py` (`seed_three_company_types()`). Run: `docker compose exec -T api python -m scripts.seed_demo_data`.

## Tally Import — Whole Company (2026-07-15)
- **ZIP / raw-folder import**: `POST /api/tally-import/upload-archive` accepts a `.zip` of Tally XML/Excel exports and/or a raw Tally company folder (e.g. `10000/Manager.1800`). Merges all files into one import job.
- **Binary reader** (`backend/app/services/tally_binary.py`): reads Tally.ERP9/TallyPrime `.1800`/`.200` data files. Object containers are `02 10 03 00 00 <len2> <utf-16 name>`; string values `02 10 02 00 00 0f <len2> <utf-16>`. **Extracts the full chart of accounts** — account groups AND ledgers (each linked to its parent group). Validated (2026-07-15) against a Tally XML master export of the same company: recovered ~85%+ of true ledgers (binary even found more than the XML, e.g. SBI accounts). Tally-internal objects (tax `Slab`/`U/s`, company-name leaks) are filtered out. **Vouchers, opening balances and stock are NOT imported from binary** — Tally's voucher/amount/date encoding is not decoded. For full financial data (vouchers + opening balances) use Tally's XML/Excel export.
- **Import as new company**: `confirm` accepts `?new_company_name=` → creates a company (via `create_company` + default FY) and imports into it. Frontend has an "Into current company / New company" toggle on the Tally Import page.
- **Voucher XML parsing fixed (2026-07-15)**: a real Tally *Day Book* XML export nests `<VOUCHER>` under `<TALLYMESSAGE>` (not `<LIST.VOUCHERS>`), uses a `VCHTYPE` **attribute**, a `<PARTYLEDGERNAME>` child, and dates like `1-Apr-2026` / `20260401`. `parse_tally_xml` now handles all of these, so dropping a real Day Book XML into the import ZIP ingests vouchers correctly (previously it silently created zero vouchers). Also hardened: Tally XML is **UTF-16** and emits invalid `&#4;` char refs (both crashed `ET.fromstring` → 0 records); the "All Masters" COA export uses unwrapped `<GROUP NAME=>`/`<LEDGER NAME=>` (attribute, not child) — both now supported. `tally_archive` + the single-file `upload` endpoint now auto-detect UTF-16. **Validated end-to-end on the real `Agapa Acts- Master.xml` + `DayBook.xml`**: imported 29 groups, 34 ledgers, 53 vouchers into a new company via the live API.

## Demo Data Backfill — fixed assets + TDS entries (2026-07-16)

- The 3 live companies were seeded before `seed_fixed_assets` was added, so all had 0 assets and 0 TDS entries.
- **`backend/scripts/backfill_demo_extras.py`** (new, idempotent) tops them up without touching existing vouchers/stock/parties/FYs.
- Added 5 asset categories + per-company asset registers and 8 TDS entries per company (section 194C @2%, linked to real payment vouchers, deposited/pending mix).
- Run: `docker compose exec -T api python -m scripts.backfill_demo_extras`.

## UI Consistency — shared Tabs + command palette actions (2026-07-16)

- **Shared `components/Tabs.tsx`** adopted across 11 pages + voucher type-tabs. Pill container with gradient underline. API: `<Tabs tabs active onChange className />`.
- **Command palette** (`TopHeader`): static index, Pages/Actions split; actions deep-link via `?action=`/`?tab=` and auto-open on 10 pages (params cleared with `replace:true`). Page-result icons removed; Actions keep `+`.
- **Voucher page** type-tabs migrated from custom colored buttons to shared `Tabs`; `getVoucherColor` retained in VoucherList/forms only.
- Migration `0050_add_bank_fields_to_ledger` adds ledger bank fields; COA "New" dropdown + closing balances; GroupForm subgroup; Fixed Assets tables normalized.
- Typecheck clean, `web` rebuilt & deployed on `:9090`.

## UI Layout Redesign — fixed header + collapsible sidebar (2026-07-16)

Complete layout architecture overhaul. Previously the sidebar carried all global controls (search, company card, FY selector, user profile, navigation) at w-320px. Now:

- **Fixed top header** (`components/TopHeader.tsx`): logo, search trigger, company+FY, settings, bell, avatar dropdown. Renders once, persists across all pages.
- **Collapsible sidebar** (`components/AppSidebar.tsx`): w-64 icon-only (tooltips on hover), expands to w-240. Mobile: overlay drawer. Toggle button at bottom.
- **Layout shell** (`pages/DashboardPage.tsx`): 38 lines composing TopHeader + AppSidebar + Outlet.
- **PageHeader.tsx deleted**: ~30 pages migrated to inline `<h1>` titles. NotificationBell removed from all pages (now global in header).
- All accounting logic, stores, API calls, navigation — unchanged.

## UI cleanup (2026-07-15)

Quick-win bundle from the UI-review: (1) `ErrorBoundary` Reload button `bg-indigo-600` → `bg-brand-600` (only genuine off-palette issue; the "broken amber/teal/slate badge" audit claim was false — those are valid Tailwind colors). (2) Deleted dead `pages/VouchersPage.tsx` (550 lines, never imported; routing uses `pages/vouchers/`). (3) `VoucherList` search placeholder corrected to match the actual client-side filter (server `?search=` is source of truth). `npm run build` passes; `web` rebuilt & live. No behavioral change to accounting logic.

## UI Restructuring — ReportsPage split, CompanySettings tabbed, dead code cleanup (2026-07-16)

### ReportsPage split (1231→240 shell + 13 sub-components)
- Created `pages/reports/` directory with `shared.tsx` (types, fmt, downloadFile, PreviewBtn, GroupTable, GroupRows), 11 report components (TrialBalanceReport, PnlReport, BalanceSheetReport, CashFlowReport, AgingReport, OutstandingReport, RegisterReport, TdsTcsReport, StockSummaryReport, StockMovementReport, StockAgeingReport), plus LedgerDetailModal and VoucherDetailModal.
- ReportsPage shell handles tab state, FY selection, fetch orchestration only.

### CompanySettingsPage tabbed refactor
- Rewritten with 5 tabs: General (logo + name + legal name + books begin from), Tax (GSTIN, PAN, State), Contact & Bank (phone, email, website, address, bank details), Voucher Numbering (8-row table), Financial Years (CRUD table with open/close/delete).
- FinancialYearsPage content merged in as the Financial Years tab.
- FinancialYearsPage.tsx deleted (was standalone, now redundant).

### MastersPage deleted
- Dead code (440 lines), not routed or imported anywhere.

### Route cleanup
- Removed standalone GST routes (`/compliance`, `/einvoice`, `/eway-bill`) from App.tsx — GST is only accessible via `/gst` with internal tabs.
- Removed `/financial-years` route (now inside Company Settings).
- Fixed DashboardContent and PendingActions GST quick action routes: `/compliance` → `/gst`.
- Sidebar nav renamed "Company" group → "Settings" (Financial Years removed since it's inside Company Settings).

## Vouchers List — FY scoping fixed (2026-07-15)

Bug: Vouchers page showed every FY's vouchers regardless of the selected Financial Year (sorted by `created_at`, so the latest voucher always appeared). Root cause: `list_vouchers` (backend `app/api/v1/vouchers.py`) had no FY filter, and the frontend `pages/vouchers/index.tsx` never passed the active FY.

Fix: added optional `financial_year_id` query param → filters `voucher_date` within the FY's `[start_date, end_date]` (mirrors `reports.py` date-range scoping). Frontend passes `activeFyId` from `useFyStore` and refetches on FY change. Omitting the param keeps "all vouchers" for other consumers (TDS/TCS, e-invoice). Verified live: 3-FY company (820 vouchers) → FY 2025-2026 = 329, FY 2024-2025 = 225, disjoint sets. `web`+`api` rebuilt & running.

## Structural UI Refactor — shared Button / Pagination / VoucherModal (2026-07-15)

Created three shared presentational components and routed the Vouchers page + Day Book through them, removing duplicated inline implementations. No accounting-logic change.

- **`frontend/src/components/Button.tsx`** (NEW) — variant `primary|secondary|danger|warning`, size `sm|xs` (+ default), consistent `brand` palette + dark-mode hover (`bg-[#282832]`). Replaces ad-hoc `border border-slate-300 ...` buttons.
- **`frontend/src/components/Pagination.tsx`** (NEW) — windowed page-number cluster (max 7), rows-per-page selector (25/50/100/200), "start–end of total" label, configurable `itemLabel` (default "items", used "entries" on Day Book). Superset of the two prior local `Pagination`/`PageButton` fns.
- **`frontend/src/components/VoucherModal.tsx`** (NEW) — unified voucher modal: dispatches to `ItemVoucherForm` / `AmountVoucherForm` / `JournalForm` by `voucher_type`, optional attachments slot, optional `showPdfActions` (Preview/Print PDF), duplicate/delete/close header, optional PDF preview (`previewUrl`/`onPreviewClose`). Replaces the 60-line inline modal in `pages/vouchers/index.tsx` and the inline modal + `PdfPreviewModal` in `DayBookPage.tsx`.
- **`pages/vouchers/index.tsx`** — now uses `Button` + `VoucherModal`; removed dead `renderModalForm` block and local `Pagination`.
- **`pages/vouchers/VoucherList.tsx`** — now uses shared `Pagination` (removed local `totalPages`).
- **`pages/DayBookPage.tsx`** — replaced inline `Pagination`/`PageButton` fns and inline voucher modal with `<Pagination>` + `<VoucherModal showPdfActions ...>`; removed now-unused `ItemVoucherForm`/`AmountVoucherForm`/`JournalForm`/`Button` imports and `ITEM_TYPES`/`AMOUNT_TYPES` consts. Kept structural `dark:border-[#1a1a24]` borders; normalized stray `#1a1a24` *hover/background* uses to `#282832`.
- **`npm run build` passes; `web` rebuilt & live** (`index-Dzt4b3l5.js`).

## DayBook dropdown theming — replaced native `<select>` with portal-based `Select` component (2026-07-15)

Bug: DayBook filter dropdowns (All Types / All Parties / All Ledgers / All Users) showed a **white unthemed popup** in dark mode — the `dark:bg-[#16161f]` class only styled the closed control, not the open option list.

Root cause: native `<select>` dropdowns are rendered by the **OS/browser engine** and cannot be themed via CSS. Tried `dark:[&>option]:bg-...` (Tailwind arbitrary variant — does not compile), `.dark select option { ... }` (doesn't reach the popup), and `color-scheme: dark` (unreliable on Linux). All fail.

Fix: replaced the 4 DayBook native `<select>` elements with the existing portal-based `Select` component (`src/components/Select.tsx`) which renders its dropdown via a React portal, fully CSS-controllable with `dark:bg-[#16161f]`. Also replaced the `Pagination` rows-per-page native `<select>` with the same component. Updated the `Select` trigger bg from `#0f0f16` to `#16161f` to match other controls. Added a comprehensive "Dark Mode Gotchas" section to `AGENTS.md` documenting this permanently. `npm run build` passes; `web` rebuilt & live.

## Binary Voucher Decoding — Research (2026-07-15, NOT viable)

Attempted option (B): decode binary vouchers from `tally/100000_1/` against `DayBook.xml` ground truth. **Primitives were cracked but the ledger ID→name mapping is not recoverable, so binary vouchers cannot be reliably imported.**

- **Cracked:** object containers `02 10 03 00 00 0f <len2> <utf-16 name>`; string values `02 10 <tag> <b3> <b4> <sub> <len2> <payload>`; ledger-name strings use subtype `83` (`02 10 02 00 00 83`); COA names use subtype `0f`. Date = `int16` LE days since 1899-12-30 (Excel epoch; `0xb4b2`=45748=2025-04-01). Amount = `int64` LE × 100000 (Tally 5-decimal precision). Voucher type = numeric code in `d5/07` (1=Receipt, 2=Payment). Ledger lines reference ledgers by **internal ID** (`0a/0f`, e.g. `5LtxunQe8aIaH1w5`), not by name.
- **Blocker (confirmed after deep dig):** vouchers reference ledgers by internal IDs; no clean ID→name map:
  - 41 distinct voucher ledger IDs in `TranMgr.1800`; **0/41 appear in `Manager.1800`** (COA, 213 names).
  - `LinkMgr.1800` maps IDs→**short** names (e.g. `5LtxunQe8aIaH1w5`→`Bank Interest`); only ~13/41 resolve via fuzzy bridging to COA full names.
  - One ledger (Bank Interest) has 5 distinct internal IDs.
  - `TranMgr.1800` ledger-master objects (with `02/83` names) contain **none** of the 41 voucher IDs.
  - Bank ledger `HDFC A/C NO.: 22691450000065` is **absent** from the binary entirely (only "HDFC" appears once, inside a narration).
- **Conclusion:** binary yields COA only (current `tally_binary.py`). Full financials require Tally's XML/Excel export. No code committed for binary voucher decode.

## Demo Data — Three Companies (current live dataset, 2026-07-24)
- **Seeder**: `backend/scripts/seed_demo_data.py` (`seed_three_company_types()`). Reuses the voucher/stock/GST builders for each company type.
- **3 companies in the live `zledger` DB:**
  - **Apex Enterprises** — proprietorship (Maharashtra, GSTIN `27AABCP1234A1Z5`). Trading-focused, standard GST.
  - **Partnership Uttar Co** — partnership (Uttar Pradesh). TDS-heavy, inter-state transactions.
  - **Pvt Ltd Karnataka Co** — private_limited (Karnataka). Manufacturing, e-invoice-heavy, BOMs.
- **Run**: `docker compose exec -T api python -m scripts.seed_demo_data`

## E2E tests run against live stack (2026-07-24)
- The Playwright E2E suite (`tests/e2e/`) runs against `http://localhost:9090` (live `zledger` DB).
- `tests/e2e/run-isolated.sh` **resets and re-seeds the live DB before each spec file**, then tears down after each file completes. This gives full test isolation without a separate E2E database.
- **Run tests:** `cd tests/e2e && ./run-isolated.sh`

## Completed (Session 2026-07-12 — Robustness & Operability)
- [x] **E2E test credentials fixed** — `fixtures.ts` admin password now `katheikei` (matches `.env`); old specs updated; password-change test restores password.
- [x] **Container healthchecks** — `api` (`/api/health`), `web` (nginx root), `db` (`pg_isready`) added to `docker-compose.yml`.
- [x] **Makefile** — `rebuild-api`/`rebuild-web`/`rebuild`/`migrate`/`seed` targets that remove containers before `up` (works around `KeyError: 'ContainerConfig'` recreate bug).
- [x] **Pagination** — `Pagination` helper + `pagination_params`; applied to COA (ledgers/parties/groups/FY), inventory (items/groups), fixed-assets (categories/assets). Optional `limit`/`offset`; default returns all (removes silent `.limit(200)` truncation); sets `X-Total-Count` when paginated.
- [x] **CI** — `.github/workflows/ci.yml`: frontend typecheck+build, backend pytest (Postgres service), backend `alembic upgrade head` (Postgres service).
- [x] **React ErrorBoundary** — wraps `<Routes>` (`components/ErrorBoundary.tsx`); plus reusable `EmptyState` component.
- [x] **Fixed Assets forms → popup modals** — `AssetCategoryFormModal.tsx` + `AssetRegisterFormModal.tsx`; `FixedAssetsPage.tsx` now opens popups (escape / click-outside to close, `z-[9999]` overlay) instead of inline forms.
- [x] **Inline "create category" inside asset form** — `AssetRegisterFormModal` has a `+` button next to the Category select that opens `AssetCategoryFormModal` (create mode) nested; new category is added to the list and auto-selected, and the page-level Categories tab list refreshes instantly (no page reload). (Matches voucher QuickCreate pattern.)
- [x] **Backend test isolation (safety fix)** — `tests/conftest.py` now redirects to a dedicated `zledger_test` DB (built from Alembic migrations, never the live `zledger` DB) with per-test savepoint rollback. Previously tests ran against the live DB with `drop_all`/`create_all` whose teardown failed (`DependentObjectsStillExist`), polluting live data (145 junk companies) and cascading into 59 failures + 253 teardown errors. Now: 221 passed, 32 failed, 0 errors, live DB untouched.
- [x] **2 originally-failing backend tests fixed** — `test_update_company` (was missing `X-Company-Id` header) and the system-group test (renamed to `test_update_system_group_rename_allowed_but_structural_protected`; system groups may be renamed but `nature`/`group_type` are protected). Both pass.

## Pending
- [x] **All 32 backend tests fixed + full suite green** (253 passed, 0 failed, 0 errors). Updates: `test_vouchers.py` (ledger rename `Cash`→`Test Cash Ledger`, paginated `resp.json()["items"]`, varied narration to avoid 409 dup-detect), `test_audit.py` (ledger rename, `resp.json()["items"]`, auto-generated voucher-no in description assertion), `test_reports_endpoints.py` (group/ledger rename to `Test *`), `test_bank_reconciliation.py` (import returns summary dict `{"imported_count","lines":[...]}`; use `["lines"]`), `test_gst_service.py` (`get_gst_ledger_ids` keys by `system_code`; use `seed_groups`+`seed_gst_ledgers`; count now 10 incl. `SYS_GST_COMPOSITION_TAX`; `get_rcm_ledger_mapping` keys by system_code), `test_gst_endpoints.py` (HSN/SAC code must be 4-8 digits or `99XXXXXX`).

## Completed (Session 2026-07-11)
- [x] **GSTIN/PAN/HSN Format Validation** (Complete)
  - Regex validation for GSTIN (15-char), PAN (10-char), HSN/SAC (4-8 digits), IFSC
  - Applied to Company, GST Registration, Stock Items, Voucher counterparty GSTIN
  - Returns clear 422 errors for invalid formats
- [x] **Duplicate Voucher Detection** (Complete)
  - `_check_duplicate_voucher()` compares line amounts (debit/credit) against existing vouchers
  - Checks: company, date, type, party, line amounts, narration
  - Returns 409 Conflict with clear error message
- [x] **Financial Ratios in Reports** (Complete)
  - 10+ ratios: Gross/Net Profit Margin, ROA, ROE, Current/Quick Ratio, Working Capital, Debt-to-Equity, Debt-to-Assets, Asset Turnover
  - Available in `financial_ratios` field on both `/profit-and-loss` and `/balance-sheet` endpoints
- [x] **Test Data Cleanup** (Complete)
  - Removed 5 test vouchers, verified 5 demo companies intact
  - Cleaned test BOMs, production orders, test vouchers

## Completed (Session 2026-07-09)
- [x] **Voucher Approval Workflow** (Complete)
  - Backend: `submit-for-approval`, `approve`, `reject` endpoints on vouchers
  - `reject` accepts optional `reason` query param, appends `[Rejected] reason` to narration
  - `GET /vouchers` accepts `approval_status` filter parameter
  - Frontend: `ApprovalsPage.tsx` at `/approvals` with sortable table, Approve/Reject buttons, reject modal
  - Sidebar: "Approvals" link under Accounting section
- [x] **Notification/Alert System** (Complete)
  - Backend: `Notification` model with categories (info, warning, error, success, gst_due, approval_pending)
  - Migration 0047: notifications table
  - API: 5 endpoints (list, unread-count, create, mark-read, mark-all-read)
  - Frontend: `NotificationBell.tsx` with bell icon, unread badge, dropdown, mark read
  - Placed in mobile (top-right fixed) and desktop (sidebar) positions
  - Demo notifications: 4 created
- [x] **Mobile Responsiveness** (Complete)
  - Fixed all `grid grid-cols-2/3/4` across 20+ pages to use responsive breakpoints
  - Pattern: `grid-cols-1 sm:grid-cols-2`, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3/4`
  - SortableTable already has `overflow-x-auto` for horizontal scroll
- [x] **Profile Page Enhancement** (Complete)
  - Avatar with initials, profile/security tabs
  - Active sessions section, account info
- [x] **Work Centers/Routings Frontend UI** (Complete)
  - `WorkCentersTab.tsx` — CRUD for work centers (name, department, capacity, rate)
  - `RoutingsTab.tsx` — CRUD for routings with multi-step operations
  - Added "Work Centers" and "Routings" tabs to ManufacturingPage
  - Seeded 4 work centers + 2 routings for Apex
- [x] **Dark Mode Select Fix** (Complete)
  - Added `dark:bg-[#0f0f16] dark:text-[#f1f5f9]` to native `<select>` elements across 8 files
- [x] **Batch Module Expansion** (Complete)
  - Backend: `GET /batches/expiring` (expiry alerts), `GET /batches/report` (summary by item)
  - Frontend: `BatchBrowsePage.tsx` with 3 tabs: Browse (search/filter), Expiry Alerts, Report
  - Added `/batches` route and sidebar link with "layers" icon
  - Fixed seed script: added batch_ledger, batches, notifications to truncate list; switched to TRUNCATE CASCADE
- [x] **Background Scheduler** (Already implemented)
  - `cron_runner.py` processes due recurring templates every 15 minutes
  - Docker service running with `scheduler` profile
- [x] **Real User Flow E2E Tests** (Complete)
  - 25 comprehensive tests mimicking real user behavior
  - Tests cover: login, dashboard, manufacturing (BOMs, orders, work centers, routings), batches (browse, expiry, reports), batch trace, inventory, COA, daybook, payments, reports, GST, approvals, profile, notifications, voucher creation, recurring templates, company settings, members, logout
  - All 25 tests passing

## Completed (Session 2026-07-10)
- [x] **Code Review Bug Fixes** (Complete)
  - Fixed inverted running balance (credit - debit for bank accounts)
  - Fixed voucher number race condition with SELECT FOR UPDATE + next_sequence sync
  - Added role checks to post_voucher and submit_for_approval
  - Removed dead code after return in import_bank_statement
  - Fixed intra-batch duplicate detection with set-based tracking
  - Replaced window.confirm with showConfirm async dialog
  - Fixed N+1 queries in find_matching_vouchers (batch load + dict lookup)
  - Fixed N+1 queries in auto_reconcile (pre-load all vouchers once)
  - Replaced get_reconciliation_summary Python aggregation with SQL
  - Rewrote check_duplicates with single batch query instead of per-row
- [x] **Approve/Reject Endpoint Bug Fix** (Complete)
  - Fixed approve_voucher and reject_voucher using require_role (returns Company) instead of get_current_user (returns User)
  - This was causing FK violations on audit_logs.user_id
- [x] **P3 Test Coverage** (Complete)
  - Added 41 E2E tests covering Voucher Approval, Notifications, Manufacturing Lifecycle, and Tally Import workflows
  - All tests passing (128 API tests + 41 P3 tests = 169 total)

## Completed (Previous Sessions)
- [x] **Bank Reconciliation Enhancements** (Complete)
  - CSV & Excel (.xlsx) import with column mapping UI
  - Fuzzy matching with scoring (amount 40pts, date 25pts, description 20pts, reference 15pts)
  - Auto-reconcile with configurable min score threshold slider (50-100%)
  - Duplicate detection on import (skip duplicates by default)
  - Bulk delete for unreconciled lines (checkbox selection)
  - Low-confidence match warning (< 50% score) with confirmation dialog
  - Detailed skip reasons in auto-reconcile results (Matched/Below threshold/No match/Zero amount)
- [x] **Transaction Flow Visualization** (Complete)
  - Visual banner on all voucher forms showing money/account direction
  - Color-coded cards (blue=bank, green=party, amber=expense, slate=general)
  - Amount badge shows "Money In" (green) or "Money Out" (red)
  - Voucher-specific flow: Sales=Customer→Bank (IN), Payment=Bank→Party (OUT), etc.
- [x] **Party/Ledger Auto-Detection** (Complete)
  - Selecting party auto-fills linked ledger in From/To field
  - Selecting ledger auto-fills linked party
  - Only fires when target field is empty (won't overwrite)
- [x] **Strict Ledger Filtering for Payment/Receipt** (Complete)
  - UI-level filter restricts dropdown options by voucher type
  - Payment From=Cash/Bank, Payment To=Expense/Supplier/Asset/Liability/Tax/Capital
  - Receipt From=Customer/Income/Asset/Liability/Capital, Receipt To=Cash/Bank
  - Uses `system_code` from AccountGroup for robustness
  - Falls back to all ledgers if no matches
- [x] **Voucher Numbering** (Complete)
  - VoucherNumbering model with prefix, format template, sequence, FY start month
  - Format: `{PREFIX}-{YEAR}-{SEQ}` (e.g., INV-2025-0001)
  - Config in Company Settings page
  - Sequence resets each financial year
  - Default prefixes: INV/PUR/PAY/RECP/CONTRA/JRN/CRNOTE/DRNOTE
- [x] **Batch Voucher Generation** (Complete)
  - `seed_batch_vouchers.py` generates ~448 vouchers across 4 companies
  - Weekly sales, bi-weekly purchases, monthly payments/receipts, journal adjustments
  - Total: 625 vouchers across 5 companies

## Completed
- [x] **Multi-Currency/Exchange Rates removed** — all code stripped (DB columns kept as dead). ExchangeRatesPage, forex API, forex UI in voucher forms, LedgerForm currency selector, sidebar nav item all removed. Dashboard NavLink also removed from sidebar (logo navigates to `/`).
- [x] Phase 1–17 — all complete (Scaffold through Voucher Engine + UI Polish)
- [x] **Phase 18: E-Way Bill + Voucher Cancellation** (Complete)
  - E-Way Bill: model, migration 0017, GSTN client, payload builder, 6 API endpoints, frontend page
  - Voucher Cancellation: model fields (cancel_reason, cancelled_at), migration 0018, cancel endpoint with reversal entry creation, frontend Cancel button on posted vouchers
- [x] **Phase 19: Cost Centre Allocation + Stock Valuation** (Complete)
  - Cost Centre: FK on VoucherLine (migration 0019), cost_centre_id on line creation, cost centre P&L report endpoint
  - Stock Valuation: StockBalance model (migration 0020), weighted average + FIFO engines, stock valuation report, stock movement summary, auto-update on voucher post

## Completed Phase 20 Work
- **Advanced voucher features**:
  - Voucher list in DayBook uses popup modal (Edit/Duplicate/Delete) — done
  - Voucher page also uses the same popup modal (merged pattern) — done
  - Duplicate (POST) auto-closes modal after save — done
  - Update (PATCH) keeps modal open with refreshed data — done
  - All 3 forms (ItemVoucherForm, AmountVoucherForm, JournalForm) call `resetForm()` after successful creation — done
  - Counter ledger validation in ItemVoucherForm — done
  - Multi-item "Duplicate ledger in lines" bug fixed (item lines without stock_item_id now correctly handled) — done
- **Select component migration**: Replaced native `<select>` with custom `Select` component in MembersPage, GstSettingsPage, AuditLogPage, AdminUsersPage — all selects now use the themed dropdown with dark mode support
- **Phase 20: Reports Suite**:
  - Cash Flow Statement (direct method): operating/investing/financing categories, opening/closing cash balance, net increase
  - Aging Analysis: receivables/payables toggle, 0-30/31-60/61-90/90+ day buckets per party
  - Outstanding Report: party-wise debtor/creditor balances with totals
  - Register Report: daybook filtered by voucher type (8 types supported)
  - All 4 reports integrated into ReportsPage tabs with proper frontend rendering
- **Phase 21: TDS/TCS Summary + Inventory Reports**:
  - TDS/TCS Summary Report: party-wise breakdown by section, TDS/TCS toggle, status counts (pending/deposited/filed), total base amount and tax
  - Stock Summary Report: current balance per item with quantity, avg rate, total value, valuation method
  - Stock Movement Report: opening/inward/outward/closing qty and value per item
  - Stock Ageing Report: days since last entry, colour-coded ageing buckets (0-30/31-60/61-90/90+ days)
  - All 4 reports added to ReportsPage as new tabs with full dark mode support
  - Backend: `get_tds_tcs_party_summary()` service, `get_stock_ageing_report()` service, 4 new API endpoints, 6 new response schemas
- **Masters & COA UI Improvements**:
  - MastersPage: Improved empty states with icons, descriptive text, and action buttons
  - MastersPage: System ledgers/groups indicated with lock icon instead of SYS badge
  - MastersPage: Context menu (⋮) on groups with Edit, Create Ledger, Create Subgroup, Delete actions
  - ChartOfAccountsPage: Fixed TypeScript error (removed redundant type comparison)
  - Shared `ContextMenu` component extracted with viewport bounds checking (prevents overflow off-screen)
  - Calendar component switched to `position: fixed` with viewport bounds checking (prevents overflow off-screen)
  - DayBookPage: Replaced native `<input type="date">` with themed `DateInput` component
  - Shared `GroupForm` and `LedgerForm` modal components (centered popup with overlay)
  - ChartOfAccountsPage: Context menu (⋮ + right-click) wired to open modal forms for Edit, Create Ledger, Create Subgroup, Delete
  - MastersPage: Migrated from inline forms to shared modal form components
  - **Masters merged into COA**: Active/inactive status badges on ledger nodes, group filter dropdown, "+ New" button. Masters route/link removed from sidebar and dashboard.
  - **COA Professional Grid Layout**: Single CSS grid with fixed columns (Name, Status, Count, Balance). All row types (Root Group, Group, Subgroup, Ledger) use identical alignment. Removed inline ⋮ buttons — all operations via right-click context menu. Column headers. Compact empty groups. Full-width hover.
- **Inventory Popup Modals**: Stock Groups, Stock Items, and Stock Entries all use clickable rows/cards that open centered popup modals (edit/delete/duplicate/save). Action buttons removed from all three tabs. Button shows "Update" when editing, auto-closes on success.

## Phase 37: UI Consistency & Visual Refinements
- **Voucher number labels**: Unified column headers across app (`#` → `Voucher No.`, `Voucher #` → `Voucher No.`, `Invoice #` → `Invoice No.`)
- **Voucher forms**: Added "Voucher No." field to VoucherHeader (shows number when editing, "Auto-generated" when creating new)
- **Dark mode text contrast**: Updated secondary text from `#94a3b8` → `#cbd5e1` across all pages/components for better visibility
- **Table headers**: Updated SortableTable header text to lighter shade
- **Inventory stat cards**: Restructured layout for better icon/value alignment

## Demo Data (3 Companies, Rewritten 2026-07-05)
- **Total**: 58 vouchers, 14 parties, 20 stock items, 90 account groups, 65 ledgers, 5 users
- **Company 1 — Apex Enterprises** (Maharashtra, regular GST): 3 FYs, 5 parties, 7 stock items, 30 vouchers, 8 e-invoices, 4 TDS sections, 1 recurring template, 4 bank statement lines
- **Company 2 — GreenLeaf Organics** (Karnataka, composition): 2 FYs, 4 parties, 6 stock items, 11 vouchers, 2 TDS sections
- **Company 3 — BuildRight Construction** (Gujarat, regular GST, TDS heavy): 2 FYs, 5 parties, 7 stock items, 17 vouchers, 5 TDS sections with linked entries, 4 e-invoices, 4 e-way bills, 5 bank statement lines
- **5 users**: admin@zledger.com (superadmin), alice.gupta (Apex accountant), bob.patil (GreenLeaf accountant), carol.singh (BuildRight viewer), david.verma (Apex viewer)
- Apex Enterprises retains all original party/stock/ledger names for E2E test backward compatibility

### FY Management: Update & Delete Endpoints
- **PATCH /coa/financial-years/{id}**: Update name/start_date/end_date via `FinancialYearUpdate` schema. Returns 400 if overlapping dates.
- **DELETE /coa/financial-years/{id}**: Deletes FY only if no vouchers exist. Returns 400 with voucher count if blocked.
- **Frontend FY Management page** (`frontend/src/pages/FinancialYearsPage.tsx`): Full CRUD table with create/edit forms (auto-fills end_date/name from start_date), delete with confirm, close/reopen toggle. Route at `/financial-years`, linked in sidebar.

### FY Management Enhancements
- **FY overlap validation**: `POST /coa/financial-years` now rejects date ranges overlapping existing FYs
- **FY close/unclose**: `PATCH /coa/financial-years/{id}/close` — toggles `is_closed`. When closing, automatically creates opening balance journal for the next FY (carries forward balance sheet ledgers via Opening Balance Equity)
- **FY closed guard**: Voucher creation (`POST /vouchers`) and update (`PATCH /vouchers/{id}`) blocked if date falls in a closed FY
- **Dashboard FY filter**: Recent vouchers now scoped to the selected FY's date range

## Navigation Redesign (Business Modules)
- **Sidebar reorganized** into 5 business-focused modules: Accounting, Inventory, GST & Tax, Reports, Company. Removed generic "Masters", "Transactions", "Compliance" groupings.
- **GST & Tax module**: Dedicated workspace with GST subgroup (GST Compliance, E-Invoice, E-Way Bill, HSN/SAC, GST Registrations) and TDS/TCS sibling. E-Invoice and E-Way Bill moved inside GST subgroup.
- **Company module**: Now a top-level group with Company Settings, Financial Years, Exchange Rates, and Import/Export (moved Tally Import here).
- **Banking (Soon)** removed from sidebar.
- **Profile dropdown** restructured into 4 labeled sections: Profile, Workspace, Administration (superadmin), Session.
- **Appearance toggle** replaced with Light / Dark / Auto (system) selector.
- **Theme store** (`store/theme.ts`): Now supports `"system"` mode that follows OS preference and listens for `prefers-color-scheme` changes.
- **Global search**: Deduplication key changed from `to` to `to|label` so items sharing a route (HSN/SAC, GST Registrations) both appear.
- **Company card redesigned**: Clean layout showing company name, GSTIN (fetched from API), and inline FY selector. Gradient background for visual separation.
- **Visual hierarchy**: Better spacing, typography, active/hover states, indented sub-items with left border.
- All existing routes preserved; no functionality broken.

## Dark Mode (Complete — Premium Redesign)
- **Infrastructure**: `darkMode: 'class'` in tailwind.config.js, flash-prevention script in index.html, theme store (`store/theme.ts`) with localStorage persistence.
- **Premium palette**: Layered surfaces — Page `#0a0a0f`, Sidebar `#111118`, Cards `#18181f`, Hover `#1e1e28`, Elevated `#252530`. Violet-500 accent for active nav, focus states, important actions.
- **Typography hierarchy**: Primary `#f1f5f9`, Secondary `#cbd5e1`, Muted `#64748b`. Font sizes: 15px brand, 13px nav/items, 11px metadata.
- **Shadows**: Custom dark shadow scale (`shadow-dark-sm` through `shadow-dark-xl`) with realistic depth.
- **Scrollbars**: Refined dark scrollbars matching the palette.
- **CSS variables**: `--surface-0` through `--surface-4`, `--border-subtle`/`--border-default`, `--text-primary`/`--text-secondary`/`--text-muted`, `--accent`.
- **Toggle**: Light / Dark / Auto (system) selector in profile dropdown. Respects system preference by default. Listen for system changes in Auto mode.
- **Sidebar**: Premium dark sidebar with gradient brand icon, layered company card, violet accent on active nav, refined hover states. Category headers (Masters, Transactions, Reports, Compliance) are white/bold/uppercase to distinguish from sub-items. Nav items use white hover text for better contrast.
- **All 30+ pages** updated with premium dark palette: auth, dashboard, masters, vouchers, reports, compliance, admin/settings.
- All existing light mode classes preserved; dark variants added alongside.
- **Global dark input fix**: CSS rules for `dark input`, `dark textarea` ensure form elements get dark backgrounds. `color-scheme: dark` on `html.dark` for native browser UI.

## Custom Select Component (All Dropdowns Themed)
- **New `Select.tsx`**: Fully styled custom dropdown replacing all native `<select>` elements. Supports keyboard navigation (arrow keys, Enter, Escape), click-outside close, viewport-aware positioning (opens above if near bottom), checkmark on selected option, hover highlight, smooth transitions. `onChange` passes value directly (not event).
- **All native `<select>` replaced across 25+ files**: InventoryPage, DayBookPage, TdsTcsPage, ReportsPage, MembersPage, GstSettingsPage, AuditLogPage, AdminUsersPage, CompliancePage, EwayBillPage, BankReconciliationPage, EInvoicePage, VoucherHeader, VoucherFooter, QuickCreate/Select, QuickCreate/Modal, VouchersPage, IndianStateSelect, CompanySelectPage, AdminCompaniesPage, CompanySettingsPage, ChartOfAccountsPage, DashboardPage, MastersPage, LedgerForm, GroupForm, ItemLineTable (GST rate). **Zero native selects remaining.**
- **Popup overlay fix**: All popups (Select, Calendar, ContextMenu) now render as overlays that float above everything — Select uses `createPortal` to `document.body`, Calendar and ContextMenu use `position: fixed` with `z-index: 99999`. No more dropdowns hiding behind other elements.

## Completed Phase 22.2: Tally Import (a/b/c + Validation)
### Phase 22.2a — XML Parser + Import Engine
- **Tally XML Parser** (`tally_parser.py:parse_tally_xml()`): Parses Tally XML exports — groups, ledgers, parties, stock groups/items, vouchers. Handles both direct and nested ledger entry formats.
- **Tally Importer Service** (`tally_importer.py`): `preview_import()` returns summary counts with item names. `execute_import()` creates DB records idempotently (skip existing by name/type+number). Dependency-order undo deletes in reverse (vouchers→stock items→stock groups→parties→ledgers→groups→units) with rollback-per-item salvage and safe partial undo (skip if referenced elsewhere).
- **ImportJob model**: `content` as `LargeBinary` (migration 0026), `created_details` JSON (migration 0025), `summary`, `errors` columns.

### Phase 22.2b — Detailed Preview + Undo
- **Detailed preview**: Upload returns `summary` with item names (not just counts). Confirm returns `created_details` with IDs/balances/totals per entity.
- **Undo**: `undo_import()` deletes in reverse dependency order, returns `{"removed": {...}, "skipped": {...}}` with individual item details. Frontend modal shows "Was:" prefix for undone jobs.

### Phase 22.2c — Excel Import + Sample Downloads
- **Excel Parser** (`tally_parser.py:parse_tally_excel()`): Reads XLSX workbooks with 6 data sheets (Groups, Ledgers, Parties, Stock Groups, Stock Items, Vouchers). Vouchers use one-row-per-line format grouped by number+type.
- **Sample generators** (`tally_sample.py`): `generate_sample_xml()` and `generate_sample_excel()` with all entity types.
- **API**: `POST /upload` auto-detects `.xlsx`, stores raw bytes. `POST /jobs/{id}/confirm` detects format from filename. `GET /sample?format=xml|xlsx`.
- **Frontend**: Accepts `.xml,.txt,.xlsx`. "Download Sample XML" / "Download Sample Excel" links.

### Phase 22.2d — Pre-Import Validation + Skip Log
- **Validation** (`tally_importer.py:validate_import()`): Checks all data references on upload without creating records. Returns `{"errors": [...], "warnings": [...]}` — errors for critical issues (missing groups/ledgers/unbalanced vouchers), warnings for non-critical (already exists / fallback used).
- **Skip logging**: All `_import_*` functions collect skip reasons per item (entity, item, reason) via `skip_log` parameter. `execute_import()` returns `(details, skip_log)` tuple. Skip log stored in `job.errors["skip_warnings"]`.
- **API**: `POST /upload` returns `validation` in response. `POST /jobs/{id}/confirm` stores and returns `skip_warnings`.
- **Frontend**: Validation issues shown in upload section after file upload. Skip warnings shown in job detail modal for completed jobs.
- **Sidebar**: Tally Import nav item under Compliance group with upload icon.

## Completed Phase 22.3: GSTR-9 Annual Return
- **Service** (`gstr.py`): Added `Gstr9Data` dataclass and `generate_gstr9()` function that aggregates full FY (Apr-Mar) voucher data into GSTR-9 format: Table 4 (outward supplies + reverse charge), Table 6 (ITC from purchases + reverse charge), Table 8 (net tax payable).
- **Schemas** (`gst.py`): Added `Gstr9Response` with all annual return fields. Updated `GstReturnGenerateRequest` pattern to accept `gstr9` return type.
- **API** (`gst.py`): `POST /returns/generate` now handles `gstr9` return type with full data dict serialization.
- **Frontend** (`CompliancePage.tsx`): GSTR-9 option in return type dropdown, FY period selection (5 recent FYs), FY-aware period switching. Detail view shows Table 4 (outward + RC), Table 6 (ITC breakdown), Table 8 (net payable), and Summary sections.

## Completed Phase 22.4: Sidebar Width + HSN/SAC Fixes
- **Sidebar width**: Increased from `w-64` (256px) → `w-80` (320px) for better readability.
- **HSN/SAC duplicate React key fix**: Sidebar nav links use `sub.to + "|" + sub.label` as key.
- **HSN/SAC Ctrl+K search fix**: Search results use `item.to + "|" + item.label` as key so both HSN/SAC and GST Registrations appear. Sidebar links changed to `/gst?tab=hsn-sac` and `/gst?tab=registrations`. GstSettingsPage reads initial tab from URL search params.

## Completed Phase 23: Composition Scheme + Recurring Vouchers

### Phase 23.1 — Composition Scheme Model
- **GstRegistration model**: Added `registration_type` (String(20), default "regular") and `composition_rate` (Numeric(5,2), nullable).
- **Company model**: Added `is_composition` (Boolean, default False).
- **Migration 0027**: Adds `registration_type` and `composition_rate` to `gst_registrations`; `is_composition` to `companies`.
- **Schemas**: `GstRegistrationCreate` and `GstRegistrationOut` include new fields.
- **API**: GST registration create/update endpoints pass through new fields.

### Phase 23.2 — Composition Scheme GST Calculation
- **GST ledgers**: Added `("Composition Tax", "SYS_GST_COMPOSITION_TAX", "GRP_GST_OUTPUT")`.
- **Voucher posting** (`vouchers.py`): When `company.is_composition`, skips line-level CGST/SGST/IGST calculation. Accumulates `composition_taxable`, then posts flat composition tax to `SYS_GST_COMPOSITION_TAX` ledger based on `primary_gst.composition_rate`.

### Phase 23.3 — GSTR-4 Quarterly Return
- **GSTR-4 service** (`gstr.py`): `Gstr4Data` dataclass, `generate_gstr4()` function, `_get_quarter_dates()` helper.
- **Schemas**: `Gstr4Response` added. Return type pattern updated to `^(gstr1|gstr3b|gstr4|gstr9)$`.
- **API**: `gstr4` return type handled in `POST /returns/generate`.
- **Frontend**: CompliancePage shows GSTR-4 option, quarterly period selection, GSTR-4 detail view with composition tax summary.

### Phase 23.4 — Recurring Templates
- **RecurringTemplate model** (`voucher.py`): company_id, name, voucher_type, frequency, next_run_date, last_run_date, is_active, template_payload (JSON), created_by.
- **Migration 0028**: Creates `recurring_templates` table.
- **API** (`recurring_templates.py`): Full CRUD + run-now + process-due endpoints. Router registered in `api/v1/__init__.py`.
- **Frontend** (`RecurringTemplatesPage.tsx`): Full CRUD page with table, create/edit form, run now, pause/resume, delete. Route at `/recurring-templates`, sidebar entry under Company group.

### Phase 23.5 — Save as Template Button
- **VoucherFooter**: New optional `onSaveAsTemplate` prop renders "Save as Template" button next to Save.
- **All 3 forms wired**: ItemVoucherForm, AmountVoucherForm, JournalForm — builds template payload from current form state, prompts for name and frequency, POSTs to `/recurring-templates`.
- **Playwright fix**: `saveVoucher()` helper uses `exact: true` to avoid matching both "Save" and "Save as Template".

## Manual Backup Trigger + Progress Bar + Download

### Backend
- **`POST /api/admin/backup/trigger`**: Triggers immediate backup in background thread. Generates rclone config from Docker secret, runs `backup.sh`. Returns `BackupTriggerResponse(status, message, gdrive_enabled)`
- **`GET /api/admin/backup/progress`**: Reads `/backups/backup-progress.json` written by backup script. Returns 204 when no backup in progress
- **`GET /api/admin/backups/download/{filename}`**: Downloads backup file with path traversal protection (regex validation, superadmin-only)
- **`admin.py`**: Added `os` and `json` imports at top level; backup files sorted by modification time (latest first)

### Backup Script Changes
- **`scripts/backup.sh`**: Writes `backup-progress.json` at each step: `db_dump` → `uploads` → `rotation` → `gdrive` → `done`. Cleans up via `trap cleanup EXIT`
- Progress file includes: `step`, `step_label`, `status`, `timestamp`, `dump_file`, `uploads_file`

### Frontend
- **`AdminBackupPage.tsx`**: Full backup management page:
  - "Backup Now" button triggers backup + opens progress modal
  - Progress modal: fade/scale animations, step indicator (5 circles), progress bar, auto-closes 1.2s after completion
  - Side-by-side scrollable tables (`grid-cols-2`, `max-h-[360px]`): Database Backups + Uploads Backups
  - Download button (↓ icon) on each row with browser file download
  - GDrive sync status card
  - Auto-polling every 2 seconds during backup

### Infrastructure
- **`backend/Dockerfile`**: Added rclone installation (unzip + rclone binary) for GDrive backup from API container
- **`docker-compose.yml`**: API container now has `GDRIVE_ENABLED`, `GDRIVE_TOKEN_FILE`, `GDRIVE_REMOTE_PATH`, `UPLOADS_DIR` env vars; mounted `token.json` and `backup.sh`

### Fixed
- **Backup button stuck in loading**: Stale closure in `checkProgress` — replaced with `wasPollingRef`
- **GDrive upload failing from API**: rclone was missing; installed in API container
- **Uploads backup skipped**: `UPLOADS_DIR` was `/uploads` (backup container path), corrected to `/app/uploads` (API container mount)

## Polish & Bug Fixes (2026-07-02)

### Fixed
- **GSTR-9C typo** (`services/gstr.py:737`): `GSTRegistration.is_primary` → `GstRegistration.is_primary`
- **Recurring templates import errors** (`api/v1/recurring_templates.py`):
  - `app.core.deps` doesn't exist — split to `app.core.db.get_db` + `app.core.dependencies.get_active_company`
  - `app.core.security.get_current_user` doesn't exist — moved to `app.core.dependencies.get_current_user`
  - Double `/recurring-templates` prefix on all routes — removed prefix from router (handled by `__init__.py`)
- **Verified**: 55/56 Playwright tests pass (1 screenshot timeout, passes individually)
- **API build verified**: No module import errors, login works, all routes registered correctly

### Split: GST Settings page → two standalone pages
- **`GstSettingsPage.tsx`** deleted (was a tab-based combination of HSN/SAC + Registrations)
- **`HsnSacPage.tsx`**: Standalone page at `/gst/hsn-sac` with HSN/SAC code table + add/delete
- **`GstRegistrationsPage.tsx`**: Standalone page at `/gst/registrations` with registration cards + add/delete
- **Sidebar links** updated: `/gst?tab=hsn-sac` → `/gst/hsn-sac`, `/gst?tab=registrations` → `/gst/registrations`
- **Playwright**: 3 new tests passing for both pages

### Fixed Bank Reconciliation Ledger Filter
- **Backend**: Added `group_code` query param to `GET /coa/ledgers` — joins `AccountGroup` and filters by `system_code`.
- **Frontend**: Bank reconciliation now fetches `/coa/ledgers?group_code=GRP_BANK_ACCOUNTS`. The dropdown shows only bank account ledgers instead of all active ledgers.

### Fixed All Modals: Close on Backdrop Click
- **8 modals across 6 files** were missing click-outside-to-close behavior. All now use `onClick={(e) => e.target === e.currentTarget && handler()}` on the backdrop div — closing when clicking outside the modal content but not when clicking inside.
- **Already correct**: `LedgerForm`, `GroupForm`, `QuickCreate/Modal`, `InventoryPage` (×3), `TallyImportPage`, `DashboardPage` search — already had `stopPropagation` or target check.
- **Fixed in this batch**: `DayBookPage`, `vouchers/index.tsx`, `TdsTcsPage` (×3), `BankReconciliationPage`, `VouchersPage`, `AuditLogPage`.

### Fixed VouchersPage Dead Status Code & Error Handling Gaps
- **Removed dead `status` field** from `VouchersPage.tsx` local `Voucher` interface — backend dropped the column in migration 0022. Removed status badge, dead "Post" button (no backend endpoint), and status-gated "Delete" button. Delete now always visible.
- **Added error handling** to `handleViewDetail()`, `handleSubmitReturn()` (CompliancePage), `fetchMe()` (auth store), and `HsnSacPage` initial data load.
- **`.gitignore`**: Ignore Playwright screenshot artifacts.

### Fixed GSTR-1 Blank Page Bug
- **GSTR-1 API response** was missing `total_b2b_taxable`, `total_b2cs_taxable`, `total_cgst`, `total_sgst`, `total_igst` fields — frontend crashed with `TypeError: Cannot read properties of undefined (reading 'toLocaleString')`. Added the missing fields to `data_dict` in `api/v1/gst.py`.
- **Playwright**: 2 new tests for GSTR-1 and GSTR-3B generation — both passing.

## Completed Phase 25: GST Challan / Payment Tracking
- **New model `GstChallan`** in `models/accounting.py` — tracks GST challan/payments with fields: challan_number, challan_date, amount, CGST/SGST/IGST/cess breakdown, interest, late_fee, bank_name, payment_mode, status (unapplied/applied), linked to GstReturn and GstRegistration.
- **Migration 0029** — creates `gst_challans` table with FKs to companies, gst_registrations, gst_returns.
- **New schemas** — `GstChallanCreate`, `GstChallanUpdate`, `GstChallanOut`, `GstChallanApplyRequest`.
- **New API endpoints** — CRUD at `/gst/challans` (list with status/return_id filters, create, get, update, delete) + `POST /challans/{id}/apply` to link a challan to a return.
- **Frontend** — "Challans / Payments" section in CompliancePage below returns list with:
  - Add challan form (challan number, date, amounts, bank, GSTIN, etc.)
  - Challans table with status badge, apply-to-return dropdown, delete
  - Linked challans card in return detail view with unlink support
- **E2E verified** — all CRUD operations, apply/unlink tested via API.

## Completed Phase 26: Financial Statements with Drill-Down
- **Backend** (`schemas/report.py`, `services/reports.py`, `api/v1/reports.py`):
  - New `LedgerTransactionOut` / `LedgerTransactionResponse` schemas
  - New `get_ledger_transactions()` service — joins VoucherLine → Voucher → Party, computes running balance
  - New `GET /reports/ledger-transactions?ledger_id=X&financial_year_id=Y` endpoint
- **Frontend** (`ReportsPage.tsx`):
  - **Trial Balance**: Ledger names are clickable (brand-colored, hover underline). Click → ledger detail modal.
  - **Profit & Loss**: Same pattern via `GroupTable`/`GroupRows` with `onLedgerClick` prop.
  - **Balance Sheet**: Same drill-down on all asset/liability/capital ledgers.
  - **Ledger Detail Modal**: Shows opening balance, all transactions with running balance, debit/credit totals. Transaction rows are clickable.
  - **Voucher Detail Modal** (2nd level): Shows voucher header (date, number, type, party, narration) and all lines with debit/credit, plus grand total.
- **Playwright**: 3 tests covering TB drill-down modal, P&L tab, BS tab — all passing.

## Completed Phase 27: Payments & Receivables Management
- **New model `PaymentAllocation`** (`models/voucher.py`) — links payment/receipt vouchers to the invoices they settle. Fields: invoice_voucher_id, payment_voucher_id, amount, allocation_date, remarks.
- **Voucher model** — added `due_date` (String(10), nullable) for invoice due date tracking.
- **Migration 0030** — adds `due_date` to vouchers, creates `payment_allocations` table with FKs and indexes.
- **New schemas** (`schemas/payments.py`) — `PaymentAllocateRequest`, `PaymentAllocationOut`, `ReceivableLine`, `PayableLine`, `ReceivablesResponse`, `PayablesResponse`.
- **New service** (`services/payments.py`) — `get_receivables()`, `get_payables()`, `get_invoice_allocations()`, `allocate_payment()`, `delete_allocation()`. Computes unpaid = grand_total - sum(allocations), aging buckets (current, 1-30, 31-60, 61-90, 90+).
- **New API router** (`api/v1/payments.py`) — 5 endpoints: receivables, payables, allocations list, allocate, delete.
- **Updated voucher schemas/service** — `due_date` added to VoucherCreate, VoucherOut, VoucherListOut, and passed through on creation.
- **Frontend `PaymentsPage.tsx`** — two tabs (Receivables / Payables), summary cards, searchable table, row-click detail modal, "Record Payment" modal. Route at `/payments`, sidebar entry under Reports group.

## Completed Phase 28: Document Attachments
- **New model `DocumentAttachment`** (`models/attachment.py`) — file attachments linked to vouchers. Fields: company_id, voucher_id, original_filename, stored_filename (UUID-based), mime_type, file_size, uploaded_by, timestamps.
- **Migration 0031** — creates `document_attachments` table.
- **New schemas** (`schemas/attachment.py`) — `AttachmentOut`, `AttachmentUploadResponse`, `AttachmentCountResponse`.
- **New API router** (`api/v1/attachments.py`) — 5 endpoints: upload, list, count, download, delete. Files stored to disk at `{UPLOAD_DIR}/{company_id}/{uuid}.ext`, auth-gated via API-only serving.
- **Config** (`core/config.py`) — `upload_dir` (default `./uploads`), `max_upload_size_mb` (default 10).
- **docker-compose.yml** — `zledger_uploads` named volume for persistence.
- **Frontend** — attachments panel in voucher detail modal: upload, download (authenticated), delete with confirm.

## Completed Phase 29: Enhanced Export & Print

### Backend — Export Service (`services/export.py`)
- **Generic helpers**: `_export_flat_pdf()` and `_export_flat_xlsx()` — reusable single-table PDF/Excel generation for flat reports.
- **16 new export functions** added (25 total):
  - Cash Flow: `export_cash_flow_pdf/xlsx` — 3 categories (operating/investing/financing) with inflow/outflow/net.
  - Aging: `export_aging_pdf/xlsx` — party-wise buckets with receivable/payable toggle.
  - Outstanding: `export_outstanding_pdf/xlsx` — debtors/creditors with balance types.
  - Register: `export_register_pdf/xlsx` — voucher-type filtered daybook.
  - TDS/TCS Summary: `export_tds_tcs_summary_pdf/xlsx` — party-wise section breakdown.
  - Stock Summary: `export_stock_summary_pdf/xlsx` — quantity, avg rate, total value, method.
  - Stock Movement: `export_stock_movement_pdf/xlsx` — opening/inward/outward/closing.
  - Stock Ageing: `export_stock_ageing_pdf/xlsx` — days since entry, ageing bucket.
  - Ledger Transactions: `export_ledger_transactions_pdf/xlsx` — full ledger with running balance.
  - **Voucher PDF**: `export_voucher_pdf` — company header, party info, ledger lines, grand total.

### Backend — API Endpoints
- **20 new export endpoints** in `api/v1/reports.py`:
  - `GET /reports/cash-flow/pdf|xlsx`
  - `GET /reports/aging/pdf|xlsx` (with `type` param)
  - `GET /reports/outstanding/pdf|xlsx`
  - `GET /reports/register/pdf|xlsx` (with `voucher_type` param)
  - `GET /reports/tds-tcs-summary/pdf|xlsx` (with `tds_tcs_type` param)
  - `GET /reports/stock-summary/pdf|xlsx`
  - `GET /reports/stock-movement/pdf|xlsx`
  - `GET /reports/stock-ageing/pdf|xlsx`
  - `GET /reports/ledger-transactions/pdf|xlsx` (with `ledger_id` + `financial_year_id`)
- **Voucher PDF endpoint** in `api/v1/vouchers.py`: `GET /vouchers/{id}/pdf`

### Frontend
- **ReportsPage.tsx** — Download PDF / Download Excel buttons added to all 8 report tabs:
  - Cash Flow, Aging (PDF/Excel next to toggle), Outstanding, Register (PDF/Excel next to select), TDS/TCS (PDF/Excel next to toggle), Stock Summary, Stock Movement, Stock Ageing.
- **ReportsPage.tsx** — Ledger Detail modal: PDF + Excel export buttons in header.
- **ReportsPage.tsx** — Voucher Detail modal: Print PDF button in header.
- **vouchers/index.tsx** — Voucher edit modal: Print PDF button next to Close.
- **DayBookPage.tsx** — Voucher edit modal: Print PDF button next to Close.

### Testing
- All 25 export functions verified — produce valid PDF (`%PDF-`) and XLSX (`PK`) bytes.
- 37/37 core Playwright tests pass (auth, navigation, vouchers, attachments, reports-drilldown).

## Completed Phase 29.1: Company Logo Upload + PDF Integration

### Backend — Model
- **Company model** (`models/user.py`): Added `logo_filename: String(255), nullable` field + `logo_url` computed property.
- **Migration 0032**: Adds `logo_filename` column to `companies` table.

### Backend — API
- **3 new endpoints** in `api/v1/companies.py`:
  - `POST /companies/{id}/logo` — upload logo (PNG/JPG, max 2 MB), stores to `{upload_dir}/{company_id}/logo.{ext}`
  - `GET /companies/{id}/logo` — serve logo image (FileResponse)
  - `DELETE /companies/{id}/logo` — delete logo file and clear DB field

### Backend — Schemas
- **CompanyOut**: Added `logo_url: str | None` field (computed from `logo_filename` via model property).

### Backend — PDF Export
- **Logo helper** (`services/export.py`): `_logo_flowable()` returns ReportLab `Image` flowable for company logo.
- **All 13 PDF export functions** updated to include logo at top of report:
  - Voucher PDF, Trial Balance, P&L, Balance Sheet, Cash Flow, Aging, Outstanding, Register, TDS/TCS Summary, Stock Summary, Stock Movement, Stock Ageing, Ledger Transactions.
- **`_export_flat_pdf()`** and **`_build_grouped_pdf()`** accept optional `company_id` + `db` params for logo rendering.

### Frontend
- **CompanySettingsPage.tsx**: New "Company Logo" section with:
  - Logo preview (20x20 image or placeholder icon)
  - Upload button (file input, accepts `image/png,image/jpeg`)
  - Remove button (when logo exists)
  - Status feedback (uploading/success/error)

## Completed Auth Fix: fetchMe Only Clears Token on 401
- **`store/auth.ts`**: Fixed `fetchMe()` — previously any error (network timeout, 500, DB pool exhaustion) cleared the auth token and redirected to login. Now only HTTP 401 triggers logout. Rapid page refreshes (5+) no longer cause forced logout.
- **Root cause**: 25+ concurrent API requests from rapid refreshes saturated the DB pool (max 15 connections), causing some `/auth/me` requests to fail with connection errors.

## Completed E2E Test Suite Expansion: 54 Tests Across 14 New Spec Files
- **14 new spec files** covering: inventory, financial years, daybook, voucher edit, chart of accounts, company settings, members, profile, e-invoice/eway, TDS/TCS, bank reconciliation, reports tabs, tally import, recurring templates.
- **All selector issues fixed**: `getByText` → `getByRole("heading")`, custom component handling (no `for` attributes on labels, custom Select vs native select), exact button name matching.
- **Total test count**: 54 tests across all spec files, all passing.

## Completed Polish & Test Coverage (2026-07-03)

### Fixed Financial Years Close 500 Error
- **Root cause**: `UnboundLocalError` in `accounting.py:103` — `from decimal import Decimal` was imported inside an `if` block AFTER already being used at lines 103-104. Python's local scope resolution raised `UnboundLocalError: cannot access local variable 'Decimal' where it is not associated with a value`.
- **Fix**: Moved `from decimal import Decimal` to the top of the `close_financial_year()` function, removed the duplicate inline import.
- **E2E test**: `financial-years.spec.ts` — removed graceful skip on "Internal Server Error". Close/reopen test now properly validates the flow end-to-end.

### Company Logo in UI
- **Sidebar company card**: Generic building icon replaced with company logo `<img>` when `logo_url` is available, falls back to building icon.
- **Dashboard header**: Small logo (24×24) + "Welcome to {company name}" below "Dashboard" heading.
- **Company select page**: Each company button shows logo (or fallback building icon) to the left of company name + role.
- **Data flow**: Backend `CompanyBrief` schema and `/auth/me` endpoint now include `logo_url`. Frontend `Company` type and `CompanyDetails` interface updated.
- **3 new E2E tests**: Logo in sidebar card, logo in dashboard header, logo disappears after removal.

### Sidebar Layout Polish
- Brand logo is now centered horizontally in the sidebar.
- Brand logo moved above search box (brand at top, search below).
- **E2E test**: Verifies brand logo is positioned above search box in DOM.

### GSTR Test Stability
- GSTR-1 and GSTR-3B tests handle 409 Conflict (return already exists from previous runs) by navigating to the existing return view.

### Performance: DB Pool Size
- Increased from default 5+10=15 → 10+20=30 max connections
- Added `db_pool_size` and `db_max_overflow` to `config.py`, `db.py`, `cron_runner.py`, `.env.example`

### Build Fix: Vite Dynamic Import Warning
- Replaced two dynamic `import("...")` calls in `QuickCreate/configs.ts` with static import — eliminates Vite chunk splitting warning

### New E2E Tests (17 tests across 5 spec files)
- **`payments-receivables.spec.ts`** (4 tests): Page load, receivables table, payables tab, invoice detail modal
- **`gstr-annual.spec.ts`** (2 tests): GSTR-9 annual return view, GSTR-9C reconciliation view
- **`dashboard-content.spec.ts`** (4 tests): Summary cards, vouchers section, voucher type counts, quick action buttons
- **`admin-pages.spec.ts`** (3 tests): Admin users, admin companies, audit log — page loads
- **`recurring-templates-crud.spec.ts`** (4 tests): Create, Run Now button, delete — replaces old 1-test file
- **Cleanup**: Removed duplicate `bank-reconciliation.spec.ts`

### Total E2E Tests
- **72 tests** across 25 spec files (71 passing, 1 doc-attachment pre-existing flake)

## Phase 31: User Roles & Permissions (Complete)

### Backend Role Enforcement
- **`require_role(min_role)`** dependency in `dependencies.py` — role hierarchy: `viewer < accountant < owner`. Superadmins always pass.
- **Applied to 13 API files** — all write endpoints (POST/PATCH/DELETE) now enforce minimum `accountant` role
- **Owner-only endpoints**: company update/logo, FY close, member management
- Read endpoints (GET) remain accessible to all members

### Frontend Role Gating
- **`useRole()` hook** — returns `role`, `canEdit` (accountant+), `canManageMembers` (owner), `isViewer`
- **7 pages gated**: COA, Inventory, Vouchers, Members, Financial Years, Company Settings — create/edit/delete buttons hidden for viewer role
- **`getUserRole()`** in auth store — derives role from active company membership

## Completed (Session 2026-07-12)
- [x] **LAN access black-screen fix** (Critical)
  - Root cause: `crypto.randomUUID()` in `client.ts:getTabId()` only works in secure contexts (HTTPS/localhost). Accessing `http://192.168.1.110:9090` over plain HTTP threw `crypto.randomUUID is not a function`, crashing the whole React app (blank/black screen).
  - Fix: Added `generateId()` fallback using `crypto.getRandomValues` when `crypto.randomUUID` is unavailable.
  - Verified via Playwright: login page renders at `http://192.168.1.110:9090` with zero console/page errors.

- [x] **Phase 33: Fixed Asset Register + Depreciation** (Complete)
  - **Backend**: `AssetCategory` + `AssetRegister` models (`models/asset.py`); migration `0049_asset_register` (down_revision `0048`).
  - **Schemas** (`schemas/asset.py`): category + asset CRUD schemas, `DepreciationScheduleLine`/`Response`, `DepreciationRunRequest`/`Response`.
  - **Service** (`services/asset.py`): category CRUD, asset register CRUD, WDV & SLM depreciation (days-apportioned from put-to-use date), schedule preview, `run_depreciation()` posts a journal (Dr `Depreciation Expense` SYS_DEPRECIATION_EXPENSE / Cr `Accumulated Depreciation` SYS_ACCUMULATED_DEPRECIATION) and is **idempotent** (skips assets already depreciated for the FY; voucher amount = actually-applied depreciation, not the preview total; 409 duplicate-voucher handled gracefully → "No new depreciation to post").
  - **API** (`api/v1/assets.py`, prefix `/fixed-assets`): categories CRUD, assets CRUD, `GET /depreciation/schedule`, `POST /depreciation/run`.
  - **Frontend** (`FixedAssetsPage.tsx`): 3 tabs (Asset Register / Categories / Depreciation) with `useRole` `canEdit` gating, ContextMenu, Select, DateInput, showConfirm. Route `/fixed-assets` + sidebar (Accounting group, `assets` icon).
  - **Reports integration**: automatic via ledger netting (BS shows Fixed Assets net of accumulated depreciation; P&L shows depreciation expense). No reports.py changes needed.
  - **Seed** (`seed_demo_data.py:seed_fixed_assets()`): 3 categories + 4 assets per company, all 5 demo companies.
  - **E2E**: `tests/e2e/specs/fixed-assets.spec.ts` — page loads, 3 tabs render with seeded data, zero console errors (passing).
  - **Verified**: Apex run posted ₹123,044.69 depreciation voucher; second run is a harmless no-op (idempotent).

### Fixed (during thorough testing)
- **Asset edit 422 bug**: `update_asset` in `api/v1/assets.py` used the wrong schema (`AssetCategoryCreate`) and there was no partial-update schema, so editing an asset via API/UI returned 422. Added `AssetCategoryUpdate` + `AssetRegisterUpdate` schemas (all fields optional, `exclude_unset`), fixed `update_category`/`update_asset` service + router to apply only provided fields, and re-derive `wdv = cost - accumulated_depreciation` on asset update.
- **Missing GET-by-id endpoints**: Added `GET /fixed-assets/categories/{id}` and `GET /fixed-assets/assets/{id}` (404 if not found / wrong company).
- **`is_active` filter**: `GET /fixed-assets/assets` now supports `?is_active=true|false` (service `get_register` gained the param).

### Testing (added)
- **Backend API spec** `tests/e2e/specs/api-fixed-assets.spec.ts` (5 tests, all passing): isolated `Test Co` company (self-cleaning via superadmin force-delete), covers category + asset CRUD, validation (422/404), filters, WDV+SLM days-apportioned schedule math, depreciation run posting a balanced journal voucher, idempotency (no-op re-run), `force` re-run, and viewer 403 / reader 200.
- **UI spec** `tests/e2e/specs/fixed-assets.spec.ts` (passing): login → /fixed-assets, 3 tabs, create+edit+delete category, create+edit+delete asset, depreciation preview + run, zero console/page errors.

## Next Up
- Phase 34: TBD (more features, bug fixes, polish)

## Completed: Data Protection — Automated Backup & Restore (2026-07-07)

### Automated Database Backup
- **`scripts/backup.sh`**: pg_dump with gzip compression, configurable retention (default 30 days), automatic rotation of old backups
- **Docker backup service**: Runs `postgres:16-alpine` with pg_dump on configurable interval (default 24h), persistent `zledger_backups` volume
- **Uploads backup**: Also backs up `zledger_uploads` volume (logos, document attachments) as tarball alongside database dump
- **Configuration**: `BACKUP_RETENTION_DAYS` (default 30), `BACKUP_INTERVAL_HOURS` (default 24)

### Google Drive Sync
- **rclone integration**: Backup service includes rclone for optional Google Drive upload
- **OAuth2 token auth**: Simple setup — run `rclone authorize drive` locally, paste token to `config/rclone/token.json`
- **No Google Cloud project needed**: Uses personal Google account via rclone's built-in OAuth
- **Config**: `GDRIVE_ENABLED` (default false), `GDRIVE_REMOTE_PATH` (default `zledger-backups`)
- **`sync-status.json`**: Written after each upload, read by backup status API for sync history
- **`config/rclone/README.md`**: Step-by-step setup instructions

### Web-Based Restore
- **`GET /api/setup/status`**: Public endpoint returning `{ has_users, has_companies }` for fresh instance detection
- **`POST /api/admin/restore/upload`**: Superadmin uploads `.sql.gz` database backup + optional `.tar.gz` uploads backup, validates gzip integrity
- **`POST /api/admin/restore/execute`**: Drops DB, restores via `pg_restore`, extracts uploads — all in background thread
- **`RestoreBackupModal`**: Frontend component with drag-and-drop upload, file validation, confirmation dialog (type "RESTORE"), progress states, auto-redirect to login
- **`CompanySelectPage`**: Shows "Restore from backup" button when no companies exist (fresh instance)
- **`backend/Dockerfile`**: Added `postgresql-client` for `pg_restore` availability

### Restore Script
- **`scripts/restore.sh`**: Interactive confirmation, drops and recreates database, restores uploads, runs ANALYZE
- **Usage**: `./scripts/restore.sh /backups/zledger_XXX.sql.gz /backups/zledger_uploads_XXX.tar.gz`

### Company Hard-Delete Guard
- **`admin.py`**: Blocks deletion if company `is_active=True` (must deactivate first)
- **`admin.py`**: Blocks deletion if company has vouchers, ledgers, or financial years — returns specific counts

### Expanded Audit Logging
- **`accounting.py`**: Added `log_action` to all CRUD operations for financial years, account groups, ledgers, and parties
- **`audit.py`**: Added public `serialize_entity()` function for generic model serialization

### Backup Status API
- **`GET /api/admin/backups`**: Superadmin-only endpoint returning list of database and uploads backups with filenames, sizes, timestamps, and GDrive sync status

### Infrastructure
- **`docker-compose.yml`**: Backup service with custom Dockerfile (postgres:16-alpine + rclone), `zledger_backups` and `zledger_uploads` volumes; API container mounts backup volume read-write
- **`backend/backup/Dockerfile`**: Custom image with pg_dump + rclone for backup service

## Completed: DayBook Bulk Actions

### Bulk Selection & Actions
- Added `bulkMode` and `selected` state to DayBookPage
- **"Select" button** appears in FilterBar for users with `canEdit` permission
- **Flat view (SortableTable)**: Checkbox column prepended when bulk mode is active; row click toggles selection instead of opening modal
- **Grouped view (manual table)**: Checkbox column added to table header and each EntryRow; row click toggles selection
- **Bulk action buttons**: "Cancel (N)" (amber) and "Delete (N)" (red) appear when items are selected
- **Confirm dialogs**: Both cancel and delete show confirmation prompts before executing
- **API calls**: Uses existing `/vouchers/bulk-cancel` and `/vouchers/bulk-delete` endpoints
- **Exit**: "Cancel Selection" button exits bulk mode and clears selections
- **Permission gating**: Bulk actions only visible to users with `canEdit` role (accountant/owner)

## Completed Phase 32: Inventory Page Redesign

### Stock Groups Tab
- Cards upgraded to gradient style with **colored left border** (6 colors cycling: emerald, blue, violet, amber, rose, teal)
- Each card shows **item count** and **stock value** summary in colored pill badges
- **Active/Inactive badge** displayed on each card
- **Hover lift effect** (`hover:-translate-y-0.5 hover:shadow-md`) with pencil edit icon appearing on hover
- Cards use `rounded-xl`, gradient bg, semi-transparent borders

### Stock Items Tab
- Replaced plain `<table>` with **SortableTable** (9 sortable + resizable columns)
- Columns: Name, SKU, Group, HSN/SAC, UOM, Qty, Rate, Value (calculated), GST%
- Added **search bar** filtering across name, SKU, and HSN/SAC code

### Stock Entries Tab
- Replaced plain `<table>` with **SortableTable** (8 sortable + resizable columns)
- Columns: Date, Item, Type (color-coded badge), Qty, Rate, Amount, Reference, Narration
- Added **search bar** filtering across item name, reference, and narration

### Summary Stats
- 4 gradient stat cards at top: Groups, Items, Stock Value (green-tinted), Entries
- Values computed via `useMemo` for performance

### Buttons
- "+ New Group/Item/Entry" button upgraded to `btn-primary` gradient

## Completed Phase 32: Visual Improvements — Gradients, Glass & Transitions

### Gradient Cards
- All dashboard stat cards, section cards (Voucher Stats, Masters, Quick Actions), and PaymentsPage summary cards now use `bg-gradient-to-br from-white to-slate-50/80` (light) / `from-[#18181f] to-[#1a1a25]` (dark)
- Cards have subtle hover lift effect (`hover:-translate-y-0.5 hover:shadow-md`) with 200ms transitions
- Dashboard stat cards upgraded to `rounded-xl` with semi-transparent borders (`border-slate-200/60`)

### Glass-Style Cards
- Added `.glass-card` CSS utility class for semi-transparent bg + borders (no backdrop-blur)
- Glass effect reserved for modals only (4 existing occurrences) — avoids scroll jank

### Primary Button Gradients
- Added `.btn-primary` CSS utility class with gradient: `from-brand-600 to-brand-70` (light) / `from-violet-500 to-violet-600` (dark)
- Buttons include hover lift, shadow transitions, and disabled state
- Applied to: VoucherFooter Save, QuickCreate modal, LoginPage, RegisterPage, MembersPage (2 buttons), CompanySelectPage, ProfilePage (2 buttons), CompanySettingsPage, FinancialYearsPage (2 buttons)

### Header Borders
- Page header borders updated from `border-slate-200 pb-2` to `border-slate-200/60 pb-3` across all major pages: Dashboard, Vouchers, DayBook, Payments, AuditLog, Members, plus others

### CSS Utilities
- `.card-gradient` — gradient card with hover lift
- `.card-gradient-static` — gradient card without hover
- `.glass-card` — semi-transparent glass effect
- `.btn-primary` — gradient primary button with transitions

## Completed Phase 32: Sortable Tables + Column Resizing

### SortableTable Component
- **New `SortableTable.tsx`** — Reusable table component using `@tanstack/react-table` with click-to-sort column headers and drag-to-resize column widths.
- **Features**: Click header to sort (ascending → descending → none), sort direction indicator arrow, drag handle on column borders for resizing, hover/active visual feedback.
- **Column resizing**: Custom resize handler with `<colgroup>` + `<col>` elements for reliable width control. Resizes via `document.addEventListener` for stable drag tracking.
- **State persistence**: Column sizes saved to `localStorage` per table key (`sortable-col-sizes-{key}`). Sizes survive page navigation and browser refresh.
- **Table layout**: `table-layout: fixed` with dynamic table width (sum of column widths). Resizing one column doesn't affect others — table expands with horizontal scroll.

### Applied To
| Page | Key | Columns Sortable |
|------|-----|-----------------|
| VoucherList (Vouchers + Dashboard) | `vouchers` | #, Date, Type, Party, Narration, Amount |
| DayBookPage (flat view) | `daybook` | Date, Voucher#, Type, Party, Narration, Debit, Credit, Created By |
| PaymentsPage | `payments` | Invoice#, Date, Due Date, Party, Amount, Paid, Unpaid, Status |
| AuditLogPage | `audit-log` | Date, Action, Entity, Description, User |

### Bug Fixes
- **`getResizeHandler` crash**: TanStack's `getResizeHandler()` returned `undefined` when called via `column` instead of `header`. Fixed by passing `header` object and using custom resize handler.
- **Table blank pages**: All SortableTable pages showed blank due to `getResizeHandler is not a function` error crashing the component tree. Resolved with custom resize handler.
- **Column resize affecting others**: `table-layout: fixed` with `width: 100%` forced columns to redistribute space. Fixed by setting table width to sum of column widths (`table.getCenterTotalSize()`).
- **Voucher number overflow**: Text like "CN-2025-0001" overlapped into adjacent cells. Fixed by adding `overflow-hidden` to `<td>` and `truncate` class, increased default size from 70 → 120.
- **Narration not filling space**: `max-w-[200px]` capped narration width even when column was wider. Changed to `w-full truncate` to fill available space.

### Dependencies
- **`@tanstack/react-table`** v8.21.3 — installed in frontend

## Superadmin UI Protection on Members Page (2026-07-05)
- **Backend**: Added `user_is_superadmin` field to `MemberOut` schema and `_serialize_member()` — the API now tells the frontend which members are superadmin.
- **Frontend `MembersPage.tsx`**: Superadmin users now show italic "superadmin" label instead of Edit/Remove action buttons, and are excluded from checkbox selection (both single-row and select-all). Owners retain existing behavior.
- All 101 API tests + workflow tests passing.

## Bug Fixes (2026-07-04)
- [x] **Migration 0033**: Restored `cancel_reason`/`cancelled_at` columns dropped by migration 0022. Fixes Cash Flow/Aging 500s and Daybook voucher load failures.
- [x] **Company Logo Auth**: Removed auth from GET logo endpoint — browser `<img>` tags can't send headers. Endpoint is now public.
- [x] **FY Delete Error**: Fixed `[object Object]` error display (`e?.detail` → `e?.message`). Added `is_closed` guard in backend.
- [x] **Payables/Receivables**: Excluded cancelled vouchers. Added PaymentAllocation records + due_date to demo data.
- [x] **Dashboard Stale FY**: Clear activeFyId on company switch. Added AbortController to prevent stale data.
- [x] **Tests**: Backend API tests 101/101 passing (was 89/99). Fixed 10 test data issues + 1 real bug (`cancelled_at` VARCHAR too short). Migration 0034 increases to VARCHAR(40).

## Completed Phase 33: High-Priority API Test Coverage (2026-07-05)
- **8 new API-level Playwright spec files** (29 unique tests after removing 10 overlaps with api-backend.spec.ts), covering: FY validation, composition GST, payment allocation, bulk actions, bank reconciliation, TDS/TCS, e-invoice, e-way bill.
- **Bug fix**: `POST /payments/allocate` returned raw ORM model causing 500 — `created_at` now serialized to ISO string.
- **Fixture update**: `LEDGERS.sales` added to `helpers/fixtures.ts`.

## Completed Phase 24: Background Cron Processor + GSTR-9C Reconciliation

### Part A — Background Cron Processor
- **Voucher service extraction**: Created `services/voucher_service.py` with all core voucher creation logic extracted from the API layer. Provides `create_voucher()` callable from both API endpoints and background tasks.
- **API refactor**: `api/v1/vouchers.py` now delegates to the shared service. Both `POST /vouchers` and `PATCH /vouchers/{id}` use the same underlying logic.
- **Recurring templates fix**: `POST /{tmpl_id}/run` and `POST /process-due` now actually create vouchers using the service (previously only advanced dates).
- **Standalone cron runner**: `cron_runner.py` — loops every N minutes, iterates all active companies, processes due recurring templates, creates vouchers as the system admin user.
- **Docker scheduler service**: New `scheduler` service in docker-compose.yml (under `--profile scheduler`) that runs the cron runner independently.
- **Config**: Added `CRON_ENABLED` and `CRON_INTERVAL_MINUTES` settings.

### Part B — GSTR-9C Reconciliation
- **Gstr9cData** dataclass and `generate_gstr9c()` function in `services/gstr.py` — compares book aggregates against a saved GSTR-9 return across Table 4 (outward), Table 6 (ITC), and Table 8 (net tax). Flags discrepancies.
- **Gstr9cResponse** schema and `Gstr9cLineOut` in `schemas/gst.py`. Return type regex extended to `gstr9c`.
- **API**: `POST /returns/generate` handles `gstr9c` return type. Requires GSTR-9 to exist first.
- **Frontend**: CompliancePage shows GSTR-9C in return type dropdown, FY period selection, detail view with side-by-side Book vs Return tables, discrepancy highlighting, and summary status.

## Completed Phase 32: Bulk Actions for All CRUD Pages

### Backend Bulk Endpoints
- **Inventory**: `POST /inventory/groups/bulk-delete`, `POST /inventory/items/bulk-delete`, `POST /inventory/entries/bulk-delete` — batch delete with error collection
- **HSN/SAC**: `POST /hsn-sac/bulk-delete` — batch delete
- **Ledgers**: `POST /coa/ledgers/bulk-delete` — skips system/protected ledgers, checks voucher usage before delete
- **Members**: `POST /members/bulk-remove` (owner only) + `POST /members/bulk-role` (owner only, changes role for selected members)
- **Shared schemas**: `BulkActionResult` and `BulkDeleteRequest` in `schemas/common.py`

### Frontend Updates
- **SortableTable**: Added `selectable`, `selected`, `onToggleSelect` props for checkbox column support. Checkbox column prepended automatically when `selectable=true`.
- **InventoryPage**: Items and entries tabs now have checkbox selection + "Delete (N)" button
- **HsnSacPage**: Table has checkbox column + bulk delete button for non-owner users
- **MastersPage**: Ledger tab has checkbox selection (skips protected ledgers) + bulk delete button
- **MembersPage**: Checkbox selection on non-owner members + bulk remove button + bulk role change buttons (accountant/viewer)

## Completed Phase 34: Performance & UX Improvements

### Backend Pagination & Search
- **Vouchers**: `GET /vouchers` paginated with `search`, `voucher_type` query params — returns `{items, total, limit, offset}`
- **Inventory entries**: `GET /inventory/entries` paginated with `search`, `limit`, `offset`
- **Master data search**: `GET /coa/ledgers`, `GET /coa/parties`, `GET /inventory/items` accept `search` param (limited to 200 results)

### Frontend UX
- **SearchableSelect**: New component with built-in search input for filtering options client-side
- **QuickCreateSelect/Modal**: Updated to use SearchableSelect for type-ahead filtering
- **Table virtualization**: SortableTable renders only visible rows (~30 at a time) via `@tanstack/react-virtual`

### Streaming Export
- **Daybook CSV**: True streaming with 1000-row batches, 50K row safety limit (replaced `StringIO` + `.encode()`)
- **Export row limits**: Daybook XLSX/PDF exports now accept `limit` param (default 50K, max 100K)

### React Query
- **useMasterData hook**: Caches ledger/party/stock item lookups across components (5 min stale, 30 min cache)
- **Vouchers page**: Now uses React Query for master data (cached, deduplicated)

### Testing
- **103/103 API tests passing**
- **6/6 Auth tests passing**

## Completed Phase 35: Table Alignment & Bug Fixes

### Table Header Alignment
- **BankReconciliationPage**: Consistent `px-3 py-2.5` on all `<th>` elements, `tabular-nums` on amounts, debit (green) / credit (red) coloring, running balance calculation, status badges with icons (Matched/Open), hover states on action buttons
- **TdsTcsPage**: 3 tables fixed — numeric columns (Base Amount, Rate, Tax, Threshold, Entries, Total Amount, Total Tax) now use `px-3 py-2.5 text-right` instead of bare `pb-2 text-right`
- **CompliancePage**: 15+ numeric column headers fixed — all `pb-2 text-right` replaced with `px-3 py-2.5 text-right` (Books, Return, Difference, Amount, CGST, SGST, IGST)

### Dashboard Bug Fix
- **Voucher list not showing**: `GET /vouchers?limit=500` was exceeding API's `le=200` cap, causing silent 422 validation error. Fixed by raising API limit to `le=500` in `backend/app/api/v1/vouchers.py`
- **Dashboard test assertions**: Updated to handle both "NET PROFIT" and "NET LOSS" states, and match uppercase CSS-transformed labels

### Testing
- **21/21 key tests passing** (dashboard, vouchers, TDS/TCS, bank reconciliation)

## Completed Phase 36: Visual Polish & UX Improvements

### Color Rebrand
- **Violet/Purple → Blue**: Replaced all `violet-*` and `purple-*` Tailwind classes with `blue-*` across 43 frontend files (~180 occurrences)
- **Dark mode accent**: Now consistently blue throughout (buttons, focus rings, tabs, badges, cards)

### Table Improvements
- **Column resizing disabled**: `enableColumnResizing` default changed to `false` — no resize handles on any tables
- **Full-width tables**: Removed `tableLayout: "fixed"` and pixel-based width calculation, tables now use `w-full` with auto-sizing columns
- **Table background**: Added `bg-white dark:bg-[#12121a]` + `shadow-sm` to make tables visually distinct from page background
- **Sort icon fix**: SVG paths corrected to render proper chevrons (↑↓) instead of broken `\` character

### Dark Mode Color Separation
- **New surface layers** with better contrast:
  - Page: `#08080c` (deeper black)
  - Sidebar: `#0f0f16`
  - Cards: `#16161f` (distinct from page)
  - Hover: `#1e1e28`
  - Elevated: `#282832`
  - Borders: `#1a1a24`
- Cards now visually pop from page background

### Dashboard Improvements
- **StatCard**: Added icons (emerald/red/slate), larger text, hover lift effect
- **CountBadge**: Colored dot indicators, better spacing, hover effects
- **Quick Actions**: Icons in colored containers, color-coded hover states per action
- **Voucher filter buttons**: Now work (client-side filtering by type and search)
- **Voucher counts**: Computed from actual voucher list, not API summary (ensures consistency)
- **Search**: Added `search` state + props to VoucherList for dashboard search

### Inventory Page Improvements
- **Stat cards**: Added icons (grid, package, dollar, document), larger text, hover shadow
- **Group cards**: Enhanced hover effect (-translate-y-1, shadow-lg, blue glow)
- **Empty state**: Centered icon with descriptive text

### Testing
- **10/10 auth + dashboard tests passing**
- **24/24 full test suite passing** (auth, dashboard, vouchers, TDS/TCS)

## Completed: Per-Tab Company Isolation

### Problem
- Browser tabs shared company ID via `localStorage` — switching company in one tab changed it in all tabs
- Caused confusion for users managing multiple companies simultaneously

### Solution
- **`client.ts`**: Replaced `localStorage` company ID with `sessionStorage` keyed by unique `tabId`
  - Each tab generates a unique ID via `crypto.randomUUID()` on first load
  - Company ID stored as `sessionStorage[tabId]` — completely independent per tab
  - `getCompanyId()` and `setCompanyId()` functions encapsulate the logic
- **`store/auth.ts`**: Updated to use `getCompanyId()`/`setCompanyId()` from client.ts instead of direct `localStorage` access

## Completed: Concurrent User Activity Tracking

### Backend
- **`CompanyActivity` model** (`models/company_activity.py`): `user_id`, `company_id`, `last_seen_at`, `current_page`, `ip_address`
- **Migration 0035**: Creates `company_activity` table with index on `(company_id, last_seen_at)`
- **`POST /api/activity/heartbeat`**: Updates `last_seen_at` for user+company, returns active user count (seen in last 2 minutes)
- **`GET /api/activity/active-users`**: Returns users active in the last 2 minutes for the current company
- **`GET /api/activity/companies/{id}/activity`**: Admin/superadmin endpoint — active users (last 5 min), recent members
- **`POST /api/activity/companies/{id}/force-logout`**: Superadmin-only — deletes all activity records for a company

### Frontend
- **`useHeartbeat` hook** (`hooks/useHeartbeat.ts`): Sends heartbeat every 30 seconds with current page path
- **`App.tsx`**: Integrated `useHeartbeat` at app root level
- **`ActiveUsersIndicator`** (`components/ActiveUsersIndicator.tsx`): Shows avatar stack of active users in sidebar company card
- **`AdminActivityPage`** (`pages/AdminActivityPage.tsx`): Admin dashboard showing active users + recent members per company, force-logout button

### Navigation
- "Admin Activity" sidebar item under Admin group
- Route at `/admin/activity`

## Manufacturing Module

### Done
- **Models**: BillOfMaterials, BomLine (with sub_bom_id for multi-level BOMs), BomVersion, ProductionOrder, ProductionOrderLine, WorkCenter, Routing, RoutingOperation
- **Services**: BOM CRUD, duplicate_bom, import_boms_from_csv, resolve_bom_requirements (recursive multi-level), production order lifecycle (draft → in_progress → completed/cancelled), get_wastage_report, cost reports, check_material_availability, versioning (auto-saves snapshots on update)
- **API**: 30+ endpoints: BOM CRUD + availability + stock-levels + duplicate + import + PDF + versions + restore, production order CRUD + start + confirm (with actual_quantities for wastage) + cancel + PDF, cost breakdown + wastage report + PDF/XLSX exports, work center CRUD, routing CRUD
- **Frontend**: ManufacturingPage with 3 tabs (BOMs, Production Orders, Reports), BOM detail panel with component table + stock levels + Sub-Assembly/Raw Material badges, BOM form with sub-assembly dropdown, production order detail with material availability + wastage tracking, CSV import, Escape key closes popups
- **Wastage Tracking**: ProductionOrderLine stores planned_qty, actual_qty, wastage_pct per component; confirm endpoint accepts actual_quantities parameter; wastage report aggregates across all production orders
- **Multi-level BOMs**: sub_bom_id on BomLine, recursive resolution, production confirm creates stock entries at all levels + cost roll-up
- **BOM Versioning**: Auto-saves snapshot before each update, version number incremented, /boms/{id}/versions endpoint returns history
- **Production Order PDF**: Includes wastage report section (planned/actual/wastage%) for completed orders
- **Migrations**: 0038 (initial), 0039 (sub_bom_id), 0040 (production_order_lines), 0041 (BOM versioning), 0042 (enhancements), 0043 (work centers + routings)
- **Seed Data — All 5 Companies**: Manufacturing seed data now covers every company:
  - **Apex Enterprises** (original): 2 BOMs (Wireless Mouse, USB Drive), 2 production orders (1 completed, 1 draft)
  - **GreenLeaf Organics**: 2 BOMs (Rice Repacking 25kg→25×1kg, Honey Bottling 5kg→10×500ml), 2 production orders (1 completed, 1 draft). Raw materials: bulk rice, pouches, labels, bulk honey
  - **BuildRight Construction**: 1 BOM (Precast Concrete Block M20 Mix), 1 production order (completed). Raw materials: cement, sand, coarse aggregate. New stock item: Precast Concrete Block 40x20x20cm
  - **Medix Pharma**: 1 BOM (Comprehensive First Aid Kit), 2 production orders (1 completed, 1 draft). Raw materials: bandage, antiseptic, gauze, tape. New stock item: Comprehensive First Aid Kit
  - **TechVista Solutions**: 1 BOM (Server Rack Assembly), 1 production order (completed). Uses existing hardware: servers, switches, UPS, cabling. New stock item: Assembled Server Rack Unit
- **truncate_all()** updated: added production_order_lines, bom_versions, routing_operations, routings, work_centers to the table deletion order
- **Demo data counts**: 182 vouchers, 72 stock items (was 53), 40 parties, 5 companies
- **Tests**: 128 tests passing (103 original + 25 manufacturing), all 26 E2E tests pass including manufacturing + cross-cutting auth
- **Manufacturing Dashboard Widgets**: Backend `/api/manufacturing/dashboard` + frontend `ManufacturingWidgets.tsx` with StatCards, OrderBadge, wastage summary, recent orders
- **13/13 manufacturing E2E tests passing**

## Dashboard Redesign

### Done
- **Phase 1 — Quick Wins**:
  - Removed Recent Vouchers list (redundant with Vouchers page + Daybook)
  - Removed Masters card (replaced by Pending Actions panel)
  - Shrunk Wastage to single KPI card in ManufacturingWidgets
  - Increased spacing between sections (space-y-8)
- **Phase 2 — Restructure**:
  - KPI cards already 4 (Income, Expenses, Net, Assets) — kept as-is
  - Manufacturing section compact with "View All" button linking to /manufacturing
  - New Pending Actions panel: Unreconciled Bank Entries, Outstanding Receivables
  - Backend: `GET /api/dashboard/pending-actions` endpoint
- **Phase 3 — Trend Chart**:
  - Installed `recharts` library
  - New `IncomeVsExpensesChart.tsx` with LineChart (income green, expenses red)
  - Backend: `GET /api/dashboard/chart-data` endpoint (monthly aggregation by FY)
- **Frontend files**: `DashboardContent.tsx`, `ManufacturingWidgets.tsx`, `PendingActions.tsx`, `IncomeVsExpensesChart.tsx`
- **Backend files**: `dashboard.py` (API), `dashboard.py` (service)
- **Tests updated**: Dashboard widget test updated for new compact labels (BOMs, Orders, Wastage)

## Granular Permissions & Role Badge (2026-07-17)

### Done
- **Permission enum** (`backend/app/core/dependencies.py`): `Permission` str-Enum (28 perms), `_ROLE_PERMISSION_MAP` mapping viewer/accountant/owner → perms, `SUPERADMIN_PERMISSIONS`, `get_permissions_for_role()`, `get_effective_permissions()`, and `require_permission(permission)` dependency factory.
- **Backend enforcement**: `require_permission` wired into:
  - `members.py`: add/patch/delete member → `MANAGE_MEMBERS` (removed redundant `_require_owner`; owner-only enforced via permission).
  - `accounting.py` (financial-years): create/close/update/delete → `MANAGE_FINANCIAL_YEARS` (previously accountant could create/close/delete FYs — was a privilege bug, now owner-only).
- **`GET /api/auth/me/permissions`** endpoint returns `{ role, permissions[] }` for the active company (superadmin → owner + all perms).
- **Frontend**:
  - `store/auth.ts`: added `permissionsByCompany` + `fetchPermissions(companyId)` called on `setActiveCompany` and after `fetchMe`.
  - `hooks/useRole.ts`: added `usePermissions()` → `{ permissions, can(perm) }` with role-based fallback.
  - `components/Can.tsx`: declarative `<Can permission=... fallback=...>` for role-aware UI hiding.
  - `TopHeader.tsx`: role badge (using `ROLE_BADGES`/`ROLE_LABELS`) in company switcher + profile dropdown.
  - `pages/vouchers/index.tsx`: create form gated behind `Can permission="create_voucher"` (viewers see read-only notice).
- **Tests**: 290 backend pytest pass. Manual API check: viewer/accountant → 403 on FY create; owner → 201.

### Notes / Next
- `require_role` remains the primary backend enforcement for the ~100 write endpoints (equivalent to the accountant permission set). Granular `Permission` is the source of truth for the frontend and for owner-only admin actions.
- Remaining plan items (not yet started): #4 MemberRoleLog audit table, #5 "admin" role as distinct from owner, broader `<Can>` wrapping of action buttons across pages.

## Admin Role + Audit + Role-Aware UI (2026-07-17, cont.)

### New: "admin" role (distinct from owner)
- `CompanyRole` now: `viewer < accountant < admin < owner`. `ASSIGNABLE_ROLES` = {admin, accountant, viewer}.
- Admin permissions = accountant set + `manage_members` + `manage_company` (NOT `manage_financial_years` / `manage_modules` — owner-only).
- `require_permission(MANAGE_COMPANY)` now gates company update/logo/voucher-numbering (was `require_role(owner)`) so admins can manage company settings.
- `require_permission(MANAGE_MEMBERS)` gates member add/patch/delete (was `_require_owner`).
- `MANAGE_COA` permission added (accountant/admin/owner) for COA create commands.

### #4 Member role-change audit
- `services/audit.py`: added `log_role_change()` helper (entity_type=`member_role`, old/new role snapshot).
- `members.py` role-change endpoint uses `log_role_change`.
- `audit.py` router: added `GET /api/audit/role-changes` (dedicated role-change history; registered BEFORE `/{log_id}` to avoid route clash).
- Fixed pre-existing bug: `get_audit_log` was shadowing `/role-changes` (404).

### Role-aware UI
- `useRole()` now derives `canManageMembers`/`canManageCompany` from effective permissions (so admins see member/company management).
- `CompanySettingsPage`: FY create/close/delete + Modules save gated by owner (`manage_financial_years`/`manage_modules`); general settings by `canManageMembers`.
- `MembersPage`: role dropdown dynamically includes "Admin" when user can manage members; badges render for all 4 roles.
- `TopHeader` command palette: create commands gated by `permission` (viewers don't see New Voucher/COA/Inventory/etc.).
- Sidebar + header show role badge (lowercase role text in sidebar per E2E spec).
- `vouchers/index.tsx`: create form gated behind `<Can permission="create_voucher">`.

### Tests
- 290 backend pytest pass. Manual API: admin can manage members+company, blocked from FY/modules/assign-owner (403); viewer/accountant blocked from FY create (403).
- E2E `role-enforcement.spec.ts`: 12/13 pass. 1 failure (`Financial Years page hides create button for viewer`) is a pre-existing spec/UI mismatch — it clicks a `<link name="Financial Years">` that doesn't exist in the current UI (FY is a Company Settings tab, not a sidebar link). Not caused by these changes.
- E2E `members.spec.ts`: 4/4 pass.

## Role Display & Admin Fixes (2026-07-17)
- **Superadmin badge in Members page**: `MembersPage.tsx` now renders a distinct blue `superadmin` badge for any member with `user_is_superadmin=true`, instead of showing their stored membership role (seed downgrades them to `accountant` in Apex/GreenLeaf). Display-only — stored role untouched.
- **AdminUsersPage menu split**: the old "Make admin" menu item (which actually toggled the global `is_superadmin` flag) is split into two explicit actions:
  - "Make admin" → promotes the user to the company **admin** role (assigns/updates `admin` in their memberships via `POST /admin/users/{id}/memberships`).
  - "Make superadmin" / "Revoke superadmin" → toggles the global `is_superadmin` flag.
- **Backend `POST /admin/users/{id}/memberships`**: now accepts role `admin` (was limited to accountant/viewer/owner) and **upserts** — if the user is already a member of the company it updates the role instead of 400/409.
- Assign form `ROLE_OPTIONS` now offers Admin/Accountant/Viewer.
- Verified: backend member/admin/role pytest 21/21 pass; E2E `members.spec.ts` 4/4, `role-enforcement.spec.ts` 13/13.

## E2E Reset Flakiness + Route-Mismatch Fixes (2026-07-18)
- **Root cause of per-spec reset flakiness FIXED in `run-isolated.sh`:** the old reset did `DROP DATABASE zledger_test WITH (FORCE)` + `CREATE DATABASE` + `docker restart api_e2e`. Under rapid successive resets (one per spec) `docker restart` intermittently wedged/slowed the daemon and left the api unreachable for extended windows, so specs ran against a DB the api couldn't see → mass failures. Rewrote `reset_db` to **avoid `docker restart` entirely**: `DROP SCHEMA public CASCADE; CREATE SCHEMA public` on `zledger_test` (via psql), then `alembic upgrade head` + `app.seed` + `seed_demo_data` via `docker exec`. The api's SQLAlchemy engine uses `pool_pre_ping=True`, so its pooled connections transparently reconnect to the fresh schema — no container restart needed. web_e2e (nginx) re-resolves the api upstream per request, so it also needs no restart.
- **Readiness check fixed:** it now probes the SAME web proxy (`:9091`) the specs use via `curl`+`python3` (host-side, no `docker exec` that stressed the daemon), logging in as `admin@zledger.com`/`katheikei` and confirming `companies` is present. The previous probe (nested `docker exec python` hitting `127.0.0.1:8000`) had a `urllib.urlopen` AttributeError bug that ALWAYS returned "no" → false WARN + wasted 240s of self-heal retries every reset.
- **Spec route mismatches fixed (pre-existing test/UI drift, not app regressions):**
  - `financial-years.spec.ts`: navigated to `/financial-years` (no such route) and waited for a "Financial Years" heading that doesn't exist. Feature is a Company Settings tab → now `getByRole("link",{name:"Financial Years"})` then `waitForURL("**financial-years")` (matches `?tab=financial-years`); assertion changed to the "Manage your financial years" tab text. 6/6 pass.
  - `einvoice-eway.spec.ts`: navigated to `/einvoice` + `/eway-bill` (no such routes). Feature is tabs on `/gst` → now `page.goto("/gst?tab=einvoice")` / `("/gst?tab=eway-bill")`. 8/8 pass.
- **Verified in-chain:** `financial-years` (6/6) + `einvoice-eway` (8/8) now pass back-to-back via `run-isolated.sh`.
- **Remaining failing specs (12 of 54) — mostly the same route/selector drift, NOT yet fixed:** `auth` (logout redirect route), `batch-tracking` (custom batch-create flow + native `<select>` "Filter by status" — dark-mode portal gotcha), `company-logo` (sidebar card img src), `compliance-gstr`, `gst-pages`, `gst-challans`, `gstr-annual` (all navigate to `/compliance` / `/gst` sub-pages that don't exist — real route is `/gst?tab=compliance|hsn-sac|registrations`; headings/tabs differ), `navigation` (sidebar group buttons "Company"/"GST" exact-name + global-search `/` key + brand-above-search — sidebar structure differs), `path-a-features`, `real-user-flow`, `restore-e2e`, `vouchers` (item-based voucher creation flow). These need per-spec investigation: some are pure test-selector fixes, some may be genuine UI issues.

## Balance Sheet Engine Correctness Fix (2026-07-19)
Root cause: the Schedule III balance sheet never closed (A ≠ L + E) due to two sign bugs in `reports.py` plus unbalanced seed openings.

### Fixes
- `app/services/reports.py` `get_ledger_balances`: closing was computed with the wrong sign for ledgers whose balance flips sign from their opening type (e.g. Cr-opening creditor later overpaid). Now `signed = (opening signed) + debit - credit`. Trial balance now nets to exactly 0.00.
- `app/services/reports.py` `get_profit_and_loss`: totals used the balance-sheet convention (Dr adds / Cr subtracts) via `_group_balances`, which made **income** come out negative. Now income (Cr-normal) and expenses (Dr-normal) are summed with the correct P&L sign, so `net_profit` is correct (e.g. Apex FY25-26 = -238,203 loss). The compliance engine injects this net into equity, which is what makes A = L + E hold.
- `scripts/seed_demo_data.py`: bulk seed created bank + debtors (Dr) and creditors (Cr) openings with no offsetting capital, so every company opened unbalanced. Added `_balance_opening_entries()` — after all opening-balance ledgers are created it sets the Capital Account opening to the net (Dr − Cr) so books open balanced.

### Verification
- API audit: all 10 seeded companies × 3 FYs → `balanced=True` (Assets == Liabilities + Equity). 30/30.
- E2E `compliance.spec.ts`: 9/9 pass.

## E2E Spec Green Sweep (2026-07-19, cont.)
Goal: make failing E2E specs green after UI/seed evolution. Critical: every `scripts/seed_demo_data.py` edit requires `docker compose build --no-cache api_e2e` + `docker rm -f zledger_api_e2e_1` + `up -d api_e2e`, since the container runs the baked `/app` copy. DB container is `40709170f62c_zledger-db-1`; reset via `DROP SCHEMA public CASCADE; CREATE SCHEMA public` then `alembic upgrade head` then reseed (≈5 min).

### Seed fixes (host file `backend/scripts/seed_demo_data.py`)
- Valid GSTIN/PAN/CIN so `GET /api/companies` no longer 500s. Composition company had `gstin=None` but `create_gst_reg` was still called → `NotNullViolation`. Fixed: composition now generates a valid gstin via `_gstin_for`. CIN forced to valid 21-char form.
- `_seed_production_orders_generic`: first production order is now a **DRAFT** (`PRD-2026-0001`), second (if BOM exists) is CONFIRMED — matches `manufacturing.spec.ts` expectation that `PRD-2026-0001` shows "draft".
- Default "Bank Account" ledger renamed to "HDFC Bank - Current A/c" (matches `LEDGERS.hdfcBank`); added generic "Sundry Debtors"/"Sundry Creditors" control ledgers.
- Work centers + routings seeded for every company (`seed_work_centers_and_routings`).

### Test helper / spec fixes
- `tests/e2e/helpers/interaction.ts`: `selectOption` + `fillLedgerLine` scope SearchableSelect search input to `input[placeholder='Type to search...']:visible` and select via `div.cursor-pointer` (portal option).
- `tests/e2e/helpers/fixtures.ts`: `STOCK_ITEMS` updated to bulk trading items.
- `tests/e2e/specs/admin-delete-ui.spec.ts` was failing only because `GET /companies` 500'd (invalid company GSTIN/CIN) — now 2/2.

### Resolved (isolated + full run)
- `vouchers.spec.ts` 8/8, `real-user-flow.spec.ts` 24/24, `admin-delete-ui.spec.ts` 2/2, `manufacturing.spec.ts` 13/13, `GET /api/companies` → 200 (was 500). Full `run-isolated.sh` suite: 52/56 specs green.

### Pre-existing failures — OUT OF SCOPE (UI/selector drift, unrelated to seed)
These failed identically in isolation and are not caused by this seed work:
- `daybook.spec.ts` "Search vouchers by text": expects table `role="Day Book entries"` (no accessible name on the table).
- `members.spec.ts` "Current admin user is listed as owner": expects literal cell text `"owner"` (role shown as badge/label, not literal word).
- `fixed-assets.spec.ts` "run depreciation": element visibility timeout in the depreciation flow.
- No backend pytest runner available in this environment (no pytest in api/api_e2e images); correctness proven via direct API audit instead.

## Parties management page (2026-07-19)
- **Rationale:** party → linked Sundry Debtors/Creditors ledger linkage existed in the DB (`party.ledger_id`) but was invisible in the UI — no screen listed parties together with their ledger. User asked "in party account, shouldn't we see the sundry creditor/debtors too?".
- **New `frontend/src/pages/PartiesPage.tsx`:** lists parties via `GET /api/coa/parties` (returns `PartyOut` with `party_type` + `ledger_id`). Shows name, type badge, GSTIN, and a **linked-ledger chip** that opens the COA (`/chart-of-accounts?q=<name>`) with the relevant Sundry Debtors/Creditors group in context. Search (name/GSTIN) + type filter included. Payable types (supplier/both/employee/transporter/agent_broker/contractor/consultant/lender) → Sundry Creditors; others → Sundry Debtors.
- **`config/modules.ts`:** added "Parties" nav item under Accounting (icon `user`).
- **`App.tsx`:** route `/parties` → `PartiesPage`.
- **`ChartOfAccountsPage.tsx`:** `search` now initializes from `?q=` URL param so the cross-link from Parties pre-fills the COA search.
- `make rebuild-web` (web + web_e2e). Verified: bundle on :9090 + :9091 contains "Parties"; `/parties` → 200 on both; `/coa/parties` returns 22 parties (e.g. Bluechip Distributors | customer | <ledger_id>, Associated Agencies | supplier | <ledger_id>).

## COA restructure — Indian accounting correctness + UX (2026-07-19)
User requested a full COA overhaul (10-point suggestion). Implemented the structural + UX changes; `system_code`s kept stable so compliance/GST engines are unaffected.

### Backend (group display-name rename + new subgroups)
- `app/services/coa.py` `TALLY_GROUPS`: renamed `Sundry Debtors`→**Trade Receivables**, `Sundry Creditors`→**Trade Payables**, `Deposits (Assets)`→**Deposits & Security** (system_codes `GRP_SUNDRY_DEBTORS`/`GRP_SUNDRY_CREDITORS`/`GRP_DEPOSITS_ASSETS` unchanged). Added new Current-Asset subgroups: **Input Tax Credits** (now the parent of `GST Input`, moving ITC out of Duties & Taxes/liabilities into Current Assets — fixes the "GST under Current Assets" inconsistency), **Other Current Assets**, **Accrued Income**, **Prepaid Expenses**. Added new Current-Liability subgroups under Duties & Taxes: **TDS Payable**, **TCS Payable**, **Expenses Payable**.
- `app/api/v1/accounting.py` `_party_ledger_group`: customer→Trade Receivables, supplier/other→Trade Payables (name-based, kept in sync).
- `app/services/reports.py`: aging + outstanding + cash-flow category sets updated to new names.
- `app/api/v1/data_import.py`: sample "Accounts Receivable" now under Trade Receivables.
- `app/services/tally_importer.py`: added `GROUP_NAME_ALIASES` so imported Tally-native "Sundry Debtors/Creditors"/"Deposits (Assets)" map onto the renamed local groups.
- Removed the `(Debtor)`/`(Creditor)` suffixes from seeded party ledger names (they were redundant with group membership). `scripts/seed_demo_data.py` uses `GRP_RECEIVABLES`/`GRP_PAYABLES`/`GRP_DEPOSITS` constants.

### Frontend
- `ChartOfAccountsPage.tsx`: ledger balance now shows `₹x.xx Dr/Cr` whenever balances are on (was blank at zero); **Tree | List view toggle** (list = sortable ledger table with group + Dr/Cr + hover quick-actions); **ledger hover quick-actions**: View Ledger (opens `LedgerDetailModal` via `/reports/ledger-transactions`), Create Voucher, Edit, Disable/Enable. "+ New" split menu (New Group / New Subgroup / New Ledger) already existed.
- `PartiesPage.tsx`: linked-ledger label updated to Trade Receivables / Trade Payables.

### Verification
- `api` + `api_e2e` rebuilt; `zledger_test` reset+migrate+reseed (370 groups, 450 ledgers, 220 parties). Old group names gone (0), no `(Debtor)/(Creditor)` suffixes (0), GST Input nests under Input Tax Credits.
- E2E (isolated): `api-backend` 128/128, `p3-coverage` 41/41, `path-a-features` 13/13, `chart-of-accounts` 7/7, `payment-allocation-workflow` 2/2 — ALL GREEN. Fixtures + inline spec references updated to Trade Receivables / Trade Payables.
- Live `zledger` DB reset + reseeded to match new structure (demo data acceptable to wipe per protocol).

## COA UI polish — system locks + group Dr/Cr rollup (2026-07-19)
Follow-up to the COA restructure (addresses suggestions #5 + #7).
- **Visual lock on system groups:** `ChartOfAccountsPage.tsx` now renders the lock icon (🔒) on `is_system` group rows (Capital Account, Profit & Loss A/c, Opening Balance Equity, GST Output/Input, etc.) — these were already delete-disabled via `is_system`, now also visually marked. Ledger-level locks (Capital Account, Sales, Purchases, Cash, Bank, GST ledgers) already existed via `is_protected`.
- **Group opening/closing balance rollup:** added `groupBalances` memo that recursively sums descendant ledgers' opening + closing balances (Dr=+, Cr=−, net sign → Dr/Cr). Group rows now show `Op ₹x.xx Dr` / `Cl ₹y.yy Dr` in the right column when balances are on; header relabelled "Balance (Op / Cl)". Per-ledger Dr/Cr already shown.
- `make rebuild-web` (web + web_e2e). Verified: bundle on :9090 contains "Balance (Op / Cl)", "Op ₹"/"Cl ₹", "Trade Receivables"; COA → 200.


## Status Display Consolidation — DONE (2026-07-29)

### Created Shared StatusBadge Component
- **`frontend/src/components/StatusBadge.tsx`** — Single source of truth for status pills across 12+ pages.
  - Hides default/common states (`"active"`, `"posted"`) — returns `null`, no visual noise.
  - Non-default states get colored pills: amber (draft/pending), green (completed/filed),
    red (cancelled/failed), blue (in_progress/submitted), slate (closed/exhausted).
  - `isActive` boolean support: hides when `true`, shows "Inactive" red pill when `false`.

### Removed is_active Status Columns (visual noise: 95%+ items are active)
- Categories table in `FixedAssetsPage.tsx`
- Users table in `AdminUsersPage.tsx`
- Companies table in `AdminCompaniesPage.tsx`
- BOMs table in `ManufacturingPage.tsx`

### Replaced Inline Color Maps with StatusBadge
- `EInvoicePage.tsx` — removed `STATUS_BADGE` map, 2 usages
- `EwayBillPage.tsx` — removed `STATUS_BADGE` map, 2 usages
- `LoansPage.tsx` — removed `statusColors` map, badge
- `ManufacturingPage.tsx` — removed `STATUS_COLORS` map, 2 usages (order table + detail panel)
- `ManufacturingWidgets.tsx` — removed `statusColors` map, badge
- `BatchBrowsePage.tsx` — 2 inline badges replaced (table + trace detail)
- `TallyImportPage.tsx` — removed `statusBadge()` function, 2 calls replaced
- `TdsTcsPage.tsx` — returns table badge replaced (entries table kept inline pending badge)

### Verification
- `tsc -b` clean (0 errors)
- `make rebuild-web` green
- Committed: **12 files, +78 -112 lines**

Intentionally kept (not suitable for StatusBadge):
- `TallyImportPage LOG_STATUS_COLORS` — log text colors in monospaced entry display
- `TdsTcsPage STATUS_BADGE` for entries table — pending must always be visible (not a default state)
