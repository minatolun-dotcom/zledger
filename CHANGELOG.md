# Changelog

All notable changes to ZLedger will be documented in this file.

## [Unreleased]

### Added - 2026-07-31
- **Voucher Lifecycle Management Phase 2** (Backend Complete)
  - Version history system with immutable snapshots before every voucher update
  - `VoucherVersion` model tracks complete voucher state with JSONB snapshots
  - Restore cancelled vouchers with validation (FY not closed, voucher is cancelled)
  - Duplicate vouchers as drafts with today's date and new voucher number
  - Structural reversal linking via `original_voucher_id` and `reversed_by_voucher_id` FKs
  - Enhanced audit trail with user context and IP tracking
  - API endpoints:
    - `POST /api/v1/vouchers/{id}/restore` - Un-cancel vouchers
    - `POST /api/v1/vouchers/{id}/duplicate` - Clone vouchers
    - `GET /api/v1/vouchers/{id}/history` - Version history retrieval
    - `GET /api/v1/vouchers/{id}/audit` - Structured audit trail
  - Frontend components (UI integration pending):
    - `VoucherHistoryPanel` - Version diff viewer
    - `VoucherAuditTimeline` - Activity log with timeline
    - `VoucherStatusBadge` - Visual status indicators
  - Migration: `67b6ec019702_add_voucher_version_and_reversal_link`

### Changed - 2026-07-31
- Enhanced `PATCH /api/v1/vouchers/{id}` to automatically create version snapshots before updates
- Voucher cancellation now creates structural links to reversal vouchers
- Audit log enhanced with `old_value` capture for change tracking

## [Previous] - 2026-07-29

### Added
- **Tally-Style Voucher Architecture**
  - Ledger-driven voucher forms with single Account field
  - Shared components: `LedgerSelector`, `PartyDetailsPanel`, `PaymentDetailsPanel`, `VoucherLayout`
  - `SalesVoucherForm` with 3-column layout and keyboard-first navigation
  - `SalesItemTable` with inline master creation and GST auto-calculation
  - Unified `lines` array payload format for backend consistency

### Fixed
- **Dark Mode Improvements**
  - Replaced native `<select>` dropdowns with portal-based `Select` component (fixes white popup in dark mode)
  - Applied custom dark palette (`#16161f`, `#1a1a24`, `#282832`) consistently across all new components
- **React useEffect Fixes**
  - Fixed infinite reset loops in `MasterSelector` and `SearchableSelect` caused by unstable dependencies
  - Removed `filteredOptions` from useEffect dependencies
  - Used refs for document-level event handlers to prevent timing gaps

## [Previous] - 2026-07-28

### Added
- **Manufacturing Module**
  - Bill of Materials (BOM) with multi-level sub-BOMs
  - Production Orders with raw material consumption tracking
  - Material planning and cost calculation
  - Work centers and routing operations
  - BOM versioning and change tracking

### Fixed
- Opening balance validation for demo companies
- Trial balance warnings for imbalanced opening entries

## [Previous] - 2026-07-27

### Added
- **GST Compliance**
  - E-invoice integration (NIC sandbox)
  - GSTR-1, GSTR-3B report generation
  - E-way bill support
  - HSN/SAC code management
  - Inter-state vs intra-state tax calculation (IGST vs CGST+SGST)

### Changed
- Enhanced voucher service to support GST tax lines
- Improved error handling in payment reconciliation

## [Previous] - 2026-07-20

### Added
- **Multi-Company Support**
  - Company switcher in header
  - Role-based permissions (Admin, Accountant, Viewer)
  - Company-scoped data isolation
- **Financial Year Management**
  - Multiple FY support per company
  - FY closing workflow
  - Opening balance migration

### Fixed
- Session token refresh on company switch
- LocalStorage keys now company-scoped

## [Previous] - 2026-07-15

### Added
- **Voucher Entry**
  - Payment, Receipt, Journal, Sales, Purchase vouchers
  - Multi-line item entry with stock integration
  - Auto voucher numbering per FY
  - Voucher templates for recurring entries
- **Reports**
  - Cash Book, Bank Book, Ledger, Daybook
  - Trial Balance, P&L, Balance Sheet
  - Stock Summary and Valuation
  - PDF export for all reports

### Changed
- Upgraded to FastAPI 0.115.0
- Improved API error responses with structured detail messages

## [1.0.0] - 2026-07-01

### Added
- Initial release with core accounting features
- Chart of Accounts (predefined COA for Indian accounting)
- Master data: Ledgers, Parties, Stock Items, Cost Centres
- User authentication and company registration
- PostgreSQL database with Alembic migrations
- React + TypeScript frontend with Vite
- Docker Compose development environment
- Dark mode support

### Technical Stack
- **Backend:** FastAPI, SQLAlchemy, Alembic, PostgreSQL
- **Frontend:** React 18, TypeScript, Tailwind CSS, Vite
- **Deployment:** Docker Compose, Nginx reverse proxy

---

## Version Numbering
- **Major.Minor.Patch** (e.g., 1.2.3)
- Major: Breaking changes
- Minor: New features, backward compatible  
- Patch: Bug fixes, minor improvements

## Change Categories
- **Added:** New features
- **Changed:** Changes in existing functionality
- **Deprecated:** Soon-to-be removed features
- **Removed:** Removed features
- **Fixed:** Bug fixes
- **Security:** Security improvements
