# Roadmap

## Phase 1: Scaffold (Completed)
- Bootable Docker stack
- Health check
- Alembic baseline

## Phase 2: Auth & Multi-company (Completed)
- JWT login/logout
- Company context (multi-company, single-tenant)
- Bootstrap admin from `.env`

## Phase 3: Chart of Accounts (Completed)
- Tally-style groups and ledgers
- Financial years
- Parties and GST registration
- Masters UI

## Phase 4: Double-entry Core (Completed)
- Vouchers with balance enforcement (`Σ debits == Σ credits`)
- Append-only ledger lines
- Voucher entry UI

## Phase 5: GST Engine (Completed)
- CGST/SGST/IGST logic
- HSN/SAC slabs
- Reverse Charge Mechanism (RCM)
- Auto GST ledgers and live tax preview
- Auto-posting GST amounts to ledgers

## Phase 6: Financial Reports (Completed)
- Trial Balance
- Profit & Loss
- Balance Sheet

## Phase 7: Printing & Export (Completed)
- PDF export (reportlab)
- Excel export (openpyxl)
- Frontend download buttons

## Phase 8: Compliance & Returns (Completed)
- GSTR-1 and GSTR-3B
- GST returns API (generate, list, view, submit)
- Compliance fields on vouchers

## Phase 9: Polish & Deploy (Completed)
- Dashboard with summary cards
- Financial Year selector in header
- Documentation update

## Phase 11: E-Invoice (Completed)
- GSTN IRP integration (IRN generation, QR codes)
- AES-256-ECB encryption and token caching
- E-Invoice payload builder (v1.1 schema)
- E-Invoice UI with IRN/QR display and cancellation

## Phase 12: User Management (Completed)
- Member management (add, list, change role, remove)
- Role-based access control (owner, accountant, viewer)
- User profile editing (name, email, password change)
- Superadmin user management (list, update, deactivate)
- Protection rules (owner can't be removed/demoted, last superadmin protection)

## Phase 13: Audit Log (Completed)
- Immutable audit trail for all financial changes
- Track voucher CRUD, settings changes, member actions
- Filter by user, action type, date range
- Frontend audit log viewer

## Phase 14: Bank Reconciliation (Completed)
- Bank statement import (CSV)
- Transaction matching and reconciliation
- Reconciliation report

## Phase 15: TDS/TCS (Completed)
- TDS/TCS sections and rates
- TDS/TCS entries on vouchers
- TDS/TCS return generation

## Phase 16: Inventory (Completed)
- Stock groups and stock items
- Stock entries (inward/outward)
- Valuation method per item (weighted avg, FIFO)

## Phase 17: Voucher Engine + UI Polish (Completed)
- Voucher form overhaul (8 forms → 3 unified forms)
- Quick Create framework (7 entity types)
- Accountant-first UI redesign
- Place of Supply auto-derivation
- Tax-inclusive pricing
- Demo data seed script

## Phase 18: E-Way Bill + Voucher Cancellation (Completed)
- E-Way Bill GSTN API integration (model, client, builder, 6 endpoints)
- E-Way Bill frontend page
- Voucher cancellation with reversal entries
- Cancel button on posted vouchers

## Phase 19: Cost Centres + Stock Valuation (Completed)
- Cost centre allocation on voucher lines
- Cost centre P&L report
- StockBalance model for running inventory valuation
- Weighted average and FIFO calculation engines
- Stock valuation and movement summary reports
- Auto-update stock balances on voucher post

## Phase 20: Reports Suite (Completed)
- Cash Flow Statement
- AR/AP Aging reports
- Party Outstanding report
- Sales/Purchase Register with GST breakup

## Phase 21: TDS Integration + Inventory Reports (Completed)
- TDS auto-deduction on payment vouchers
- Form 16/16A certificate generation
- Stock Summary/Movement/Ageing reports

## Phase 22: Multi-Currency + Tally Import + GSTR-9 (Completed)
- Multi-currency transactions and forex gain/loss (removed — kept as dead columns)
- Tally XML/Excel import/export with undo
- GSTR-9 annual return generation

## Phase 23: Composition Scheme + Recurring Vouchers (Completed)
- Composition dealer GST handling (flat tax rate, skip CGST/SGST/IGST)
- GSTR-4 quarterly return generation
- Recurring voucher templates with CRUD + run-now + process-due
- "Save as Template" button on all voucher forms

## Phase 24: Background Processor + GSTR-2A (Planned)
- Background cron job for recurring template processing
- GSTR-2A auto-population (purchase register)
- GSTR-9C reconciliation statement
