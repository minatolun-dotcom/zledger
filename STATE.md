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

## Next Up
- Phase 33: TBD (more features, bug fixes, polish)

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
