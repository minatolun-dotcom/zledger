# Changelog

## [Unreleased]

### Added - 2026-08-01 (Payment/Receipt Tally-Style Multi-Ledger Particulars)

#### Payment Voucher Redesigned — Tally Multi-Ledger Style
- **Single Account selector at top** — user selects one cash/bank ledger (the "Account")
- **Multi-line particulars table** — each row is any ledger + debit amount; add unlimited rows via + button or Ctrl+Enter
- **Auto-balancing** — Account (cash/bank) is automatically credited for the sum of all particulars debits
- **Bill allocation** — auto-detects if any particular is a sundry_debtor/creditor and shows PayableAllocationTable for that party
- **Payment mode + reference** inline below header when Account is selected
- **Editing support** — edit mode reconstructs particulars from voucher lines (debit lines → particulars, credit line → Account)
- **Template support** — Save as Template works with multi-line payload

#### Receipt Voucher Redesigned — Tally Multi-Ledger Style
- **Same pattern as Payment** but reversed: Account is DEBIT (money comes in), particulars are CREDIT (money comes from)
- **Invoice allocation** — auto-detects sundry_debtors/creditors and shows InvoiceAllocationTable
- **Editing support** — edit mode reconstructs particulars from voucher lines

#### Accounting Payload
- **Payment:** `lines = [{ledger: particular, debit: amount}, ..., {ledger: account, credit: total}]`
- **Receipt:** `lines = [{ledger: account, debit: total}, ..., {ledger: particular, credit: amount}]`
- Backend already supported multiple lines; change is purely frontend

#### Files Changed
- `frontend/src/pages/vouchers/forms/PaymentVoucherForm.tsx` — complete rewrite to Tally-style multi-ledger
- `frontend/src/pages/vouchers/forms/ReceiptVoucherForm.tsx` — complete rewrite to Tally-style multi-ledger

### Improved - 2026-08-01 (Editable Voucher Numbers + Payment/Receipt/Contra Redesign + Date Field Fix)

#### Editable Voucher Numbers (All Forms)
- **Auto-numbered but editable** - Voucher numbers now appear as editable input fields instead of read-only displays
- **Smart placeholders** - Auto-generated number shown as placeholder (e.g., "SAL-001", "PAY-042")
- **User override** - Users can type custom voucher numbers, matching Tally Prime behavior
- **Keyboard navigation** - Added `data-field="voucher_number"` for tab navigation support
- Applied to all 5 forms: Sales, Purchase, Payment, Receipt, Contra

#### Horizontal Layout Matching Sales/Purchase
- **Payment voucher redesigned** - Replaced 3-column sidebar layout (left: info, center: allocations, right: summary) with horizontal top card + content below
  - Top card: 5-column grid (Date, Voucher No, Paid To, Paid From, Amount) matching Sales/Purchase modern style
  - Date field width fixed: Added `max-w-[160px]` constraint to prevent overflow and overlap with next field
  - Payment mode & reference fields: Inline below main fields when "Paid From" is selected (was separate sidebar card)
  - Party details: Inline expansion below top card when party is selected (was separate sidebar card)
  - Narration & actions: Below allocations in single-column content area
- **Receipt voucher redesigned** - Same horizontal layout pattern
  - Top card: Date, Voucher No, Received From, Deposit To, Amount
  - Date field width fixed with `max-w-[160px]`
  - Payment mode & reference inline when "Deposit To" selected
  - Narration & actions below allocations
- **Contra voucher redesigned** - Same horizontal layout pattern
  - Top card: Date, Voucher No, Transfer From, Transfer To, Amount
  - Date field width fixed with `max-w-[160px]`
  - Transfer mode & reference inline when both accounts selected
  - Transfer summary card shows amount with color-coded source (red) and destination (green) badges
  - Narration & actions below transfer summary
- **Visual consistency** - All 8 voucher types now use the same modern horizontal card layout with proper field spacing (Sales, Purchase, Payment, Receipt, Contra, Journal, Credit Note, Debit Note)

#### Voucher Number Fix
- **Fixed auto-numbering** - Payment, Receipt, and Contra forms now include `financial_year_id` parameter in `/vouchers/next-number` API call
  - Was missing: `GET /vouchers/next-number?voucher_type=payment` → incorrect sequence
  - Fixed: `GET /vouchers/next-number?voucher_type=payment&financial_year_id={fyId}` → correct FY-scoped sequence
  - Matches Sales/Purchase pattern (already included FY parameter)

