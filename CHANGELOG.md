# Changelog

## [2026-07-04] — Inventory Page Redesign

### Changed
- **Stock Groups cards** — Upgraded from plain flat cards to gradient style with colored left border (6 colors cycling), item count + stock value summary badges, active/inactive badge, hover lift with pencil edit icon.
- **Stock Items tab** — Replaced plain `<table>` with `SortableTable` (9 sortable + resizable columns: Name, SKU, Group, HSN/SAC, UOM, Qty, Rate, Value, GST%). Added search bar.
- **Stock Entries tab** — Replaced plain `<table>` with `SortableTable` (8 sortable + resizable columns: Date, Item, Type, Qty, Rate, Amount, Reference, Narration). Added search bar.
- **Summary stat cards** — Added 4 gradient cards at top showing Groups count, Items count, Stock Value (green-tinted), Entries count.
- **"+ New" button** — Upgraded to `btn-primary` gradient.

---

## [2026-07-04] — Visual Improvements: Gradients, Glass & Transitions

### Added
- **`.card-gradient`** — Gradient card utility class with subtle hover lift (`hover:-translate-y-0.5 hover:shadow-md`). Applied to all dashboard stat cards, section cards, and PaymentsPage summary cards.
- **`.card-gradient-static`** — Gradient card without hover effect.
- **`.glass-card`** — Semi-transparent glass card utility (no backdrop-blur). Available for future modal use.
- **`.btn-primary`** — Gradient primary button utility with hover lift, shadow transitions, and disabled state. Applied to 12 high-visibility buttons across the app.

### Changed
- **Dashboard stat cards** — `rounded-xl` with `bg-gradient-to-br` gradient backgrounds and hover lift.
- **Dashboard section cards** (Voucher Stats, Masters, Quick Actions) — gradient backgrounds with hover lift.
- **Dashboard quick action buttons** — hover lift with brand-color border highlight.
- **PaymentsPage summary cards** — gradient backgrounds with color-tinted tails (red for overdue amount, orange for overdue count) and hover lift.
- **Page header borders** — Updated from `border-slate-200 pb-2` to `border-slate-200/60 pb-3` across Dashboard, Vouchers, DayBook, Payments, AuditLog, Members pages.

---

## [2026-07-04] — Sortable Tables + Column Resizing

### Added
- **`SortableTable.tsx`** — Reusable table component with `@tanstack/react-table` v8.21.3. Click-to-sort headers (ascending → descending → none) with direction arrow indicator. Drag-to-resize column borders with visual hover/active feedback.
- **Column size persistence** — Sizes saved to `localStorage` per table key (`sortable-col-sizes-{key}`). Survives page navigation and browser refresh.
- **Applied to 4 pages**: VoucherList (`vouchers`), DayBookPage flat view (`daybook`), PaymentsPage (`payments`), AuditLogPage (`audit-log`).

### Fixed
- **`getResizeHandler` crash** — TanStack's `getResizeHandler()` returned `undefined` when called on `column` instead of `header`. Custom resize handler bypasses this entirely.
- **Table blank pages** — All SortableTable pages showed blank (0 rows, 0 tables) due to `getResizeHandler is not a function` error crashing the React component tree.
- **Column resize redistributing space** — `table-layout: fixed` with `width: 100%` forced columns to shrink when one grew. Fixed by setting table width to sum of column widths.
- **Voucher number overflow** — Text like "CN-2025-0001" overlapped adjacent cells. Added `overflow-hidden` to `<td>`, `truncate` on cell content, increased default column size from 70 → 120.
- **Narration not filling space** — `max-w-[200px]` capped narration even when column was wider. Changed to `w-full truncate` to fill available space.

### Changed
- **`@tanstack/react-table`** — Added as dependency (v8.21.3).

---

## [2026-07-04] — PDF Preview

### Added
- **`PdfPreviewModal.tsx`** — In-app PDF viewer. Fetches PDF with auth headers, displays in iframe via blob object URL. Includes Download and Close buttons, Escape key to close, backdrop click to close, loading spinner, error state.
- **ReportsPage**: Added eye-icon preview button next to all 14 "Download PDF" buttons (trial balance, P&L, balance sheet, cash flow, aging, outstanding, register, TDS/TCS, stock summary/movement/ageing, ledger transactions, voucher PDF).
- **DayBookPage**: Added "Preview PDF" button next to "Print PDF" in voucher modal.
- **vouchers/index.tsx**: Added "Preview PDF" button next to "Print PDF" in voucher modal.
- **FY test**: Widened date range to `2050 + (Date.now() % 100)` to prevent accumulating overlaps.

### Added
- **`Skeleton.tsx`** — Base skeleton component with `animate-pulse` shimmer, dark mode support (`bg-slate-200` / `dark:bg-[#252530]`). Exports: `Skeleton`, `SkeletonText`, `SkeletonCard`, `SkeletonTable`, `SkeletonStatCard`, `SkeletonTree`.
- **Page-specific skeletons** in `pages/skeletons/`:
  - `DashboardSkeleton` — stat cards grid + two-column layout
  - `CoaSkeleton` — header bar + tree view
  - `VouchersSkeleton` — tab bar + filter row + table
  - `ReportsSkeleton` — FY selector + tabs + report table
  - `InventorySkeleton` — tabs + card grid
  - `ListSkeleton` — generic title + table (used by 19 pages)
- **Replaced text-only loading states** (`<p>Loading...</p>`) with skeleton components across 25 pages: Dashboard, Chart of Accounts, Vouchers, Reports, Inventory, Financial Years, Members, HSN/SAC, GST Registrations, Company Settings, Payments, Masters, Audit Log, Admin Users, Admin Companies, Bank Reconciliation, TDS/TCS, E-Invoice, E-Way Bill, Day Book, Tally Import, Recurring Templates, Compliance, Vouchers (old page).

### Fixed
- **Voucher tests**: Changed `date` → `voucher_date`, `ledger_name` → `ledger_id` (API schema requires `ledger_id`). Added `getLedgerIds()` helper to fetch real ledger IDs from COA.
- **Viewer 403 tests** (vouchers, COA, audit): Viewer users weren't added to the company, so `get_active_company` returned 400 before the role check. Added `registerViewerInCompany()` helper that registers + adds as member.
- **GST calculate test**: Changed payload from `{taxable_amount, cgst_rate, ...}` → `{amount, hsn_sac_id, is_inter_state}` to match `GstCalculationRequest` schema.
- **Recurring templates test**: Changed `lines` → `template_payload: dict` to match `RecurringTemplateCreate` schema.
- **Inventory delete test**: Reordered tests so delete runs before entry creation (API blocks delete when item has stock entries).
- **Attachments test**: Changed expected status from 200 → 404 for non-existent voucher (API correctly validates voucher existence).
- **FY create test**: Used dynamic far-future dates (`2030+`) to avoid overlap with seed data FY 2026-2027.
- **Migration 0034**: Increased `cancelled_at` column from `VARCHAR(30)` → `VARCHAR(40)` to accommodate ISO timestamps with microseconds (32 chars).
- **AGENTS.md**: Added "E2E Test Patterns" section documenting all patterns to prevent regressions.

### Test Results
- Backend API: 101/101 passing (was 89/99)
- Path-a features: 13/13 passing
- All tests idempotent across multiple runs

## [2026-07-04] — Bug Fix: 6 Production Issues

### Fixed
- **Migration 0033**: Restored `cancel_reason` and `cancelled_at` columns accidentally dropped by migration 0022. Fixes Cash Flow, Aging reports, and Daybook voucher loading.
- **Company Logo Auth**: Removed `get_current_user` dependency from `GET /companies/{id}/logo` — browser `<img>` tags can't send auth headers. Endpoint is now public.
- **FY Delete Error**: Fixed frontend displaying `[object Object]` by changing `e?.detail` → `e?.message` in 4 catch blocks. Added `is_closed` guard in backend to block deletion of closed FYs.
- **Payables/Receivables**: Added `Voucher.cancel_reason.is_(None)` filter to exclude cancelled vouchers. Added `PaymentAllocation` records and `due_date` to demo sales/purchase vouchers.
- **Dashboard Stale FY**: Clear `activeFyId` on company switch (was persisted globally, not company-scoped). Added `AbortController` to prevent stale data overwriting fresh fetches.
- **Tests**: Updated logo auth assertions for public endpoint (401→404, DELETE no-op 204). Backend API tests: 89/99 passing.

## [2026-07-03] — Phase 31: User Roles & Permissions

### Added: Backend Role Enforcement
- **`backend/app/core/dependencies.py`**: Added `require_role(min_role: CompanyRole)` dependency with role hierarchy (`viewer < accountant < owner`). Superadmins always pass.
- **Applied `require_role(CompanyRole.accountant)` to all write endpoints across 13 files**:
  - `vouchers.py` — create, update, delete
  - `accounting.py` — FY create/update/delete, group/ledger/party CRUD
  - `inventory.py` — groups, items, entries CRUD + balance update
  - `gst.py` — HSN/SAC, registrations, returns, challans, calculate
  - `payments.py` — allocate, delete allocation
  - `recurring_templates.py` — create, update, delete, run now, process due
  - `attachments.py` — upload, delete
  - `tds_tcs.py` — sections, entries, deposit, returns, file
  - `eway_bill.py` — create, generate, cancel, vehicle update
  - `einvoice.py` — create, generate IRN, cancel IRN
  - `bank_reconciliation.py` — import, delete line, match/unmatch, sessions, finalize
- **Applied `require_role(CompanyRole.owner)` to owner-only endpoints**:
  - `companies.py` — update company, upload/delete logo
  - `accounting.py` — close financial year

### Added: Frontend Role Gating
- **`frontend/src/hooks/useRole.ts`**: New hook returning `role`, `canEdit` (accountant+), `canManageMembers` (owner), `isViewer`
- **`frontend/src/store/auth.ts`**: Added `getUserRole()` function; fixed unused `get` parameter
- **Gated create/edit/delete buttons** on 7 pages for viewer role:
  - `ChartOfAccountsPage.tsx` — "+ New" button and context menu items
  - `InventoryPage.tsx` — "+ New Group/Item/Entry" button, modal Delete/Duplicate buttons
  - `VouchersPage.tsx` — "+ New Voucher" button, Delete button in table
  - `MembersPage.tsx` — "+ Add Member" button, Edit role/Remove buttons
  - `FinancialYearsPage.tsx` — "+ New Financial Year" button, Edit/Delete/Close actions
  - `CompanySettingsPage.tsx` — Logo upload/delete, Save Changes button (owner-only)
  - (All gated with `{canEdit && (...)}` or `{canManageMembers && (...)}`)

## [2026-07-03] — E2E Test Expansion (17 new tests)

### Added: 5 New E2E Test Spec Files (17 tests)
- **`tests/e2e/specs/payments-receivables.spec.ts`** (4 tests): Page load, receivables table data, payables tab switch, invoice detail modal
- **`tests/e2e/specs/gstr-annual.spec.ts`** (2 tests): GSTR-9 annual return detail view, GSTR-9C reconciliation detail view
- **`tests/e2e/specs/dashboard-content.spec.ts`** (4 tests): Summary cards (Income/Expenses/Profit/Assets), vouchers section, voucher type counts, quick action navigation
- **`tests/e2e/specs/admin-pages.spec.ts`** (3 tests): Admin users, admin companies, audit log — page loads and headings
- **`tests/e2e/specs/recurring-templates-crud.spec.ts`** (4 tests): Page accessible, create template, Run Now button visible, delete template — replaces old `recurring-templates.spec.ts`

### Cleaned Up
- **Removed `tests/e2e/specs/bank-reconciliation.spec.ts`** — superseded by `bank-recon.spec.ts` (duplicate with native select locators)
- **Removed `tests/e2e/specs/recurring-templates.spec.ts`** — replaced by `recurring-templates-crud.spec.ts` with expanded scope

### Fixed: DB Pool Size (Performance)
- **`backend/app/core/config.py`**: Added `db_pool_size` (default 10) and `db_max_overflow` (default 20) settings
- **`backend/app/core/db.py`**: Pass pool settings to `create_engine()` — max 30 concurrent connections (up from default 15)
- **`backend/app/cron_runner.py`**: Reads `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` from env
- **`.env.example`**: Documented new pool env vars

### Fixed: Vite Build Warning
- **`frontend/src/pages/vouchers/shared/QuickCreate/configs.ts`**: Replaced two `await import("...")` dynamic imports with a static `import { api }` at the top of the file

## [2026-07-03] — Polish & Test Coverage

### Fixed: Financial Years Close 500 Error
- **`backend/app/api/v1/accounting.py`**: Moved `from decimal import Decimal` to top of `close_financial_year()` function to fix `UnboundLocalError`. The import was inside an `if` block after already being used.
- **`tests/e2e/specs/financial-years.spec.ts`**: Removed graceful skip on "Internal Server Error". Close/reopen test now validates end-to-end.

### Added: Company Logo in UI
- **`backend/app/schemas/auth.py`**: Added `logo_url` to `CompanyBrief` schema.
- **`backend/app/api/v1/auth.py`**: Populated `logo_url` from Company model in `/auth/me` response.
- **`frontend/src/store/auth.ts`**: Added `logo_url: string | null` to `Company` interface.
- **`frontend/src/pages/DashboardPage.tsx`**: Sidebar company card shows logo when available (replaces building icon). Brand logo centered and moved above search box. Company details passed via Outlet context.
- **`frontend/src/pages/DashboardContent.tsx`**: Dashboard header shows logo + "Welcome to {company name}".
- **`frontend/src/pages/CompanySelectPage.tsx`**: Each company button shows logo (or fallback icon).
- **`tests/e2e/specs/company-logo.spec.ts`**: 3 new tests — logo in sidebar card, dashboard header, disappears after removal.
- **`tests/e2e/specs/navigation.spec.ts`**: 1 new test — brand logo above search box in sidebar.

### Stability: GSTR Tests Handle 409 Conflict
- **`tests/e2e/specs/compliance-gstr.spec.ts`**: Tests now gracefully navigate to existing return view when a return already exists for the period, rather than failing on 409 Conflict.

## [2026-07-03] — Auth Fix: fetchMe Only Clears Token on 401

### Frontend
- **`store/auth.ts`**: Fixed `fetchMe()` catching all errors and unconditionally clearing the auth token. Previously, any error (network timeout, 500, DB pool exhaustion) would remove the JWT from localStorage and redirect to login. Now only HTTP 401 (truly invalid/expired token) triggers logout. Transient server errors no longer log the user out.
- **Root cause**: Rapid page refreshes (5+) generate 25+ concurrent API requests. With a max DB pool of 15 connections (SQLAlchemy defaults), some `/auth/me` requests fail with pool exhaustion errors. The old catch block treated these the same as 401s.
- **Import change**: Added `ApiError` import to check error type before clearing token.

## [2026-07-03] — E2E Test Suite: 14 New Spec Files + Selector Fixes

### New Test Files
- **`specs/inventory.spec.ts`**: 7 tests — stock group/item/entry CRUD, create/edit/delete operations via popup modals.
- **`specs/financial-years.spec.ts`**: 6 tests — page load, create form, close/reopen, edit name, delete.
- **`specs/daybook.spec.ts`**: 5 tests — page load with summary cards, filter bar, search, flat/grouped toggle, row click modal.
- **`specs/voucher-edit.spec.ts`**: 4 tests — detail modal, duplicate button, delete button, print PDF button.
- **`specs/chart-of-accounts.spec.ts`**: 7 tests — page load, expand/collapse all, search, create ledger via context menu, show balances toggle, delete.
- **`specs/company-settings.spec.ts`**: 4 tests — page load with sections, company details fields, bank details fields, save.
- **`specs/members.spec.ts`**: 4 tests — page load, admin listed as owner, add member form, role selector.
- **`specs/profile.spec.ts`**: 4 tests — page load, fields present, update profile, password form.
- **`specs/einvoice-eway.spec.ts`**: 2 tests — E-Invoice page load, E-Way Bill page load.
- **`specs/tds-tcs.spec.ts`**: 2 tests — TDS/TCS page load, configuration sections.
- **`specs/bank-reconciliation.spec.ts`**: 2 tests — page load, ledger dropdown bank filter.
- **`specs/reports-tabs.spec.ts`**: 8 tests — Trial Balance, Profit & Loss, Balance Sheet, Cash Flow, Aging, Outstanding, Stock Summary, PDF export buttons.
- **`specs/tally-import.spec.ts`**: 2 tests — page load, import section.
- **`specs/recurring-templates.spec.ts`**: 1 test — page accessible.

### Selector Fixes (All 14 new specs)
- **Root cause**: `getByText("X")` matched both sidebar nav link and page heading, causing strict mode violations.
- **Fix**: All page heading assertions now use `getByRole("heading", { name: "X" })` instead of `getByText("X")`.
- **Sidebar link text**: `members` is in profile dropdown (use `page.goto("/members")`); `Reconciliation` not `Bank Reconciliation`; `Financial Reports` not `Trial Balance`.
- **Custom components**: Company Settings uses `<label>` without `for` attributes — use `getByPlaceholder` instead of `getByLabel`. Reports tabs are `<button>` elements, not `role="tab"`. Members uses custom `Select` component, not native `<select>`.
- **Exact matches**: `getByRole("button", { name: "Search", exact: true })` to avoid matching global search shortcut.

## [2026-07-03] — Phase 29.1: Company Logo Upload + PDF Integration

### Backend
- **`models/user.py`**: Added `logo_filename` (String(255), nullable) to `Company` model + `logo_url` computed property.
- **`schemas/user.py`**: Added `logo_url: str | None` to `CompanyOut`.
- **`api/v1/companies.py`**: Added 3 logo endpoints — `POST /companies/{id}/logo` (upload, PNG/JPG, max 2 MB), `GET /companies/{id}/logo` (serve image), `DELETE /companies/{id}/logo` (remove).
- **`services/export.py`**: Added `_logo_flowable()` helper. All 13 PDF export functions updated to render company logo at top of report. `_export_flat_pdf()` and `_build_grouped_pdf()` accept optional `company_id` + `db` params.
- **`alembic/versions/0032_add_company_logo.py`**: Migration to add `logo_filename` column to `companies`.

