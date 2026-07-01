# Project State

## Current Location
- **Path:** /home/khuptong/ZCodeProject/Zledger

## Current Milestone
- **Active Phase:** Indian Accounting Compliance
- **Status:** In Progress

## Completed
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

## Navigation Redesign (Accounting-Focused)
- **Sidebar reorganized**: Accounting-only modules (Masters, Transactions, Reports, Compliance) with collapsible groups. Masters includes Chart of Accounts, Inventory, and nested Company submenu (Company Settings, Financial Years).
- **Profile dropdown**: Admin/settings items (Members, Audit Log, Settings) moved to user avatar popover at sidebar bottom. Superadmin gets Users/Companies in profile menu.
- **Company card redesigned**: Clean layout showing company name, GSTIN (fetched from API), and inline FY selector. Gradient background for visual separation.
- **Global search placeholder** at sidebar top (Ctrl+K / `/` shortcut hint).
- **Visual hierarchy improved**: Better spacing, typography, active/hover states, indented sub-items with left border, disabled "Banking" (future) and "Preferences" (soon) items with badges.
- All existing routes preserved; no functionality broken.

## Dark Mode (Complete — Premium Redesign)
- **Infrastructure**: `darkMode: 'class'` in tailwind.config.js, flash-prevention script in index.html, theme store (`store/theme.ts`) with localStorage persistence.
- **Premium palette**: Layered surfaces — Page `#0a0a0f`, Sidebar `#111118`, Cards `#18181f`, Hover `#1e1e28`, Elevated `#252530`. Violet-500 accent for active nav, focus states, important actions.
- **Typography hierarchy**: Primary `#f1f5f9`, Secondary `#cbd5e1`, Muted `#64748b`. Font sizes: 15px brand, 13px nav/items, 11px metadata.
- **Shadows**: Custom dark shadow scale (`shadow-dark-sm` through `shadow-dark-xl`) with realistic depth.
- **Scrollbars**: Refined dark scrollbars matching the palette.
- **CSS variables**: `--surface-0` through `--surface-4`, `--border-subtle`/`--border-default`, `--text-primary`/`--text-secondary`/`--text-muted`, `--accent`.
- **Toggle**: Dark/Light mode toggle in profile dropdown (sidebar bottom). Respects system preference on first visit.
- **Sidebar**: Premium dark sidebar with gradient brand icon, layered company card, violet accent on active nav, refined hover states. Category headers (Masters, Transactions, Reports, Compliance) are white/bold/uppercase to distinguish from sub-items. Nav items use white hover text for better contrast.
- **All 30+ pages** updated with premium dark palette: auth, dashboard, masters, vouchers, reports, compliance, admin/settings.
- All existing light mode classes preserved; dark variants added alongside.
- **Global dark input fix**: CSS rules for `dark input`, `dark textarea` ensure form elements get dark backgrounds. `color-scheme: dark` on `html.dark` for native browser UI.

## Custom Select Component (All Dropdowns Themed)
- **New `Select.tsx`**: Fully styled custom dropdown replacing all native `<select>` elements. Supports keyboard navigation (arrow keys, Enter, Escape), click-outside close, viewport-aware positioning (opens above if near bottom), checkmark on selected option, hover highlight, smooth transitions. `onChange` passes value directly (not event).
- **All native `<select>` replaced across 25+ files**: InventoryPage, DayBookPage, TdsTcsPage, ReportsPage, MembersPage, GstSettingsPage, AuditLogPage, AdminUsersPage, CompliancePage, EwayBillPage, BankReconciliationPage, EInvoicePage, VoucherHeader, VoucherFooter, QuickCreate/Select, QuickCreate/Modal, VouchersPage, IndianStateSelect, CompanySelectPage, AdminCompaniesPage, CompanySettingsPage, ChartOfAccountsPage, DashboardPage, MastersPage, LedgerForm, GroupForm, ItemLineTable (GST rate). **Zero native selects remaining.**
- **Popup overlay fix**: All popups (Select, Calendar, ContextMenu) now render as overlays that float above everything — Select uses `createPortal` to `document.body`, Calendar and ContextMenu use `position: fixed` with `z-index: 99999`. No more dropdowns hiding behind other elements.

## Completed Phase 22.2: Tally Import
- **Tally XML Parser** (`tally_parser.py`): Parses Tally XML exports — groups, ledgers, parties, stock groups/items, vouchers. Handles both direct and nested ledger entry formats.
- **Tally Importer Service** (`tally_importer.py`): Imports parsed Tally data into the database — creates groups (skipping system groups), ledgers (with group mapping), parties (linked to ledgers), stock groups/items (with opening stock balances), units, and vouchers (with double-entry lines). All operations are idempotent (skip existing records by name).
- **ImportJob model**: `content` Text column for storing raw XML. `created_details` JSON column for tracking created items with IDs. Migration 0024 creates the `import_jobs` table and adds `content`. Migration 0025 adds `created_details`.
- **API endpoints** (`/tally-import`): `POST /upload` (parse XML, return detailed preview with item names), `POST /jobs/{id}/confirm` (execute import, return created_details with IDs), `POST /jobs/{id}/undo` (delete import-created records, safe partial undo), `GET /jobs` (list with history), `GET /jobs/{id}` (detail with counts/errors/created_details).
- **Frontend** (`TallyImportPage.tsx`): File upload with detailed preview (item names, groups, voucher numbers), import history list with status badges (including `undone`), job detail modal showing sectioned item lists, Confirm Import button, Undo Import button with confirm dialog, dark mode support.
- **Sidebar**: Tally Import nav item added under Compliance group with upload icon.

## Next Up
- Phase 22.3: GSTR-9
- Phase 23: Composition Scheme + Recurring Vouchers