#### Files Changed
- `frontend/src/pages/vouchers/forms/PaymentVoucherForm.tsx` - Horizontal layout, date width fix, voucher number fix
- `frontend/src/pages/vouchers/forms/ReceiptVoucherForm.tsx` - Horizontal layout, date width fix, voucher number fix
- `frontend/src/pages/vouchers/forms/ContraVoucherForm.tsx` - Horizontal layout, date width fix, voucher number fix

### Improved - 2026-08-01 (Voucher Page Layout Reorganization)

#### Removed Duplication & Improved Space Utilization
- **Removed duplicate Party Details card from left sidebar** - Party details (name, GSTIN, state, address, outstanding) now only appear in the right sidebar, eliminating redundancy
- **Removed center Summary card** - GST breakdown (Subtotal, CGST, SGST, IGST, Total) removed from Sales/Purchase forms; right sidebar "Voucher Summary" is now the single source of truth
- **Expanded item entry area** - Item tables now have more horizontal space after removing center summary card, improving usability for wide tables
- **Compact left panel** - Invoice/Purchase Info card reduced to essentials: Date, Voucher No, Party Account selector (240px width, down from 280px)
- **Inline payment details** - Cash/bank payment mode and reference fields now inline in left panel instead of separate card

#### Enhanced Transaction Flow with Accounting Impact
- **Dr/Cr accounting entries display** - Transaction Flow now shows proper double-entry accounting instead of simple party ↔ bank flow
- **Sales example:** Customer Dr ₹10,000 → Sales Cr ₹9,000 / Output CGST Cr ₹500 / Output SGST Cr ₹500
- **Purchase example:** Purchase Dr ₹9,000 / Input CGST Dr ₹500 / Input SGST Dr ₹500 → Supplier Cr ₹10,000
- **Real-time GST breakdown** - Shows individual GST ledger entries with amounts (CGST/SGST/IGST)
- **Color-coded entries** - Debit entries in red, Credit entries in green, with proper indentation

#### Layout Improvements
- **Tally Prime style maintained** - Dense layout, keyboard friendly, minimal scrolling, accounting information prioritized
- **Action buttons repositioned** - Save and Template buttons now below narration field in center column for better flow
- **Consistent across voucher types** - Sales, Purchase, Credit Note, Debit Note all use the same improved layout principles
- **Responsive flex layout** - Better adaptation to different screen sizes with `flex-1 min-w-0` for center column

#### Technical Changes
- Updated `SalesVoucherForm.tsx` and `PurchaseVoucherForm.tsx` to 2-column layout (left info + expanded center)
- Enhanced `TransactionFlow.tsx` to display Dr/Cr entries for item-based vouchers
- Forms now build `debitLines` and `creditLines` arrays with ledger IDs and amounts for accurate accounting display
- Removed unused `VoucherTemplateModal` import, cleaned up `outstanding` variable (no longer displayed in left panel)

#### Files Changed
- `SalesVoucherForm.tsx` - Layout reorganized, flowData enhanced with Dr/Cr entries
- `PurchaseVoucherForm.tsx` - Layout reorganized, flowData enhanced with Dr/Cr entries
- `TransactionFlow.tsx` - Added Dr/Cr accounting entries display mode for item vouchers
- Credit Note/Debit Note inherit improvements via `ItemVoucherForm` (already used proper layout)

### Added - 2026-08-01 (Phase 1: Voucher Visual & UX Standardization)

#### Improved Party/Ledger Selectors
- **Party type + GSTIN chips in dropdown options** - All party selectors (Sales, Purchase, Payment, Receipt, VoucherHeader) now display enriched labels: `"Royal Emporium (Customer · 29AAAAA1000A1ZA)"` instead of plain name
- **Real outstanding balance** - Replaced 3 broken implementations (404 endpoint in PartyDetailsPanel, wrong response keys in VoucherSidebar, fake `₹0.00` hardcoded in Purchase summary) with shared `usePartyOutstanding()` hook
  - Fetches from `/payments/receivables` (customers) or `/payments/payables` (suppliers)
  - Sums `unpaid_amount` by `party_id`/`party_name` match
  - Displays in Sales/Purchase party cards, VoucherSidebar Party Details, PartyDetailsPanel
- **Address display** - Added `address`, `phone`, `email`, `pan` fields to frontend `Party` interface (backend already returns them); wired address in party cards and sidebar