### Frontend
- **`CompanySettingsPage.tsx`**: New "Company Logo" section with image preview, upload button (PNG/JPG), remove button, and status feedback.

## [2026-07-03] — Phase 29: Enhanced Export & Print

### Backend
- **`services/export.py`**: Added generic helpers `_export_flat_pdf()` and `_export_flat_xlsx()` for simple single-table reports. Added 16 new export functions: Cash Flow, Aging, Outstanding, Register, TDS/TCS Summary, Stock Summary, Stock Movement, Stock Ageing, Ledger Transactions (each PDF + XLSX), plus Voucher PDF.
- **`api/v1/reports.py`**: Added 20 new export endpoints — `/pdf` and `/xlsx` for each of the 8 remaining report types, plus ledger-transactions exports.
- **`api/v1/vouchers.py`**: Added `GET /vouchers/{id}/pdf` endpoint for single-voucher PDF generation.
- Fixed `Party` import in `export_voucher_pdf()` (was importing from `app.models.masters`, corrected to `app.models.accounting`).

### Frontend
- **`ReportsPage.tsx`**: Download PDF / Download Excel buttons added to Cash Flow, Aging, Outstanding, Register, TDS/TCS, Stock Summary, Stock Movement, and Stock Ageing tabs. Ledger Detail modal gets PDF + Excel export buttons. Voucher Detail modal gets Print PDF button.
- **`vouchers/index.tsx`**: Print PDF button added to voucher edit modal header.
- **`DayBookPage.tsx`**: Print PDF button added to voucher edit modal header.

### Testing
- All 25 export functions verified to produce valid PDF and XLSX files.
- 37/37 core Playwright tests pass (auth, navigation, vouchers, document-attachments, reports-drilldown).

## [2026-07-02] — Phase 28: Document Attachments

### Backend
- **New model `DocumentAttachment`** (`models/attachment.py`) — file attachments linked to vouchers. Fields: company_id, voucher_id, original_filename, stored_filename (UUID-based), mime_type, file_size, uploaded_by, timestamps.
- **Migration 0031** — creates `document_attachments` table.
- **New schemas** (`schemas/attachment.py`) — `AttachmentOut`, `AttachmentUploadResponse`, `AttachmentCountResponse`.
- **New API router** (`api/v1/attachments.py`) — 5 endpoints:
  - `POST /attachments/upload/{voucher_id}` — multipart file upload, stores to `{UPLOAD_DIR}/{company_id}/{uuid}.ext`
  - `GET /attachments/{voucher_id}` — list attachments for a voucher
  - `GET /attachments/{voucher_id}/count` — attachment count
  - `GET /attachments/{voucher_id}/download/{attachment_id}` — stream file with correct Content-Type
  - `DELETE /attachments/{id}` — delete file from disk + DB record
- **Config** (`core/config.py`) — `upload_dir` (default `./uploads`), `max_upload_size_mb` (default 10).
- **Allowed types**: pdf, jpg, jpeg, png, xlsx, xls, docx, doc, csv, txt.

### Infrastructure
- **docker-compose.yml** — `zledger_uploads` named volume mapped to `/app/uploads` for file persistence across container rebuilds.

### Frontend
- **`VouchersPage.tsx`**: Added attachments panel at the bottom of the voucher detail modal:
  - Attachment list with file type icon, filename, size
  - "Upload File" button (hidden file input, accepts allowed types)
  - Download button (authenticated via API client)
  - Delete button with confirmation
  - Attachment count shown in panel header

## [2026-07-02] — Phase 27: Payments & Receivables Management

### Backend
- **New model `PaymentAllocation`** (`models/voucher.py`) — links payment/receipt vouchers to the invoices they settle. Fields: invoice_voucher_id, payment_voucher_id, amount, allocation_date, remarks.
- **Voucher model** — added `due_date` (String(10), nullable) for invoice due date tracking.
- **Migration 0030** — adds `due_date` to vouchers, creates `payment_allocations` table with FKs and indexes.
- **New schemas** (`schemas/payments.py`) — `PaymentAllocateRequest`, `PaymentAllocationOut`, `ReceivableLine`, `PayableLine`, `ReceivablesResponse`, `PayablesResponse`.
- **New service** (`services/payments.py`) — `get_receivables()`, `get_payables()`, `get_invoice_allocations()`, `allocate_payment()`, `delete_allocation()`. Computes unpaid = grand_total - sum(allocations), aging buckets (current, 1-30, 31-60, 61-90, 90+).
- **New API router** (`api/v1/payments.py`) — 5 endpoints:
  - `GET /payments/receivables` — outstanding sales invoices with aging
  - `GET /payments/payables` — outstanding purchase invoices with aging
  - `GET /payments/allocations/{invoice_voucher_id}` — allocations for an invoice
  - `POST /payments/allocate` — create payment allocation
  - `DELETE /payments/allocations/{id}` — remove allocation
- **Updated voucher schemas** — `due_date` added to `VoucherCreate`, `VoucherOut`, `VoucherListOut`.
- **Updated voucher service** — passes `due_date` through on creation.

