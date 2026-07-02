# Project State

## Current Location
- **Path:** /home/khuptong/ZCodeProject/Zledger

## Current Milestone
- **Active Phase:** Indian Accounting Compliance
- **Status:** In Progress

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

## Demo Data
- **Single comprehensive company**: Apex Enterprises (Maharashtra, GSTIN 27AABCP1234A1Z5)
- **2 Financial Years**: 2024-25, 2025-26
- **19 vouchers** covering all 8 types: 5 sales, 4 purchase, 2 payment, 2 receipt, 1 contra, 3 journal, 1 credit note, 1 debit note
- **5 parties**: 3 customers (incl. 1 inter-state Gujarat), 2 suppliers (incl. 1 inter-state Karnataka)
- **7 stock items** across 3 stock groups, with StockEntry + StockBalance tracking
- **21 ledgers** incl. system GST, control, and party ledgers
- **3 cost centres** (2 actively used across 3 voucher lines)
- **6 units** of measure, **5 e-invoice draft records**
- Opening balances on 7 ledgers: Cash ₹35K, HDFC Bank ₹5.8L, Royal Emporium ₹1.25L, City Mart ₹87.5K, Metro Retail ₹43K (Dr), Global Distributors ₹2.1L, Prime Imports ₹64K (Cr)
- Stock valuation tracks: qty, avg_rate, total_value, last_entry_date

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

## Next Up
- Phase 26: (TBD)

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