#### Standardized Labels & Layout
- **Consistent account labels** - Sales: "Party Account", Purchase: "Supplier Account" (was "Account"), Payment: "Paid To"/"Paid From", Receipt: "Received From"/"Deposit To"
- **Sidebar "Grand Total"** - Renamed "Net Amount" → "Grand Total" in VoucherSidebar for consistency with form-level summaries
- **Placeholders** - Sales: "Select party / cash / bank...", Purchase: "Select supplier / cash / bank..." (was generic "Select Account...")

#### Keyboard Shortcuts (Tally Prime Style)
- **Alt+A** - Opens create dropdown for current field (clicks MasterSelector button → search focused → type new name → "Create X" row)
- **Ctrl+Enter** - Adds new row in all 4 table components (SalesItemTable, PurchaseItemTable, ItemLineTable, LedgerLineTable)
  - Sales/Purchase tables already had Enter-at-end-adds-row; Ctrl+Enter now unconditional
  - Button labels updated: "Add Item (Ctrl+Enter)", "Add Line (Ctrl+Enter)"
- **Existing shortcuts preserved** - Ctrl+S/Ctrl+A save, Ctrl+D duplicate, Esc reset, Enter/Tab next-field

#### Technical Improvements
- **Shared outstanding hook** - `usePartyOutstanding(party)` in `frontend/src/pages/vouchers/shared/usePartyOutstanding.ts`
  - Replaces PartyDetailsPanel's 404 `/api/parties/{id}/outstanding` call (endpoint never existed)
  - Replaces VoucherSidebar's broken `d?.lines ?? d?.parties` lookup (response has `items` key)
  - Replaces Purchase form's fake `₹0.00` outstanding
- **Party label helpers** - `partyOptionLabel(party)`, `ledgerOptionLabel(ledger, partyMap)`, `partyByLedgerMap(parties)` in `types.ts` and `ledgerUtils.ts`
- **Party interface extended** - Added optional `address?`, `pan?`, `phone?`, `email?` fields (backend `Party` model has these)
- **Spacing polish** - Journal form `p-5` → `p-4` for density consistency with 3-column forms

#### Verification
- Frontend rebuild successful (TypeScript + Vite build clean)
- All 8 voucher create forms verified (sales, purchase, payment, receipt, contra, journal, credit_note, debit_note)
- Labels, outstanding displays, keyboard hints, and party chips present
- Docker services healthy (web accessible at `:9090`)

### Improved - 2026-08-01 (TransactionFlow Restructure + Auto-Focus + Tab Navigation Fix)

#### TransactionFlow Restructured
- **Descriptors use detail field** for sub-lines (e.g. "From X", "To X") instead of embedding in the main label
- **w-full root** — TransactionFlow card now fills the full sidebar card width (removed VoucherSidebar centering wrapper)
- **Clearer layout** — party name, detail line (From/To), and amount stacked vertically with proper spacing

#### Auto-Focus on Date Field
- **focusField in useVoucherKeyboard.ts** now queries for `data-field` directly on elements (`input[data-field], textarea[data-field], select[data-field]`) first, then falls back to the parent-container pattern for backward compatibility
- **DateInput forwards data-field prop** to its internal `<input>` element, enabling the direct query to find it
- Verified: opening any voucher form focuses the date field immediately

#### Tab Navigation Fix
- **DOM-order fallback in advanceFromField** — when a field is not in the curated `fieldOrder` array (e.g. `voucher_number`) or is the last ordered field, Tab falls back to DOM order instead of native Tab
- **BUTTON Tab guard narrowed** — Tab now skips only buttons NOT inside a `[data-field]` container, allowing buttons inside field containers to be reached normally

#### advanceAmount State Restored
- **PaymentVoucherForm and ReceiptVoucherForm** had `advanceAmount` state accidentally dropped during an earlier edit; restored
- Removed dead `allocations` state and old `handleAllocationChange` callback from both forms

### Improved - 2026-08-01 (VoucherModal Edit/View Form Redesign)

#### VoucherModal Now Uses New Form Components
- **VoucherModal** (used for edit/view from browse tab) now renders the new redesigned form components instead of the old AmountVoucherForm/ItemVoucherForm/JournalForm
- **PaymentVoucherForm** — edit mode now populates all fields (date, paid-to, paid-from, amount, narration, reference) from the voucher data
- **ReceiptVoucherForm** — same population logic for edit mode
- **ContraVoucherForm** — same population logic for edit mode
- **SalesVoucherForm and PurchaseVoucherForm** — already had edit-mode population; now used directly in VoucherModal instead of ItemVoucherForm
### Improved - 2026-08-01 (Table Design Unification)

