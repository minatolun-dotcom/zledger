# Zledger Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (2026-07-31)
- **Bill-wise Accounting Report Pages** (4 new standalone pages)
  - Customer Statement page: View detailed customer transaction history with date range filtering, opening/closing balance, and export to PDF/CSV
  - Supplier Statement page: View detailed supplier transaction history with date range filtering, opening/closing balance, and export to PDF/CSV
  - Outstanding Bills Report: Drill-down view of all outstanding bills grouped by party, with aging indicators and color-coded status
  - Aging Analysis page: Visual aging distribution with bucket breakdown (0-30, 31-60, 61-90, 90+ days), party-wise breakdown table, and export functionality

### Fixed
- TypeScript type safety improvements across all report pages (proper error handling with `unknown` type, null checks)
- MasterSelector integration in report pages using correct `entityKey` and `options` props

---

## [2026-07-30] - Bill-wise Accounting MVP Complete

### Added
- **Bill-wise Accounting System** (Tally Prime equivalent)
  - Auto-bill creation from Sales/Purchase invoices
  - Outstanding bills calculation with aging buckets (0-30, 31-60, 61-90, 90+ days)
  - Bill settlement UI with real-time validation in Receipt/Payment forms
  - Party statement generation API
  - Aging analysis API
  - Credit/Debit note adjustment support
  - Advance tracking support

### Backend
- `BillReference` model with status tracking (open/partial/paid/cancelled)
- `bill_wise.py` service module: auto-creation, settlement, statements, aging
- `/bills/*` API endpoints: outstanding, settle, statement, credit-note adjustment
- Alembic migration `94d081b56fd4_add_bill_reference.py`

### Frontend
- `BillSelector` component (17.3 KB): Inline bill allocation with aging indicators
- `OutstandingBillsTable` component (13.6 KB): Read-only bill display
- Receipt form integration: Outstanding customer bills with allocation
- Payment form integration: Outstanding supplier bills with allocation
- `bills.ts` API client (4.3 KB)

### Testing
- E2E test suite `bills-api.spec.ts` (17 KB, 9 comprehensive test cases):
  1. Auto-bill creation from Sales invoices
  2. Auto-bill creation from Purchase invoices
  3. Outstanding bills API (customers)
  4. Outstanding bills API (suppliers)
  5. Partial payment settlement
  6. Over-allocation prevention
  7. Party statement generation
  8. Aging calculation
  9. Full payment settlement

---

## Earlier Changes

See git history for changes prior to 2026-07-30.
