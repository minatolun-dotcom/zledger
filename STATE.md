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
- **Phase 20: Reports Suite**:
  - Cash Flow Statement (direct method): operating/investing/financing categories, opening/closing cash balance, net increase
  - Aging Analysis: receivables/payables toggle, 0-30/31-60/61-90/90+ day buckets per party
  - Outstanding Report: party-wise debtor/creditor balances with totals
  - Register Report: daybook filtered by voucher type (8 types supported)
  - All 4 reports integrated into ReportsPage tabs with proper frontend rendering

## Demo Data
- **Single comprehensive company**: Apex Enterprises (Maharashtra, GSTIN 27AABCP1234A1Z5)
- **2 Financial Years**: 2024-25, 2025-26
- **19 vouchers** covering all 8 types: 5 sales, 4 purchase, 2 payment, 2 receipt, 1 contra, 3 journal, 1 credit note, 1 debit note
- **5 parties**: 3 customers (incl. 1 inter-state Gujarat), 2 suppliers (incl. 1 inter-state Karnataka)
- **7 stock items** across 3 stock groups, with StockEntry + StockBalance tracking
- **21 ledgers** incl. system GST, control, and party ledgers
- **3 cost centres** (2 actively used across 3 voucher lines)
- **6 units** of measure, **5 e-invoice draft records**
- Opening balance journal, tax-inclusive pricing, intra/inter-state GST scenarios
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
- **Sidebar reorganized**: Accounting-only modules (Masters, Transactions, Reports, Compliance) with collapsible groups. Masters includes nested Company submenu (Company Settings, Financial Years).
- **Profile dropdown**: Admin/settings items (Members, Audit Log, Settings) moved to user avatar popover at sidebar bottom. Superadmin gets Users/Companies in profile menu.
- **Company card redesigned**: Clean layout showing company name, GSTIN (fetched from API), and inline FY selector. Gradient background for visual separation.
- **Global search placeholder** at sidebar top (Ctrl+K / `/` shortcut hint).
- **Visual hierarchy improved**: Better spacing, typography, active/hover states, indented sub-items with left border, disabled "Banking" (future) and "Preferences" (soon) items with badges.
- All existing routes preserved; no functionality broken.

## Dark Mode (In Progress)
- Added `dark:` Tailwind variants to 7 admin/settings pages: MembersPage, AuditLogPage, ProfilePage, CompanySettingsPage, AdminUsersPage, AdminCompaniesPage, BankReconciliationPage
- Added `dark:` Tailwind variants to 4 masters/inventory/finance pages: MastersPage, ChartOfAccountsPage, InventoryPage, FinancialYearsPage
- Added `dark:` Tailwind variants to all 12 voucher pages: index.tsx, VoucherList, VoucherHeader, VoucherFooter, AmountLineTable, ItemLineTable, LedgerLineTable, QuickCreate/Modal, QuickCreate/Select, AmountVoucherForm, ItemVoucherForm, JournalForm
- All existing light mode classes preserved; dark variants added alongside
- Badge patterns (purple, blue, slate) get `dark:bg-{color}-900/30 dark:text-{color}-400`
- Modal shadows get `dark:shadow-slate-800/50`
- Focus ring/border brand colors mapped to `dark:focus:border-brand-400` / `dark:focus:ring-brand-400`

## Next Up
- Phase 21: TDS Integration + Inventory Reports
- Phase 22: Multi-Currency + Tally Import + GSTR-9
- Phase 23: Composition Scheme + Recurring Vouchers