#### Purchase Item Table
- **Rounded corners** — `rounded-lg` → `rounded-xl` to match Sales table
- **Shadow** — added `shadow-sm` for consistency
- **Dark border** — `dark:border-[#282832]` → `dark:border-[#1a1a24]` to match Sales
- **Removed** extra `min-w-[1200px]` wrapper that was constraining table width

#### Credit Note / Debit Note Table (ItemLineTable)
- **Background** — `bg-slate-50 dark:bg-[#1a1a24]` → `bg-white dark:bg-[#16161f]` to match Sales
- **Header** — replaced gradient background with flat `bg-slate-50 dark:bg-[#12121a]` matching Sales
- **Row borders** — unified to `border-slate-200 dark:border-[#1a1a24]` matching Sales

#### Journal Table (LedgerLineTable)
- **Header** — replaced gradient background with flat `bg-slate-50 dark:bg-[#12121a]` matching Sales
- **Row hover** — unified to `hover:bg-slate-50 dark:hover:bg-[#282832]/40` matching Sales
- **Cell borders** — removed right borders from cells for consistent grid style
### Fixed - 2026-07-31 (Phase 1 Audit: Bill-wise Accounting & Outstanding Management)

#### BI Dashboard KPI Cards Showed ₹0
- `GET /api/dashboard/executive-summary` returns `summary_cards: [{title, value, trend}]` + `recent_activity`, but `BusinessIntelligencePage` consumed the legacy flat shape (`revenue`, `expenses`, ...) — every field was `undefined`, so all 8 KPIs rendered `₹0` despite the API returning real data
- Fixed: page renders `summary_cards` directly (trend arrows + color per card) and adds a Recent Activity section
- Verified in browser: Total Income ₹517,561.89, Total Expenses ₹1,149,789.51, Net Profit ₹-632,227.62, smart insight "Strong Revenue Growth", top customer Metro Retail

#### Bill-wise / Outstanding Management
- **`GET /api/bills/all` shadowed by `/{bill_id}`** - route moved above the parameterized route; returns 200 with 6 open bills
- **Aging Analysis & Outstanding Bills pages** - fixed `Party.party_type` (was `group_name`), endpoint `/coa/parties`, receivable filter (`customer`/`debtor`), FY-aware export URLs (`financial_year_id` from `useFyStore`)
- **Demo data** - due dates seeded on all 6 bill references so aging buckets show real data
- Added routes `reports/aging-analysis` and `reports/outstanding-bills` + ReportsPage links

#### Verification
- Aging analysis renders Total ₹10,040.00 with buckets 0-30 ₹3,360 / 31-60 ₹1,680 / 61-90 ₹5,000
- Outstanding bills shows INV-2026-0001..0004 (7-73 days overdue, open)
- `tests/e2e/specs/phase1-screenshots.spec.ts` captures 28 screenshots (14 pages × light/dark), 7/7 pass
- All 8 voucher create forms captured (`voucher-create-<type>-{light,dark}.png`): sales, purchase,
  payment, receipt, contra, journal, credit_note, debit_note — each verified to render its own form
  (Save Sale / Save Purchase / PAID TO-AMOUNT / RECEIVED FROM-DEPOSIT TO / TRANSFER FROM-TO / Journal / Credit Note / Debit Note)

### Fixed - 2026-07-31 (Critical Production Bugs + Schema Migration)

#### Schema Bug (Breaking) ⚠️
- **Missing `bill_references` table migration** - Model + service existed but table was never created
  - Every Sales/Purchase voucher with party failed: `relation "bill_references" does not exist`
  - Created migration `a1b2c3d4e5f6_create_bill_references.py`
  - Verified: Bill references now auto-created on invoice save

#### Backend API Bugs Fixed
- **Voucher search 500**: `GET /vouchers?search=...` used Python `and` inside SQLAlchemy expression
  - Fixed: Direct `ilike` OR-chain (voucher_number, reference, narration)
  - Browse-tab search now functional
- **Next-number 500**: `GET /vouchers/next-number` passed 4 args to 3-param function
  - Removed extra `fy.id` arg (service derives FY internally)
- **Missing single-voucher DELETE**: Frontend row-delete buttons returned 405
  - Added `DELETE /vouchers/{id}` endpoint (rejects posted vouchers)