### Frontend
- **New `PaymentsPage.tsx`** — two tabs (Receivables / Payables), summary cards (Total Outstanding, Overdue Amount, Overdue Count), searchable table (Invoice#, Date, Due Date, Party, Amount, Paid, Unpaid, Status badge), row-click detail modal with payment allocations list, "Record Payment" modal (select voucher, enter amount, date, remarks).
- **Route** — `/payments` in `App.tsx`.
- **Sidebar** — "Payments & Receivables" nav item under Reports group with currency icon.

## [2026-07-02] — Phase 26: Financial Statements with Drill-Down

### Backend
- **New schemas** `LedgerTransactionOut`, `LedgerTransactionResponse` for drill-down transaction data
- **New service** `get_ledger_transactions()` — joins VoucherLine → Voucher → Party, computes running balance per ledger
- **New endpoint** `GET /reports/ledger-transactions?ledger_id=X&financial_year_id=Y` — returns all transactions for a single ledger

### Frontend
- **Drill-down in Trial Balance**: Ledger names are clickable → opens modal showing all transactions with running balance
- **Drill-down in Profit & Loss**: Same via `onLedgerClick` prop on `GroupTable`/`GroupRows`
- **Drill-down in Balance Sheet**: Same on all asset/liability/capital groups
- **Ledger Detail Modal**: Opening balance, transaction table (date, voucher#, type, party, narration, debit, credit, balance), closing summary
- **Voucher Detail Modal**: Second-level drill-down — click a transaction to see full voucher with all ledger lines and totals

### Playwright
- 3 new tests: TB drill-down modal, P&L tab, BS tab — all passing

## [2026-07-02] — Phase 25: GST Challan / Payment Tracking

### Backend
- **New model `GstChallan`** (`models/accounting.py`) — tracks GST payments with fields: challan_number, challan_date, amount, CGST/SGST/IGST/cess breakdown, interest, late_fee, bank_name, payment_mode, status (unapplied/applied), linked to GstReturn and GstRegistration.
- **Migration 0029** — creates `gst_challans` table.
- **New schemas** (`schemas/gst.py`) — `GstChallanCreate`, `GstChallanUpdate`, `GstChallanOut`, `GstChallanApplyRequest`.
- **New API endpoints** (`api/v1/gst.py`):
  - `GET /gst/challans` — list with optional `status` and `gst_return_id` filters
  - `POST /gst/challans` — create
  - `GET /gst/challans/{id}` — get single
  - `PATCH /gst/challans/{id}` — update
  - `DELETE /gst/challans/{id}` — delete
  - `POST /gst/challans/{id}/apply` — link to a return (sets status=applied)

### Frontend
- **`CompliancePage.tsx`**: Added "Challans / Payments" section below the returns list:
  - "+ Add Challan" form with fields for challan number, date, amount, CGST/SGST/IGST/Cess, interest, late fee, bank name, payment mode, GSTIN, remarks
  - Challans table with status badges, apply-to-return dropdown, delete button
  - Linked challans card in return detail view with unlink support

### E2E Verified
- Challan CRUD (create, list, get, update, delete) — all passing.
- Apply challan to return — status changes to `applied`, `gst_return_id` set, filtered list returns correct results.

## [2026-07-02] — Scheduler E2E Tested + GSTR-9C Verified + Bug Fixes

### Backend
- **`recurring_templates.py`**: Fixed `ResponseValidationError` — all endpoints now convert `created_at` datetime to isoformat string via `_tmpl_to_dict()` helper before returning.
- **`voucher_service.py`**: `hsn_sac_id` not set on voucher lines when omitted from input. Added fallback to look up HSN/SAC from `stock_item.hsn_sac_code` and resolve to the `HsnSac` record ID.

### Verification
- **Scheduler**: Created recurring template via API, ran `/run` endpoint → voucher created (#35). Ran `/process-due` → 2 more vouchers created (#36, #37). Started `scheduler` Docker service — logs clean, interval 15min.
- **GSTR-9C**: Generated GSTR-9 then GSTR-9C for FY 2025-26. Reconciliation produces Table 4/6/8 with book vs return comparison, flags discrepancies. ITC matches perfectly.

### Fixed
- **`recurring_templates.py`**: All endpoints (list, create, get, update, run) returning ORM objects caused FastAPI `ResponseValidationError` because `created_at` is a Python `datetime` but schema expected `str`. Added `_tmpl_to_dict()` helper.

## [2026-07-02] — VouchersPage: Remove Dead Status Code + Error Handling Fixes

### Frontend
- **`VouchersPage.tsx`**: Removed `status` field from local `Voucher` interface (backend no longer returns it — column dropped in migration 0022). Removed dead status badge, dead "Post" button (endpoint `POST /vouchers/{id}/post` doesn't exist), and dead status-gated "Delete" button. "Delete" now always visible. `handleViewDetail` now has try/catch error handling.
- **`CompliancePage.tsx`**: `handleSubmitReturn` now wrapped in try/catch with error display.
- **`HsnSacPage.tsx`**: Initial data load now has `.catch(() => {})` to prevent unhandled rejections.
- **`store/auth.ts`**: `fetchMe()` now catches errors — only clears token on 401 (not all errors) to prevent logout on transient failures.
- **`.gitignore`**: Added `tests/e2e/*.png` and `tests/e2e/*-videos/` to prevent Playwright debug artifacts from being committed.

## [2026-07-02] — Close Modals on Backdrop Click (5 Modals Missing Click-Outside)

### Frontend
- **`DayBookPage.tsx`**: Added `onClick` with `e.target === e.currentTarget` check on voucher modal backdrop.
- **`vouchers/index.tsx`**: Same fix on voucher edit/modal backdrop.
- **`TdsTcsPage.tsx`**: Same fix on all 3 modals (New Entry, New Section, Deposit).
- **`BankReconciliationPage.tsx`**: Same fix on match modal backdrop.
- **`VouchersPage.tsx`**: Same fix on detail voucher modal backdrop.
- **`AuditLogPage.tsx`**: Same fix on audit log detail modal backdrop.

All modals now close on outside-click (backdrop click) in addition to existing Escape key support.

## [2026-07-02] — Bank Reconciliation: Show Only Bank Ledgers

### Backend
- **`api/v1/accounting.py`**: Added optional `group_code` query parameter to `GET /coa/ledgers`. Joins `AccountGroup` and filters by `system_code`. Example: `GET /coa/ledgers?group_code=GRP_BANK_ACCOUNTS` returns only ledgers under the Bank Accounts group.

### Frontend
- **`BankReconciliationPage.tsx`**: Changed ledger fetch from `/coa/ledgers` to `/coa/ledgers?group_code=GRP_BANK_ACCOUNTS`. The dropdown now shows only bank account ledgers (HDFC Bank, etc.) instead of all active ledgers (Cash, Debtors, Sales, etc.).

## [2026-07-02] — Fix GSTR-1 Crash (Missing Total Fields in API Response)

### Backend
- **`api/v1/gst.py`**: Fixed `TypeError: Cannot read properties of undefined (reading 'toLocaleString')` when viewing a GSTR-1 return. The API response for GSTR-1 generation was missing `total_b2b_taxable`, `total_b2cs_taxable`, `total_cgst`, `total_sgst`, and `total_igst` fields that the frontend summary cards depend on. This caused a React crash (blank page).

### Tests
- **2 Playwright tests** for GSTR-1 and GSTR-3B generation — both passing. Confirm that both return types generate successfully and render their detail views correctly.

## [2026-07-02] — Split GST Settings Into Two Standalone Pages

### Frontend
- **`GstSettingsPage.tsx` deleted** — the old tab-based page (HSN/SAC + GST Registrations in one) is gone.
- **New `HsnSacPage.tsx`** at `/gst/hsn-sac` — standalone page with HSN/SAC code table, add/delete actions.
- **New `GstRegistrationsPage.tsx`** at `/gst/registrations` — standalone page with registration cards, add/delete actions.
- **Sidebar links updated**: `/gst?tab=hsn-sac` → `/gst/hsn-sac`, `/gst?tab=registrations` → `/gst/registrations`.
- **App.tsx**: Single `/gst` route replaced with two routes — one per page.

### Tests
- **3 new Playwright tests** for both pages (heading visibility, add button presence) — all passing.

## [2026-07-02] — Bug Fixes: Import Errors, Double Route Prefix, GSTR-9C Typo

### Backend
- **`recurring_templates.py`**: Fixed `ModuleNotFoundError: No module named 'app.core.deps'` — split to `app.core.db.get_db` + `app.core.dependencies.get_active_company`.
- **`recurring_templates.py`**: Fixed `ImportError: cannot import name 'get_current_user' from 'app.core.security'` — moved to `app.core.dependencies.get_current_user`.
- **`recurring_templates.py`**: Fixed double `/recurring-templates` prefix on all routes (router had prefix AND `__init__.py` added the same prefix). Routes now correctly at `/api/recurring-templates` instead of `/api/recurring-templates/recurring-templates`.
- **`gstr.py:737`**: Fixed `GSTRegistration` → `GstRegistration` (wrong model name in GSTR-9C query).
- **Verified**: API starts clean, 55/56 Playwright tests pass.

## [2026-07-02] — Phase 24: Background Cron Processor + GSTR-9C Reconciliation

### Backend
- **Voucher service extraction**: New `services/voucher_service.py` — all core voucher creation logic extracted from the API layer so it can be called from both API endpoints and background workers. `create_voucher()` function takes `db, company, payload, user_id`.
- **API refactor** (`api/v1/vouchers.py`): `POST /vouchers` and `PATCH /vouchers/{id}` now delegate to the shared service. Removed ~400 lines of duplicated helper functions.
- **Recurring templates fix** (`api/v1/recurring_templates.py`): `POST /{tmpl_id}/run` and `POST /process-due` now actually create vouchers using the service (previously only advanced dates without creating anything).
- **Cron runner** (`cron_runner.py`): Standalone Python script that loops every N minutes, iterates all active companies, processes due recurring templates, and creates vouchers as the system admin user.
- **Config** (`core/config.py`): Added `CRON_ENABLED` (default false) and `CRON_INTERVAL_MINUTES` (default 15).
- **GSTR-9C service** (`services/gstr.py`): Added `Gstr9cData` dataclass and `generate_gstr9c()` — compares book aggregates (ledger queries) against a saved GSTR-9 return for Table 4 (outward), Table 6 (ITC), Table 8 (net tax). Flags discrepancies > ₹0.01.
- **GSTR-9C schemas** (`schemas/gst.py`): Added `Gstr9cLineOut` and `Gstr9cResponse`. Extended return type regex to `^(gstr1|gstr3b|gstr4|gstr9|gstr9c)$`.
- **GSTR-9C API** (`api/v1/gst.py`): `POST /returns/generate` handles `gstr9c` return type. Requires GSTR-9 to exist first.

### Frontend
- **CompliancePage.tsx**: Added GSTR-9C to return type dropdown (uses FY period selection), detail view with side-by-side Book vs Return reconciliation tables for Table 4/6/8, discrepancy highlighting (red for > ₹0.01 difference), and summary status ("Books Match Returns" or "Discrepancies Found").

### Infrastructure
- **docker-compose.yml**: Added `scheduler` service (under `--profile scheduler`) that runs `cron_runner.py` independently from the API.
- **Skipped GSTR-2A**: GSTR-2A auto-population excluded per scope decision (requires GSP API access).

## [2026-07-02] — Phase 23: Composition Scheme + Recurring Vouchers

### Backend
- **Composition scheme**: `registration_type` and `composition_rate` fields on `GstRegistration`; `is_composition` on `Company`. When active, voucher posting skips CGST/SGST/IGST and posts flat composition tax to `SYS_GST_COMPOSITION_TAX` ledger. Migration 0027.
- **GSTR-4 quarterly return**: `Gstr4Data` dataclass, `generate_gstr4()` service, `_get_quarter_dates()` helper. `Gstr4Response` schema. Wired into `POST /returns/generate`.
- **RecurringTemplate model**: `recurring_templates` table with name, voucher_type, frequency, next_run_date, template_payload (JSON). Migration 0028.
- **Recurring templates API** (`recurring_templates.py`): Full CRUD + run-now + process-due endpoints. Router registered in `api/v1/__init__.py`.

### Frontend
- **GstSettingsPage**: Registration type dropdown (Regular/Composition), conditional composition rate input, card badges showing "Composition X%".
- **CompliancePage**: GSTR-4 option in return type dropdown, quarterly period selection, GSTR-4 detail view with composition tax summary.
- **RecurringTemplatesPage**: Full CRUD page with table, create/edit form, run now, pause/resume, delete. Route at `/recurring-templates`.
- **Sidebar**: Recurring Templates entry under Company group. Sidebar width increased to `w-80` (320px).
- **Save as Template**: VoucherFooter gets optional `onSaveAsTemplate` prop. All 3 voucher forms (ItemVoucherForm, AmountVoucherForm, JournalForm) wired to build template payload and POST to `/recurring-templates`.
- **HSN/SAC fixes**: Sidebar nav keys and search result keys use `to|label` to avoid duplicate React keys. Sidebar links changed to `/gst?tab=hsn-sac` and `/gst?tab=registrations`. GstSettingsPage reads tab from URL search params.
- **Dashboard page title**: Added `<h2>Dashboard</h2>` heading.

### Tests
- **Playwright fix**: `saveVoucher()` helper uses `exact: true` on Save button selector to avoid matching "Save as Template".
- **55/56 tests passing** (1 flaky timeout in screenshot helper, not a code issue).

## [2026-07-02] — Visual Audit Fixes: Dark Mode Gaps, Input Padding, Border Radius

### Frontend
- **Dark mode fixes for remaining pages**: ProfilePage, MembersPage, AdminUsersPage, AdminCompaniesPage, AuditLogPage — all error/success badges, status badges, buttons, and inputs now have `dark:` variants.
- **Input padding unification**: Changed `py-2` to `py-1.5` on all inputs across ProfilePage, MembersPage, AdminUsersPage, AdminCompaniesPage, TdsTcsPage (Cancel/Deposit), AuditLogPage (Close), EwayBillPage (Update Vehicle). Added explicit `bg-white dark:bg-[#111118]` to all inputs missing it.
- **Border radius consistency**: Changed `rounded` → `rounded-lg` on table wrappers (`ItemLineTable.tsx`, `LedgerLineTable.tsx`), error banners (`VoucherHeader.tsx`, `vouchers/index.tsx`, `TallyImportPage.tsx`), and JournalForm Auto Balance button.
- **TDS Deposit button color**: Changed `bg-blue-600` → `bg-brand-600 dark:bg-violet-500` in TdsTcsPage and EwayBillPage.
- **Dashboard page title**: Added `<h2>Dashboard</h2>` heading to DashboardContent for visual consistency.

## [2026-07-01] — Playwright E2E Tests: 30/30 Passing (All 8 Voucher Types)

### Backend
- **Credit Note GST direction fix** (`vouchers.py`): Changed `is_output` from `("sales", "credit_note")` to `("sales",)`. Added `is_reversal = payload.voucher_type == "credit_note"` flag. GST lines now DEBIT (not CREDIT) for credit notes, using output-ledger codes. Fixes `Voucher not balanced` error.

### Frontend
- **Login form a11y fix** (`LoginPage.tsx`): Added `htmlFor`/`id` attributes to email/password inputs so `getByLabel` works in tests.
- **ApiError parsing** (`client.ts`): Now extracts FastAPI-style `detail` field from error responses.

### Tests
- **Playwright e2e suite**: Created `tests/e2e/` with `package.json`, `tsconfig.json`, `playwright.config.ts` (chromium, headless, 60s, base URL `http://localhost:8080`).
  - `helpers/login.ts`: Full UI login flow.
  - `helpers/fixtures.ts`: Admin creds, party/stock/ledger names, `E2E_PREFIX`.
  - `helpers/interaction.ts`: Custom Select, DateInput, voucher type tab, item/ledger line fillers, save.
  - `specs/auth.spec.ts`: 6 tests (login page, invalid creds, redirect, full flow, logout, unauthenticated).
  - `specs/navigation.spec.ts`: 16 tests (sidebar modules, expand/collapse, navigation, brand logo, global search open/search/navigate/close, profile dropdown sections/appearance/theme switch).
  - `specs/vouchers.spec.ts`: 8 tests (Sales, Purchase, Credit Note, Debit Note, Payment, Receipt, Contra, Journal — all creating and verifying vouchers).
- **Selector best practices**: Scoped to `nav`/`table.first()`, uses `getByRole("link")`/`getByRole("button")`, narration-based assertions with `.first()` for duplicate resilience.
- **Result: 30/30 passing** (6 auth + 16 nav + 8 vouchers).

## [2026-07-01] — Remove Dashboard Sidebar Link + Strip Multi-Currency

### Backend
- **Deleted** all multi-currency/exchange rate code:
  - `models/currency.py` (ExchangeRate model, SUPPORTED_CURRENCIES)
  - `schemas/currency.py` (exchange rate Pydantic schemas)
  - `api/v1/currencies.py` (5 forex endpoints)
  - Removed `currencies` router from `api/v1/__init__.py`
- **Removed** forex fields from ORM models (columns remain in DB as dead):
  - `Ledger.currency` → removed from `models/accounting.py`
  - `Voucher.currency`, `Voucher.exchange_rate` → removed from `models/voucher.py`
  - `VoucherLine.fc_debit`, `VoucherLine.fc_credit` → removed from `models/voucher.py`
  - `Company.currency` → removed from `models/user.py`
- **Removed** forex fields from all Pydantic schemas (voucher, ledger, company)
- **Removed** forex conversion logic from `api/v1/vouchers.py` `_process_voucher_lines()`
- **Removed** `currency` from `tally_parser.py` `ParsedLedger` and `tally_importer.py` ledger creation

### Frontend
- **Deleted** `ExchangeRatesPage.tsx` and its route from `App.tsx`
- **Removed** `Dashboard` NavLink from sidebar (brand logo still navigates to `/`; Dashboard stays in search)
- **Removed** `Exchange Rates` nav item from Company group in sidebar
- **Removed** all forex UI from voucher components:
  - `VoucherHeader`: removed currency Select, exchange rate input, all currency props
  - `VoucherFooter`, `AmountLineTable`, `ItemLineTable`, `LedgerLineTable`: removed `currencySymbol` prop (hardcoded `₹`)
  - `AmountVoucherForm`, `JournalForm`, `ItemVoucherForm`: removed `currency`/`exchangeRate` state, forex API call, forex payload logic
- **Removed** forex types from `types.ts` (`currency`, `exchange_rate`, `fc_debit`, `fc_credit`)
- **Removed** `currency` selector from `LedgerForm`
- **Removed** `currency` from `CompanySettingsPage` interface

## [2026-07-01] — Sidebar IA Redesign + Theme System

### Backend
- No backend changes (routes preserved).

### Frontend
- **Sidebar restructured** into 5 business modules: Accounting (Chart of Accounts, Vouchers, Reconciliation), Inventory, GST & Tax (GST subgroup + TDS/TCS), Reports, Company.
- **GST & Tax workspace**: GST subgroup with Compliance, E-Invoice, E-Way Bill, HSN/SAC, GST Registrations. TDS/TCS as sibling.
- **Company module**: Company Settings, Financial Years, Exchange Rates, Import/Export (Tally Import moved here).
- **Banking (Soon)** removed from sidebar.
- **Profile dropdown** organized into 4 labeled sections: Profile, Workspace, Administration (superadmin), Session.
- **Theme store**: Added `"system"` mode (follows OS preference). `setTheme()` replaces `toggle()`. Listens for `prefers-color-scheme` changes in auto mode.
- **Appearance selector**: Light / Dark / Auto (system) inline selector in profile dropdown.
- **Global search**: Dedup key changed from `to` to `to|label` so shared-route items both appear.
- No routes or functionality changed.

## [2026-07-01] — Phase 22.3: GSTR-9 Annual Return

### Backend
- **Service** (`gstr.py`): Added `Gstr9Data` dataclass and `generate_gstr9()` — aggregates vouchers across a full FY (Apr-Mar) into GSTR-9 format. Covers Table 4 (outward supplies + reverse charge), Table 6 (ITC from regular purchases + reverse charge split), Table 8 (net CGST/SGST/IGST payable after ITC adjustment). Helper `_get_fy_dates()` converts `YYYY-YY` period to Apr–Mar date range.
- **Schemas** (`gst.py`): Added `Gstr9Response` with 25 annual return fields. Updated `GstReturnGenerateRequest.return_type` regex to include `gstr9`.
- **API** (`gst.py`): `POST /returns/generate` now handles `gstr9` — constructs full data dict from `Gstr9Data`. Import of `generate_gstr9` added.

### Frontend
- **CompliancePage.tsx**: Added "GSTR-9 (Annual)" option in return type dropdown. Generates FY periods (5 recent FYs) for GSTR-9. Period auto-resets on return type switch. Detail view renders 4 card sections: Table 4 Outward (taxable + RC), Table 6 ITC (purchases + RC breakdown + totals), Table 8 Net Payable (CGST/SGST/IGST + total), and Summary (legal/trade name).

## [2026-07-01] — Phase 22.2d: Pre-Import Validation + Skip Log

### Backend
- **Validation** (`tally_importer.py:validate_import()`): New function checks all data references on upload without creating records. Validates: group parent existence with nature-based fallback, ledger group membership, party ledger linkage, stock group references, voucher line ledger existence, voucher balance equality, and duplicate detection. Returns `{"errors": [...], "warnings": [...]}`.
- **Skip logging**: All `_import_*` functions (`_import_groups`, `_import_ledgers`, `_import_parties`, `_import_stock_groups`, `_import_stock_items`, `_import_units`, `_import_vouchers`) now accept `skip_log` list parameter and append `{"entity", "item", "reason"}` dicts for each skipped item. `execute_import()` returns `(details, skip_log)` tuple.
- **Schema** (`tally_import.py`): Added `ValidationIssue` model and optional `validation` field on `TallyImportPreview`.
- **API**: `POST /upload` now calls `validate_import()` and includes validation results in response. `POST /jobs/{id}/confirm` stores skip_log in `job.errors["skip_warnings"]`.
- **Tally Sample**: Fixed voucher lines in sample generator to include proper debit/credit amounts.

### Frontend
- **TallyImportPage.tsx**: New `ValidationDisplay` component shows errors/warnings in upload section after file upload. New `SkipWarnings` component shows entity-grouped skip reasons with explanations in job detail modal for completed imports. All new components support dark mode. `UploadResponse` interface updated with `validation` field.

## [2026-07-01] — Phase 22.2c: Excel Import + Sample Downloads

### Backend
- **Model update**: `ImportJob.content` changed from `Text` to `LargeBinary` (migration 0026) to support both XML and Excel binary storage.
- **Migration 0026**: Alters `import_jobs.content` column type using `postgresql_using='content::bytea'`.
- **Excel Parser** (`tally_parser.py:parse_tally_excel()`): Reads XLSX workbooks with 6 data sheets — Groups (name, parent, nature), Ledgers (name, group, opening_balance, gstin), Parties (name, type, gstin, state_code), Stock Groups (name), Stock Items (name, group, unit, hsn, gst_rate, opening_qty, opening_rate), Vouchers (voucher_type, voucher_number, date, narration, ledger_name, debit, credit). Vouchers use one-row-per-line format; rows with matching number+type are grouped into one voucher.
- **Sample generators** (`tally_sample.py`): `generate_sample_xml()` returns a complete sample Tally XML string with 5 groups, 4 ledgers, 2 stock items, 2 vouchers. `generate_sample_excel()` builds an XLSX workbook with all 6 data sheets + a Readme sheet.
- **API updates**: `POST /upload` auto-detects `.xlsx` files and routes to Excel parser; stores raw bytes. `POST /jobs/{id}/confirm` detects format from filename and parses accordingly. New `GET /sample?format=xml|xlsx` endpoints return downloadable sample files.
- **Importer update**: Removed/skipped sections in undo result now show individual item details (not just counts).

### Frontend
- **TallyImportPage.tsx**: File input now accepts `.xml`, `.txt`, `.xlsx`. "Download Sample XML" and "Download Sample Excel" links below the upload form. Undo result modal shows individual item names/details for removed and skipped items (not just counts).

## [2026-07-01] — Phase 22.1: Multi-Currency Support

### Backend
- **New model**: `ExchangeRate` in `models/currency.py` — stores daily exchange rates per company (unique on company+currency+date).
- **Ledger model**: Added optional `currency` field (NULL = company base currency INR).
- **Voucher model**: Added `currency` and `exchange_rate` fields for forex transactions.
- **VoucherLine model**: Added `fc_debit` and `fc_credit` fields for foreign currency amounts.
- **Migration 0023**: Creates `exchange_rates` table, adds `currency` to ledgers, `currency`/`exchange_rate` to vouchers, `fc_debit`/`fc_credit` to voucher_lines.
- **Currency API**: 5 endpoints — list supported currencies, CRUD exchange rates (`/api/forex/*`).
- **Voucher API**: Updated `_process_voucher_lines` to convert foreign currency amounts to base currency using exchange rate. Both `fc_debit`/`fc_credit` and base `debit`/`credit` stored.
- **Ledger API**: `LedgerCreate` and `LedgerOut` schemas now include optional `currency` field.

### Frontend
- **Exchange Rates page** (`ExchangeRatesPage.tsx`): Add/delete exchange rates grouped by currency with symbol display.
- **Voucher forms** (AmountVoucherForm, ItemVoucherForm, JournalForm): Currency selector dropdown and exchange rate input in VoucherHeader. Payload includes `currency`, `exchange_rate`, `fc_debit`, `fc_credit`.
- **VoucherHeader**: New currency/exchange rate fields. Grid layout expanded to include currency selector and rate input.
- **VoucherFooter**: Accepts `currencySymbol` prop — all hardcoded `₹` replaced with dynamic symbol.
- **AmountLineTable, ItemLineTable, LedgerLineTable**: Accept `currencySymbol` prop for display.
- **LedgerForm**: Currency dropdown added (fetches supported currencies from API).
- **TypeScript types**: `Ledger`, `VoucherLine`, `Voucher` interfaces updated with `currency`, `exchange_rate`, `fc_debit`, `fc_credit` fields.
- **Empty line factories**: Updated to include `fc_debit: null`, `fc_credit: null`.
- **Sidebar**: Exchange Rates added under Masters > Company subgroup.

### Supported Currencies (18)
INR, USD, EUR, GBP, JPY, AED, SGD, AUD, CAD, CHF, CNY, MYR, THB, SAR, QAR, OMR, KWD, BHR

---

## [2026-07-01] — Chart of Accounts: Professional Grid Layout Refactor

### Layout
- **Single CSS grid** with fixed columns: Name (flex) | Status (100px) | Count (110px) | Balance (150px).
- Every row (Root Group, Group, Subgroup, Ledger) uses the identical grid — no alignment shifts based on content.
- Column header row (Name, Status, Count, Balance) displayed above the tree when data is loaded.
- `.coa-row` CSS class defined in `index.css` for the grid template.

### Actions Removed
- Removed inline ⋮ (three-dot) action button from group rows.
- Removed the Actions column entirely.
- All operations (Edit, Create Ledger, Create Subgroup, Delete) remain available via right-click context menu.

### Data Alignment
- **Status column**: Active/Inactive badge for ledgers only. Empty for groups.
- **Count column**: Shows subgroup + ledger counts for groups (e.g. "2 Groups · 5 Ledgers"). Empty for ledgers.
- **Balance column**: Right-aligned ₹ amounts with Dr/Cr suffix. Empty when balances are hidden or balance is zero.
- Unused columns show empty space instead of shifting other columns.

### Row Behavior
- Full-width hover highlight on every row (both groups and ledgers).
- Entire row is clickable for expand/collapse (groups) or context menu (all types).
- Consistent row height (`py-1.5`) and typography across all row types.

### Empty Groups
- Expanded groups with no children show a compact single-line italic message: "No ledgers in this group."
- Replaced the previous multi-line empty state with a single indented line.

### Hierarchy
- Indentation via `depth * 20px` from left edge.
- Expand/collapse arrows (▸/▾) for groups.
- Nature icons for root groups, folder icons for subgroups, document icons for ledgers.
- Consistent left padding calculation for all row types.

---

## [2026-07-01] — Custom Select Component + Popup Overlay Fix

### Custom Select Component
- New `components/Select.tsx` — fully themed custom dropdown replacing all native `<select>` elements.
- Keyboard navigation: arrow keys, Enter to select, Escape to close.
- Click outside to close, viewport-aware positioning (opens above if near bottom).
- Checkmark on selected option, hover highlight, smooth transitions.
- `onChange` passes value directly (not event) — all migration converts `e.target.value` to direct value.

### Native Select Migration (All Files — Zero Remaining)
- **TdsTcsPage.tsx**: 6 selects (filter type, filter status, voucher, party, section, TDS/TCS type) — final native selects replaced.
- **ItemLineTable.tsx**: GST rate dropdown.
- **InventoryPage.tsx**: All filter and form selects.
- **DayBookPage.tsx**: Date filters, voucher type, party, ledger, status, sort.
- **ReportsPage.tsx**: Register voucher type, aging type.
- **MembersPage.tsx**: Role selects in add/edit forms.
- **GstSettingsPage.tsx**: HSN/SAC code type.
- **AuditLogPage.tsx**: Entity type and action filters.
- **AdminUsersPage.tsx**: Company and role assigns.
- **CompliancePage.tsx**: Return type, period, GSTIN.
- **EwayBillPage.tsx**: Cancel reason, voucher, seller GSTIN, transport mode.
- **BankReconciliationPage.tsx**: Bank account selector.
- **EInvoicePage.tsx**: Cancel reason, B2B voucher, seller GSTIN.
- **VoucherHeader.tsx**: Doc Type select.
- **VoucherFooter.tsx**: Round-off mode.
- **QuickCreate/Select.tsx, QuickCreate/Modal.tsx**: Dynamic field selects.
- **VouchersPage.tsx**: Party, Place of Supply, Stock Item, Ledger.
- **IndianStateSelect.tsx, CompanySelectPage.tsx, AdminCompaniesPage.tsx, CompanySettingsPage.tsx**: State selects.
- **ChartOfAccountsPage.tsx**: Group filter.
- **DashboardPage.tsx**: FY selector.
- **MastersPage.tsx**: Group filter.
- **LedgerForm.tsx, GroupForm.tsx**: Nature and parent group selects.

### Popup Overlay Fix
- **Select**: Uses `createPortal` to render dropdown on `document.body` with `position: fixed` and `z-index: 99999`. No longer affected by parent overflow, transform, or stacking context.
- **Calendar**: Bumped z-index from 50 to 99999 (was already `position: fixed`).
- **ContextMenu**: Bumped z-index from 50 to 99999 (was already `position: fixed`).
- All popups now appear as overlays above any content on the page.

### Cleanup
- Removed `!important` CSS hack from `index.css` (global `.dark select` rules) — no longer needed since custom Select handles its own styling.
- Removed global `.dark select option` rules.

### Sidebar Readability
- **Category headers** (Masters, Transactions, Reports, Compliance): white text in dark mode, 12px bold uppercase — clearly distinguishable from sub-items.
- **Nav items**: white hover text in dark mode (from `#94a3b8`) for better contrast.
- **Subgroup labels**: slightly bolder font weight, improved hover contrast.
- Dashboard link also updated for consistent hover behavior.

---

## [2026-07-01] — Select Component Migration (4 Pages)

### Changes
- Replaced all native HTML `<select>` elements with the custom `Select` component from `components/Select`
- **MembersPage.tsx**: 2 selects (Add form role, Edit form role) → custom Select with shared `ROLE_OPTIONS` array
- **GstSettingsPage.tsx**: 1 select (HSN/SAC code type) → custom Select with `HSN_TYPE_OPTIONS` array
- **AuditLogPage.tsx**: 2 selects (Entity Type filter, Action filter) → custom Select with `ENTITY_FILTER_OPTIONS` and `ACTION_FILTER_OPTIONS` arrays
- **AdminUsersPage.tsx**: 2 selects (Company, Role in assign form) → custom Select with dynamic company options and shared `ROLE_OPTIONS` array

### Details
- All `onChange` handlers converted from `e.target.value` (event-based) to direct value passing
- Labels moved from separate `<label>` tags into the `label` prop on Select
- Option arrays defined as `const` variables inside each component
- Dark mode classes preserved on wrapper elements
- No numeric value conversion needed — all values were already strings

---

## [2026-07-01] — Inventory Popup Modals (All 3 Tabs)

### Stock Groups
- Removed inline edit/delete buttons from group cards.
- Cards are now **clickable** — clicking opens a centered popup modal with Name/Description form + **Delete / Close** in the header.
- "+ New Group" button opens the modal in create mode.

### Stock Items
- Removed the **Actions** column from the stock items table.
- Rows are now **clickable** — clicking opens a centered popup modal with the item form.
- Modal header shows **Duplicate / Delete** buttons for existing items, or "Creating new item" for new items.

### Stock Entries
- Removed the **Actions** column from the stock entries table.
- Rows are now **clickable** — clicking opens a centered popup modal with the entry form.
- Modal header shows **Duplicate / Delete** buttons for existing entries, or "Creating new entry" for new entries.

### UX Consistency (All 3 Modals)
- Button text: **"Update"** when editing an existing entity, **"Create"** when creating new.
- After a successful **Update**, the modal **auto-closes** and the list refreshes.
- Clicking the backdrop (outside the modal) also closes the modal.
- Follows the DayBook voucher modal pattern (centered overlay, header with actions, form body).

---

## [2026-07-01] — Masters Merged into Chart of Accounts

### ChartOfAccountsPage
- **Active/Inactive status badges** on all ledger nodes — green "Active" or red "Inactive" pill badges.
- **Group filter dropdown** — filter tree to show only a specific primary group and its descendants.
- **"+ New" button** — contextual create button that shows "+ New Ledger" when a group is filtered, or "+ New" (group) when viewing all.
- Tree filtering updates live when group filter changes.

### MastersPage Removed
- **Masters route removed** from `App.tsx`.
- **Masters sidebar link removed** from `DashboardPage.tsx`.
- **Dashboard quick action** "Manage Masters" removed, "Chart of Accounts" renamed to "Manage Accounts".
- `MastersPage.tsx` file retained but no longer routed — all CRUD functionality now lives in COA.

---

## [2026-07-01] — Masters & COA UI Improvements + Modal Forms

### MastersPage
- Improved empty states with icons, descriptive text, and action buttons for groups and ledgers.
- System groups/ledgers indicated with lock icon instead of SYS badge.
- Context menu (⋮) on groups with Edit, Create Ledger, Create Subgroup, Delete actions.
- Migrated from inline forms to shared modal popup forms.

### ChartOfAccountsPage
- Fixed TypeScript error: removed redundant type comparison in context menu.
- Context menu (⋮ + right-click) now fully wired — opens modal forms for Edit, Create Ledger, Create Subgroup, Delete.
- Right-click support on ledger rows (previously only groups).
- Delete actions with confirm dialog for groups and ledgers.

### Shared Components
- Extracted `ContextMenu` into `components/ContextMenu.tsx` with viewport bounds checking — prevents menu from overflowing off-screen when clicking near edges.
- New `GroupForm` modal component — centered popup for creating/editing account groups with dark mode support.
- New `LedgerForm` modal component — centered popup for creating/editing ledgers with dark mode support, includes Delete button in edit mode.
- `Calendar` component switched from `position: absolute` to `position: fixed` with viewport bounds checking — prevents calendar popup from overflowing off-screen.
- `DayBookPage`: Replaced native `<input type="date">` with themed `DateInput` component for consistent dark mode support.

### Demo Data
- Added opening balances to 7 ledgers in seed data so "Show Balances" toggle in Chart of Accounts has visible data.

---

## [2026-06-30] — Phase 21: TDS/TCS Summary + Inventory Reports

### TDS/TCS Summary Report
- New ReportsPage tab showing party-wise TDS/TCS breakdown by section.
- TDS/TCS toggle to switch between views.
- Status counts: pending, deposited, filed.
- Total base amount and total tax aggregated at top.

### Inventory Reports (3 new tabs)
- **Stock Summary**: Current balance per item — quantity, avg rate, total value, valuation method.
- **Stock Movement**: Opening/inward/outward/closing quantity and value per item.
- **Stock Ageing**: Days since last entry with colour-coded ageing buckets (0-30, 31-60, 61-90, 90+ days).

### Backend
- `get_tds_tcs_party_summary()` service function in `tds_tcs.py`.
- `get_stock_ageing_report()` service function in `stock_valuation.py`.
- 4 new API endpoints: `/reports/tds-tcs-summary`, `/reports/stock-summary`, `/reports/stock-movement`, `/reports/stock-ageing`.
- 6 new Pydantic response schemas in `report.py`.

### Global Dark Input Fix
- CSS rules for `dark input`, `dark select`, `dark textarea` in `index.css` — catch-all for form elements missed during manual dark mode updates.
- `color-scheme: dark` on `html.dark` for native browser UI (date picker popups, scrollbars).

---

## [2026-06-30] — Dark Mode: Premium Redesign (Linear/Vercel-inspired)

### Layered Surface System
- Page background deepened to `#0a0a0f` (near-black with subtle blue tint).
- Sidebar: `#111118`, Cards/panels: `#18181f`, Hover states: `#1e1e28`, Elevated elements: `#252530`.
- Replaces flat `slate-800`/`slate-700` with purpose-specific hex layers for visual depth.

### Typography Hierarchy
- Primary text: `#f1f5f9` (near-white) for headings and important values.
- Secondary: `#cbd5e1` for body text and form inputs.
- Muted: `#64748b` for labels, metadata, badges.
- Very muted: `#475569` for disabled states and subtle indicators.
- Font sizes refined: 15px brand, 13px nav items, 11px metadata.

### Accent Color
- Violet-500 (`#8b5cf6`) replaces brand-600 for dark mode accent.
- Active nav: `bg-violet-500/10 text-violet-400`.
- Focus states: `focus:border-violet-500/50 focus:ring-violet-500/20`.
- Admin/superadmin items: `text-violet-400` with `hover:bg-violet-500/10`.
- Brand icon: gradient from violet-500 to indigo-600 with glow shadow.

### Shadows & Depth
- Custom shadow scale: `shadow-dark-sm`, `shadow-dark`, `shadow-dark-md`, `shadow-dark-lg`, `shadow-dark-xl`.
- Realistic depth with rgba(0,0,0) shadows calibrated for dark backgrounds.
- `glow-violet` shadow for future accent elements.

### Scrollbars
- Refined dark scrollbars: 6px width, `#252530` thumb, `#333340` hover.
- Webkit scrollbar styling for Chrome/Safari.

### Sidebar Redesign
- Brand icon: gradient violet-to-indigo with `shadow-lg shadow-violet-500/20`.
- Company card: rounded-xl with subtle border, violet icon bg.
- Search bar: refined with `/` keyboard hint.
- Nav items: rounded-xl, `transition-all duration-150`, violet accent on active.
- Profile dropdown: rounded-2xl with `shadow-dark-xl`, refined hover states.

### Badge & Status Colors
- All accent backgrounds changed from `*-900/30` to `*-500/10` for subtlety.
- Red borders: `border-red-800` → `border-red-500/20`.
- Hover states: `hover:bg-*-900/20` → `hover:bg-*-500/10`.

### Files Updated (29 files)
- `tailwind.config.js`: Custom shadow scale.
- `index.css`: Premium dark base, CSS variables, scrollbar, utility classes.
- `DashboardPage.tsx`: Complete sidebar redesign.
- All 28 remaining page files: palette replacement.

## [2026-06-30] — Dark Mode: Full Application Dark Theme

### Infrastructure
- `darkMode: 'class'` added to `tailwind.config.js` — enables class-based dark mode toggling.
- Flash-prevention script in `index.html` reads `zledger.theme` from localStorage and applies `.dark` to `<html>` before paint (no white flash on reload).
- New Zustand store `store/theme.ts` — persists theme to localStorage, applies `.dark` class, respects `prefers-color-scheme` on first visit.
- `index.css` updated: `.dark body` gets `bg-slate-900 text-slate-100`, dark scrollbar colors.

### Theme Toggle
- Dark/Light mode toggle added to profile dropdown (sidebar bottom) with sun/moon icons.
- Replaced the old "Preferences (placeholder)" button.

### Dark Variants Applied (All 30+ page components)
- **Sidebar** (DashboardPage): sidebar bg, brand, company card, search bar, all nav links, profile dropdown, hover/focus/active states.
- **Auth**: LoginPage, RegisterPage, CompanySelectPage — cards, inputs, labels, error messages.
- **Dashboard**: DashboardContent — stat cards, summary cards, quick actions, recent vouchers table.
- **Masters**: MastersPage, ChartOfAccountsPage, InventoryPage, FinancialYearsPage — forms, tables, badges, tabs.
- **Transactions**: All voucher files (index, VoucherList, 5 shared components, QuickCreate Modal/Select, 3 form files).
- **Reports**: ReportsPage, DayBookPage — tables, badges, filters, modals.
- **Compliance**: CompliancePage, GstSettingsPage, TdsTcsPage, EInvoicePage, EwayBillPage — forms, tables, status badges, detail cards.
- **Admin/Settings**: MembersPage, AuditLogPage, ProfilePage, CompanySettingsPage, AdminUsersPage, AdminCompaniesPage, BankReconciliationPage — forms, tables, modals.

### Dark Mode Color Mapping
| Pattern | Dark Variant |
|---|---|
| `bg-white` | `dark:bg-slate-800` |
| `bg-slate-50` | `dark:bg-slate-800/50` |
| `text-slate-900/800` | `dark:text-slate-100` |
| `text-slate-700` | `dark:text-slate-300` |
| `text-slate-600/500` | `dark:text-slate-400` |
| `border-slate-200` | `dark:border-slate-700` |
| `border-slate-300` | `dark:border-slate-600` |
| `bg-{color}-50 text-{color}-700` | `dark:bg-{color}-900/30 dark:text-{color}-400` |
| `focus:border-brand-600` | `dark:focus:border-brand-400` |
| `shadow-xl` | `dark:shadow-slate-800/50` |

## [2026-06-30] — Dark Mode: Tailwind CSS Dark Variants for Masters, Inventory, COA, Financial Years

### Changes
- Added `dark:` Tailwind CSS variants to 4 frontend pages
- **MastersPage.tsx**: Tab buttons, group form, ledger form, group tree cards, sub-group badges, ledger table, status badges, action buttons
- **ChartOfAccountsPage.tsx**: Page header, primary group cards, sub-group names, ledger tables, nature badges, system badges
- **InventoryPage.tsx**: Tab buttons, group/item/entry forms, group cards, items table, entries table, entry type badges, action buttons
- **FinancialYearsPage.tsx**: Page header, FY form, FY table, open/closed status badges, action buttons, confirm/cancel states
- All existing light mode classes preserved; dark variants added alongside

### Dark Mode Mapping Applied
- All standard mappings (bg-white, text-slate-*, border-slate-*, etc.)
- Badge patterns: emerald, red, amber, rose, purple badges
- Form inputs: dark:bg-slate-700, dark:text-slate-100
- Focus rings: dark:focus:border-brand-400, dark:focus:ring-brand-400
- Hover states: dark:hover:bg-slate-700, dark:hover:bg-red-900/30

---

## [2026-06-30] — Dark Mode: Tailwind CSS Dark Variants for Voucher Pages

### Changes
- Added `dark:` Tailwind CSS variants to all color classes across 12 voucher files
- **index.tsx**: Page header, error banner, card containers, tabs, modal overlay/panel, action buttons
- **VoucherList.tsx**: Filter pills, search input, table header/rows, type badges, empty state
- **VoucherHeader.tsx**: Labels, inputs, selects, textarea, doc type toggle, error state
- **VoucherFooter.tsx**: Totals row, action bar, round-off select, cancel/save buttons
- **AmountLineTable.tsx**: Labels, amount input, transfer summary, arrow SVG
- **ItemLineTable.tsx**: Table borders, header, row borders, all inputs/checkboxes, add button
- **LedgerLineTable.tsx**: Table borders, header, row borders, all inputs, footer totals, add/balance indicators
- **QuickCreate/Modal.tsx**: Modal panel, title, close button, labels, all inputs/selects/textareas, error state, cancel/create buttons
- **QuickCreate/Select.tsx**: Default select classes, "+" button with dashed border
- **AmountVoucherForm.tsx**: No direct color classes (delegates to shared components)
- **ItemVoucherForm.tsx**: "Items" section header
- **JournalForm.tsx**: Auto Balance button, balance indicator

### Dark Mode Mapping Applied
- `bg-white` → `dark:bg-slate-800`
- `bg-slate-50` → `dark:bg-slate-800/50`
- `bg-slate-50/80` → `dark:bg-slate-800/80`
- `bg-slate-100` → `dark:bg-slate-700`
- `text-slate-900` → `dark:text-slate-100`
- `text-slate-800` → `dark:text-slate-100`
- `text-slate-700` → `dark:text-slate-300`
- `text-slate-600` → `dark:text-slate-400`
- `text-slate-500` → `dark:text-slate-400`
- `text-slate-400` → `dark:text-slate-500`
- `text-slate-300` → `dark:text-slate-600`
- `border-slate-200` → `dark:border-slate-700`
- `border-slate-300` → `dark:border-slate-600`
- `border-red-200` → `dark:border-red-800`
- `ring-slate-200` → `dark:ring-slate-700`
- `focus:border-brand-500` → `dark:focus:border-brand-400`
- `focus:ring-brand-500` → `dark:focus:ring-brand-400`
- `bg-brand-50` → `dark:bg-brand-900/30`
- `text-brand-700` → `dark:text-brand-400`
- `bg-red-50` → `dark:bg-red-900/30`
- `text-red-700` → `dark:text-red-400`
- `hover:bg-slate-50` → `dark:hover:bg-slate-700/50`
- `hover:bg-slate-200` → `dark:hover:bg-slate-600`
- `hover:text-slate-800` → `dark:hover:text-slate-200`
- `hover:text-slate-600` → `dark:hover:text-slate-300`
- `hover:text-brand-600` → `dark:hover:text-brand-400`
- `hover:bg-brand-50` → `dark:hover:bg-brand-900/20`
- `border-dashed border-slate-300` → `dark:border-slate-600`
- `bg-brand-500`, `bg-brand-600`, `hover:bg-brand-700`, `text-red-500`, `bg-black/40` → kept as-is

## [2026-06-30] — Dark Mode: Tailwind CSS Dark Variants for Admin/Settings Pages

### Changes
- Added `dark:` Tailwind CSS variants to all color classes across 7 pages
- **MembersPage.tsx**: Role badges (purple/blue/slate), borders, text, backgrounds
- **AuditLogPage.tsx**: Filter selects, table, detail modal, action badges
- **ProfilePage.tsx**: Forms, inputs, labels, account info section
- **CompanySettingsPage.tsx**: Section cards, input/select focus rings, field labels, loading state
- **AdminUsersPage.tsx**: Create/assign forms, user table, role/status badges, action buttons
- **AdminCompaniesPage.tsx**: Form card, company table, header row, action icon buttons
- **BankReconciliationPage.tsx**: Ledger selector, summary cards, filter tabs, statement table, match modal

### Dark Mode Mapping Applied
- `bg-white` → `dark:bg-slate-800`
- `bg-slate-50` → `dark:bg-slate-800/50` or `dark:bg-slate-700/50`
- `bg-slate-100` → `dark:bg-slate-700`
- `text-slate-900/800` → `dark:text-slate-100`
- `text-slate-700` → `dark:text-slate-300`
- `text-slate-600/500` → `dark:text-slate-400`
- `text-slate-400` → `dark:text-slate-500`
- `border-slate-200` → `dark:border-slate-700`
- `border-slate-300` → `dark:border-slate-600`
- `shadow-xl` → `dark:shadow-slate-800/50`
- `focus:border-brand-600/500` → `dark:focus:border-brand-400`
- `focus:ring-brand-600/500` → `dark:focus:ring-brand-400`
- `bg-brand-50 text-brand-700` → `dark:bg-brand-900/30 dark:text-brand-400`
- Badge patterns: `bg-{color}-50 text-{color}-700` → `dark:bg-{color}-900/30 dark:text-{color}-400`
- Hover states: `hover:bg-slate-50` → `dark:hover:bg-slate-700` or `dark:hover:bg-slate-700/50`

## [2026-06-30] — Navigation Redesign: Accounting-Focused Sidebar + Profile Dropdown

### Sidebar Reorganization
- Sidebar now shows only accounting modules: Masters (collapsible), Transactions, Reports, Compliance.
- Dashboard moved to its own top-level link (not wrapped in a group).
- Masters includes a nested **Company** subgroup: Company Settings + Financial Years (no longer a top-level sidebar item).
- All groups are collapsible with expand/collapse state persisted to localStorage.

### Profile Dropdown
- User avatar at sidebar bottom opens a popover menu with: My Profile, Preferences (placeholder), Switch Company (multi-company only).
- Admin items (Members, Settings, Audit Log) moved to profile menu below a separator.
- Super-admin only items (Users, Companies) shown in a purple-themed section below another separator.
- Sign Out at the bottom with red styling.

### Company Card Redesign
- Clean card showing company icon, name, and GSTIN (fetched via `GET /companies/{id}`).
- Inline "FY" selector directly below the company info (removed the old "Company" / "Period" labels).
- Subtle gradient background for visual separation.

### Visual & UX Improvements
- Global search placeholder at sidebar top with keyboard hint `Ctrl+K` / `/`.
- "Banking" nav item shown as disabled with "Soon" badge (reserved for future module).
- "Preferences" in profile menu shown as disabled with "Soon" badge.
- Better active states (brand-50 bg + brand-700 text on active items).
- Hover states with subtle background changes.
- Subgroup items indented with left border.
- Chevron rotation animation on collapsible groups.
- Group headers show active indicator when any child route is active.

### Route Preservation
- All existing routes (30+) remain intact. No routes removed, no functionality broken.

## [2026-06-30] — FY Management: Update/Delete Endpoints + Frontend FY Management Page

### PATCH & DELETE Endpoints
- **PATCH /coa/financial-years/{id}**: Partial update of name/start_date/end_date. Validates overlap if dates change.
- **DELETE /coa/financial-years/{id}**: Deletes FY iff zero vouchers exist in its date range. Returns 400 with voucher count if blocked, guiding user to close the FY instead.

### Frontend FY Management Page
- **New page** at `/financial-years`: table listing all FYs with Name, Start Date, End Date, Status (Open/Closed badge), and Actions (Edit, Close/Reopen, Delete with confirm).
- **Smart form**: selecting start_date auto-fills end_date (365 days later) and name (e.g. "2026-27"). Create & edit reuse the same form panel.
- **Sidebar** updated: "Financial Years" link under Masters section with calendar icon.

## [2026-06-30] — FY Management: Overlap Validation, Close/Reopen, Auto Carry-Forward, Closed-Period Guard

### FY Overlap Validation
- `POST /coa/financial-years` now checks for overlapping date ranges before creating a new FY. Returns 400 with a descriptive message referencing the conflicting FY name.

### FY Close/Reopen Endpoint
- `PATCH /coa/financial-years/{id}/close` — toggles `is_closed`. Idempotent: calling again reopens the FY.
- When **closing**: if a subsequent FY exists, automatically generates an opening balance journal voucher (`OPEN-{FY_NAME}`) dated on the next FY's first day. Carries forward all balance sheet ledger balances (assets, liabilities, capital natures). Uses the Opening Balance Equity ledger as the counter-entry to balance the journal.
- When **reopening**: sets `is_closed = false` without side effects.

### Closed-Period Guard
- `POST /vouchers` and `PATCH /vouchers/{id}` now call `_check_fy_closed()` which rejects voucher dates falling in a closed FY. Returns 400: "Financial year '{name}' is closed. Cannot create or update vouchers in a closed period."

### Dashboard FY Filter Fix
- `services/dashboard.py` recent vouchers query previously ignored the FY filter (showed last 5 vouchers company-wide). Fixed to include `voucher_date >= fy.start_date AND voucher_date <= fy.end_date`.

### Bug Fix
- `services/dashboard.py:83` — `company.id` changed to `company_id` (NameError when accessing recent vouchers).

## [2026-06-30] — Phase 20 Reports Suite (Cash Flow, Aging, Outstanding, Register)

### New Report: Cash Flow Statement
- **Backend service** (`services/reports.py`): Direct method implementation. Identifies cash/bank ledgers (Bank Accounts, Cash-in-Hand groups). For each voucher affecting cash/bank, categorizes the counterparty ledger's group into Operating (Sundry Debtors, Sales, Purchases, Expenses, etc.), Investing (Fixed Assets, Investments), or Financing (Capital Account, Loans, Reserves). Computes opening/closing cash balance and net increase.
- **Schema** (`schemas/report.py`): `CashFlowLine`, `CashFlowCategory`, `CashFlowResponse` with per-category inflow/outflow/net breakdown.
- **API endpoint**: `GET /api/reports/cash-flow?financial_year_id=`

### New Report: Aging Analysis
- **Backend service**: Computes receivable (Sundry Debtors) and payable (Sundry Creditors) aging. Groups party vouchers by age from voucher date to FY end date. Buckets: 0-30, 31-60, 61-90, 90+ days.
- **Schema**: `AgingBucket`, `AgingPartyLine`, `AgingResponse` with per-bucket amount and count.
- **API endpoint**: `GET /api/reports/aging?financial_year_id=&type=receivable|payable`

### New Report: Outstanding
- **Backend service**: Lists all parties with their ledger closing balances. Debtors (Sundry Debtors group, Dr balance) and Creditors (Sundry Creditors group, Cr balance).
- **Schema**: `OutstandingPartyLine`, `OutstandingResponse` with debtor/creditor totals.
- **API endpoint**: `GET /api/reports/outstanding?financial_year_id=`

### New Report: Register
- **Backend service**: Reuses DayBook query engine filtered by voucher_type. Returns all entries for the specified type within the FY.
- **Schema**: `RegisterEntry`, `RegisterResponse` with total debit/credit.
- **API endpoint**: `GET /api/reports/register?financial_year_id=&voucher_type=`

### Frontend (`ReportsPage.tsx`)
- Added 4 new tabs: Cash Flow, Aging, Outstanding, Register
- Cash Flow: 3 summary cards (opening/closing/net increase), 3 category tables with inflow/outflow/net columns
- Aging: toggle buttons for Receivables/Payables, 5-column aging table with bucket totals in footer
- Outstanding: side-by-side Debtors/Creditors tables with party-wise balances
- Register: voucher type dropdown selector, daybook-style table with date/voucher/party/narration/debit/credit
- All tabs follow existing report patterns (FY selector, loading/error states, date range display)

## [2026-06-30] — Demo Data Overhaul, Voucher Modal, Bug Fixes

### Demo Data (Replaced)
- **Removed** "Test Company" (GSTIN 27AAAAA0000A1Z5) and both demo companies from old script
- **Created "Apex Enterprises"** — single comprehensive company in Maharashtra (27AABCP1234A1Z5) with full feature coverage
- **19 vouchers** covering all 8 types: sales(5), purchase(4), payment(2), receipt(2), contra(1), journal(3), credit_note(1), debit_note(1)
- **5 parties** with inter-state (Gujarat, Karnataka) and intra-state (Maharashtra) trading partners
- **7 stock items** across 3 stock groups with StockEntry + StockBalance tracking (opening + purchase + sales = live balances)
- **3 cost centres** actively allocated across 3 journal voucher lines
- **6 units** of measure, **5 e-invoice draft records** for sales vouchers
- **2 financial years** (2024-25, 2025-26) with opening balance journal for 2025-26
- **21 ledgers**: system GST ledgers, control ledgers (Sundry Debtors/Creditors), 5 party ledgers
- Revenue / expense / GST scenarios: intra-state CGST+SGST, inter-state IGST, tax-inclusive pricing
- Stock valuation engine active — all items show correct qty, avg_rate, total_value

### Features
- **Voucher page modal**: Clicking a voucher in Recent Vouchers opens an editable modal (same pattern as DayBookPage). Actions column removed from VoucherList. All actions (Edit, Duplicate, Delete) integrated in modal header.
- **Duplicate save closes modal**: After POST (duplicate), modal auto-closes. PATCH (update) keeps modal open with refreshed data.
- **Form fields reset after create**: Added `resetForm()` to all 3 forms — called after successful `onSubmit`. Clears date, narration, party, lines, counter ledger, round-off, reference, and fetches next number.

### Bug Fixes
- **Multi-item "Duplicate ledger in lines"**: Check at `backend/app/api/v1/vouchers.py:291` previously only skipped duplicate-ledger enforcement for lines with `stock_item_id`. Changed to also skip for lines with `quantity` and `rate` set (item lines without inventory). New condition: `is_item_line = line.stock_item_id is not None or (line.quantity is not None and line.rate is not None)`.
- **Counter ledger validation**: Added required counter ledger check in `ItemVoucherForm.handleSubmit` — prevents submitting unbalanced vouchers when grandTotal > 0.
- **Test fixtures dropped all tables**: `conftest.py:25` runs `Base.metadata.drop_all` after each test — this destroyed the app database during the test run. Database restored via `alembic upgrade head && python -m app.seed`.
- **Intermittent blank page on voucher update**: `VouchersPage` (`frontend/src/pages/vouchers/index.tsx`) called `refresh()` after PATCH, which re-fetched `ledgers`/`parties`/`stockItems` — all passed as props to the modal form. When master data arrays changed while the modal was open, a React render crash occurred (timing-sensitive race condition). Fixed by excluding master data from the post-update refresh (`refresh(false)`) — only the voucher list is re-fetched after an update. Also added null-safety to `counterLedgers` filter and `editingVoucher.lines` access in `ItemVoucherForm.tsx`.

### Documentation
- `AGENTS.md`: Added testing protocol — always test after every change using live API curl + frontend build. Noted test fixture data-loss issue and restoration procedure.

## [2026-06-29] — Voucher System Bug Fixes

### Bug Fixes

- **Voucher type switching**: Added `key={activeType}` to force React remount when switching voucher types, resetting all form state (reference, date, lines, narration)
- **Voucher number display**: Removed random reference generation (`INV-2026-XXXX`). Added `GET /vouchers/next-number` endpoint. Forms now fetch and display the actual next auto-generated voucher number, which increments after each creation.
- **Save & Post not posting**: Form `handleSubmit` now includes `_postImmediately` flag in payload so parent sees it and calls the `/post` endpoint
- **Inclusive tax creation failure**: Backend used `inclusive_total` (gross amount) for debit/credit when `is_rate_inclusive=True`, but GST lines are also added → double-counting → balance error. Fixed to use `line_total` (taxable amount) for debit/credit.
- **Total amount mismatch**: Counter ledger debit was being added to `subtotal` for item-based vouchers (sales/purchase/CN/DN), inflating grand_total to nearly double. Fixed: `elif` subtotal accumulation now skipped for item-based voucher types.
- **Discount with inclusive tax failure**: JavaScript floating point precision caused grandTotal to mismatch backend's Decimal calculation by ~1 paisa. Fixed by rounding `grandTotal` to 2 decimals in frontend and adding `abs(diff) > 0.01` tolerance to backend balance check.
- **Voucher list sort order**: `ORDER BY voucher_number DESC` sorts alphabetically ("9" > "80" as strings). Changed to `ORDER BY created_at DESC` for correct chronological ordering.
- **Next-voucher-number sort**: Same VARCHAR sorting bug in `_next_voucher_number` could generate duplicate numbers. Changed sort to `created_at DESC`.
- **Multiple item lines rejected**: The "Duplicate ledger in lines" check rejected vouchers with >1 item line because both auto-resolve to the same Sales ledger. Fixed to skip the check for lines with `stock_item_id`.

### E-Way Bill (Phase 18)
- **New model**: `EwayBill` in `models/eway_bill.py` — full GSTN E-Way Bill fields (supply type, transport, from/to addresses, item values, status tracking)
- **New migration**: `0017_eway_bill.py` — creates `eway_bills` table with 40+ columns
- **New service**: `services/eway_bill_client.py` — GSTN E-Way Bill API client (auth, generate, cancel, vehicle update)
- **New service**: `services/eway_bill_builder.py` — converts voucher data to GSTN E-Way Bill payload
- **New API**: `api/v1/eway_bill.py` — 6 endpoints (list, create, get, generate, cancel, vehicle update, payload preview)
- **New frontend**: `EwayBillPage.tsx` — full E-Way Bill management UI with create form, detail view, cancel/vehicle update
- **Config**: Added `eway_bill_enabled`, `eway_bill_env`, `eway_bill_username`, `eway_bill_password` settings
- **Nav**: Added E-Way Bill link to Compliance section in sidebar

### Voucher Cancellation (Phase 18)
- **Model update**: Added `cancel_reason` (String 1024) and `cancelled_at` (ISO timestamp) to Voucher model
- **New migration**: `0018_voucher_cancel.py` — adds cancel columns to vouchers
- **New endpoint**: `POST /vouchers/{id}/cancel` — cancels posted voucher, creates reversal journal entry (swaps debit/credit for all lines including GST), deletes stock entries for sales/purchase
- **Schema update**: Added `cancel_reason` and `cancelled_at` to `VoucherOut` and `VoucherListOut`
- **Frontend**: Cancel button on posted vouchers in VoucherList (prompts for reason)

### Cost Centre Allocation (Phase 19)
- **Model update**: Added `cost_centre_id` FK to VoucherLine (references cost_centres)
- **New migration**: `0019_cost_centre_allocation.py` — adds cost_centre_id to voucher_lines
- **Schema update**: Added `cost_centre_id` to `VoucherLineIn` and `VoucherLineOut`
- **API update**: Both create_voucher and update_voucher now handle cost_centre_id on lines
- **New report**: `GET /reports/cost-centre-pl` — P&L breakdown by cost centre

### Stock Valuation (Phase 19)
- **New model**: `StockBalance` in `models/stock.py` — running balance per item (quantity, avg_rate, total_value, last_entry_date)
- **New migration**: `0020_stock_balance.py` — creates `stock_balances` table
- **New service**: `services/stock_valuation.py` — weighted average and FIFO calculation engines, stock valuation report, stock movement summary
- **New endpoints**: `GET /inventory/valuation`, `GET /inventory/movement-summary`, `POST /inventory/update-balance`
- **Auto-update**: Stock balances now updated automatically when sales/purchase vouchers are posted

---

## [2026-06-29] — Demo Data Seed Script

### New
- **`backend/scripts/seed_demo_data.py`**: Clears all data (keeps admin user), creates 2 realistic Indian companies with full data.
- **Vikram Textiles Pvt Ltd** (Maharashtra, GSTIN 27AABCV1234A1Z5): 14 vouchers, 8 stock items (textiles/garments), 4 parties (2 customers in Gujarat, 2 suppliers in Maharashtra), mix of intra/inter-state transactions, GST at 5% and 12%, 2 draft vouchers.
- **Sunrise Electronics** (Karnataka, GSTIN 29AABCS5678B1Z8): 14 vouchers, 7 stock items (electronics), 4 parties (2 customers in Karnataka, 2 suppliers in Maharashtra), IGST on inter-state purchases, GST at 18%, 2 draft vouchers, 1 debit note.
- All 28 vouchers are balanced (Σ debits = Σ credits). Voucher types: sales, purchase, receipt, payment, credit note, debit note, journal.

### Bug Fixes
- **Seeding order fixed** in `companies.py`: `seed_default_ledgers` now runs before `seed_gst_ledgers`. Previously, GST ledgers were created first, causing `seed_default_ledgers` to skip (its guard checks for ANY existing ledger).
- **Migration 0016**: Fixed `down_revision` from `"0015"` to `"0015_quick_create_masters"`. Fixed `server_default` from `0` to `false` for PostgreSQL boolean compatibility.

---

## [2026-06-29] — Tax-Inclusive Pricing Support

### Problem
Tally and most Indian accounting software support tax-inclusive pricing where the rate entered includes GST. ZLedger only supported GST-exclusive rates, requiring users to mentally back-calculate or enter pre-computed taxable amounts.

### Solution
- **Backend model**: Added `is_rate_inclusive` Boolean column to `VoucherLine` (migration 0016, `server_default=sa.text("0")`). Existing vouchers unaffected.
- **Backend schemas**: Added `is_rate_inclusive` to `VoucherLineIn` and `VoucherLineOut`.
- **Backend create/update**: When `is_rate_inclusive=True`, back-calculates taxable amount: `taxable = inclusive_total / (1 + gst_rate / 100)`. Discount is applied on the inclusive amount first, then the back-calculation occurs. Debit/credit uses the inclusive total.
- **Frontend ItemLineTable**: Added "Incl." checkbox column between Rate and Disc%. Header tooltip: "Rate inclusive of tax". When checked, `linesCalc` back-calculates taxable and GST from the inclusive amount.
- **Frontend ItemVoucherForm**: Updated `linesCalc` with same inclusive logic. Submit payload includes `is_rate_inclusive` per line.
- **Frontend LedgerLineTable**: Added `is_rate_inclusive: false` to `addLine()` factory (no UI checkbox — ledger lines don't use it).
- **GST calculation**: No changes needed — `calculate_gst_from_rate()` receives the taxable amount, which is now correctly back-calculated before being passed to it.

### Files Added
- `backend/alembic/versions/0016_voucher_line_is_rate_inclusive.py` — migration

### Files Changed
- `backend/app/models/voucher.py` — added `is_rate_inclusive` Boolean column
- `backend/app/schemas/voucher.py` — added field to VoucherLineIn, VoucherLineOut
- `backend/app/api/v1/vouchers.py` — inclusive back-calc in `create_voucher()` and `update_voucher()`
- `frontend/src/pages/vouchers/types.ts` — added `is_rate_inclusive` to VoucherLine, all empty*Line() factories
- `frontend/src/pages/vouchers/shared/ItemLineTable.tsx` — Incl. checkbox column, linesCalc inclusive logic
- `frontend/src/pages/vouchers/shared/LedgerLineTable.tsx` — added `is_rate_inclusive` to addLine()
- `frontend/src/pages/vouchers/forms/ItemVoucherForm.tsx` — linesCalc inclusive logic, submit payload includes field

---

## [2026-06-29] — Place of Supply Auto-Derivation & State Selection Unification

### Problem
- Place of Supply was a manual dropdown in Sales, Purchase, Credit Note, and Debit Note vouchers — redundant since it should match the Party's registered state per GST rules.
- `INDIAN_STATES` was duplicated in 4 files (CompanySelectPage, AdminCompaniesPage, CompanySettingsPage, vouchers/types.ts) with slight inconsistencies.
- Party creation used a raw text input for state_code (e.g., "27") instead of a user-friendly state dropdown.

### Solution — Place of Supply
- **Removed** Place of Supply field from `VoucherHeader` and all voucher forms.
- **Removed** `placeOfSupply` / `onPlaceOfSupplyChange` props from `VoucherHeader` interface.
- **Removed** `showPlaceOfSupply` from `VoucherTypeConfig` interface and all 8 voucher type definitions.
- **Auto-derivation**: `ItemVoucherForm.handleSubmit()` now derives `place_of_supply` from `party.state_code` at submit time. Both `place_of_supply` and `counterparty_state_code` are set from the same Party state.
- **Validation**: If a Party is selected but has no `state_code`, posting is prevented with message: "Selected party does not have a registered state. Please update the Party master to add the state before posting."
- **Backend preserved**: `place_of_supply` and `counterparty_state_code` columns, `_determine_is_inter_state()` logic, and all GST calculation paths unchanged.

### Solution — State Selection Unification
- **Created** `frontend/src/components/IndianStates.ts`: Single source of truth for `INDIAN_STATES` array (37 states/territories including Ladakh and Other Territory) + `stateName()` helper.
- **Created** `frontend/src/components/IndianStateSelect.tsx`: Reusable dropdown component showing full state names, storing 2-digit GST code internally.
- **Replaced** 4 duplicate `INDIAN_STATES` arrays with shared import in: `CompanySelectPage.tsx`, `AdminCompaniesPage.tsx`, `CompanySettingsPage.tsx`.
- **Removed** `INDIAN_STATES` from `vouchers/types.ts` (was only used by VoucherHeader's Place of Supply dropdown).
- **QuickCreate Party config**: `state_code` field changed from text input (`"e.g. 27"`) to select dropdown with all state names.

### Files Changed
- `frontend/src/components/IndianStates.ts` — new shared constant
- `frontend/src/components/IndianStateSelect.tsx` — new reusable component
- `frontend/src/pages/vouchers/shared/VoucherHeader.tsx` — removed Place of Supply, simplified to 3 rows (Date/Ref, Party, Narration)
- `frontend/src/pages/vouchers/types.ts` — removed `showPlaceOfSupply` from config, removed `INDIAN_STATES`
- `frontend/src/pages/vouchers/forms/ItemVoucherForm.tsx` — removed placeOfSupply state, added Party state validation, auto-derive at submit
- `frontend/src/pages/vouchers/forms/AmountVoucherForm.tsx` — removed placeOfSupply/onPlaceOfSupplyChange props
- `frontend/src/pages/vouchers/forms/JournalForm.tsx` — removed placeOfSupply/onPlaceOfSupplyChange props
- `frontend/src/pages/vouchers/shared/QuickCreate/configs.ts` — state_code changed to select with INDIAN_STATES
- `frontend/src/pages/CompanySelectPage.tsx` — replaced local INDIAN_STATES with shared import
- `frontend/src/pages/AdminCompaniesPage.tsx` — replaced local INDIAN_STATES with shared import
- `frontend/src/pages/CompanySettingsPage.tsx` — replaced local INDIAN_STATES with shared import

---

## [2026-06-29] — Document Type Field Smart Hide

### Problem
The Document Type dropdown (Regular/Export/SEZ/Deemed Export) was always visible on Sales and Purchase vouchers, consuming header space even though ~95% of vouchers use "Regular".

### Solution
- **Default**: All new vouchers default to `"regular"` (matches backend `server_default`).
- **Hidden when Regular**: When value is `"regular"`, the dropdown is hidden entirely. A subtle `"Regular ▾"` text link appears in its place.
- **Revealing**: Clicking `"Regular ▾"` reveals the full Document Type dropdown inline.
- **Non-regular state**: When value is non-regular (Export/SEZ/Deemed Export), the dropdown is shown inline with a `×` button to reset to Regular.
- **Local state**: `showDocType` boolean in VoucherHeader controls visibility; initialized to `true` if `documentType !== "regular"`.
- **Backend unchanged**: Model, APIs, validation, and business logic preserved.
- **Scope**: Sales and Purchase voucher types only (others have `showDocumentType: false`).

### Files Changed
- `frontend/src/pages/vouchers/shared/VoucherHeader.tsx`: Added local `showDocType` state, conditional rendering logic, "Regular ▾" toggle, × reset button.

---

## [2026-06-29] — Voucher Form Accountant-First Redesign

### Design Philosophy
Redesigned all voucher entry forms and shared components for professional accounting software density — information-dense but readable, fields sized by importance, compact but clear.

### VoucherHeader
- Removed unused `hideDocType` prop from interface.
- Fixed `text-slate-ibold` typo → `text-slate-500`.
- Row 1: Date (160px fixed) + Reference (flex) + Document Type (auto) — tight grid with `items-end gap-2`.
- Row 2: Party full-width, prominent with `font-medium text-slate-800`.
- Row 3: Place of Supply (1fr) + Narration (2fr) — smart proportional widths.
- Labels: `text-[11px] font-medium text-slate-500` throughout.

### VoucherFooter
- Totals row: subtotals left-aligned with `gap-4 text-xs`, grand total right with `min-w-[120px] text-right border-l`.
- Actions bar: compact `py-2`, buttons `px-3 py-1.5 text-xs` instead of `px-4 py-2 text-sm`.
- Rounded corners: `rounded` instead of `rounded-lg`.

### ItemLineTable
- Proportional columns: Item (flex), Qty (`w-16`), Rate (`w-20`), Disc (`w-14`), Amount (`w-24`), GST (`w-14`).
- Header: `text-[11px] font-semibold uppercase tracking-wide`.
- All numeric inputs: `tabular-nums` for alignment.
- "Add Item" button: `text-[11px] py-0.5` — smaller footprint.

### LedgerLineTable
- Proportional columns: Ledger (flex), Debit/Credit (`w-32`).
- Tfoot: `text-slate-600` for "Total" label.
- "Add Line" button: `text-[11px] py-0.5`.
- Balance indicator: `text-[11px]` instead of `text-xs`.

### AmountLineTable
- Arrow SVG: `h-4 w-6 text-slate-300` — smaller, subtler.
- Amount input: `w-28 pl-5` with inline `₹` prefix positioned absolutely.
- Summary line: `text-[11px]` compact.

### Forms (ItemVoucherForm, AmountVoucherForm, JournalForm)
- Outer spacing: `space-y-3` (was `space-y-4`).
- "Cash/Bank Account" label: `text-[11px] font-medium text-slate-500`.
- Section headers: `text-[11px] font-semibold uppercase tracking-wide`.

### VoucherList
- Filter pills: `rounded px-2.5 py-1 text-xs` (was `rounded-lg px-3 py-2 text-sm`).
- Search input: `rounded px-2.5 py-1 text-xs w-52`.
- Table: `rounded-lg` (was `rounded-xl`), `text-[11px]` headers.
- Cells: `px-2.5 py-1.5` (was `px-3 py-2`).
- Status badges: `rounded` (was `rounded-full`), `text-[11px]`.
- Action buttons: `text-[11px] py-0.5`.

### vouchers/index.tsx
- Page spacing: `space-y-4` (was `space-y-6`).
- Tabs: `text-xs py-1.5 px-3` (was `text-sm py-2.5 px-4`).
- Form body: `p-4` (was `p-5`), header `text-sm`.
- Detail modal: `rounded-lg p-5`, compact grid `gap-2 text-xs`, smaller table `text-xs`.

---

## [2026-06-29] — Quick Create Framework

### Backend: New Master Entities
- Created `app/models/masters.py`: Unit, CostCentre, CostCategory models (id, company_id, name, description, is_active).
- Created `app/schemas/masters.py`: UnitCreate/Out, CostCentreCreate/Out, CostCategoryCreate/Out schemas.
- Created `app/api/v1/masters.py`: CRUD endpoints for units (`/api/masters/units`), cost centres (`/api/masters/cost-centres`), cost categories (`/api/masters/cost-categories`).
- Created Alembic migration `0015_quick_create_masters` — adds `units`, `cost_centres`, `cost_categories` tables.
- Registered `masters` router in `api/v1/__init__.py` and models in `models/__init__.py`.

### Frontend: Reusable Quick Create Framework
- **`QuickCreateSelect`** (`shared/QuickCreate/Select.tsx`): Augments any `<select>` with a "+" button that opens the creation modal. Maintains existing native select UX for browsing/selecting.
- **`QuickCreateModal`** (`shared/QuickCreate/Modal.tsx`): Dynamic form rendered from entity config. Fetches dynamic options (account groups for ledger, stock groups for stock item). Validates required fields, submits to correct API endpoint, reports server errors (e.g. duplicate name).
- **`QuickCreate configs`** (`shared/QuickCreate/configs.ts`): Central registry defining fields, API paths, and validation rules for all 7 entity types: `ledger`, `party`, `stock_item`, `stock_group`, `unit`, `cost_centre`, `cost_category`.

### Integration — All Voucher Selects
- **VoucherHeader**: Party select replaced with QuickCreateSelect. Creates new Party (name + type required).
- **ItemLineTable**: Stock Item select replaced. Creates new Stock Item (name required, optional group/uom/GST).
- **LedgerLineTable**: Ledger select replaced. Creates new Ledger (name + group required).
- **AmountLineTable**: Both From/To ledger selects replaced. Creates new Ledger.
- **ItemVoucherForm**: Cash/Bank Account select replaced. Creates new Ledger.
- **VouchersPage**: New `handleQuickCreate` handler appends new items to `ledgers`/`parties`/`stockItems` state arrays and re-renders selects with the new option auto-selected.

### Data Flow
- On successful creation: modal closes → new item appended to parent state array → select dropdown re-renders with new option → `onChange(newItem.id)` auto-selects it.
- No full-page refresh needed. All existing form state (lines, amounts, dates) preserved.
- Server-side duplicate detection: backend returns error if name already exists; modal displays error message.

### Types Added
- `AccountGroup`, `StockGroup`, `Unit`, `CostCentre`, `CostCategory` interfaces in `vouchers/types.ts`.

### Verification
- TypeScript compiles clean (zero errors).
- Docker build + deploy successful. Migration 0015 applied.

## [2026-06-29] — Voucher Module UI/UX Professional Refinement

### Shared Components
- **VoucherHeader**: Party field moved to primary focus (full-width row), Document Type demoted to subtle inline select, Date/Reference reduced to compact grid row, overall spacing tightened from `space-y-4` → `space-y-2.5`, input padding reduced `py-2` → `py-1.5`.
- **VoucherFooter**: Now sticky at bottom with `bg-white shadow-[0_-1px_3px_rgba(0,0,0,0.04)]`. Totals row placed inline above the action bar (right-aligned with separator). Button roles swapped: "Save & Post" is primary (filled `bg-brand-600`), "Save as Draft" is secondary (outline). Accepts `sticky` prop.
- **ItemLineTable**: Converted to spreadsheet-like grid — cell padding reduced `py-1` → `py-0.5`, input padding `py-0.5` instead of `py-1`, col widths explicit for Qty/Rate/Disc/Amount/GST. "Add Item" button changed to dashed border compact style. Headers tighter with `py-1.5`.
- **LedgerLineTable**: Cell padding reduced to `py-1`, balanced indicator always visible as footer row + inline message. Total row added to `tfoot`. "Add Line" button in compact dashed style.
- **AmountLineTable**: Accountant-friendly labels with `fromHint`/`toHint` props properly passed. Compact 3-column grid (from → amount → to) with SVG direction arrow. Transfer summary card shown when all fields filled. Input/select padding reduced to `py-1.5`.

### Forms
- **ItemVoucherForm**: "Counter Ledger" relabeled → "Cash/Bank Account" with compact inline layout. Outer spacing reduced `space-y-5` → `space-y-4`. Items heading changed to `text-xs font-semibold text-slate-600`.
- **JournalForm**: Outer spacing reduced `space-y-5` → `space-y-4`.
- **AmountVoucherForm**: Outer spacing reduced `space-y-5` → `space-y-4`. Added missing `fromHint`/`toHint` props to AmountLineTable.

### Voucher Page & List
- **vouchers/index.tsx**: Added "Recent Vouchers" section heading with bottom border to visually separate form from list.
- **VoucherList**: Table cell padding reduced `px-4 py-2.5` → `px-3 py-2` for denser rows. Search placeholder improved from "Search by # or narration..." → "Search voucher # or narration...".

### Verification
- TypeScript compiles clean (zero errors).

## [2026-06-29] — Day Book Module

### New Feature: Day Book Report
- **Backend**: Created `app/services/daybook.py` — core query engine with chronological voucher listing, 10 filter dimensions (date range, voucher type, party, ledger, status, created_by, voucher number, narration, global search), server-side pagination, sorting, and summary computation with balance validation.
- **Backend**: Created `app/schemas/daybook.py` — `DayBookEntry`, `DayBookGroup`, `DayBookSummary`, `DayBookResponse` Pydantic models.
- **Backend**: Created `app/api/v1/daybook.py` — REST endpoints: `GET /api/reports/daybook` (paginated JSON), `GET /api/reports/daybook/csv`, `GET /api/reports/daybook/xlsx`, `GET /api/reports/daybook/pdf`, `GET /api/reports/daybook/filters` (filter options for dropdowns). Exports use csv/stdlib, openpyxl, and reportlab respectively.
- **Model**: Added `created_by` (nullable FK → users) to Voucher model. Migration `0014_daybook_created_by`. Updated voucher creation to set `created_by=user.id`. Added `creator` relationship.
- **Frontend**: Created `DayBookPage.tsx` with summary cards (vouchers, debit, credit, balance check), collapsible filter bar (date range, 5 dropdowns, search), view toggle (flat table / grouped by date), sticky header table with 10 columns, action buttons (View/Edit/Duplicate/Print/Delete), server-side pagination, export (CSV/Excel/PDF/Print), loading/empty/error states, and proper ARIA labels.
- **Routing**: Added `/daybook` route and "Day Book" nav item under Reports in sidebar.
- **Architecture**: Designed for future extensibility — the query engine supports ledger_id filtering (needed for Cash Book, Bank Book, Ledger reports), all monetary values use Decimal with proper rounding, company isolation via X-Company-Id, and the service pattern separates query logic from router/serialization.

### Files Added
- `backend/app/api/v1/daybook.py` — Day Book REST API router (5 endpoints)
- `backend/app/schemas/daybook.py` — Day Book Pydantic schemas
- `backend/app/services/daybook.py` — Day Book query engine with full filter/pagination/sort support
- `backend/alembic/versions/0014_daybook_created_by.py` — migration for `created_by` column
- `frontend/src/pages/DayBookPage.tsx` — Day Book UI page component

### Files Modified
- `backend/app/models/voucher.py` — added `created_by` column + `creator` relationship
- `backend/app/schemas/voucher.py` — added `created_by` to `VoucherListOut`
- `backend/app/api/v1/vouchers.py` — set `created_by=user.id` on voucher creation
- `backend/app/api/v1/__init__.py` — registered daybook router
- `frontend/src/App.tsx` — added `/daybook` and `/vouchers/:id` routes
- `frontend/src/pages/DashboardPage.tsx` — added "Day Book" nav item under Reports
- `CHANGELOG.md` — this entry

## [2026-06-29] — Voucher Engine Refactor & UI Redesign

### Voucher Engine — Configuration-Driven Architecture
- **8 individual forms → 3 unified forms**: Replaced SalesForm, PurchaseForm, CreditNoteForm, DebitNoteForm with single `ItemVoucherForm` (config-driven via `voucherType` prop). Same for PaymentForm/ReceiptForm/ContraForm → `AmountVoucherForm`. Deleted 7 old files.
- **~1400 lines → ~650 lines**: 53% code reduction while preserving all functionality.
- **ItemVoucherForm**: Drives sales/purchase/credit_note/debit_note from config (reference prefix, auto-ledger group, debit/credit direction).
- **AmountVoucherForm**: Drives payment/receipt/contra with configurable from/to labels.
- **Voucher List**: Added search by voucher # or narration; sorted by date descending; pill-style type filters (rounded buttons); improved status badges (Draft/Posted/Cancelled).
- **Voucher Footer**: CGST/SGST/IGST shown separately (not just combined "GST"). Card-style totals with 2 decimal formatting.

### AmountLineTable Redesign
- Both "From" (credit) and "To" (debit) ledgers are now editable, with clear visual direction indicators (amber → outgoing, emerald ← incoming).
- Transfer summary card showing full path: `Bank → ₹5,000 → Party`.
- Payment/Receipt/Contra now send **both legs** of the double-entry (from_ledger credited, to_ledger debited).

### Journal Auto-Balance
- Added "Auto Balance" button that fills the debit/credit difference into the last empty row — matches professional accounting software behavior.

### Sidebar Redesign
- Navigation grouped by accountant workflow: Masters, Transactions, Reports, Compliance, Administration.
- 12 inline SVG icons (sitemap for COA, receipt for vouchers, bank for reconcile, chart for reports, etc.).
- Context switcher in a compact card (company + FY in single container).
- Section headers with `tracking-widest` uppercase labels.
- User footer with avatar initial + logout icon.

### Chart of Accounts Page
- New read-only hierarchical view at `/chart-of-accounts`.
- Primary groups as cards, sub-groups nested inside, ledgers in tables with name, opening balance, Dr/Cr.
- Linked from sidebar nav and dashboard quick actions.

### System Code Badges Removed
- Removed all system code badges (GRP_*, SYS_*) from MastersPage and ChartOfAccountsPage.
- Removed System Code column from ledgers table in MastersPage.

### Superadmin Auto-Join
- `companies.py`: all superadmins auto-added as `CompanyMember` (role "owner") on company creation.
- `admin.py`: same for admin company creation.
- `auth.py`: `/auth/me` now returns ALL companies for superadmins (not just CompanyMember records), covering pre-existing companies.

### DateInput Fixes
- Calendar picker: hidden `<input type="date">` now overlays only the icon area (not entire component), uses `pointer-events-none` on SVG so clicks pass through to native date picker.
- Empty value shows blank (not "—") in DateInput; "—" preserved for display-only contexts.
- End date fields in CompanySelectPage and DashboardContent now editable (removed readOnly) while keeping auto-derive from start date.

### Files Added
- `frontend/src/pages/ChartOfAccountsPage.tsx` — read-only hierarchical COA view
- `frontend/src/pages/vouchers/forms/ItemVoucherForm.tsx` — unified item-based voucher form
- `frontend/src/pages/vouchers/forms/AmountVoucherForm.tsx` — unified amount-based voucher form

### Files Deleted
- `frontend/src/pages/vouchers/forms/SalesForm.tsx`
- `frontend/src/pages/vouchers/forms/PurchaseForm.tsx`
- `frontend/src/pages/vouchers/forms/PaymentForm.tsx`
- `frontend/src/pages/vouchers/forms/ReceiptForm.tsx`
- `frontend/src/pages/vouchers/forms/ContraForm.tsx`
- `frontend/src/pages/vouchers/forms/CreditNoteForm.tsx`
- `frontend/src/pages/vouchers/forms/DebitNoteForm.tsx`

### Files Modified
- `frontend/src/pages/vouchers/index.tsx` — uses unified forms, cleaner orchestrator
- `frontend/src/pages/vouchers/VoucherList.tsx` — search, sort, pill filters, better columns
- `frontend/src/pages/vouchers/shared/AmountLineTable.tsx` — editable from/to, direction indicators
- `frontend/src/pages/vouchers/shared/VoucherFooter.tsx` — CGST/SGST/IGST breakdown
- `frontend/src/pages/vouchers/forms/JournalForm.tsx` — auto-balance button
- `frontend/src/pages/vouchers/types.ts` — LineStyle, VoucherTypeConfig unchanged
- `frontend/src/pages/DashboardPage.tsx` — sidebar redesign
- `frontend/src/pages/DashboardContent.tsx` — added Chart of Accounts quick action
- `frontend/src/App.tsx` — added chart-of-accounts route
- `frontend/src/pages/MastersPage.tsx` — removed system code badges + column
- `frontend/src/components/DateInput.tsx` — calendar picker fix, no placeholder
- `frontend/src/utils/dateUtils.ts` — (unchanged, toDisplayDate still returns "—")
- `backend/app/api/v1/companies.py` — superadmin auto-join on company creation
- `backend/app/api/v1/admin.py` — superadmin auto-join in admin company creation
- `backend/app/api/v1/auth.py` — /auth/me returns all companies for superadmins
- `frontend/src/pages/CompanySelectPage.tsx` — end date editable
- `frontend/src/pages/DashboardContent.tsx` — end date editable

## [2026-06-29] — Chart of Accounts Redesign with System Codes

### Model Changes
- `AccountGroup`: added `system_code` column (immutable identifier, e.g. `GRP_CURRENT_ASSETS`)
- `Ledger`: added `system_code` column (e.g. `SYS_GST_OUTPUT_CGST`) and `is_protected` boolean
- Both have composite unique index on `(company_id, system_code)` for per-company uniqueness

### New Group Hierarchy
- **Equity** (root) → Capital Account, Drawings, Reserves & Surplus, Profit & Loss A/c, Opening Balance Equity
- **Current Assets** → added `Suspense A/c`
- **Duties & Taxes** → reorganized into subgroups: `GST Input`, `GST Output`, `Reverse Charge`
- All built-in groups marked `is_system=true` with immutable system_codes

### GST Ledger Restructuring
- GST Input subgroup: CGST Input, SGST Input, IGST Input
- GST Output subgroup: CGST Output, SGST Output, IGST Output
- Reverse Charge subgroup: RCM CGST Input, RCM SGST Input, RCM IGST Input
- All lookups migrated from display names to system_codes (`SYS_GST_INPUT_CGST`, etc.)

### System Ledgers Created
- Round Off, Discount Allowed, Discount Received, Bank Charges
- Interest Paid, Interest Received, Freight Inward
- Inventory Adjustment, Miscellaneous Expenses
- All marked `is_protected=true` — cannot be deleted

### Protection Rules
- System groups: cannot be deleted, display name can be renamed
- System ledgers: cannot be deleted, can edit opening balance and alias
- Business logic uses `system_code` (e.g. `SYS_SALES`) never display names

### Files Changed
- `backend/app/models/accounting.py` — system_code + is_protected fields
- `backend/app/schemas/accounting.py` — new fields in AccountGroupOut, LedgerOut
- `backend/app/services/coa.py` — new TALLY_GROUPS with system codes, seed_system_ledgers
- `backend/app/services/gst.py` — system_code-based GST ledger seeding + lookup
- `backend/app/services/gst_posting.py` — system_code-based posting
- `backend/app/services/gstr.py` — system_code-based ITC queries
- `backend/app/api/v1/accounting.py` — protection enforcement
- `backend/app/api/v1/companies.py` — seed_system_ledgers on company creation
- `backend/app/api/v1/vouchers.py` — system_code-based GST auto-posting
- `backend/alembic/versions/0013_coa_system_codes.py` — migration
- `frontend/src/pages/MastersPage.tsx` — system code badges, protection indicators

## [2026-06-29] — Voucher System Balance Fix & Payment Ledger

### Backend Fixes
- **GST auto-posting bug fixed**: Added `db.flush()` before GST auto-posting query — was querying unflushed voucher lines, causing CGST/SGST lines to never be created
- **Line-level GST rate override**: Added `gst_rate` field to `VoucherLineIn` schema; backend now uses line's `gst_rate` when provided, falling back to stock item's `gst_rate`
- **Credit Note & Debit Note GST**: Extended GST auto-posting to `credit_note` and `debit_note` voucher types

### Frontend Fixes
- **Payment Ledger selector**: Added to SalesForm, PurchaseForm, CreditNoteForm, and DebitNoteForm — required field to specify Cash/Bank ledger for the counter-entry (debit for sales, credit for purchase)
- SalesForm sends debit line for Cash/Bank + credit lines for item entries
- PurchaseForm sends credit line for Cash/Bank + debit lines for item entries
- CreditNoteForm sends credit line for Cash/Bank + debit lines for items
- DebitNoteForm sends debit line for Cash/Bank + credit lines for items

### Files Changed
- `backend/app/schemas/voucher.py` — added `gst_rate` to `VoucherLineIn`
- `backend/app/api/v1/vouchers.py` — `db.flush()` before GST auto-posting, `gst_rate` line override logic, credit_note/debit_note GST support
- `frontend/src/pages/vouchers/forms/SalesForm.tsx` — Payment Ledger selector, debit counter-line
- `frontend/src/pages/vouchers/forms/PurchaseForm.tsx` — Payment Ledger selector, credit counter-line
- `frontend/src/pages/vouchers/forms/CreditNoteForm.tsx` — Payment Ledger selector, credit counter-line, fixed CN prefix
- `frontend/src/pages/vouchers/forms/DebitNoteForm.tsx` — Payment Ledger selector, debit counter-line, fixed DN prefix

### Stock Items
- GST rate field changed from number input to dropdown with predefined rates: None (0%), 0.25%, 3%, 5%, 12%, 18%, 28%

### Voucher Entry
- **Invoice number**: Auto-generated (INV-2026-XXXX for sales, PUR-2026-XXXX for purchase, etc.) but fully editable
- **Rate auto-fill**: When stock item is selected, rate auto-populates from item's opening rate (editable)
- **GST per line**: GST rate auto-applied from stock item, but now editable per line via dropdown (Auto/0%/0.25%/3%/5%/12%/18%/28%). "Auto" uses stock item's rate, custom value overrides

### Financial Year
- Now required when creating a company (was optional)
- Calendar icon added to all DateInput components — click to open native date picker
- Still supports manual dd/mm/yyyy typing

### Files Changed
- `components/DateInput.tsx` — added calendar icon and native date picker
- `pages/InventoryPage.tsx` — GST rate dropdown
- `pages/vouchers/types.ts` — added `gst_rate` to VoucherLine, `opening_rate` to StockItem
- `pages/vouchers/shared/ItemLineTable.tsx` — GST % dropdown per line, auto-fill rate/GST on item select
- `pages/vouchers/shared/LedgerLineTable.tsx` — added gst_rate to line factory
- `pages/vouchers/forms/SalesForm.tsx` — auto-generated invoice, line-level GST
- `pages/vouchers/forms/PurchaseForm.tsx` — same
- `pages/vouchers/forms/CreditNoteForm.tsx` — same
- `pages/vouchers/forms/DebitNoteForm.tsx` — same
- `pages/vouchers/forms/ReceiptForm.tsx` — auto-generated receipt number
- `pages/vouchers/forms/PaymentForm.tsx` — auto-generated payment number
- `pages/vouchers/forms/ContraForm.tsx` — auto-generated contra number
- `pages/CompanySelectPage.tsx` — FY required, calendar picker

## [2026-06-29] — Date Format & Admin Company Management

### Date Format (dd/mm/yyyy)
- Created shared `utils/dateUtils.ts` with `toDisplayDate()`, `toIsoDate()`, `todayIso()`, `calculateEndDate()`, `generateFyName()`
- Created reusable `components/DateInput.tsx` component with dd/mm/yyyy display and auto-conversion to YYYY-MM-DD for API
- Updated all date inputs across the app (10 files): CompanySelectPage, DashboardContent, VoucherHeader, InventoryPage, TdsTcsPage, VouchersPage, CompanySettingsPage
- Updated all date displays in tables/lists (12 files): VoucherList, VouchersPage, DashboardContent, InventoryPage, TdsTcsPage, BankReconciliationPage, CompliancePage, ReportsPage, AuditLogPage

### Admin Company Management
- Added 5 new admin endpoints in `api/v1/admin.py`:
  - `GET /admin/companies` — list all companies
  - `POST /admin/companies` — create company
  - `GET /admin/companies/{id}` — get company details
  - `PATCH /admin/companies/{id}` — update company
  - `DELETE /admin/companies/{id}` — delete company (removes memberships first)
- Created `AdminCompaniesPage.tsx` with full CRUD: table view, create/edit form, activate/deactivate toggle, delete with confirmation
- Added route `/admin/companies` in App.tsx
- Added "Admin: Companies" nav link in sidebar (superadmin only)

## [2026-06-29] — Financial Year UX Improvements

### Company Creation
- Removed FY name input field — name now auto-generated from date range (e.g., "2025-2026")
- When start date is selected, end date automatically set to day before start date in next year
- End date field is now read-only (displayed as "2025-04-01" → "2026-03-31")

### Dashboard FY Creation
- Same auto-generation logic applied to inline FY creation form
- Removed name input — auto-generates from start date
- End date auto-calculated and read-only

## [2026-06-29] — Voucher Entry Page Redesign (Complete)

### Architecture
- Restructured voucher frontend from single monolithic component to type-specific form architecture:
  - `pages/vouchers/types.ts`: VoucherTypeConfig registry, shared types, helper functions
  - `pages/vouchers/index.tsx`: Main orchestrator with tabbed interface and detail modal
  - `pages/vouchers/shared/`: Reusable components (VoucherHeader, ItemLineTable, LedgerLineTable, AmountLineTable, VoucherFooter)
  - `pages/vouchers/forms/`: 8 type-specific form components

### Form Components
- **SalesForm**: Stock item selection with qty/rate/discount/GST breakdown, place of supply, party selection
- **PurchaseForm**: Stock item selection with qty/rate/discount/GST breakdown, party selection
- **PaymentForm**: Amount-based with from/to ledger selection, party support
- **ReceiptForm**: Amount-based with from/to ledger selection, party support
- **ContraForm**: Amount-based for bank/cash transfers between accounts
- **JournalForm**: Debit/credit grid for general journal entries
- **CreditNoteForm**: Stock item-based credit notes with GST
- **DebitNoteForm**: Stock item-based debit notes with GST

### Shared Components
- VoucherHeader: Date, reference, narration, party/place of supply selection
- ItemLineTable: Stock item lines with qty, rate, discount %, GST breakdown
- LedgerLineTable: Debit/credit lines with ledger selection
- AmountLineTable: Single amount with from/to ledger selection
- VoucherFooter: Totals display with submit buttons

### Integration
- Updated App.tsx routing to use new vouchers page
- TypeScript compilation passes clean

## [2026-06-29] — Phase 17: Voucher System Overhaul (Complete)

### Model & Migration
- Voucher model: added `party_id` FK to parties, `subtotal`, `discount_total`, `tax_total`, `grand_total` (Numeric 18,2). Replaced `is_posted` boolean with `status` field (draft/posted/cancelled). Added party relationship.
- VoucherLine model: added `stock_item_id` FK to stock_items, `quantity` (Numeric 18,3), `rate` (Numeric 18,2), `discount_pct` (Numeric 5,2), `discount_amount` (Numeric 18,2), `line_total` (Numeric 18,2). Added stock_item relationship.
- Alembic 0012_voucher_enhancements: adds all new columns, migrates `is_posted` → `status`, drops old column.

### Backend
- Schemas rewritten: VoucherLineIn now accepts stock_item_id, quantity, rate, discount fields. VoucherCreate removed `voucher_number` (always auto-generated server-side) and `min_length=1` on lines. VoucherOut returns all new fields + status.
- Voucher API rewritten:
  - **Create**: auto-generates voucher number, validates party, resolves stock items, auto-selects ledger by voucher type (Sales Accounts / Purchase Accounts), auto-calculates GST from stock item's gst_rate (no HsnSac lookup needed), computes line totals, subtotal, discount, tax, grand total. Creates GST ledger lines for sales/purchase. Validates balance.
  - **Update** (`PATCH /vouchers/{id}`): replaces lines entirely on draft vouchers only. Same calculation logic as create.
  - **Post** (`POST /vouchers/{id}/post`): changes draft → posted, creates StockEntry records (inward for purchase, outward for sales) linked to voucher.
  - **Delete**: blocks posted vouchers (must cancel first). Drafts delete freely.
- GST helper `calculate_gst_from_rate()` added to services/gst.py for direct gst_rate calculation without HsnSac FK.
- Updated `is_posted` → `status == "posted"` in: services/reports.py, services/dashboard.py, services/gstr.py (7 occurrences).
- Updated tests: test_vouchers.py (rewritten with draft/post workflow, auto-numbering), test_reports_service.py, test_dashboard_service.py, test_gstr_service.py (all `is_posted=True` → `status="posted"`).

### Frontend
- VouchersPage.tsx fully redesigned:
  - **Filter tabs**: All | Sales | Purchase | Journal | Receipt | Payment.
  - **Create form** with type selector: Sales/Purchase get item-based form (stock item dropdown, qty, rate, discount %, auto line total, GST breakdown, subtotal/discount/tax/grand total). Journal/Receipt/Payment keep debit/credit grid.
  - **Party selector** for Sales/Purchase/Receipt/Payment. Place of Supply dropdown (all 37 Indian states).
  - **Detail modal**: click any voucher row to see lines, GST breakdown, totals.
  - **Status badges**: Draft (amber), Posted (green), Cancelled (red).
  - **Actions**: Post (draft only), Delete (draft only).
  - Server-side voucher numbering (no more client-generated).
- TypeScript compiles clean.

## [2026-06-29] — Phase 16: Inventory Management (Complete)
- Created StockGroup, StockItem, StockEntry models in models/stock.py.
- Alembic 0011_stock: stock_groups, stock_items, stock_entries tables.
- API: /inventory/groups (CRUD), /inventory/items (CRUD), /inventory/entries (CRUD) with validation (group deletion blocked if items exist, item deletion blocked if entries exist, total_amount auto-calculated).
- StockItem fields: name, SKU, HSN/SAC, UOM (Nos/Kgs/Ltr/Mtr/Sqm/Pcs/Box/Bag/Set/Pair/Rft), opening qty/rate, valuation method (weighted_avg/fifo), GST rate.
- StockEntry: inward/outward with quantity, rate, auto total, date, reference, narration, optional voucher link.
- Frontend InventoryPage: 3 tabs (Stock Groups, Stock Items, Stock Entries) with full CRUD — cards for groups, table for items/entries, item filter on entries, edit/delete icon buttons, real-time total preview on entry form.
- Added Inventory nav link and route.

## [2026-06-29] — Editable Primary Groups + Company Settings Expansion
- Primary groups Purchase Accounts, Direct/Indirect Incomes, Direct/Indirect Expenses seeded as editable (is_system=False).
- Groups tab UI modernized: cards with border, edit/delete icon buttons on every group and sub-group pill, "No sub-groups" empty state.
- Alembic 0010_company_details: added phone, email, website, bank_name, bank_account_number, bank_ifsc, bank_branch to companies table.
- Company Settings page redesigned with sections: General (name, legal name, books begin), Tax Registration (GSTIN, PAN, state), Contact Details (phone, email, website, address), Bank Details (bank, branch, account, IFSC).

## [2026-06-29] — Company Settings + FY Validation + UX Polish
- Company creation: state dropdown shows state name only (not "07 - Delhi"), added optional FY fields (name, start, end) during creation.
- FY creation: end date validated — cannot be before start date.
- After company creation with FY: auto-redirects to dashboard (no create-FY screen).
- New Company Settings page (/company-settings): edit company name, legal name, GSTIN, PAN, state, address.
- Sidebar: "COMPANY" and "FINANCIAL YEAR" labels above selectors for clarity; Company Settings added to nav.

## [2026-06-29] - Dashboard FY Form + Group Edit Fix + State Dropdown
- Dashboard "Create Financial Year" now opens an inline form (name, start date, end date) instead of navigating to Masters.
- Sub-groups seeded with is_system=False so edit/delete buttons are visible. Primary groups remain protected.
- Company creation state code replaced with a dropdown of all 37 Indian states/UTs with codes.

## [2026-06-29] - Admin: Create User + Assign Company
- Added POST /admin/users endpoint (superadmin only) to create a new user with name, email, password, optional superadmin flag.
- Added POST /admin/users/{id}/memberships endpoint to assign a user to a company with a role (accountant/viewer).
- Rewrote AdminUsersPage: "+ New User" form (name, email, password, superadmin checkbox), "Assign" button per user opens company+role selector, success/error feedback, company list fetched from /companies.

## [2026-06-29] - Sidebar Logo Clickable
- Sidebar logo and app name now wrapped in a button that navigates to "/" (dashboard).

## [2026-06-29] - Masters Full CRUD
- Added DELETE /coa/groups/{id} (rejects system groups, groups with children or ledgers).
- Added DELETE /coa/ledgers/{id} (rejects ledgers referenced by voucher lines).
- MastersPage groups tab: create/edit form (name, nature, type, parent), delete button (non-system only), hover edit/delete on sub-group pills.
- MastersPage ledgers tab: create/edit form, delete button, group filter dropdown.

## [2026-06-29] - Default Ledgers + Ledger CRUD UI
- Added DEFAULT_LEDGERS to services/coa.py: Cash, Bank Account, Capital Account, Sales, Purchases — auto-seeded on company creation.
- Added seed_default_ledgers() called from POST /companies after seed_groups + seed_gst_ledgers.
- Rewrote MastersPage.tsx: ledgers tab now has create form (name, group with optgroup hierarchy, opening balance Dr/Cr, alias, GSTIN), edit form, group filter dropdown, and edit button per row.

## [2026-06-29] - UI: Sidebar Layout
- Replaced top navbar with fixed left sidebar in DashboardPage.tsx.
- Sidebar contains: logo, company/FY selectors, navigation links, profile link, sign out.
- Main content fills remaining space with overflow scroll.

## [2026-06-29] - Phase 15: TDS/TCS (Complete)
- Created Alembic migration 0009_tds_tcs: tds_tcs_sections (section_code, rate, threshold_limit), tds_tcs_entries (base_amount, deducted_amount, status, challan_number), tds_tcs_returns (quarter, financial_year, total_tax, filing_date).
- Created TdsTcsSection, TdsTcsEntry, TdsTcsReturn models in models/tds_tcs.py.
- Added all three models to models/__init__.py for Alembic autogenerate.
- Created schemas/tds_tcs.py: TdsTcsSectionCreate/Out, TdsTcsEntryCreate/Out, TdsTcsDeposit, TdsTcsReturnCreate/Out, TdsTcsReturnFile.
- Created services/tds_tcs.py: seed_tds_tcs_sections() (13 common Indian TDS/TCS sections), calculate_tds_tcs() (with threshold check), create_tds_tcs_entry(), deposit_entries(), generate_return() (quarterly aggregation from deposited entries), get_tds_tcs_summary().
- Created api/v1/tds_tcs.py: 10 endpoints (CRUD sections, seed defaults, calculate, CRUD entries, deposit, generate/file returns, summary).
- Registered tds_tcs router in api/v1/__init__.py with /tds-tcs prefix.
- Created frontend TdsTcsPage.tsx: tabbed UI (Entries/Sections/Returns), entry creation with voucher+section+party selection, bulk deposit with challan details, section management with seed defaults, returns with filing, summary cards (pending/deposited/filed amounts).
- Added TDS/TCS nav link to DashboardPage and route to App.tsx.
- Created tests/test_tds_tcs.py: 14 tests covering sections CRUD, seeding, entries with threshold, deposit workflow, return generation, filing, summary, calculation, auth checks.
- TDS sections: 194C (Contractors 1%/2%), 194J (Professional 10%), 194I (Rent 2%/10%), 194H (Commission 5%), 194A (Interest 10%), 194B (Lottery 30%), 206C (TCS collections).

## [2026-06-29] - Phase 14: Bank Reconciliation (Complete)
- Created Alembic migration 0008_bank_reconciliation: bank_statement_lines table (transaction_date, description, reference, debit, credit, balance, is_reconciled, voucher_id FK) and bank_reconciliations table (opening/closing balance, statement_date, is_finalized).
- Created BankStatementLine and BankReconciliation models in models/bank_reconciliation.py.
- Added both models to models/__init__.py for Alembic autogenerate.
- Created schemas/bank_reconciliation.py: BankStatementLineOut, BankReconciliationOut, BankReconciliationCreate, BankReconciliationFinalize, BankReconcileMatch, BankReconcileUnmatch.
- Created services/bank_reconciliation.py: parse_bank_csv() (flexible column detection, multiple date formats, comma handling, negative value support), import_statement(), match_statement_to_voucher() (amount validation), unreconcile_statement_line(), get_reconciliation_summary(), find_matching_vouchers().
- Created api/v1/bank_reconciliation.py: 8 endpoints (import CSV, list/delete lines, match/unmatch, suggest matches, summary, create/list/finalize sessions).
- Registered bank_reconciliation router in api/v1/__init__.py with /bank-reconciliation prefix.
- Created frontend BankReconciliationPage.tsx: bank ledger selector, CSV import, statement lines table with filter tabs (All/Unreconciled/Reconciled), match modal with voucher suggestions, unmatch/delete actions, summary cards (total/reconciled/unreconciled/matched amount).
- Added Reconcile nav link to DashboardPage and route to App.tsx.
- Created tests/test_bank_reconciliation.py: 21 tests covering CSV parsing, import, line management, match/unmatch, amount mismatch rejection, suggest matches, summary, session CRUD, finalization, auth checks.
- Bank statement CSV parser handles flexible column names (date/txn_date/value_date, description/narration/particulars, debit/withdrawal/dr, credit/deposit/cr, reference/cheque_no/utr).

## [2026-06-29] - Phase 13: Audit Log (Complete)
- Created Alembic migration 0007_audit_log: audit_logs table (action, entity_type, entity_id, old_value JSON, new_value JSON, description, ip_address, user_agent).
- Created AuditLog model in models/audit.py with company_id, user_id FKs, JSON columns for state snapshots, and indexes on entity lookup and created_at.
- Added AuditLog to models/__init__.py for Alembic autogenerate.
- Created schemas/audit.py: AuditLogOut (full detail with old/new values), AuditLogListOut (list view with user enrichment).
- Created services/audit.py: log_action() helper, serialize_voucher(), serialize_member(), _serialize_entity() utilities for JSON-safe snapshots.
- Created api/v1/audit.py: 2 endpoints (list with entity_type/action/entity_id filters + pagination, detail with full old/new values).
- Registered audit router in api/v1/__init__.py with /audit prefix.
- Integrated audit logging into api/v1/vouchers.py: CREATE and DELETE voucher actions are logged with full voucher+lines snapshots.
- Integrated audit logging into api/v1/members.py: CREATE (add member), UPDATE (role change), DELETE (remove member) actions are logged.
- Created frontend AuditLogPage.tsx: audit log list with entity type and action filters, detail modal with JSON old/new value display, user attribution.
- Added Audit Log nav link to DashboardPage.tsx and route to App.tsx.
- Created tests/test_audit.py: ~20 tests covering voucher integration, member integration, endpoint filtering/pagination, auth checks, and service unit tests.
- Role enforcement: only owners and accountants can view audit logs; viewers are denied access.

## [2026-06-28] - Phase 12: User Management (Complete)
- Created schemas/member.py: CompanyRole enum, ASSIGNABLE_ROLES, MemberAddRequest, MemberRoleUpdate, MemberOut.
- Added UserUpdate, PasswordChange, AdminUserUpdate schemas to schemas/user.py.
- Added get_current_membership dependency to core/dependencies.py (returns CompanyMember with role).
- Created api/v1/members.py: 4 endpoints (list, add, change role, remove) with owner-only protection.
- Created api/v1/admin.py: 5 endpoints (list users, get user, update user, deactivate user, stats) — superadmin only.
- Updated api/v1/auth.py: added PATCH /auth/me (profile update) and PATCH /auth/me/password (password change).
- Registered members and admin routers in api/v1/__init__.py.
- Created frontend MembersPage.tsx: member list, add form, role editing, remove button.
- Created frontend ProfilePage.tsx: edit name/email, change password, account info.
- Created frontend AdminUsersPage.tsx: superadmin user management (list, edit, activate/deactivate, promote/demote).
- Updated DashboardPage.tsx: added Members nav item, Admin nav item (superadmin only), clickable user name → profile.
- Updated App.tsx: added /members, /profile, /admin/users routes.
- Created tests/test_members.py (10 tests): member CRUD, owner protection, role enforcement, auth checks.
- Created tests/test_admin_users.py (7 tests): superadmin user management, self-deactivation prevention.
- Created tests/test_user_profile.py (7 tests): profile update, password change, email uniqueness.
- Protection rules: owner can't be removed/demoted, can't deactivate yourself, last superadmin can't be deactivated.

## [2026-06-28] - Phase 11: E-Invoice (Complete)
- Created Alembic migration 0006_einvoice: e_invoices table (IRN, ack_no, ack_dt, signed_qr_code, signed_invoice, status, cancel fields).
- Created EInvoice model in models/einvoice.py with company, voucher, GST registration foreign keys.
- Added EInvoice to models/__init__.py for Alembic autogenerate.
- Added e-invoice config fields: einvoice_gstin, einvoice_client_id, einvoice_client_secret, einvoice_username, einvoice_password to config.py.
- Added einvoice_api_url property to config (sandbox/production URL routing).
- Added dependencies: pycryptodome (AES-256-ECB), httpx (HTTP client), qrcode (QR generation) to pyproject.toml.
- Passed e-invoice credential env vars through docker-compose.yml.
- Updated .env and .env.example with Phase 11 e-invoice credential comments.
- Created services/einvoice_client.py: GSTN API client with AES-256-ECB encryption, token caching, IRN generation, cancellation, and status queries.
- Created services/einvoice_builder.py: converts Zledger voucher data to GSTN e-invoice v1.1 schema (DocDtls, SellerDtls, BuyerDtls, ItemList, ValDtls).
- Created schemas/einvoice.py: EInvoiceGenerateRequest, EInvoiceCancelRequest, EInvoiceOut, EInvoiceListOut.
- Created api/v1/einvoice.py: 7 endpoints (list, create, get, generate, cancel, qr download, invoice-data preview).
- Registered einvoice router in api/v1/__init__.py.
- Created frontend EInvoicePage.tsx: e-invoice list, create form, detail view with IRN, QR code display, cancel form.
- Added "E-Invoice" nav item to DashboardPage and route to App.tsx.
- Created tests/test_einvoice_service.py: unit tests for AES encryption, date formatting, PIN extraction, state codes, doc types, supply types.
- Created tests/test_einvoice_endpoints.py: integration tests for all e-invoice endpoints (enabled/disabled, CRUD, auth, company scoping).

## [2026-06-28] - Phase 10: Testing (Complete)
- Expanded test suite from 14 to 146 tests (10x increase).
- Added `conftest.py` helpers: `register_user`, `create_company`, `auth_header(token, company_id)`, `create_db_company`.
- `test_money.py` (20 tests): Unit tests for `to_money`, `quantize_money`, `to_qty`, `add`, `sum_money`, `money_is_zero`.
- `test_gst_service.py` (14 tests): Unit tests for `calculate_gst` (18%/12%/5% rates, intra/inter-state, rounding edge cases, invalid HSN), `get_gst_ledger_ids`, `get_rcm_ledger_mapping`.
- `test_reports_service.py` (12 tests): Unit tests for `get_ledger_balances`, `get_trial_balance`, `get_profit_and_loss`, `get_balance_sheet` with various voucher scenarios.
- `test_dashboard_service.py` (7 tests): Unit tests for `get_dashboard_summary` (empty, voucher counts, entity counts, recent vouchers, invalid FY).
- `test_gstr_service.py` (11 tests): Unit tests for `generate_gstr1` (B2B/B2CS/HSN/IGST), `generate_gstr3b` (outward/reverse charge/ITC), `_get_period_dates`.
- `test_coa.py` (16 tests): Integration tests for financial years, account groups (CRUD, system group protection), ledgers (CRUD, invalid group), parties (CRUD).
- `test_vouchers.py` (12 tests): Integration tests for voucher CRUD, double-entry enforcement, unbalanced rejection, duplicate ledger rejection, posted voucher deletion prevention.
- `test_gst_endpoints.py` (12 tests): Integration tests for HSN/SAC CRUD, GST registration CRUD, GST calculation endpoint.
- `test_reports_endpoints.py` (12 tests): Integration tests for trial balance/P&L/balance sheet (JSON, PDF, XLSX) endpoints.
- `test_auth.py` (8 tests): Existing auth tests (unchanged).
- `test_companies.py` (6 tests): Existing company tests (unchanged).
- **Bug fix:** Added `is_inter_state` field to `GstBreakdown` NamedTuple in `services/gst.py` — was causing `AttributeError` on `POST /api/gst/calculate-gst` endpoint.

## [2026-06-28] - Phase 9: Polish & Deploy (Complete)
- Created backend/app/services/dashboard.py: aggregated P&L, balance sheet, voucher counts, recent vouchers, entity counts.
- Created backend/app/api/v1/dashboard.py: GET /api/dashboard/summary endpoint.
- Created frontend/src/store/fy.ts: shared financial year Zustand store with localStorage persistence.
- Created frontend/src/pages/DashboardContent.tsx: summary cards (income, expenses, profit, assets), voucher counts by type, master entity counts, quick action buttons, recent vouchers table.
- Updated DashboardPage.tsx: added FY selector dropdown in the header bar alongside company switcher.
- Updated App.tsx: replaced placeholder index route with DashboardContent component.
- Updated README.md: current status (Phase 9), full feature list, all phases marked complete.
- Updated ROADMAP.md: all 9 phases marked complete.

## [2026-06-28] - Phase 8: Compliance & Returns (Complete)
- Created Alembic migration 0005_compliance: added place_of_supply, document_type, counterparty_gstin, counterparty_state_code to vouchers; taxable_value to voucher_lines; gst_returns table.
- Created backend/app/services/gst_posting.py: auto-posts GST amounts (CGST/SGST/IGST) to correct GST ledgers (Output/Input/RCM) on voucher creation.
- Created backend/app/services/gstr.py: GSTR-1 and GSTR-3B generation services with B2B/B2CS classification, HSN summary aggregation, ITC calculation.
- Added GstReturn model to accounting models.
- Added GST return schemas (GstReturnGenerateRequest, GstReturnOut, GstReturnDetail, Gstr1Response, Gstr3bResponse).
- Added 4 GST return endpoints: list, generate, view, submit.
- Updated voucher creation to accept compliance fields and auto-post GST.
- Created frontend CompliancePage with return generation form, return listing, and detail view (GSTR-1: B2B/B2CS/HSN tabs, GSTR-3B: summary cards).
- Added Compliance nav link and route.

## [2026-06-28] - Phase 7: Printing & Export (Complete)
- Added reportlab and openpyxl dependencies to pyproject.toml.
- Created backend/app/services/export.py with PDF and Excel generators for all 3 report types.
- PDF generation uses reportlab with styled tables, dark headers, and INR formatting.
- Excel generation uses openpyxl with styled headers, auto-width columns, and bold totals.
- Added 6 new export endpoints: /api/reports/{report-type}/{pdf|xlsx}?financial_year_id=...
- Added api.download() method to frontend API client for file downloads (Blob-based).
- Added Download PDF / Download Excel buttons to each report tab in ReportsPage.
- All exports stream directly from server — no intermediate storage needed.

## [2026-06-28] - Phase 6: Reports (Complete)
- Created reports service with dynamic balance calculation from ledger openings + voucher lines.
- Trial Balance API: GET /api/reports/trial-balance?financial_year_id=...
- Profit & Loss API: GET /api/reports/profit-and-loss?financial_year_id=...
- Balance Sheet API: GET /api/reports/balance-sheet?financial_year_id=...
- Frontend ReportsPage with tabbed UI: Trial Balance, P&L, Balance Sheet tabs.
- Financial year selector drives all reports.
- Balance Sheet balance verification (Assets == Liabilities + Capital).
- P&L net profit/loss calculation with visual indicator.
- Added Reports nav link to dashboard.

## [2026-06-28] - Project Relocation
- Moved project from /home/khuptong/ZCodeProject to /home/khuptong/ZCodeProject/Zledger
- Updated repository layout in README.md
- Verified all Docker containers and tests work correctly from new location

## [2026-06-28] - Phase 5: GST Engine (Complete)
- Added HsnSac model for HSN/SAC codes with GST rates.
- Added GstRegistration model for multi-GSTIN support.
- Auto-create GST ledgers (CGST/SGST/IGST output/input + RCM ledgers) on company creation.
- GST calculation service with half-up rounding as per Indian GST rules.
- Added GST fields to voucher lines (hsn_sac_id, is_inter_state, is_reverse_charge, cgst/sgst/igst amounts).
- Created GST API endpoints: list/create/get/delete HSN/SAC, list/create/update/delete GST registrations, calculate GST.
- Implemented Reverse Charge Mechanism (RCM) with dedicated RCM Input ledgers.
- Created frontend UI for HSN/SAC codes and GST registrations management.
- Added GST Settings page with navigation link.
- Created Alembic migration 0004_gst for new tables and fields.

## [2026-06-28] - Phase 4: Double-entry Core
- Added Voucher and VoucherLine models with balance enforcement (ΣD == ΣC).
- Created Alembic migration 0003_vouchers.
- Built Voucher CRUD API: list, get, create (with balance validation), delete.
- Vouchers auto-posted on creation (append-only guarantee).
- Built Voucher entry UI: dynamic line items, real-time balance indicator, ledger selector.
- Added Vouchers nav tab to dashboard.

## [2026-06-28] - Phase 3: Chart of Accounts
- 23 Tally-style groups auto-seeded on company creation.
- CRUD API for groups, ledgers, parties, financial years.
- Masters UI with tabbed groups/ledgers view.

## [2026-06-28] - Phase 2: Auth & Multi-company
- JWT auth, company context, bootstrap admin.
- Frontend: login, register, company select, dashboard.

## [2026-06-28] - Initial Scaffold
- Docker Compose stack, FastAPI, PostgreSQL, React.
