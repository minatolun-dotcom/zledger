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

### FY Management Enhancements
- **FY overlap validation**: `POST /coa/financial-years` now rejects date ranges overlapping existing FYs
- **FY close/unclose**: `PATCH /coa/financial-years/{id}/close` — toggles `is_closed`. When closing, automatically creates opening balance journal for the next FY (carries forward balance sheet ledgers via Opening Balance Equity)
- **FY closed guard**: Voucher creation (`POST /vouchers`) and update (`PATCH /vouchers/{id}`) blocked if date falls in a closed FY
- **Dashboard FY filter**: Recent vouchers now scoped to the selected FY's date range

## Next Up
- Phase 21: TDS Integration + Inventory Reports
- Phase 22: Multi-Currency + Tally Import + GSTR-9
- Phase 23: Composition Scheme + Recurring Vouchers