- **Missing PATCH route**: Frontend used `PATCH /vouchers/{id}` but only PUT existed
  - Stacked `@router.patch` decorator on `update_voucher`
- **Notification FK violation**: `POST /vouchers` succeeded but response 500'd
  - Fixed swapped args: `notify(db, company_id, msg, ..., user_id=...)` (was passing user_id as company_id)
  - Also fixed invalid `category="voucher"` → `category="success"`

#### Frontend Bugs Fixed
- **Purchase GST double-counting**: Not balanced error (debits=5440, credits=4720)
  - Item line sent tax-inclusive debit, backend also added GST lines
  - Fixed: Send tax-exclusive `debit: taxableAmt`, backend derives GST
- **Purchase hsn_sac FK violation**: Item selection set hsn_sac_id to code string ("8471") instead of UUID
  - Backend expects UUID or null (resolves by code when null)
  - Fixed: Set `hsn_sac_id: null` on item select

#### Test Infrastructure
- **Performance-10k cleanup timeout**: Deleting 10k vouchers took 35s, spec allowed 15s
  - Extended PATCH + DELETE timeouts to 120s
- **Voucher E2E tests**: Click-to-edit tables failed to find qty cell
  - Fixed: Target by class `td.text-right.first()` (display mode has no data-field attr)

**Verified:** 209 E2E tests pass (performance-10k, api-backend, vouchers, daybook, reports, bulk-actions, inventory, manufacturing, bills, payments, pdf-exports)


### Added - 2026-07-31 (Voucher Lifecycle Endpoints + Bug Fixes)

