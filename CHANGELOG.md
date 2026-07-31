# ZLedger Changelog

All notable changes to this project will be documented in this file.

## [2026-07-31] Voucher Intelligence Phase 3 - Backend Complete

### Backend API Enhancements
**Advanced Voucher Search & Navigation**

#### New Features
- **Advanced Filtering** - Enhanced `/api/v1/vouchers` endpoint with:
  - `min_amount`, `max_amount` - Filter by grand_total range
  - `ledger_id` - Find vouchers containing specific ledger
  - `from_date`, `to_date` - Date range filters
  - `party_id`, `user_id`, `status` - Party/creator/status filters
  
- **Related Transactions Endpoint** - New `/api/v1/vouchers/{id}/related`:
  - Returns vouchers related via reversal links (`original_voucher_id`, `reversed_by_voucher_id`)
  - Shows other vouchers for same party (recent 10)
  - Shows vouchers using same ledgers (recent 5 per ledger)
  - Each result includes relationship type: `reversal`, `original`, `same_party`, `same_ledger`

#### Infrastructure Analysis
- Audited existing Day Book implementation - **fully functional**
- Audited voucher list/browse - **production ready**
- Audited search functionality - **working, now enhanced**
- Identified missing features for upcoming frontend work

**Files Changed:**
- `backend/app/api/v1/vouchers.py` (19.1 KB) - Enhanced list endpoint + related transactions

**Documentation:**
- `VOUCHER_INTELLIGENCE_AUDIT.md` (11.8 KB) - Complete analysis of existing infrastructure
- `STATE.md` - Updated with Phase 3 progress

### What's Next
**Frontend Enhancements (Phase 3 continued):**
- Enhance VoucherDetailModal with tabs (Stock, GST, Audit, Related)
- Add keyboard navigation system
- Create dedicated Register pages
- Add quick actions menu

---

## [2026-07-31] Voucher Lifecycle Management Phase 2 - Complete

### Backend Features (Production Ready)
- VoucherVersion model for immutable snapshots
- Restore cancelled vouchers with validation
- Duplicate vouchers as drafts
- Structural reversal linking
- 4 lifecycle API endpoints

### Frontend Components (Built, Integration Pending)
- VoucherHistoryPanel (12.2 KB) - Version diff viewer
- VoucherAuditTimeline (8.1 KB) - Activity timeline
- VoucherStatusBadge (1.8 KB) - Status indicators

**Status:** Backend production-ready. Frontend components exist but not yet wired into UI (deferred to focus on navigation first).

---

## [2026-07-29] Voucher Architecture Refactor

### Features
- Tally-style ledger-driven voucher architecture
- Shared components: `LedgerSelector`, `PartyDetailsPanel`, `PaymentDetailsPanel`, `VoucherLayout`
- Fixed dark mode dropdown issues (portal-based Select component)
- Fixed React useEffect infinite loops in selectors
- Refactored `SalesVoucherForm` with unified `lines` array payload

---

## [2026-07-28] Manufacturing Module

### Features
- Bill of Materials (BOM) with multi-level sub-BOMs
- Production Orders with material consumption
- Material planning and cost calculation
- Work centers and routing operations

---

## [2026-07-27] GST Compliance

### Features
- E-invoice integration (sandbox)
- GSTR-1, GSTR-3B report generation
- E-way bill support
- HSN/SAC code management

---

## [2026-07-04] Bug Fixes - Production Stability

### Fixed (10 backend API test failures)
- Voucher payloads use `voucher_date` (not `date`)
- Voucher payloads use `ledger_id` (not `ledger_name`)
- GST calculation requests corrected
- Inventory delete validation
- Financial year seed data overlap
- Attachment 404 handling
- Voucher register viewer permission test
- Test cleanup includes orphaned users

### Added
- `getLedgerIds()` helper for E2E tests
- `registerViewerInCompany()` helper for permission tests
- Mandatory test data cleanup command (AGENTS.md)

---

## Earlier Changes

See git history for complete changelog of earlier features:
- Multi-company support
- Financial year management  
- Trial Balance, P&L, Balance Sheet
- Bank reconciliation
- TDS/TCS tracking
- Inventory management
- Recurring vouchers
- Attachments
- Audit logging
- User roles and permissions