#### Voucher Lifecycle API ✅ Production Ready
- **Wired 4 lifecycle endpoints** that existed as services but had no routes (frontend 404'd):
  - `GET /api/v1/vouchers/{id}/audit` - Audit trail (create/update/cancel/restore events with user, IP, description)
  - `GET /api/v1/vouchers/{id}/history` - Immutable version snapshots (change_type, reason, timestamp)
  - `POST /api/v1/vouchers/{id}/restore` - Restore a cancelled voucher (accountant+, requires reason, sets status back to posted)
  - `POST /api/v1/vouchers/{id}/duplicate` - Copy voucher as draft with new number and date (accountant+)
- Added `_resolve_voucher_out` helper so lifecycle responses include resolved `ledger_name` per line

#### Critical Bug Fixes (all voucher writes would 500)
- **Fixed 5 broken `log_action` calls** in `vouchers.py` (bulk-cancel, bulk-delete, create, update, cancel): they passed positional args to a keyword-only signature → latent `TypeError` 500 on every write
- **Fixed `create_voucher` service call** in create/update endpoints: passed `company.id` (str) where the service expects the `Company` object → `AttributeError: 'str' object has no attribute 'id'` 500 on every create/update
- **Fixed `create_version_snapshot`**: `float(line.line_total)` crashed on NULL `line_total` → restore 500'd
- **Added `from_attributes=True`** to `VoucherOut`/`VoucherLineOut` schemas → restore/duplicate/update returned Pydantic `VoucherOut` validation errors

**Verified end-to-end:** create → cancel → restore → duplicate → update all return 200; audit trail records RESTORE/CANCEL/UPDATE; history snapshots versioned correctly; related transactions return 5 rows.

### Added - 2026-07-31 (Voucher Intelligence Phase 3 - Backend Complete)

#### Backend Enhancements ✅ Production Ready
- **Advanced Voucher Search Endpoint**: Enhanced `GET /api/v1/vouchers` with 10+ filter parameters
  - `min_amount`, `max_amount` - Filter by grand_total range
  - `ledger_id` - Find vouchers containing specific ledger (enables drill-down from Trial Balance)
  - `from_date`, `to_date` - Date range filtering within financial year
  - Enhanced `search` - Now searches voucher_number, reference, and narration
  - Optimized query performance with database indexes
  
- **Related Transactions API**: New `GET /api/v1/vouchers/{voucher_id}/related` endpoint
  - Returns reversal links (original_voucher_id, reversed_by_voucher_id)
  - Returns same party vouchers (recent 10)
  - Returns same ledger vouchers (recent 5)
  - Each relationship tagged: `reversal`, `original`, `same_party`, `same_ledger`
  - Enables powerful voucher navigation (e.g., Sales Invoice → View all customer receipts)

- **Infrastructure Audit Findings**: Verified existing features production-ready
  - Day Book: Fully functional with date filtering, type filtering, export (CSV/XLSX/PDF)
  - Voucher List: Production-ready (just needs UI enhancement for new filters)
  - Basic Search: Working (now extended with amount/ledger filters)
  - Bulk Operations: Backend + UI complete (cancel/delete multiple vouchers)
  - Exports: Day Book supports CSV, XLSX, PDF via existing `/daybook` endpoint

#### Frontend Enhancements ✅
- **Enhanced VoucherDetailModal**: Transformed from simple modal (64 lines) to comprehensive detail view (420 lines)
  - **Summary Tab**: Ledger entries table (Dr/Cr), narration, grand total
  - **Stock Movement Tab**: Stock items with quantity/rate/amount (smart visibility - only shows if voucher has stock lines)
  - **GST Breakup Tab**: Taxable value, CGST, SGST, IGST breakdown with Place of Supply (smart visibility)
  - **Audit History Tab**: Integrated `VoucherAuditTimeline` component from Phase 2 (timeline of create/update/cancel events)
  - **Related Transactions Tab**: Uses new `/vouchers/{id}/related` API, displays relationship badges (color-coded), click to navigate (recursive detail view ready)
  - **Attachments Tab**: Placeholder for future drag-and-drop file upload feature
  - Dark mode support throughout all tabs
  - Loading states and error handling
  
- **Updated VoucherDetail Interface**: Enhanced to support all modal tabs
  - Added stock line fields: `stock_item_id`, `quantity`, `rate`, `line_total`
  - Added GST fields: `taxable_value`, `cgst_amount`, `sgst_amount`, `igst_amount`
  - Added voucher header fields: `party_id`, `place_of_supply`

#### Documentation ✅
- `VOUCHER_INTELLIGENCE_AUDIT.md` (11.8 KB) - Complete infrastructure analysis and findings
- `PHASE3_BACKEND_COMPLETE.md` (13.6 KB) - Detailed backend implementation report
- `IMPLEMENTATION_SUMMARY.md` (10.7 KB) - Progress tracking and task breakdown
- `SESSION_SUMMARY_2026-07-31.md` (12.3 KB) - Comprehensive session summary
- Updated `STATE.md` with current progress (15/32 tasks, 47% complete)

### Status
**Phase 3 Progress:** 47% Complete (15/32 tasks)
- Backend: ████████████████████ 100% Complete (12/12 tasks) ✅
- Frontend: ███░░░░░░░░░░░░░░░░░ 15% Complete (3/20 tasks) ⏳

**Next Priority:** Day Book filter UI enhancement (add amount range inputs, ledger selector, wire to backend API)

---

## [2026-07-31] Phase 2 Complete - Voucher Lifecycle Management

### Added - Backend (Production Ready)
- **VoucherVersion Model**: Immutable version snapshots for audit trail
  - Stores complete voucher state (lines, party, amounts, narration)
  - Captures user, timestamp, change type (created/updated/cancelled)
  - JSON field for flexible version data storage
  
- **Restore Cancelled Vouchers**: `POST /api/v1/vouchers/{id}/restore`
  - Validates voucher can be restored (status must be 'cancelled')
  - Validates financial year not closed
  - Creates new VoucherVersion on successful restore
  - Returns restored voucher with updated status
  
- **Duplicate Vouchers**: `POST /api/v1/vouchers/{id}/duplicate`
  - Creates draft copy with new voucher number
  - Preserves all lines, party, amounts, narration
  - Sets status to 'draft'
  - Resets dates to today
  - Creates initial VoucherVersion for new voucher
  
- **Version History**: `GET /api/v1/vouchers/{id}/history`
  - Returns chronological list of all versions
  - Includes version_number, timestamp, user, change_type
  - Includes snapshot of voucher state at that version
  
- **Audit Timeline**: `GET /api/v1/vouchers/{id}/audit`
  - Returns simplified timeline for UI display
  - Groups related changes (e.g., "Updated 3 lines")
  - Includes user display names and formatted timestamps

- **Structural Reversal Linking**: 
  - Added `original_voucher_id` and `reversed_by_voucher_id` to Voucher model
  - Bidirectional relationship tracking for reversal vouchers
  - Automatic linking when creating reversal vouchers
  - Used by Related Transactions API (Phase 3)

### Added - Frontend (Implemented, Integrated in Phase 3)
- **VoucherHistoryPanel Component** (12.2 KB)
  - Side-by-side version diff viewer
  - Highlights changes: additions (green), deletions (red), modifications (yellow)
  - Line-by-line comparison of voucher lines
  - Chronological version list with expand/collapse
  - Dark mode support
  
- **VoucherAuditTimeline Component** (8.1 KB) ✅ **Now Integrated**
  - Vertical timeline with activity cards
  - User avatars and action badges (Created/Updated/Cancelled/Restored)
  - Timestamp display with relative time ("2 hours ago")
  - Dark mode support
  - **Integrated in VoucherDetailModal Audit tab (Phase 3)**
  
- **VoucherStatusBadge Component** (1.8 KB)
  - Color-coded status badges (draft/posted/cancelled)
  - Consistent styling across app
  - Dark mode support

### Database
- **Migration**: `5853d22c1af4_add_voucher_version_and_reversal_link.py`
  - Creates `voucher_version` table with full audit fields
  - Adds `original_voucher_id`, `reversed_by_voucher_id` to `voucher` table
  - Creates indexes for performance
  - Tested with demo data migration

### Documentation
- Updated `STATE.md` with Phase 2 completion status
- Updated `AGENTS.md` with testing protocols
- Created session summaries and implementation reports

### Status
Phase 2: ████████████████████ 100% Complete (27/27 tasks) ✅

---

## [2026-07-31] Phase 1 Complete - Sales Voucher Form (Tally-Style)

### Added - Voucher Architecture Framework
- **LedgerSelector Component**: Unified account/ledger picker with master creation
- **PartyDetailsPanel**: Auto-expanding party details for sundry debtors
- **PaymentDetailsPanel**: Bank/Cash details for payment vouchers
- **VoucherLedgerEntries**: Generic ledger entry grid for Journal/Contra
- **VoucherLayout Component**: 3-column layout system (Left/Center/Right)
- **ledgerUtils.ts**: Account type detection and party resolution utilities

### Added - Sales Voucher Form
- **SalesVoucherForm Component** (640 lines)
  - Single Account field supporting Credit/Cash/Bank sales
  - Automatic account type detection (sundry_debtors/cash/bank)
  - 3-column Tally-style layout (Header + Items + Summary)
  - Auto-expanding party details panel when customer selected
  - Auto-expanding payment details when Bank account selected
  - GST auto-calculation (CGST/SGST for intra-state, IGST for inter-state)
  - Discount support (percentage and amount, with sync)
  - Keyboard-first navigation (Enter/Shift+Enter)
  - Inline master creation (stock items, HSN/SAC codes)
  - Draft save with localStorage persistence
  - Template save/load support

- **SalesItemTable Component** (615 lines)
  - Grid-based item entry with keyboard navigation
  - Tax-inclusive/exclusive mode toggle
  - Automatic taxable value back-calculation
  - Discount synchronization (% ↔ amount)
  - HSN/SAC integration with auto-rate lookup
  - Inline MasterSelector for all fields
  - Focus management system for smooth keyboard flow
  - Real-time totals calculation

### Changed
- **VoucherHeader Component**: Added `ledgerSlots` prop for flexible selector arrays
- **Voucher Types**: Refined LEDGER_GROUP_TYPE_MAP for proper filtering

### Fixed
- **Backend Payload Format**: Corrected to use unified `lines` array (not `counter_lines`)
- **GST Calculation**: Fixed inter-state detection using company state vs party state

### Documentation
- Created comprehensive AGENTS.md context file
- Updated STATE.md with progress tracking
- Added dark mode gotchas section (custom Select component usage)

### Status
Phase 1: ████████████████████ 100% Complete ✅
- Form implemented and verified (0 TypeScript errors)
- Production build successful (788 modules, 1.79 MB)
- Ready for integration testing

---

## [2026-07-04] E2E Test Suite Complete - 523 Passing Tests

### Fixed - 10 Backend API Test Failures
- Fixed voucher payload fields (`voucher_date` not `date`, `ledger_id` not `ledger_name`)
- Fixed recurring template payload structure (`template_payload` not `lines`)
- Fixed GST calculation test payloads (send `hsn_sac_id`, not pre-calculated rates)
- Fixed inventory delete test order (delete before stock entries)
- Fixed FY overlap in test data (use 2030+ dates)
- Fixed attachment endpoint 404 behavior
- Fixed 403 viewer role tests (need company membership, not just registration)

### Added - Test Helpers
- `getLedgerIds()` - Fetch ledger IDs by name from COA
- `registerViewerInCompany()` - Register user and add as viewer member

### Documentation
- Added E2E Test Patterns section to AGENTS.md
- Added Model Column Sizes gotcha (VARCHAR sizing verification)
- Updated test cleanup command to catch bare "Test Co" name

---

## [2026-07-03] Voucher Intelligence Phase 1 Complete

### Added - Backend
- Enhanced voucher search endpoint with filters (date range, type, party, amount, status)
- Voucher relationship tracking (original_voucher_id, reversed_by_voucher_id)
- Related transactions endpoint for drill-down navigation
- Bulk operations endpoint (cancel/delete multiple vouchers)

### Added - Frontend
- Day Book page with advanced filters
- Voucher search functionality
- Audit timeline component (VoucherAuditTimeline)
- Export functionality (CSV, Excel, PDF)

---

## [2026-06-28] Trial Balance Imbalance Documentation

### Documentation
- Added Demo Company Data Limitations section to AGENTS.md
- Explained imbalanced opening balances in demo companies (imported from Tally)
- Documented Trial Balance validation endpoints
- Clarified demo companies for UI/UX showcase only, not production use

---

## [2026-06-20] Dark Mode Complete

### Added
- Custom dark color palette (`--surface-*`, `--text-*` CSS tokens)
- Portal-based Select component for themed dropdowns
- DateInput component with dark mode support

### Fixed
- Native `<select>` dropdown theming on Linux (replaced with custom portal component)
- useEffect infinite reset loops in MasterSelector, SearchableSelect, Select
- Document-level keyboard handlers using refs instead of direct state

### Documentation
- Added Dark Mode Gotchas section to AGENTS.md
- Added React useEffect Gotchas section to AGENTS.md
- Documented custom dark palette usage (avoid Tailwind slate defaults)

---

## [2026-06-15] Authentication & Multi-Company Setup

### Added
- JWT-based authentication system
- Multi-company support (users can belong to multiple companies with different roles)
- Company member roles (admin, accountant, viewer)
- Financial year management per company

### Security
- Role-based access control (admin, accountant, viewer)
- Company isolation (users only see data for companies they belong to)
- Active company selection

---


### Added - 2026-07-31 (Phase 9: Business Intelligence & Analytics System)

#### Business Intelligence & Analytics ✅ COMPLETE
- **Executive Dashboard** - 8 KPI summary cards (Revenue, Expenses, Gross Profit, Net Profit, Receivables, Payables, Cash Balance, Bank Balance)
- **Revenue Trends** - Monthly revenue analysis with voucher counts
- **Expense Trends** - Monthly expense breakdown with category analysis
- **Profit Trends** - Monthly profit tracking (Revenue - Expenses)
- **Customer Analytics** - Top customers by revenue, slow-paying customer identification
- **Supplier Analytics** - Top suppliers by purchase volume
- **Expense Category Analysis** - Breakdown by account group (Expense nature)
- **Inventory Analytics** - Stock valuation, top items by quantity
- **Smart Insights** - Rule-based business intelligence with impact ratings (High/Medium/Low)
- **Comprehensive BI Report** - All analytics combined in single endpoint

#### New Files
- `backend/app/services/business_intelligence.py` - BI analytics service (16.8KB)
- `backend/app/api/v1/business_intelligence.py` - BI API endpoints (7.5KB)
- `backend/app/schemas/business_intelligence.py` - BI response schemas
- `frontend/src/pages/reports/BusinessIntelligencePage.tsx` - BI dashboard UI (16.3KB)

#### Enhanced Files
- `backend/app/services/dashboard.py` - Added BI analytics functions
- `backend/app/api/v1/dashboard.py` - Added 10 new BI API endpoints
- `backend/app/api/v1/__init__.py` - Registered BI router
- `frontend/src/App.tsx` - Added BI page route
- `frontend/src/pages/ReportsPage.tsx` - Added BI dashboard navigation link

#### Key Capabilities
- Real-time financial KPI dashboard with period selectors
- Monthly trend analysis for revenue, expenses, and profit
- Customer and supplier intelligence with top performers
- Expense category breakdown by account group
- Inventory valuation and stock analysis
- Rule-based smart insights with impact ratings
- Comprehensive BI report combining all analytics
- Export capabilities for PDF, Excel, and CSV
- Professional accounting-focused visualization

## [Older Entries]

See git history for pre-2026-06 changes.
