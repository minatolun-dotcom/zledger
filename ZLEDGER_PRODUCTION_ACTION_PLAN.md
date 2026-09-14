# ZLedger Production Action Plan

**Status:** NOT READY — ALPHA  
**Derived from:** ZLEDGER_FULL_AUDIT.md (2026-09-11) + current source code inspection  
**Constraint this phase:** No source code or migrations modified. This is planning and verification only.

---

## 1. Current Production Status

**Verdict: NOT READY — ALPHA**

ZLedger has substantial implementation depth (47 migrations, 8 voucher types, full double-entry accounting, GST engine, GSTR reports, inventory, manufacturing, recurring templates, audit trails) but cannot be trusted with real business accounting today.

The core accounting engine passes 523/523 voucher balance checks in tests and the double-entry invariant holds. However: the Balance Sheet does not enforce the accounting equation Assets = Liabilities + Capital; opening balances can be created in an imbalanced state; no security tests exist; cross-company isolation is not tested; no tests cover the full sales→receipt and purchase→payment workflows with outstanding reconciliation; FIFO accounting has negative-quantity edge cases; GSTR reports are report-only with no statutory filing integration; manufacturing is vaporware without accounting integration; and the frontend has visual inconsistencies and known dark-mode dropdowns that cannot be themed natively.

ZLedger is approximately 35-45% production-ready by feature count, but far less by correctness and trust.

---

## 2. Complete Feature Disposition

Every significant feature receives exactly one status.

**Key:**
- KEEP — important, should remain
- FIX — required but currently broken/incorrect
- COMPLETE — partially implemented and required
- SIMPLIFY — useful but unnecessarily complex
- POSTPONE — useful later, not required for production
- REMOVE — unnecessary for ZLedger's intended product
- VERIFY — unclear; requires runtime investigation

### 2.1 Accounting Core

| Feature | Status | Evidence | Notes |
|---------|--------|----------|-------|
| Double-entry enforcement (Dr=Cr per voucher) | KEEP | voucher_service.py; test_accounting_integrity.py | Verified 523/523 in tests; strongest part |
| Account Groups (Level 1-4 hierarchy) | KEEP | accounting.py, coa.py | Standard Tally-style classification; works |
| Ledger model with balances | KEEP | accounting.py | Computed from voucher lines; correct approach |
| Trial Balance report | KEEP | reports.py | Works; trusted source |
| Ledger statement | KEEP | reports.py | Works |
| Day Book | KEEP | reports.py | Works |
| Profit & Loss | KEEP | reports.py | Works but does NOT verify balance sheet equation |
| Balance Sheet | FIX | reports.py | Lists assets/liabilities/capital but does not assert Assets = Liabilities + Capital; BS can show imbalance silently |
| Opening balances | FIX | voucher_service.py, coa.py | Can be entered in imbalanced state; no server-side validation prevents Assets ≠ Liabilities + Capital at company creation |
| Closing stock | COMPLETE | stock_valuation.py | Weighted average implemented but FIFO exists as dead/alternate path; model is confused |
| Bank reconciliation | COMPLETE | reports.py | Exists; verification needed |
| Suspense account | KEEP | accounting.py default ledgers | Present for error handling |
| Cost centers | POSTPONE | No evidence of implementation | Feature is absent; postpone |

### 2.2 Voucher System

| Feature | Status | Evidence | Notes |
|---------|--------|----------|-------|
| Sales voucher | KEEP | voucher_service.py, SalesVoucherForm.tsx | Works; GST handling exists |
| Purchase voucher | KEEP | voucher_service.py, PurchaseVoucherForm.tsx | Works |
| Receipt voucher | KEEP | voucher_service.py | Works; posts to bank/cash + party |
| Payment voucher | KEEP | voucher_service.py | Works |
| Contra voucher | KEEP | voucher_service.py | Cash↔Bank; works |
| Journal voucher | KEEP | voucher_service.py | Manual entries; works |
| Debit Note | KEEP | voucher_service.py | Created for purchase returns; posts correct entries |
| Credit Note | KEEP | voucher_service.py | Created for sales returns; posts correct entries |
| Sales Return (via Credit Note) | KEEP | voucher_service.py | Credit Note + inventory reversal; works conceptually |
| Purchase Return (via Debit Note) | KEEP | voucher_service.py | Debit Note + inventory reversal; works conceptually |
| Voucher numbering | KEEP | vouchers.py | VoucherTypeNumbering model; per-type; works |
| Voucher cancellation | KEEP | voucher_service.py | cancelled_at; reversal logic; verify runtime |
| Voucher editing | VERIFY | Needs investigation | Audit flagged as likely problematic; MUST verify whether editing a posted voucher creates new entries or mutates existing ones |
| Duplicate voucher | KEEP | voucher_service.py | Exists; verify runtime |
| Recurring templates | COMPLETE | recurring_template.py, voucher_service.py | Template→schedule→create voucher; tested in E2E; verify schedule processing |
| Voucher attachments | COMPLETE | attachments.py | Upload/view/delete; verify runtime |
| Voucher narration search | KEEP | vouchers.py | Works |
| Bill-wise / outstanding | COMPLETE | bill_wise.py, payment_allocation.py, bills.py | Allocations, bill statements, party outstanding; tested partially |
| Payment scheduling | COMPLETE | payment_schedule.py, payment_allocation.py | Schedule→allocate→clear; verify runtime |
| Advance receipts/payments | COMPLETE | payment_allocation.py | Advance handling exists; verify runtime |
| TDS on vouchers | COMPLETE (calculation only) | gst.py TDS section in GET /v1/gst/analysis | TDS calculated in report context; BUT voucher_service.py POST path does NOT post TDS ledger entries; TDS exists as report calculation, not accounting entries |
| TCS | POSTPONE | No evidence | Not implemented; postpone |

### 2.3 Inventory

| Feature | Status | Evidence | Notes |
|---------|--------|----------|-------|
| Units of Measure | KEEP | stock.py, inventory forms | Created per company; used; works |
| Stock Groups | KEEP | stock.py, inventory forms | Hierarchical; works |
| Stock Items | KEEP | stock.py, inventory forms | Core; works; has GST/HSN/units/rate/valuation method |
| Stock valuation method (FIFO, Weighted Avg) | FIX | stock_valuation.py | Two separate implementations exist; FIFO has negative-stock edge case; weighted avg is primary but both paths exist and are confusing; must choose ONE and remove the dead one |
| Stock ledger (quantity tracking) | KEEP | stock.py StockBalance | Per item per company; updated on voucher post; works |
| Negative stock | VERIFY | stock_valuation.py update_stock_balance_weighted_avg | No explicit validation; FIFO path had edge case; must verify behavior when old_qty < qty |
| Opening stock | COMPLETE | stock.py, voucher_service.py | Opening stock voucher type exists; posts to Stock-in-Hand + item ledger; verify runtime |
| Stock adjustment | COMPLETE | voucher_service.py, StockAdjustment voucher type | Adjustment voucher; posts to Stock-in-Hand + item; works conceptually |
| Stock-in-Hand ledger (SYS_STOCK_IN_HAND) | FIX | coa.py | Ledger is NOT in DEFAULT_LEDGERS list; created dynamically; seed data for demo companies does NOT create it; CAST(BOOLEAN AS INTEGER) is PostgreSQL-specific; reports reference it via string; must be explicitly seeded for all companies |
| Multi-godown / warehouse | REMOVE | No evidence of multi-location | Not present; good |
| Batch tracking | REMOVE | Not implemented | Premature; postpone/never |
| Serial number tracking | REMOVE | Not implemented | Premature; postpone/never |
| Manufacturing (BOM/Production Orders) | REMOVE | manufacturing/ directory exists but BROKEN; BOM lines use `origin` field that doesn't exist in DB model; production order JSON API mismatch; no accounting integration; no stock movement | See Section 11; REMOVE from production scope |

### 2.4 GST

| Feature | Status | Evidence | Notes |
|---------|--------|----------|-------|
| GST configuration (company level) | KEEP | company.py GST fields | GSTIN, state, scheme type, dates; works |
| Multiple GSTINs per company | KEEP | gst.py, GSTIN model | List; primary GSTIN concept; verify runtime |
| CGST/SGST (intra-state) | KEEP | gst_posting.py, voucher lines | Correctly split on intra-state; works |
| IGST (inter-state) | KEEP | gst_posting.py | Correctly applied on inter-state; works |
| RCM (Reverse Charge) | KEEP | gst.py, gst_posting.py | RCM toggle on voucher line; posts to RCM ledger; verify runtime |
| HSN/SAC | KEEP | hsn_sac.py | HSN and SAC models; used on voucher lines; verify runtime |
| GST ledgers (CGST, SGST, IGST, RCM, Input Tax) | KEEP | coa.py DEFAULT_LEDGERS creates GST ledgers | Created for company; used in posting; works |
| GST on sales | KEEP | voucher_service.py, gst_posting.py | Correctly calculated and posted |
| GST on purchases | KEEP | voucher_service.py, gst_posting.py | Correctly calculated and posted |
| GST rounding | KEEP | gst.py | Rounding logic exists; verify values |
| Exempt/Nil-rated/Non-GST items | COMPLETE | voucher forms, gst posting | Supported via item GST type; verify runtime |
| Composition scheme | COMPLETE | company.py is_composition; gst.py composition logic | Flag exists; GST calculation changes for composition; verify runtime |
| Place of supply | COMPLETE | voucher forms, gst.py | Derived from state; used for IGST determination; works |
| GSTR-1 (Sales outward) | KEEP | gstr.py GSTR1Generator | Generates report data; verify reconciliation with vouchers |
| GSTR-1A (Amended) | POSTPONE | No evidence | Amendments are advanced; postpone |
| GSTR-3B (Summary return) | KEEP | gstr.py GSTR3BGenerator | Generates report data; verify reconciliation |
| GSTR-4 (Composition) | COMPLETE | gstr.py GSTR4Generator | Exists; verify reconciliation |
| GSTR-9 (Annual) | COMPLETE | gstr.py GSTR9Generator | Exists; verify reconciliation |
| GSTR-9C (Reconciliation) | COMPLETE | gstr.py GSTR9CGenerator | Exists; verify reconciliation |
| E-invoice (IRN/QR) | SIMPLIFY | e_invoice.py, GstPage.tsx QR modal with NO payload | UI scaffold exists with empty QR placeholder; backend has service structure but NO real GSTN API integration; SIMPLIFY to: remove the fake UI, keep backend stubs, mark as POSTPONE until GSTN API is integrated |
| E-way bill | SIMPLIFY | e_way_bill.py, e_way_bill_tasks.py, scheduler | DB model exists; generation task exists; but GSTN API integration is likely stub; SIMPLIFY: mark as POSTPONE; do not advertise as working |
| TDS | COMPLETE (calculation only) | gst.py TDS section | TDS calculated in report context; voucher POST path does NOT post TDS ledger entries; FIX: either add TDS ledger posting to voucher post path, or demote TDS to report-only and document the limitation |
| TCS | REMOVE | Not implemented | Postpone; do not implement now |

### 2.5 Company & Multi-Company

| Feature | Status | Evidence | Notes |
|---------|--------|----------|-------|
| Company model | KEEP | user.py Company | Core; works |
| Company membership/roles | KEEP | user.py CompanyMember, RBAC roles | Member/Editor/Owner/Viewer; works |
| Current company context | KEEP | dependencies.py get_current_company_id | Header/LT; works |
| Multi-company isolation (reads) | VERIFY | Most queries filter by company_id; but must verify EVERY query path | Audit flagged: must verify ALL read endpoints enforce company scope; no security tests exist |
| Multi-company isolation (writes) | VERIFY | Same as reads; must verify no IDOR | Audit flagged; no security tests exist |
| Cross-company IDOR risk | VERIFY | No dedicated security tests | P1 candidate; must add tests |
| Company settings | KEEP | companies.py PUT /settings | Works; financial year, tax defaults, rounding, etc. |
| Company creation | KEEP | companies.py POST | Works; creates COA, FY, ledgers |
| Demo companies (seed) | KEEP | seed_demo_data.py | 4-5 demo companies for showcase; imbalanced opening balances (known limitation, documented) |
| Demo company data imbalance warning | FIX | seed data creates imbalanced opening; validation endpoint exists but demo data bypasses it | Trial Balance warning exists; documented as demo limitation; but this is confusing for users; either fix the demo seed or make the imbalance more obvious |

### 2.6 Authentication & Security

| Feature | Status | Evidence | Notes |
|---------|--------|----------|-------|
| JWT authentication | KEEP | security.py create_access_token; dependencies.py get_current_user | JWT with expire; works |
| JWT expiry | KEEP | security.py | 7 days default (config.py) |
| Password hashing | KEEP | security.py Utils.hash/check | bcrypt; works |
| Bootstrap admin | KEEP | seed/startup | Created on first boot; works |
| User registration | COMPLETE | users.py register_user endpoint + frontend | Exists; verify runtime |
| Reset password | REMOVE | No evidence of implementation | Absent; postpone; email infrastructure prerequisite |
| Forgot password | REMOVE | No evidence | Absent; postpone |
| RBAC on endpoints | COMPLETE | dependencies.py role checks | Some endpoints check RBAC roles; verify all write endpoints |
| Session management | KEEP | JWT stateless | JWT only; no session table; works for this architecture |
| Rate limiting | REMOVE | Absent | Postpone for production hardening phase |
| 2FA | REMOVE | Absent | Postpone |
| Password policy | POSTPONE | Minimal; no complexity rules visible | Postpone until hardening |
| Login lockout | REMOVE | Absent | Postpone |
| HTTPS enforcement | COMPLETE (config-dependent) | Docker/nginx; env-dependent | Configurable; production must enforce HTTPS |

### 2.7 Reporting

| Feature | Status | Evidence | Notes |
|---------|--------|----------|-------|
| Day Book | KEEP | reports.py | Works |
| Ledger | KEEP | reports.py | Works |
| Ledger Statement | KEEP | reports.py | Works |
| Trial Balance | KEEP | reports.py | Works |
| Profit & Loss | KEEP | reports.py | Works; verify opening/closing treatment |
| Balance Sheet | FIX | reports.py | Does NOT validate equation; see accounting section |
| Cash/Bank book | KEEP | reports.py | Exists; verify |
| Outstanding - receivables | KEEP | reports.py, bill_wise.py | Works conceptually |
| Outstanding - payables | KEEP | reports.py, bill_wise.py | Works conceptually |
| Party statement | KEEP | reports.py | Exists; verify |
| Stock summary | KEEP | reports.py | Exists; verify |
| Stock ledger | KEEP | reports.py | Exists; verify |
| Stock-in-Hand valuation | FIX | reports.py, SYS_STOCK_IN_HAND ledger | Depends on SYS_STOCK_IN_HAND ledger being seeded; see inventory section |
| GST reports | KEEP | gstr.py, reports.py | Report data; verify reconciliation |
| GSTR-1 report | KEEP | gstr.py | Works as report |
| GSTR-3B report | KEEP | gstr.py | Works as report |
| GSTR-9 report | KEEP | gstr.py | Works as report |
| Tax report (general) | KEEP | reports.py | Exists; verify |
| Voucher report (list) | KEEP | reports.py | Exists; verify |
| Export to PDF | COMPLETE | pdf_exports.py, frontend | Scaffold exists; verify runtime rendering quality |
| Export to Excel/CSV | POSTPONE | No evidence of Excel export | Postpone until needed |
| Report date/fiscal-year filtering | COMPLETE | reports.py date params, FY context | Works |
| Report reconciliation (TB=PL+BS consistency) | FIX | No cross-report reconciliation check | Reports stand alone; no verification that TB = PL + BS; no verification that BS balances |

### 2.8 Manufacturing

| Feature | Status | Evidence | Notes |
|---------|--------|----------|-------|
| BOM | REMOVE | BOM model exists; BOM line has Pydantic `origin` field not in DB model; frontend BOM forms reference fields that don't exist in service layer or DB; BOM API routes exist but are inconsistent | BROKEN; see Section 11 |
| Multi-level BOM | REMOVE | Not functional | Postpone/never for now |
| BOM versions | REMOVE | Not functional | Postpone |
| Production Orders | REMOVE | PO model exists; frontend sends JSON that doesn't match service parameters; service method signatures mismatch; PO has no accounting integration | BROKEN/PLACEHOLDER |
| WIP (Work in Progress) | REMOVE | No evidence of WIP accounting | Absent |
| Raw material consumption | REMOVE | Not integrated | No stock movement on production completion |
| Finished goods | REMOVE | Not integrated | No stock receipt on production completion |
| Production journal entries | REMOVE | Not implemented | No accounting entries created by production orders |
| Manufacturing cost / costing | REMOVE | Not implemented | No costing |
| Stock effects of manufacturing | REMOVE | Not implemented | No inventory movement |
| Work centers | REMOVE | Referenced in frontend but not in DB/service | Absent |
| Operations / routing | REMOVE | Referenced in frontend but not in DB/service | Absent |

**Overall manufacturing verdict: REMOVE from production scope.** It is vaporware with broken stubs. A production accounting application does not need manufacturing at launch. If ZLedger ever targets manufacturing businesses, it should be built fresh with full accounting integration, not as a broken add-on.

### 2.9 Frontend / UI

| Feature | Status | Evidence | Notes |
|---------|--------|----------|-------|
| Dashboard | KEEP | frontend pages | Exists; verify relevance of metrics |
| Navigation | KEEP | frontend layout | Works; verify consistency |
| Company switcher | KEEP | frontend | Works; verify UX |
| Chart of Accounts UI | KEEP | frontend | Works; verify editing UX |
| Ledger UI | KEEP | frontend | Works; verify |
| Voucher forms | KEEP | frontend forms | Work; UX audit flagged readability/spacing issues; see UX section |
| Debit Note form | KEEP | frontend | Exists; verify |
| Credit Note form | KEEP | frontend | Exists; verify |
| Inventory UI | KEEP | frontend | Works; verify |
| GST configuration UI | KEEP | GstPage.tsx | Works; verify GSTIN handling |
| E-invoice QR modal UI | SIMPLIFY | GstPage.tsx; modal exists with empty payload | User-facing fake; remove the fake UI until real integration exists |
| E-way bill UI | SIMPLIFY | Voucher forms have transport fields; verify whether they are wired | If e-way bill is not functional, remove the fields from voucher forms or mark as future |
| Reports UI | KEEP | ReportsPage.tsx | Works; verify filter UX |
| Settings UI | KEEP | frontend settings pages | Works |
| User management UI | COMPLETE | frontend | Exists; verify |
| Theme (light/dark) | KEEP | frontend | Toggle exists; dark mode has known select dropdown issue |
| Dark mode native select bug | FIX | AGENTS.md dark mode gotchas; frontend uses native select in some places | Replace with portal Select component where dropdowns appear in dark mode |
| Keyboard shortcuts | COMPLETE | frontend | Alt+A etc.; verify coverage |
| Loading/error states | POSTPONE | UX audit flagged gaps | Improve in UX phase |
| Empty states | POSTPONE | UX audit flagged gaps | Improve in UX phase |
| Confirmation dialogs for destructive actions | POSTPONE | UX audit flagged gaps | Improve in UX phase |
| Form validation UX | COMPLETE | frontend | Exists; verify quality |
| Mobile/responsive | POSTPONE | Not a target at launch | Desktop-first is acceptable for accounting; postpone responsive until later |

---

## 3. What ZLedger IS and IS NOT

### WHAT ZLEDGER IS

A practical, modern Indian accounting application for small/medium businesses, inspired by Tally Prime's core bookkeeping workflow but simpler and cleaner. It supports:

- Single or multi-company accounting
- Chart of Accounts with Indian account group classification
- All core voucher types (Sales, Purchase, Receipt, Payment, Contra, Journal, Debit Note, Credit Note)
- Double-entry accounting enforced at the voucher level
- GST (CGST/SGST/IGST/RCM/Composition) for India
- GST report generation (GSTR-1/3B/4/9/9C) as reports derived from posted vouchers
- Inventory with stock items, units, groups, valuation, stock ledger
- Outstanding/bill-wise management with payment allocation
- Recurring vouchers
- Audit trail of who changed what
- User roles and company membership
- Exportable reports
- Light/Dark theme

### WHAT ZLEDGER IS NOT

Not a generic ERP. It is not:

- A manufacturing system (BOM, production orders, WIP, routing, work centers) — remove from production scope
- A payroll system
- A project accounting system
- A CRM
- A helpdesk/ticketing system
- An asset management system with depreciation/revaluation/disposal — not implemented; postpone
- An e-invoicing/GSTN integration product (at least not yet) — the scaffolding exists but no real GSTN API integration; do not ship as working
- An e-way bill generation product (at least not yet) — same as above
- A TDS/TCS filing product — TDS calculation exists as report; ledger posting is incomplete
- A multi-currency product — not implemented; postpone
- A multi-godown/warehouse management product — not present; good
- A batch/serial number tracking product — not present; good
- A cloud/SaaS multi-tenant product with tenant isolation beyond company-scoped rows — current isolation is row-level company_id; this is acceptable for the target but must be verified

This scope discipline is a STRENGTH, not a weakness. The product should be small, correct, and reliable. Bloat is the enemy.

---

## 4. Accounting Integrity Findings

### 4.1 What Works

- **Voucher-level Dr=Cr enforcement**: voucher_service.py validates and rolls back on imbalance. Tests confirm 523/523 vouchers balance. This is the foundation and it holds.
- **Ledger balance computation**: computed from voucher lines; correct approach; no separate balance table to fall out of sync.
- **Account group classification**: standard Indian accounting groups (Level 1-4), proper debit/credit nature for balance sheet vs profit & loss.
- **Voucher posting creates ledger entries + stock entries + GST entries atomically** (within a single DB transaction).
- **Credit Note / Debit Note**: create reversal entries and reverse inventory movement.

### 4.2 Critical Issues

#### A1. Balance Sheet does not enforce the accounting equation

**Location:** reports.py (Balance Sheet endpoint)  
**Severity:** P0  
**Type:** Catastrophic accounting risk

**Observed behavior:** Balance Sheet lists assets, liabilities, and capital. It computes values. It does NOT assert or verify that `Total Assets == Total Liabilities + Capital`.

**Why it matters:** If a company's opening balances are imbalanced (which the current seed data allows), the Balance Sheet will quietly show an imbalance without any warning, flag, or validation. A business owner relying on the Balance Sheet to assess their financial position could believe their books are correct when they are not.

**Root cause:** No validation gate exists between opening balance entry and Balance Sheet display. The accounting engine enforces Dr=Cr per voucher, but the initial company state can be mathematically incorrect.

**Recommended fix:**
1. Add server-side validation at company setup / opening balance entry that computes `Assets - Liabilities - Capital` and refuses to allow a company to enter transactions until the opening position balances.
2. Add a visible warning on the Balance Sheet when `|Assets - (Liabilities + Capital)| > threshold`.
3. Add a Trial Balance status endpoint (already partially exists) and surface the result in the UI.

**Acceptance criteria:**
- A company with imbalanced opening balances cannot create the first voucher until balances are corrected.
- Balance Sheet shows a clear imbalance warning when equation fails.
- Trial Balance status endpoint is wired into the UI.

---

#### A2. Opening balances can be entered in an imbalanced state

**Location:** voucher_service.py (opening balance flow), seed data  
**Severity:** P0  
**Type:** Data integrity

**Observed behavior:** The demo seed data creates companies with imbalanced opening balances. The opening balance validation endpoint exists but is not enforced as a gate during company setup.

**Why it matters:** Same as A1. If the first voucher can be posted against imbalanced opening balances, all subsequent balances inherit the error.

**Recommended fix:** Enforce the opening balance validation as a hard gate. See A1.

---

#### A3. Editing a posted voucher — unknown behavior

**Location:** voucher_service.py / vouchers.py (need to trace)  
**Severity:** P1  
**Type:** Potential data corruption

**Observed behavior:** Audit flagged that editing a posted voucher's implementation is unclear. Two possible implementations exist:
- (a) Mutation of existing ledger entries (breaks audit trail, breaks balance integrity if not handled perfectly)
- (b) Creation of reversal entries + new entries (correct approach)

**Why it matters:** If the system mutates posted ledger entries in place, then:
- The audit trail is broken (the original entries are gone)
- Balance integrity may silently break if the edit is imperfect
- Reports tied to the original voucher date may show incorrect values

**Recommended fix:** Verify the implementation. If (a), rewrite to use (b): on edit, create a reversing journal that nullifies the original entries, then post a new voucher with the corrected entries. The original voucher should be marked as "amended" with a reference to the new voucher, not silently mutated.

**Acceptance criteria:**
- Editing a posted voucher never mutates existing ledger lines in place.
- Original entries remain in the ledger with a link to the amendment.
- Trial Balance remains correct before and after edit.

---

#### A4. Deletion of posted vouchers

**Location:** voucher_service.py / vouchers.py  
**Severity:** P1  
**Type:** Potential data corruption

**Observed behavior:** Need to verify whether deleting a posted voucher:
- Removes its ledger entries (breaks audit trail, breaks other vouchers' references)
- Creates reversal entries (correct)
- Is blocked for posted vouchers and only cancellation is allowed

**Recommended fix:** If deletion removes ledger entries in place, this is unacceptable for posted vouchers. Either:
- Block hard delete for posted vouchers, only allow cancellation (cancelled_at + reversal entries)
- Or require that deletion creates reversal entries and marks the voucher as deleted, never removing rows

**Acceptance criteria:**
- Posted vouchers cannot be hard-deleted in a way that removes their ledger entries.
- Cancellation creates reversal entries and preserves the original voucher.
- Orphan ledger entries are impossible.

---

#### A5. Stock-in-Hand ledger (SYS_STOCK_IN_HAND) is not reliably seeded

**Location:** coa.py DEFAULT_LEDGERS, stock_valuation.py, reports.py  
**Severity:** P1  
**Type:** Data integrity / report failure

**Observed behavior:**
- `SYS_STOCK_IN_HAND` ledger is NOT in the DEFAULT_LEDGERS list in coa.py.
- The ledger is created dynamically (first time a rounded voucher posts, or when opening stock is entered).
- The seed data for demo companies does NOT create this ledger.
- Reports reference this ledger by string name `SYS_STOCK_IN_HAND`.
- `CAST(BOOLEAN AS INTEGER)` used in stock_valuation.py is PostgreSQL-specific.

**Why it matters:**
- Companies created via the normal flow may not have a Stock-in-Hand ledger.
- Stock valuation reports may fail or show incorrect values.
- Demo companies and manually-created companies have different stock report behavior.

**Recommended fix:**
1. Add `SYS_STOCK_IN_HAND` to the system ledgers created at company creation (alongside the other system ledgers).
2. Ensure the seed data creates this ledger for all demo companies.
3. Verify Stock-in-Hand ledger is created for every company at creation time, not lazily on first rounded voucher.
4. Replace `CAST(BOOLEAN AS INTEGER)` with a database-agnostic alternative or document the PostgreSQL requirement explicitly.

**Acceptance criteria:**
- Every company has a `SYS_STOCK_IN_HAND` ledger immediately after creation.
- Stock valuation reports work for all companies, including newly-created ones.
- Demo and production companies behave the same way.

---

#### A6. FIFO vs Weighted Average — two conflicting implementations

**Location:** stock_valuation.py  
**Severity:** P1  
**Type:** Correctness risk

**Observed behavior:** Both FIFO and Weighted Average valuation paths exist in the codebase. FIFO has a negative-stock edge case where `old_qty < qty` (the system may attempt to average with a negative base or fail). The code is confusing because both paths coexist.

**Why it matters:** If a user selects FIFO but the system silently falls back to weighted average, or if FIFO recalculation fails on negative stock, stock valuation will be incorrect and the user will not know.

**Recommended fix:**
1. Choose ONE valuation method for ZLedger's initial release. For Indian small/medium businesses, weighted average is the safer default (it is what Tally uses as the default). FIFO is more complex and error-prone for negative stock.
2. Remove the dead/alternate valuation path from the codebase after choosing.
3. Add a validation that rejects or warns on negative stock if the chosen method does not support it.
4. Add explicit tests for the stock valuation path with: opening stock, purchase, sale, sale return, purchase return, adjustment, and negative stock edge cases.

**Acceptance criteria:**
- Only one valuation method is active and documented.
- Stock valuation is provably correct for all voucher types that affect stock.
- Negative stock behavior is explicitly defined and tested.

---

#### A7. Negative stock handling

**Location:** stock_valuation.py update_stock_balance_weighted_avg  
**Severity:** P2  
**Type:** Correctness

**Observed behavior:** No explicit validation that prevents selling more than available stock. The stock balance update logic must handle the case where `old_qty < qty` (selling more than on hand). The current behavior in this edge case is not fully verified.

**Recommended fix:**
1. Decide whether ZLedger allows negative stock.
   - If YES: ensure the valuation logic handles it correctly and the UI warns the user.
   - If NO: add server-side validation that rejects the voucher before posting if stock would go negative, unless an explicit override (e.g., "Allow negative stock" company setting) is enabled.
2. Add tests for the negative stock boundary.

**Acceptance criteria:**
- Negative stock behavior is explicitly configured and documented.
- If disallowed, the voucher is rejected with a clear error before posting.
- If allowed, valuation remains correct and a warning is shown.

---

#### A8. Purchase return / debit note and inventory

**Location:** voucher_service.py (debit note flow)  
**Severity:** P2  
**Type:** Correctness

**Observed behavior:** Debit Note creates reversal entries for purchase return. Need to verify that:
- Inventory quantity is correctly increased (returned goods back to stock)
- Stock valuation is recalculated correctly
- GST input tax reversal is correct
- The original purchase bill's outstanding balance is reduced

**Recommended fix:** Trace a full purchase→debit note→vendor payment flow and verify each step. Add a test that verifies:
- Purchase creates: vendor payable + inventory + input GST
- Debit note creates: inventory reversal + vendor reversal + input GST reversal
- Payment reconciles against the reduced outstanding

**Acceptance criteria:**
- Purchase return inventory is correctly added back.
- GST input tax reversal is correct for intra/inter-state.
- Outstanding balance after return + payment is zero for full return + full payment.

---

#### A9. Sales return / credit note and inventory

**Location:** voucher_service.py (credit note flow)  
**Severity:** P2  
**Type:** Correctness

**Observed behavior:** Credit Note creates reversal entries for sales return. Need to verify that:
- Inventory quantity is correctly reduced (returned goods out of stock)
- Stock valuation is recalculated correctly
- GST output tax reversal is correct
- The original sales invoice's outstanding balance is reduced
- Customer receivable is reduced

**Recommended fix:** Same as A8 but for sales flow. Add a test that verifies the full sales→credit note→customer payment flow.

**Acceptance criteria:**
- Sales return inventory is correctly reduced.
- GST output tax reversal is correct.
- Outstanding balance after return + receipt is zero for full return + full receipt.

---

#### A10. COGS and stock valuation on sales

**Location:** voucher_service.py, stock_valuation.py  
**Severity:** P2  
**Type:** Correctness

**Observed behavior:** On a sales voucher, inventory quantity is reduced and the Stock-in-Hand ledger is credited (reducing asset value). The corresponding debit is typically to COGS or a direct expense account. Need to verify:
- The COGS posting is correct
- The stock valuation used is the correct current value (weighted average of remaining stock)
- The Stock-in-Hand ledger is updated correctly

**Recommended fix:** Verify the COGS posting path. Ensure the valuation used on sale is the current weighted average of the item's stock at the time of sale, not a stale value.

**Acceptance criteria:**
- Sales posting reduces inventory value by the correct current weighted average value.
- COGS is debited correctly.
- Stock-in-Hand ledger reflects the reduced value.

---

### 4.3 Lower-Priority Accounting Issues

- **Rounding:** Verify rounding logic handles edge cases (e.g., rounding that pushes Dr≠Cr).
- **Discounts:** Verify discount posting is correct (discount allowed vs discount received, GST on discounted value vs gross value per Indian GST rules).
- **Round-off ledger:** Auto-created `SYS_ROUND_OFF` ledger; verify it is correctly used and does not accumulate errors.
- **Period/date validation:** Verify vouchers cannot be posted outside the financial year unless allowed.
- **Voucher numbering gaps:** Verify numbering is sequential and gaps are handled correctly (cancelled vouchers).

---

## 5. Inventory Findings

### 5.1 What Works

- Units of Measure: created per company, used on items.
- Stock Groups: hierarchical, works.
- Stock Items: created with GST type, HSN, units, rate, valuation method.
- Stock ledger (StockBalance): per item per company, updated on voucher post.
- Opening stock voucher: creates opening stock entries.
- Stock adjustment voucher: adjusts stock with accounting entries.

### 5.2 Critical Issues

See A5 (Stock-in-Hand ledger not seeded), A6 (two valuation methods), A7 (negative stock), A8/A9 (return inventory handling), A10 (COGS valuation).

### 5.3 Recommended Inventory Model (Decision)

**Valuation method:** Weighted Average (primary). Remove FIFO path from production codebase. Rationale:
- Weighted average is simpler, less error-prone with negative stock, and is the Tally default for small/medium businesses.
- FIFO requires tracking lots/queues which adds complexity without clear value for ZLedger's target users.
- If a user genuinely needs FIFO (e.g., pharmaceutical batch tracking), that is an advanced feature for a later version with batch tracking. Not now.

**Negative stock:** Allow with warning, but add a company-level setting "Allow Negative Stock" default OFF. When OFF, reject vouchers that would cause negative stock with a clear error listing the items and quantities.

**Batches/Serials:** Remove from scope. Postpone indefinitely.

**Multi-godown:** Not present. Good. Keep it out.

**Stock Groups only, no Stock Categories:** Acceptable simplification. Stock Categories are a Tally feature that adds complexity; ZLedger can live without them at launch.

**Units:** Keep as-is. UOM conversion is a known complex feature; if ZLedger needs it later, build it deliberately. For now, allow only one UOM per item.

---

## 6. GST / Tax Findings

### 6.1 What Works

- GSTIN management: per-company, multiple GSTINs, primary GSTIN.
- CGST/SGST split for intra-state, IGST for inter-state.
- RCM toggle on voucher lines, posts to RCM ledger.
- HSN/SAC on voucher lines and items.
- GST ledgers created at company setup (CGST, SGST, IGST, RCM, Input Tax ledgers).
- Composition scheme flag on company; GST calculation changes.
- Place of supply derived from state for interstate determination.
- Exempt/Nil-rated/Non-GST items supported.
- GST rounding logic exists.

### 6.2 Critical Issues

#### G1. TDS calculation exists but TDS ledger posting is missing from voucher POST path

**Location:** gst.py (TDS calculation in analysis), voucher_service.py POST path (no TDS posting)  
**Severity:** P1  
**Type:** Accounting incompleteness

**Observed behavior:** The GST analysis endpoint (`GET /v1/gst/analysis`) includes TDS fields: `deductible_amount`, `deductible_tds`, `tax_after_tds`. This suggests TDS calculation exists in report context. However, the voucher POST path in voucher_service.py does NOT post TDS ledger entries. TDS is calculated but not posted as a ledger transaction.

**Why it matters:** If TDS is calculated but not posted to the TDS ledger, then:
- The TDS ledger balance is incorrect (or zero).
- The party's outstanding is incorrect (TDS reduces the payable amount, which must be reflected in the vendor ledger).
- The books are incomplete: the liability for TDS deducted is not recorded.

**Recommended fix:**
1. Trace the exact TDS calculation in gst.py and confirm the rates and logic are correct for Indian TDS rules (section 194A, 194C, 194J, etc. — verify which sections ZLedger supports).
2. Add TDS ledger posting to the voucher POST path when TDS applies.
3. The TDS posting should:
   - Debit the party ledger for the TDS amount (reducing what is owed to the vendor)
   - Credit the TDS liability ledger (creating the deposit liability)
4. Verify the TDS report reconciliation: TDS calculated on vouchers == TDS ledger balance.

**Acceptance criteria:**
- TDS is posted as ledger entries on the voucher, not just calculated in reports.
- TDS liability ledger balance equals the sum of TDS deducted on all vouchers.
- Party outstanding reflects TDS deduction.

---

#### G2. E-invoice and E-way bill are not integrated with GSTN

**Location:** e_invoice.py, e_invoice_generation.py, e_way_bill.py, e_way_bill_tasks.py, GstPage.tsx  
**Severity:** P2  
**Type:** Misleading if shipped as working

**Observed behavior:**
- Backend has e-invoice service structure and e-way bill task structure.
- Frontend has a QR code modal on the GST page with NO payload (empty placeholder).
- No evidence of real GSTN API integration (no API keys, no GSTN endpoints, no IRN fetch/verify).
- E-way bill has a DB model and a scheduled task, but GSTN API integration is not verified.

**Why it matters:** If these are advertised as working, users will expect to generate IRNs and e-way bills that actually integrate with the GSTN portal. A stub that generates empty QR codes is worse than no feature because it creates false confidence.

**Recommended fix:**
1. Mark e-invoice and e-way bill as POSTPONE / NOT WORKING in the UI.
2. Remove the fake QR modal from the GST page until real GSTN integration exists.
3. If the backend stubs are useful for future integration, keep them but clearly mark them as stubs in code and documentation.
4. Do not integrate with GSTN until the team is ready to maintain the integration (GSTN API changes, credentials, rate limits, error handling).

**Acceptance criteria:**
- The UI does not show fake e-invoice/e-way bill features as working.
- If a user looks for e-invoice, they see a clear "Coming Soon" or the feature is hidden.

---

#### G3. GSTR reports are derived from vouchers but reconciliation not verified

**Location:** gstr.py GSTR1Generator, GSTR3BGenerator, GSTR9Generator, GSTR9CGenerator  
**Severity:** P2  
**Type:** Correctness

**Observed behavior:** GSTR reports generate data from vouchers. The reports exist and compile. However, the reconciliation between:
- GSTR-1 total == sum of sales vouchers with GST
- GSTR-3B total == GSTR-1 + imports + RCM - adjustments
- GSTR-9 annual total == sum of all deferred GST entries

has not been verified in tests.

**Why it matters:** If the GSTR report shows a number that doesn't match the voucher total, the business could file an incorrect return.

**Recommended fix:**
1. Add tests that create vouchers (intra-state, inter-state, RCM, exempt, credit note, debit note) and verify each GSTR report total reconciles with the underlying voucher data.
2. Add a reconciliation endpoint that compares GSTR report totals with voucher totals and flags discrepancies.

**Acceptance criteria:**
- GSTR-1 total reconciles with sales vouchers for the period.
- GSTR-3B total reconciles with the underlying data.
- Any discrepancy is flagged, not silently ignored.

---

#### G4. GST rounding and tax-on-tax edge cases

**Location:** gst.py, gst_posting.py  
**Severity:** P3  
**Type:** Correctness

**Observed behavior:** GST rounding logic exists. Need to verify:
- Rounding is applied at the voucher level or line level consistently.
- Rounding does not create Dr≠Cr imbalance.
- Tax-on-tax (e.g., GST on freight) is handled correctly per Indian rules.

**Recommended fix:** Verify rounding is consistent and does not break the Dr=Cr invariant.

---

### 6.3 Lower-Priority GST Issues

- **HSN/SAC hierarchy:** Verify HSN codes are searched/created correctly.
- **GSTIN validation:** Verify GSTIN format validation on entry.
- **State change impact:** Verify what happens to existing vouchers when a company's state changes (IGST vs CGST/SGST determination depends on state).
- **Export treatment:** Verify zero-rated/export handling if implemented.
- **ITC (Input Tax Credit) blocking:** Verify the rules for blocked ITC (e.g., motor vehicles, food and accommodation) if implemented.

---

## 7. Voucher Findings

### 7.1 What Works

- All 8 voucher types have backend services, API endpoints, database models, and frontend forms.
- Voucher numbering per type exists.
- Voucher cancellation exists (cancelled_at + reversal logic).
- Voucher duplication exists.
- Attachments exist.
- Bill-wise / outstanding management exists.

### 7.2 Critical Issues

See A3 (edit posted voucher), A4 (delete posted voucher).

### 7.3 Voucher UX Issues

- **Cramped tables:** Voucher line tables are dense. This is partially acceptable for accounting users (Tally users are used to density), but readability can be improved with better alignment, clearer debit/credit column headers, and visual separation between taxable lines and tax lines.
- **Redundant fields:** Audit flagged some forms have fields that duplicate information or are rarely used. Inventory forms especially have fields that may be legacy.
- **Alt-key shortcuts:** Verify they work and don't conflict.
- **Dark mode dropdowns:** Replace native selects with portal Select component in dark mode contexts (GST page, voucher forms with dropdowns).

### 7.4 Recommended Voucher Fixes

1. Verify edit and delete behavior for posted vouchers (see A3, A4).
2. Add server-side validation for voucher date vs financial year.
3. Add validation for voucher date vs effective date of GST registration (cannot have GST vouchers before GST effective date if GST is configured).
4. Ensure every voucher form shows the accounting entries preview before save (a "Posting Preview" section that shows the ledger lines that will be created). This is a high-value UX improvement for accounting users.

---

## 8. Reporting Findings

### 8.1 What Works

- Day Book, Ledger, Ledger Statement, Trial Balance: trusted sources, work.
- P&L: works.
- Outstanding reports: work conceptually.
- GST reports: generate data.

### 8.2 Critical Issues

- **Balance Sheet does not validate equation** (see A1).
- **No cross-report reconciliation:** TB, P&L, and BS are independent calculations. There is no verification that `TB == P&L effects + BS effects`. There is no verification that `Assets == Liabilities + Capital`. Reports can silently disagree.
- **Stock-in-Hand report depends on SYS_STOCK_IN_HAND ledger** (see A5).
- **PDF exports:** Verify the PDF rendering is correct and complete. Audit flagged PDF exports as existing but not deeply verified.

### 8.3 Recommended Reporting Fixes

1. Add Balance Sheet equation validation (see A1).
2. Add a reconciliation report / endpoint that shows TB, P&L total, BS total, and flags discrepancies.
3. Add reconciliation tests for all reports.
4. Verify PDF export rendering quality and completeness.
5. Add date range validation: reports should not return data from outside the selected financial year unless explicitly allowed.

---

## 9. Security Findings

### 9.1 What Works

- JWT authentication: works, bcrypt password hashing, 7-day expiry.
- Bootstrap admin creation: works.
- RBAC roles exist (Member/Editor/Owner/Viewer) and are enforced on some endpoints.
- Company context is derived from JWT + header/LT.

### 9.2 Critical Issues

#### S1. No security tests exist

**Severity:** P0  
**Type:** Unknown risk

**Observed behavior:** Zero security tests. No tests for:
- Cross-company read
- Cross-company write
- Cross-company delete
- IDOR on vouchers, ledgers, parties, stock items, bills, payment allocations
- JWT forgery/expiry
- Role escalation
- Invalid/malformed IDs

**Why it matters:** Without security tests, the only way to find IDOR or cross-company bugs is by manual exploration. The presence of company_id filtering in most queries is encouraging, but it is not verified that EVERY query path is correctly scoped.

**Recommended fix:** Add a security test suite that systematically tests:
- Every API endpoint with a token from Company A, trying to read/write/delete a resource belonging to Company B.
- Every API endpoint with a Viewer role token, trying to perform write operations.
- Every API endpoint with a non-owner token, trying to modify company settings.
- JWT expiry, malformed JWT, missing JWT.
- Invalid IDs (non-numeric, UUID mismatch, out of range).

**Acceptance criteria:**
- Every public API endpoint has at least one security test.
- Cross-company access is blocked on every endpoint.
- Role-based access is verified on every write endpoint.

---

#### S2. Cross-company isolation is not verified on all endpoints

**Severity:** P1  
**Type:** Potential data leak / data corruption

**Observed behavior:** Most queries filter by company_id. But:
- No security tests verify this.
- Some endpoints may accept a companyId parameter that is not validated against the authenticated user's company context.
- IDOR is possible if any endpoint uses a direct ID without company scoping.

**Recommended fix:** Same as S1. Add systematic cross-company tests.

**Specific endpoints to verify:**
- `/v1/vouchers/{id}`
- `/v1/ledgers/{id}`
- `/v1/parties/{id}`
- `/v1/stock-items/{id}`
- `/v1/bills/{id}`
- `/v1/payment-allocations/{id}`
- `/v1/financial-years/{id}`
- `/v1/reports/*` (must not leak another company's data)
- `/v1/setup/*` (company configuration endpoints)

**Acceptance criteria:**
- Every endpoint rejects cross-company access.

---

#### S3. IDs are trusted from the frontend

**Severity:** P1  
**Type:** IDOR risk

**Observed behavior:** API endpoints accept IDs from the request body/query params. While most queries filter by company_id, the pattern of accepting an ID from the frontend and using it directly in a query is an IDOR risk if the company filter is missing or bypassed.

**Recommended fix:** Audit every endpoint that accepts an ID. Verify the company_id filter is applied in the same query, not as a separate check that could be bypassed. Use a helper that scopes every query to the current company.

**Acceptance criteria:**
- No endpoint can return or modify another company's data by ID manipulation.

---

#### S4. Password security is minimal

**Severity:** P2  
**Type:** UX/security

**Observed behavior:** Passwords are bcrypt-hashed. No password complexity rules, no password history, no lockout after failed attempts, no 2FA, no reset password flow.

**Recommended fix:** For initial production, this is acceptable for a self-hosted small-business tool. Add password complexity rules and rate limiting before exposing to the public internet. Postpone 2FA and reset password until email infrastructure is in place.

**Acceptance criteria:**
- Minimum password length enforced.
- Rate limiting on login attempts before public exposure.

---

#### S5. Input validation gaps

**Severity:** P2  
**Type:** Potential data corruption / injection

**Observed behavior:** Pydantic models provide validation, but need to verify:
- Negative amounts are rejected on vouchers.
- Extremely large amounts are handled (overflow).
- Decimal precision abuse (e.g., 1000000000000.0001) is handled.
- Date fields are validated (no future dates where inappropriate, no dates before company creation).
- GSTIN format is validated.
- HSN/SAC codes are validated.

**Recommended fix:** Add explicit validation for:
- Voucher amounts: must be positive (or zero for nil-rated).
- Voucher dates: within financial year, not before company creation, not in the future (unless allowed).
- GSTIN: format validation.
- HSN/SAC: format validation.
- Party names, item names: length limits.

**Acceptance criteria:**
- All input validation rules are documented and enforced server-side.
- Invalid input is rejected with clear error messages.

---

### 9.3 Lower-Priority Security Issues

- **CSRF:** API is stateless JWT; CSRF is less relevant but verify if any cookie-based auth exists.
- **SQL injection:** SQLAlchemy parameterized queries should prevent this; verify no raw SQL with string interpolation.
- **XSS:** React frontend should prevent most XSS; verify any `dangerouslySetInnerHTML` usage.
- **File upload vulnerabilities:** Attachments exist; verify file type validation, size limits, storage security.
- **Audit trail tampering:** Audit log exists; verify it is append-only and cannot be modified by users.
- **Error information leakage:** Verify error messages do not leak internal details (stack traces, DB errors, file paths).

---

## 10. Database / Architecture Findings

### 10.1 What is Solid

- SQLAlchemy / Alembic migration system: standard, well-used, 47 migrations.
- Company-scoped tables: most tables have `company_id` and are scoped to a company.
- FK relationships: generally well-defined.
- Pydantic schemas separate request/response validation from models: good practice.
- Service layer separates business logic from API routes: good practice.

### 10.2 Critical Issues

#### D1. SYS_STOCK_IN_HAND ledger not in default ledgers

**Severity:** P1  
**Type:** Data integrity  
**See:** A5. The Stock-in-Hand ledger is not reliably created for all companies.

#### D2. `origin` field in BOM line Pydantic model does not exist in DB

**Severity:** P2  
**Type:** Schema mismatch  
**Location:** BOM line schema vs DB model  
**Evidence:** BOM line Pydantic has an `origin` field not present in the DB model. This will cause validation errors or silent data loss depending on how the schema is used.

**Recommended fix:** Remove the `origin` field from the Pydantic model if it's not in the DB, or add the column to the DB if it is needed. Resolve the mismatch.

---

#### D3. Manufacturing schema/service mismatch

**Severity:** P2  
**Type:** Broken implementation  
**Location:** manufacturing/ directory, BOM/ProductionOrder models, frontend BOM/PO forms  
**Evidence:** Frontend sends JSON fields (`bom_id`, `operation_number`, `work_center_id`) that don't exist in the service layer or DB. Service method signatures don't match what the frontend sends. This is a broken implementation.

**Recommended fix:** REMOVE manufacturing from production scope. See Section 11.

---

#### D4. PostgreSQL-specific SQL in stock valuation

**Severity:** P2  
**Type:** Portability  
**Location:** stock_valuation.py `CAST(BOOLEAN AS INTEGER)`  
**Evidence:** This is PostgreSQL-specific. If ZLedger ever wants to run on SQLite (testing) or another DB, this will break.

**Recommended fix:** Replace with a database-agnostic equivalent, or document the PostgreSQL requirement clearly.

---

### 10.3 Lower-Priority Database Issues

- **Unused columns:** Audit for columns that are never read or written.
- **Nullable fields that should be NOT NULL:** Audit for required fields that are nullable (e.g., voucher date, ledger_id on voucher lines).
- **Missing indexes:** Audit queries for missing indexes on frequently-filtered columns (company_id, voucher_date, ledger_id, party_id, stock_item_id, voucher_type, narration).
- **Cascading delete behavior:** Verify that deleting a company cascades correctly to all related records, and that deleting a ledger/party/stock item does not leave orphan voucher lines.
- **Unique constraints:** Verify voucher numbering has a unique constraint per company + voucher type + financial year.

---

## 11. Manufacturing Findings

### 11.1 Current State

Manufacturing exists as a directory (`backend/app/services/manufacturing.py`, `backend/app/models/manufacturing.py`) and a frontend page (`ManufacturingPage.tsx`).

**What exists in code:**
- BOM model (BillOfMaterials)
- BOM Line model (BomLine)
- Production Order model (ProductionOrder)
- Production Order Line model (ProductionOrderLine)
- A frontend manufacturing page
- BOM and PO API routes

**What is broken:**
- The BOM line Pydantic schema has an `origin` field that does not exist in the DB model.
- Frontend BOM forms send fields (`bom_id`, `operation_number`, `work_center_id`) that do not exist in the service layer or DB.
- Frontend PO forms send JSON that does not match the service method parameters.
- Service layer signatures don't match the frontend payloads.
- Production orders create NO accounting entries.
- Production orders create NO stock movements.
- No WIP accounting exists.
- No raw material consumption tracking at the accounting level.
- No finished goods receipt on production completion.
- No costing calculation.

### 11.2 Verdict

**Manufacturing is vaporware with broken stubs.** It is not functional. It does not integrate with accounting or inventory. It does not serve any real user need in its current state.

### 11.3 Recommendation

**REMOVE from production scope.**

Options:
- **Option A (recommended for now):** Remove the manufacturing frontend page and routes from the production build. Keep the backend models and services in the codebase but clearly mark them as deprecated/experimental in code. Do not invest further until there is a clear user need and a plan to build it properly with full accounting integration.
- **Option B (if a manufacturing business is the target user):** Build it fresh from scratch with a clear design: BOM with accounting integration, production orders that create stock movements and journal entries, WIP accounting, costing. This is a large feature and should not be added as a broken stub.

Do not allow manufacturing complexity to destabilize the accounting core. A production accounting application does not need manufacturing at launch.

---

## 12. Feature Disposition Summary

### 12.1 Features to REMOVE from Production Scope

| Feature | Reason |
|---------|--------|
| Manufacturing UI (ManufacturingPage.tsx) | Broken stubs; no accounting integration; vaporware |
| E-invoice QR modal (GstPage.tsx) | Empty placeholder; fake UI; misleading if shipped |
| E-way bill transport fields on voucher forms (if e-way bill is not functional) | Remove or clearly mark as future if not integrated with GSTN |
| FIFO valuation path (if weighted average is chosen) | Redundant; confusing; remove the dead path |
| TCS implementation | Not started; postpone; do not add now |
| Reset password / Forgot password UI | No email infrastructure; postpone |

### 12.2 Features to POSTPONE

| Feature | Reason |
|---------|--------|
| E-invoice real GSTN integration | Requires GSTN API credentials, maintenance; not for v1 |
| E-way bill real GSTN integration | Same as above |
| Batch/serial number tracking | Premature for target users |
| Multi-currency | Not needed for v1; adds complexity |
| Multi-godown/warehouse | Not needed; good that it's not present |
| Stock Categories | Tally feature; adds complexity; not needed |
| UOM conversion (multiple units per item) | Complex; postpone until needed |
| Asset management (depreciation/revaluation/disposal) | Not implemented; postpone |
| Project accounting | Not needed for v1 |
| Payroll | Not needed for v1 |
| Rate limiting / 2FA / login lockout | Production hardening; add before public internet exposure |
| Mobile/responsive layout | Desktop-first is acceptable for accounting; postpone |
| Excel export | Users can use PDF export + copy-paste for now; postpone |
| GSTR-1A (amended returns) | Advanced GST feature; postpone |
| Cash flow statement | Nice to have; not essential for v1 |
| Cost centers | Not implemented; postpone |

### 12.3 Features to SIMPLIFY

| Feature | Current State | Recommended Simplification |
|---------|---------------|---------------------------|
| E-invoice / E-way bill | Backend stubs + fake frontend UI | Mark as POSTPONE; remove fake UI; keep stubs if useful for future |
| TDS | Calculated in reports but not posted as ledger entries | Either add ledger posting (FIX) or demote to report-only with documented limitation |
| Recurring templates | Template + schedule + create voucher | Verify schedule processing in production; ensure created vouchers balance and post correctly |
| Reports | Standalone calculations | Add reconciliation endpoint; add cross-report consistency checks |

---

## 13. Missing Features

### 13.1 MUST HAVE (before production)

| Feature | Why | Priority |
|---------|-----|----------|
| Opening balance validation (Assets = Liabilities + Capital) | Prevents imbalanced books; P0 | P0 |
| Balance Sheet equation validation | Prevents silent imbalance; P0 | P0 |
| Security test suite (cross-company, IDOR, RBAC) | Unknown risk; P0 | P0 |
| SYS_STOCK_IN_HAND ledger seeded for all companies | Stock reports fail otherwise; P1 | P1 |
| TDS ledger posting (or documented report-only limitation) | Incomplete accounting; P1 | P1 |
| Verify edit/delete behavior for posted vouchers | Potential data corruption; P1 | P1 |
| Unified valuation method (remove FIFO or weighted avg dead path) | Correctness; P1 | P1 |
| Negative stock validation/setting | Correctness; P2 | P2 |
| GSTR report reconciliation tests | Correctness; P2 | P2 |
| Voucher date vs financial year validation | Correctness; P2 | P2 |
| Voucher date vs GST effective date validation | Correctness; P2 | P2 |
| Posting preview on voucher forms (show ledger lines before save) | UX; P2 | P2 |
| Cross-report reconciliation (TB = PL + BS consistency) | Correctness; P2 | P2 |
| Input validation: negative amounts, date ranges, GSTIN format, HSN format | Correctness; P2 | P2 |

### 13.2 SHOULD HAVE (before public launch)

| Feature | Why | Priority |
|---------|-----|----------|
| Password complexity rules | Security baseline | P2 |
| Rate limiting on login | Security baseline | P2 |
| Error information leakage fix (no stack traces in API responses) | Security | P2 |
| File upload validation (type, size limits) | Security | P2 |
| Audit trail append-only verification | Auditability | P2 |
| PDF export rendering verification | Completeness | P2 |
| User registration flow verification | Completeness | P2 |
| Company settings UI verification (especially GST/composition) | Completeness | P2 |
| Recurring template schedule processing verification | Completeness | P2 |
| Bill-wise / outstanding full workflow test (purchase→payment, sales→receipt, credit note, debit note) | Correctness | P2 |
| GST on discounts: verify discount treatment per Indian GST rules | Correctness | P2 |
| Rounding: verify rounding does not create Dr≠Cr | Correctness | P2 |

### 13.3 NICE TO HAVE (later)

| Feature | Why |
|---------|-----|
| Cash flow statement | Useful for business owners |
| Excel export | Convenience |
| Email notifications | Convenience |
| Bank feed import (CSV) | Convenience for bank reconciliation |
| Fingerprint/biometric login | Convenience (mobile) |
| Multi-warehouse | For larger businesses |
| UOM conversion | For businesses with fractional units |
| Advanced GST features (ITC blocking rules, export treatment, amendments) | For GST-heavy businesses |
| E-invoice / E-way bill real integration | When GSTN API is ready |
| Dashboard metrics refinement | UX |

---

## 14. Priority Matrix

### P0 — Catastrophic / Data Corruption / Security

| ID | Problem | Location | Fix |
|----|---------|----------|-----|
| A1 | Balance Sheet does not validate Assets = Liabilities + Capital | reports.py | Add validation + UI warning |
| A2 | Opening balances can be imbalanced | voucher_service.py, company setup | Add hard gate validation |
| S1 | No security tests exist | tests/ | Add security test suite |
| S2 | Cross-company isolation not verified on all endpoints | all API endpoints | Add systematic cross-company tests |
| S3 | IDs trusted from frontend (IDOR risk) | all endpoints | Audit and fix every ID-accepting endpoint |

### P1 — Production Blocker

| ID | Problem | Location | Fix |
|----|---------|----------|-----|
| A3 | Edit posted voucher behavior unknown | voucher_service.py | Verify; rewrite to reversal + new voucher if needed |
| A4 | Delete posted voucher behavior unknown | voucher_service.py | Verify; block hard delete or use reversal entries |
| A5 | SYS_STOCK_IN_HAND ledger not seeded | coa.py, seed data | Add to system ledgers at company creation |
| A6 | Two valuation methods (FIFO + weighted avg) | stock_valuation.py | Choose one; remove the other |
| G1 | TDS calculated but not posted as ledger entries | gst.py, voucher_service.py | Add TDS ledger posting or document limitation |
| D1 | SYS_STOCK_IN_HAND not in default ledgers | coa.py | Add to DEFAULT_LEDGERS/system ledgers |
| D2 | `origin` field in BOM Pydantic not in DB | BOM line schema | Remove field or add column |

### P2 — Important Correctness / Usability

| ID | Problem | Location | Fix |
|----|---------|----------|-----|
| A7 | Negative stock handling unclear | stock_valuation.py | Add validation/setting; test edge cases |
| A8 | Purchase return / debit note inventory + GST + outstanding | voucher_service.py | Add workflow test |
| A9 | Sales return / credit note inventory + GST + outstanding | voucher_service.py | Add workflow test |
| A10 | COGS + stock valuation on sale | voucher_service.py, stock_valuation.py | Verify valuation is current; verify COGS posting |
| G2 | E-invoice / E-way bill not integrated; fake UI | e_invoice.py, GstPage.tsx | Remove fake UI; mark as POSTPONE |
| G3 | GSTR reports not reconciled with vouchers | gstr.py | Add reconciliation tests |
| R1 | Balance Sheet equation not validated | reports.py | Add validation |
| R2 | No cross-report reconciliation | reports.py | Add reconciliation endpoint |
| V1 | Dark mode native select dropdowns | Multiple frontend forms | Replace with portal Select component |
| V2 | Voucher edit/delete unclear | voucher_service.py | Verify and fix |
| D4 | PostgreSQL-specific SQL in stock valuation | stock_valuation.py | Replace with agnostic alternative |
| S4 | Minimal password security | security.py, config.py | Add complexity rules, rate limiting |
| S5 | Input validation gaps | All endpoints | Add explicit validation |

### P3 — Improvement

| ID | Problem | Location | Fix |
|----|---------|----------|-----|
| UI density and readability on voucher forms | Multiple frontend forms | Improve alignment, column headers, visual hierarchy |
| Loading/error/empty states | Multiple frontend pages | Add consistently |
| Confirmation dialogs for destructive actions | Multiple frontend pages | Add consistently |
| Dashboard metrics relevance | Dashboard page | Review and refine |
| Voucher posting preview | Voucher forms | Add ledger line preview before save |
| PDF export rendering quality | pdf_exports.py | Verify and fix |
| GST rounding edge cases | gst.py | Verify consistency |
| HSN/SAC search and validation | hsn_sac.py | Verify and improve |

### P4 — Future Enhancement

| ID | Problem | Location | Fix |
|----|---------|----------|-----|
| E-invoice real GSTN integration | e_invoice.py | Postpone until GSTN API is integrated |
| E-way bill real GSTN integration | e_way_bill.py | Postpone |
| Batch/serial tracking | stock.py | Postpone |
| Multi-currency | models, services | Postpone |
| Cash flow statement | reports.py | Postpone |
| Excel export | reports.py | Postpone |
| GSTR-1A amendments | gstr.py | Postpone |
| Asset management (depreciation/revaluation/disposal) | models, services | Postpone |
| Project accounting | models, services | Postpone |
| Payroll | models, services | Postpone |
| 2FA | security.py | Postpone |
| Reset password / forgot password | auth flow | Postpone |
| Email notifications | services | Postpone |
| Bank feed import (CSV) | services | Postpone |
---

## 15. Implementation Roadmap

### PHASE 0 — Freeze & Baseline (1-2 days)

**Goal:** Establish a clean baseline before making changes.

1. Read and verify ZLEDGER_FULL_AUDIT.md findings against current source.
2. Run the full test suite and record baseline results.
3. Run the E2E suite and record baseline results.
4. Document the current state of every P0/P1 item with exact file locations and line numbers.
5. Create a "known issues" inventory that will be updated as fixes are made.
6. Do NOT start fixing yet. Just baseline.

**Acceptance criteria:**
- Full test suite runs and results are recorded.
- E2E suite runs and results are recorded.
- Every P0/P1 item has an exact file location.

---

### PHASE 1 — Accounting Integrity (P0/P1 accounting fixes)

**Goal:** Make the accounting engine trustworthy.

**Order of fixes:**

1. **A1/A2 — Opening balance validation gate**
   - Add server-side validation that refuses to allow the first voucher until Assets = Liabilities + Capital.
   - Add a visible warning on the Balance Sheet when the equation fails.
   - Wire the Trial Balance status endpoint into the UI.
   - Fix demo seed data to be balanced (or document the imbalance clearly in the UI).

2. **A5/D1 — SYS_STOCK_IN_HAND ledger seeding**
   - Add `SYS_STOCK_IN_HAND` to the system ledgers created at company creation.
   - Ensure seed data creates it for all demo companies.
   - Verify stock reports work for newly-created companies.

3. **A6 — Unified valuation method**
   - Choose weighted average as the primary method.
   - Remove or clearly deprecate the FIFO path.
   - Add tests for the chosen valuation path.

4. **A3 — Verify edit posted voucher behavior**
   - Trace the implementation.
   - If it mutates in place, rewrite to reversal + new voucher pattern.

5. **A4 — Verify delete posted voucher behavior**
   - Trace the implementation.
   - If it hard-deletes ledger entries, block it or change to reversal entries.

6. **A7 — Negative stock handling**
   - Decide allow/disallow.
   - Add validation or setting.
   - Test edge cases.

7. **A8/A9 — Return workflows**
   - Add end-to-end tests for purchase→debit note→payment and sales→credit note→receipt.
   - Verify inventory, GST, and outstanding all reconcile.

8. **A10 — COGS + stock valuation on sale**
   - Verify valuation is current at time of sale.
   - Verify COGS posting.

**Acceptance criteria:**
- Opening balances are validated.
- Balance Sheet shows imbalance warning.
- Stock-in-Hand ledger exists for all companies.
- One valuation method is active and tested.
- Edit/delete of posted vouchers is safe and verified.
- Negative stock behavior is defined and tested.
- Return workflows are tested and reconcile.
- COGS posting is correct.

**Do NOT start Phase 2 until Phase 1 is complete.** Inventory integrity depends on accounting integrity.

---

### PHASE 2 — Inventory Integrity (P1/P2 inventory fixes)

**Goal:** Make inventory reconcile with accounting.

**Fixes:**

1. **FIFO vs weighted average cleanup** (if not already done in Phase 1).
2. **A8/A9 return inventory handling verification** (if not already done in Phase 1).
3. **A10 COGS verification** (if not already done in Phase 1).
4. Add inventory integrity tests:
   - Opening stock → purchase → sale → balance
   - Sale return → inventory reversal
   - Purchase return → inventory reversal
   - Stock adjustment → inventory + accounting
   - Negative stock boundary (if allowed)
5. Verify stock reports reconcile with ledger:
   - Stock Summary == sum of stock ledger balances
   - Stock-in-Hand valuation == sum of (qty × weighted average rate) for each item
6. Stock movement vs valuation consistency.

**Acceptance criteria:**
- Stock quantity reconciles between stock ledger, voucher lines, and stock reports.
- Stock valuation reconciles between stock ledger, voucher lines, and stock reports.
- Stock-in-Hand ledger balance equals the sum of item valuations.

**Do NOT start Phase 3 until Phase 2 is complete.** GST integrity depends on inventory and accounting being correct.

---

### PHASE 3 — GST / Tax Integrity (P1/P2 GST fixes)

**Goal:** Make GST reports reconcile with vouchers and ledgers.

**Fixes:**

1. **G1 — TDS ledger posting** (or document report-only limitation).
2. **G3 — GSTR report reconciliation tests.**
3. **G2 — Remove fake e-invoice/e-way bill UI; mark as POSTPONE.**
4. Verify GST rounding does not create Dr≠Cr.
5. Verify GST on discounts per Indian GST rules.
6. Verify intra-state vs inter-state determination for all scenarios.
7. Verify RCM posting and reports.
8. Verify composition scheme GST calculation.
9. Verify credit note / debit note GST reversal.
10. Verify GSTIN validation on entry.
11. Verify HSN/SAC handling.

**Acceptance criteria:**
- TDS is posted as ledger entries or clearly documented as report-only.
- GSTR-1 total == sum of sales vouchers with GST for the period.
- GSTR-3B total reconciles with underlying data.
- GST rounding does not break Dr=Cr.
- GST on discounts is correct per Indian rules.
- RCM posting and reports are correct.
- Composition scheme calculation is correct.

**Do NOT start Phase 4 until Phase 3 is complete.** Outstanding management depends on vouchers and GST being correct.

---

### PHASE 4 — Outstanding / Bill Management (P2 fixes)

**Goal:** Make outstanding balances reconcile with vouchers.

**Fixes:**

1. Add end-to-end tests for:
   - Sales → partial receipt → full receipt → outstanding zero
   - Purchase → partial payment → full payment → outstanding zero
   - Sales → credit note → receipt → outstanding correct
   - Purchase → debit note → payment → outstanding correct
   - Advance receipt → invoice → allocation → outstanding correct
   - Advance payment → invoice → allocation → outstanding correct
2. Verify bill allocation reduces outstanding correctly.
3. Verify over-allocation is rejected or handled.
4. Verify wrong party ID is rejected.
5. Verify party statement reconciles with outstanding.

**Acceptance criteria:**
- Party outstanding == sum of sales/purchase entries minus receipts/payments minus credit/debit notes plus allocations.
- Over-allocation is rejected.
- Party statement shows correct balance.

---

### PHASE 5 — Reports / Reconciliation (P2 report fixes)

**Goal:** Make all reports consistent and reconcilable.

**Fixes:**

1. **R1 — Balance Sheet equation validation.**
2. **R2 — Cross-report reconciliation endpoint.**
3. Add reconciliation tests:
   - TB total == P&L total + BS total (within rounding)
   - BS Assets == Liabilities + Capital
   - Stock-in-Hand == sum of item valuations
   - GST report totals == voucher totals
4. Verify PDF export rendering.
5. Verify report date/fiscal-year filtering.
6. Verify report company isolation.

**Acceptance criteria:**
- All reports reconcile with each other.
- Any discrepancy is flagged, not silently ignored.
- PDF exports render correctly.
- Reports respect company boundaries.

---

### PHASE 6 — Security / Data Integrity (P0/P1 security fixes)

**Goal:** Make cross-company isolation and authorization provably correct.

**Fixes:**

1. **S1/S2/S3 — Security test suite:**
   - Cross-company read/write/delete tests for every endpoint.
   - RBAC tests for every write endpoint.
   - JWT expiry, malformed JWT, missing JWT tests.
   - Invalid ID tests.
   - Role escalation tests.
2. **S5 — Input validation:**
   - Negative amounts rejected.
   - Date range validation.
   - GSTIN/HSN format validation.
   - Length limits on names.
3. **S4 — Password security baseline:**
   - Minimum password length.
   - Rate limiting on login (before public exposure).
4. Error information leakage fix.
5. File upload validation.
6. Audit trail append-only verification.
7. Verify no raw SQL with string interpolation.
8. Verify no dangerous `dangerouslySetInnerHTML` usage.

**Acceptance criteria:**
- Every endpoint rejects cross-company access.
- Every write endpoint enforces RBAC.
- Invalid input is rejected with clear errors.
- No stack traces or internal details in API responses.
- File uploads are validated.

**This is the most important phase for production readiness.** Do not skip it.

---

### PHASE 7 — Voucher UX Improvements (P2/P3 UX fixes)

**Goal:** Make voucher entry efficient and clear for accounting users.

**Fixes:**

1. **V1 — Dark mode dropdowns:** Replace native selects with portal Select in dark mode contexts.
2. Add voucher posting preview (ledger lines before save).
3. Improve voucher form readability: alignment, column headers, visual hierarchy.
4. Add loading/error/empty states consistently.
5. Add confirmation dialogs for destructive actions.
6. Verify Alt-key shortcuts work and don't conflict.
7. Review dashboard metrics relevance.
8. Review voucher form field redundancy.

**Acceptance criteria:**
- Dark mode dropdowns are themed correctly.
- Voucher forms show a posting preview.
- Destructive actions have confirmations.
- Loading/error/empty states are consistent.

---

### PHASE 8 — Production Hardening (P2/P3 hardening)

**Goal:** Make the application safe for production deployment.

**Fixes:**

1. Password complexity rules.
2. Rate limiting on login.
3. HTTPS enforcement in production config.
4. Logging and monitoring setup.
5. Backup/restore strategy.
6. Database persistence verification.
7. Container security (non-root user, minimal image, secrets management).
8. Health checks.
9. Migration safety (verify upgrade path, verify rollback).
10. Environment variable documentation.
11. Error handling consistency.
12. Remove debug endpoints and debug flags from production config.

**Acceptance criteria:**
- Production config is secure.
- Backups can be created and restored.
- Migrations apply cleanly and can be rolled back.
- Logs capture errors without leaking sensitive data.

---

### PHASE 9 — Optional Features (P3/P4 later)

**Features to add only after Phases 0-8 are complete and the application is trustworthy:**

1. E-invoice real GSTN integration (when ready to maintain).
2. E-way bill real GSTN integration (when ready to maintain).
3. Cash flow statement.
4. Excel export.
5. Email notifications.
6. Bank feed import (CSV).
7. UOM conversion (when needed).
8. Multi-warehouse (when needed).
9. Advanced GST features (ITC blocking, export, amendments) when needed.
10. Batch/serial tracking (when needed for specific businesses).
11. Mobile/responsive layout (when needed).

---

## 16. Test Plan

### 16.1 Accounting Tests

For each test, specify: input, expected DB state, expected accounting entries, expected report result.

#### Sales → Receipt

**Input:**
- Sales voucher: debtor party, items, GST (intra-state), save.

**Expected DB state:**
- Voucher created with voucher lines (items + tax lines).
- Ledger entries: debtor (debit), sales income (credit), CGST (credit), SGST (credit), inventory/Stock-in-Hand (credit), COGS (debit).
- Stock ledger: item quantity reduced.
- Party outstanding: increased by invoice amount.

**Expected report result:**
- Day Book shows the voucher.
- Ledger shows debtor balance increased.
- Stock ledger shows item quantity reduced.
- GST report shows CGST/SGST collected.
- Trial Balance balances.

**Then:**
- Receipt voucher: debtor party, bank/cash, amount = invoice amount, allocate to bill, save.

**Expected after receipt:**
- Ledger entries: bank/cash (debit), debtor (credit).
- Party outstanding: reduced to zero.
- Payment allocation created.
- Bill status: paid.

#### Purchase → Payment

Same structure as above, mirrored for vendors, input GST, creditor.

#### Sales → Credit Note → Receipt

1. Create sales invoice.
2. Create credit note for partial/full return.
3. Receive payment for the reduced outstanding.

**Verify:**
- Credit note reverses inventory (qty reduced).
- Credit note reverses GST (CGST/SGST reduced).
- Credit note reduces debtor outstanding.
- Receipt reconciles against reduced outstanding.
- Stock valuation is correct after return.

#### Purchase → Debit Note → Payment

Same as above, mirrored.

#### Journal Entry

**Input:**
- Journal voucher with two ledger lines (one debit, one credit), save.

**Verify:**
- Dr = Cr.
- Ledger balances updated.
- No stock effect.
- No GST effect.

#### Contra

**Input:**
- Contra voucher: cash (debit) + bank (credit), save.

**Verify:**
- Cash increased, bank decreased.
- No party effect.
- No GST effect.

### 16.2 Inventory Tests

#### Opening Stock

**Input:**
- Opening stock voucher: item, qty, rate, valuation method, save.

**Verify:**
- Stock ledger: item qty increased.
- Stock-in-Hand ledger: credited/adjusted.
- Item current weighted average rate updated.
- No GST effect.
- No party effect.

#### Purchase → Sale → Balance

1. Opening stock: item A, qty 10, rate 100.
2. Purchase: item A, qty 5, rate 110.
3. Sale: item A, qty 8, rate 150.

**Verify:**
- Stock ledger: 10 + 5 - 8 = 7.
- Weighted average rate after purchase: (10×100 + 5×110) / 15 = 103.33.
- COGS on sale: 8 × 103.33 = 826.67.
- Stock-in-Hand value after sale: 7 × 103.33 = 723.33.
- Stock summary shows 7 units, value 723.33.

#### Sale Return

1. Sale: item A, qty 5, rate 150.
2. Credit note: item A, qty 2, rate 150.

**Verify:**
- Stock ledger: 5 - 2 = 3 (returned to stock).
- GST output tax reversed for 2 units.
- Customer outstanding reduced.
- Stock valuation updated.

#### Purchase Return

1. Purchase: item A, qty 5, rate 100.
2. Debit note: item A, qty 2, rate 100.

**Verify:**
- Stock ledger: 5 - 2 = 3 (removed from stock).
- GST input tax reversed for 2 units.
- Vendor outstanding reduced.
- Stock valuation updated.

#### Stock Adjustment

**Input:**
- Stock adjustment voucher: item A, qty adjustment +3, rate, save.

**Verify:**
- Stock ledger: qty adjusted.
- Stock-in-Hand ledger adjusted.
- Valuation updated.

#### Negative Stock Boundary

**If negative stock is disallowed:**
- Attempt to sell more than available.
- Voucher rejected with clear error.
- No ledger entries created.

**If negative stock is allowed:**
- Sale creates negative stock ledger balance.
- Valuation recalculated correctly (weighted average with negative qty).
- Warning shown to user.

### 16.3 GST Tests

#### Intra-state Sale

**Input:**
- Sales voucher: intra-state, GST 18%, save.

**Verify:**
- CGST = 9% of taxable value.
- SGST = 9% of taxable value.
- CGST ledger credited.
- SGST ledger credited.
- GSTR-1 report includes the sale.

#### Inter-state Sale

**Input:**
- Sales voucher: inter-state, GST 18%, save.

**Verify:**
- IGST = 18% of taxable value.
- IGST ledger credited.
- GSTR-1 report includes the sale as inter-state.

#### RCM Purchase

**Input:**
- Purchase voucher: RCM enabled, GST 18%, save.

**Verify:**
- GST liability on RCM ledger (not input tax credit).
- Recipient creates GST liability instead of input credit.
- GSTR-3B report reflects RCM.

#### Composition Scheme

**Input:**
- Company configured as composition scheme.
- Sales voucher: save.

**Verify:**
- GST calculation uses composition rate (not full GST rate).
- No input tax credit claimed.
- GSTR-4 report includes the sale.

#### Exempt / Nil-rated / Non-GST

**Input:**
- Sales voucher with exempt item, nil-rated item, non-GST item, save.

**Verify:**
- No GST posted for exempt/nil-rated/non-GST items.
- GSTR-1 report excludes non-GST items (or shows as exempt).
- Inventory still moves.

#### Credit Note GST Reversal

**Input:**
- Sales invoice with GST.
- Credit note for the sale.

**Verify:**
- CGST/SGST reversed for the returned amount.
- Customer outstanding reduced.
- GSTR-1 report reflects the reduction.

#### GSTR Reconciliation

**Input:**
- Set of vouchers for a period (intra-state, inter-state, exempt, credit note).

**Verify:**
- GSTR-1 total == sum of taxable sales for the period.
- GSTR-3B total == GSTR-1 + RCM + imports - adjustments.
- Any discrepancy flagged.

### 16.4 Outstanding Tests

#### Partial Payment

**Input:**
- Sales invoice for 1000.
- Receipt for 600, allocated to the invoice.

**Verify:**
- Party outstanding: 400.
- Payment allocation: 600 allocated.
- Bill status: partially paid.

#### Full Payment

**Input:**
- Sales invoice for 1000.
- Receipt for 1000, allocated to the invoice.

**Verify:**
- Party outstanding: 0.
- Bill status: paid.

#### Over-allocation Rejection

**Input:**
- Sales invoice for 1000.
- Receipt for 1200, allocated to the invoice.

**Verify:**
- Rejected with clear error, or allocated up to invoice amount with excess handled explicitly.

#### Advance Receipt + Invoice + Allocation

**Input:**
- Advance receipt: 500, party.
- Sales invoice: 1000, party.
- Allocation: 500 advance + 500 receipt against invoice.

**Verify:**
- Party outstanding correct.
- Advance allocated correctly.

#### Wrong Party ID Rejection

**Input:**
- Sales invoice: party A.
- Receipt: party B, trying to allocate to party A's invoice.

**Verify:**
- Rejected with clear error.

### 16.5 Security Tests

#### Cross-Company Read

**Input:**
- Token for Company A.
- Request for voucher belonging to Company B.

**Expected:**
- 403 or 404. No data returned.

#### Cross-Company Write

**Input:**
- Token for Company A.
- POST/PUT/DELETE for resource belonging to Company B.

**Expected:**
- 403 or 404. No modification.

#### Cross-Company Delete

**Input:**
- Token for Company A.
- DELETE for resource belonging to Company B.

**Expected:**
- 403 or 404. No deletion.

#### IDOR via ID Manipulation

**Input:**
- Token for Company A, user is a member but not owner.
- Request for a resource with a guessed ID from Company A.

**Expected:**
- Resource returned if user has access, or 403 if not.
- No access to Company B resources.

#### Viewer Role Write Attempt

**Input:**
- Token for a Viewer role user.
- POST/PUT/DELETE for any write endpoint.

**Expected:**
- 403.

#### Non-Owner Company Settings Modification

**Input:**
- Token for a non-owner member.
- PUT company settings.

**Expected:**
- 403.

#### JWT Expiry

**Input:**
- Expired JWT token.

**Expected:**
- 401.

#### Malformed JWT

**Input:**
- Tampered JWT token.

**Expected:**
- 401.

#### Missing JWT

**Input:**
- Request with no Authorization header.

**Expected:**
- 401.

#### Invalid ID Format

**Input:**
- Request with non-numeric, UUID-mismatch, or out-of-range ID.

**Expected:**
- 400 or 404. No server error.

### 16.6 Report Tests

#### Trial Balance

**Input:**
- Company with vouchers posted.

**Verify:**
- Total debit == total credit.

#### Balance Sheet

**Input:**
- Company with balanced opening balances + vouchers.

**Verify:**
- Assets == Liabilities + Capital.
- If imbalanced, warning shown.

#### P&L

**Input:**
- Company with vouchers posted (income + expenses).

**Verify:**
- Net profit/loss == income - expenses.
- Matches TB P&L section.

#### Ledger

**Input:**
- Specific ledger.

**Verify:**
- Balance == sum of voucher lines for that ledger.
- Matches TB line for that ledger.

#### Stock Summary

**Input:**
- Company with inventory movement.

**Verify:**
- Stock summary == sum of stock ledger balances.
- Stock-in-Hand valuation == sum of (qty × rate) for each item.

#### GST Reports

**Input:**
- Company with GST vouchers for a period.

**Verify:**
- GSTR-1/3B/9 totals reconcile with vouchers.
- Any discrepancy flagged.

---

## 17. Acceptance Criteria Summary

### Phase 0
- [ ] Full test suite runs and results recorded.
- [ ] E2E suite runs and results recorded.
- [ ] Every P0/P1 item has exact file location.

### Phase 1
- [ ] Opening balances validated (Assets = Liabilities + Capital).
- [ ] Balance Sheet shows imbalance warning.
- [ ] TB status wired into UI.
- [ ] Demo seed data balanced or imbalance clearly shown in UI.
- [ ] SYS_STOCK_IN_HAND ledger created for all companies at creation.
- [ ] One valuation method active and tested.
- [ ] Edit posted voucher is safe (reversal + new voucher or equivalent).
- [ ] Delete posted voucher is safe (reversal or blocked).
- [ ] Negative stock behavior defined and tested.
- [ ] Purchase return workflow tested and reconciles.
- [ ] Sales return workflow tested and reconciles.
- [ ] COGS + stock valuation on sale verified.

### Phase 2
- [ ] Inventory quantity reconciles across stock ledger, voucher lines, stock reports.
- [ ] Stock valuation reconciles across stock ledger, voucher lines, stock reports.
- [ ] Stock-in-Hand ledger == sum of item valuations.

### Phase 3
- [ ] TDS posted as ledger entries or documented as report-only.
- [ ] GSTR-1 total == sum of taxable sales for period.
- [ ] GSTR-3B total reconciles.
- [ ] GST rounding does not break Dr=Cr.
- [ ] GST on discounts correct per Indian rules.
- [ ] RCM posting and reports correct.
- [ ] Composition scheme calculation correct.
- [ ] Credit/debit note GST reversal correct.
- [ ] Fake e-invoice/e-way bill UI removed or marked POSTPONE.
- [ ] GSTIN format validated.
- [ ] HSN/SAC handling verified.

### Phase 4
- [ ] Partial payment outstanding correct.
- [ ] Full payment outstanding zero.
- [ ] Over-allocation rejected or handled explicitly.
- [ ] Advance receipt + invoice + allocation correct.
- [ ] Wrong party ID rejected.
- [ ] Party statement reconciles with outstanding.

### Phase 5
- [ ] TB balances.
- [ ] BS equation validated (or warning shown).
- [ ] P&L matches TB P&L section.
- [ ] Ledger balance matches TB line.
- [ ] Stock summary matches stock ledger.
- [ ] Stock-in-Hand valuation matches item valuations.
- [ ] GST reports reconcile with vouchers.
- [ ] PDF exports render correctly.
- [ ] Reports respect company boundaries.
- [ ] Report date/FY filtering works.

### Phase 6
- [ ] Every endpoint rejects cross-company read.
- [ ] Every endpoint rejects cross-company write.
- [ ] Every endpoint rejects cross-company delete.
- [ ] Every write endpoint enforces RBAC.
- [ ] JWT expiry returns 401.
- [ ] Malformed JWT returns 401.
- [ ] Missing JWT returns 401.
- [ ] Invalid IDs return 400/404.
- [ ] Negative amounts rejected.
- [ ] Date ranges validated.
- [ ] GSTIN format validated.
- [ ] HSN format validated.
- [ ] Name length limits enforced.
- [ ] No stack traces in API responses.
- [ ] File uploads validated (type, size).
- [ ] Audit trail is append-only.
- [ ] No raw SQL with string interpolation.
- [ ] No dangerous `dangerouslySetInnerHTML`.

### Phase 7
- [ ] Dark mode dropdowns themed correctly (no white popup).
- [ ] Voucher forms show posting preview.
- [ ] Destructive actions have confirmations.
- [ ] Loading/error/empty states consistent.
- [ ] Alt-key shortcuts work without conflict.
- [ ] Dashboard metrics reviewed.
- [ ] Redundant fields reviewed.

### Phase 8
- [ ] Password complexity enforced.
- [ ] Rate limiting on login.
- [ ] HTTPS enforced in production.
- [ ] Logging configured.
- [ ] Backup/restore tested.
- [ ] Database persistence verified.
- [ ] Container security: non-root, minimal image, secrets managed.
- [ ] Health checks working.
- [ ] Migrations apply and rollback cleanly.
- [ ] Environment variables documented.
- [ ] Error handling consistent.
- [ ] Debug endpoints/flags removed from production config.

---

## 18. Final Production Readiness Verdict

### CURRENT STATUS: NOT READY — ALPHA

ZLedger has the shape of a production accounting application but not yet the substance. The accounting engine is the strongest part: double-entry is enforced, 523/523 vouchers balance in tests, the voucher model is complete, and the core workflow (sales, purchase, receipt, payment, contra, journal, debit note, credit note) is largely implemented.

However, the application is not yet trustworthy for real business accounting because:

1. **The accounting equation is not enforced at the Balance Sheet level.** The system will happily show a Balance Sheet where Assets do not equal Liabilities + Capital, with no warning. This is a P0 issue.
2. **Opening balances can be imbalanced.** The same issue, at the point of company creation, with no hard gate. P0.
3. **The security posture is untested.** There are zero security tests. Cross-company isolation, IDOR, RBAC, JWT handling, input validation — all assumed correct but none proven. P0.
4. **TDS is calculated but not posted as ledger entries.** The books are incomplete for any transaction involving TDS. P1.
5. **Inventory valuation has two conflicting implementations (FIFO + weighted average).** The system is confused about how it values stock. P1.
6. **The Stock-in-Hand ledger is not reliably seeded.** Stock reports may fail for newly-created companies. P1.
7. **The edit and delete behavior for posted vouchers is unverified.** One of these could be silently corrupting the ledger. P1.
8. **Manufacturing is vaporware.** Broken stubs with no accounting integration, occupying space and attention. REMOVE from production scope.
9. **E-invoice and e-way bill are not integrated with GSTN.** The UI shows placeholders that could mislead users into thinking they work. SIMPLIFY: remove fake UI, mark as POSTPONE.
10. **No cross-report reconciliation exists.** TB, P&L, and BS are independent calculations that could silently disagree.

### TOP 10 THINGS THAT MUST BE FIXED (in priority order)

1. **Opening balance validation gate** (A1/A2) — P0 — prevents imbalanced books.
2. **Balance Sheet equation validation** (A1/R1) — P0 — prevents silent imbalance.
3. **Security test suite** (S1/S2/S3) — P0 — unknown risk is unacceptable.
4. **TDS ledger posting** (G1) — P1 — incomplete accounting.
5. **SYS_STOCK_IN_HAND ledger seeding** (A5/D1) — P1 — stock reports fail otherwise.
6. **Unified valuation method** (A6) — P1 — correctness.
7. **Verify edit posted voucher** (A3) — P1 — potential data corruption.
8. **Verify delete posted voucher** (A4) — P1 — potential data corruption.
9. **Cross-company isolation verification on all endpoints** (S2/S3) — P1 — data leak/corruption risk.
10. **GSTR report reconciliation tests** (G3) — P2 — statutory reporting correctness.

### TOP 10 THINGS THAT SHOULD BE REMOVED OR POSTPONED

1. **Manufacturing UI and routes** — REMOVE from production scope.
2. **E-invoice QR modal (fake UI)** — REMOVE until GSTN integration exists.
3. **E-way bill transport fields (if not functional)** — REMOVE or mark future.
4. **FIFO valuation path (if weighted average is chosen)** — REMOVE dead path.
5. **TCS implementation** — POSTPONE (not started).
6. **Reset password / forgot password** — POSTPONE (no email infrastructure).
7. **2FA / login lockout / rate limiting (before public internet)** — POSTPONE to hardening phase.
8. **Mobile/responsive layout** — POSTPONE.
9. **Excel export** — POSTPONE.
10. **GSTR-1A amendments** — POSTPONE.

### TOP 10 FEATURES THAT SHOULD BE ADDED (in priority order)

1. **Opening balance validation gate** (Assets = Liabilities + Capital) — P0.
2. **Balance Sheet equation validation + warning** — P0.
3. **Security test suite** — P0.
4. **TDS ledger posting (or documented report-only limitation)** — P1.
5. **SYS_STOCK_IN_HAND ledger seeding for all companies** — P1.
6. **Voucher posting preview (show ledger lines before save)** — P2 (high-value UX).
7. **GSTR report reconciliation endpoint** — P2.
8. **Cross-report reconciliation endpoint** — P2.
9. **Negative stock validation/setting** — P2.
10. **Voucher date vs financial year validation** — P2.

### Most Important Accounting Bug

**The Balance Sheet does not enforce the accounting equation Assets = Liabilities + Capital.** This is P0. If a company has imbalanced opening balances, the Balance Sheet will quietly show an incorrect financial position. The fix is to add a validation gate at opening balance entry and a visible warning on the Balance Sheet.

### Most Important Inventory Bug

**Two conflicting valuation methods (FIFO + weighted average) coexist, and the Stock-in-Hand ledger is not reliably seeded.** The system is confused about how it values stock, and stock reports may fail for new companies. The fix is to choose one valuation method (weighted average recommended), remove the dead path, and seed the Stock-in-Hand ledger for all companies at creation.

### Most Important GST Bug

**TDS is calculated in reports but not posted as ledger entries.** This means the TDS liability is not recorded in the books, the party's outstanding is incorrect for transactions involving TDS, and the TDS ledger balance does not reflect reality. The fix is to add TDS ledger posting to the voucher POST path, or clearly document TDS as report-only until ledger posting is implemented.

### Most Important Security Issue

**Zero security tests exist, and cross-company isolation is not verified on all endpoints.** This is P0. Without security tests, the application's tenant isolation is unproven. The fix is to add a systematic security test suite that tests every endpoint for cross-company read/write/delete, RBAC enforcement, JWT handling, and invalid input.

### Most Important UI Issue

**Dark mode native select dropdowns are not themed correctly** (the popup list is white on a dark background). This is a known issue documented in AGENTS.md. The fix is to replace native `<select>` elements with the app's portal-based `Select` component in all dark mode contexts. Secondary: voucher forms are dense and could benefit from a posting preview and better visual hierarchy.

### First Implementation Phase

**Phase 0 — Freeze & Baseline.** Before fixing anything, run the full test suite and E2E suite, record baseline results, and document every P0/P1 item with exact file locations. This establishes the ground truth and prevents regressions.

After Phase 0, **Phase 1 — Accounting Integrity** is the first fixing phase, starting with the opening balance validation gate and Balance Sheet equation validation, because these are P0 and form the foundation for everything else.

### Exact Next Task to Execute

**Phase 0: Run the full backend test suite and record results.**

Command:
```bash
cd backend && python -m pytest tests/ -v --tb=short 2>&1 | tee /tmp/test-baseline.log
```

Then run the E2E suite:
```bash
cd tests/e2e && npm test 2>&1 | tee /tmp/e2e-baseline.log
```

Record:
- Total tests, passed, failed, skipped.
- Any test failures and their root causes.
- Any tests that are missing coverage for the P0/P1 items identified in this plan.

This baseline will be the reference point for all subsequent fixes.

---

## 19. Appendix — Files Referenced

### Backend
- `backend/app/services/voucher_service.py` — voucher posting, Dr=Cr enforcement, stock posting, GST posting, return logic
- `backend/app/services/stock_valuation.py` — stock balance update, weighted average, FIFO, SYS_STOCK_IN_HAND
- `backend/app/services/gst.py` — GST calculation, TDS calculation, GST analysis
- `backend/app/services/gst_posting.py` — GST ledger posting
- `backend/app/services/gstr.py` — GSTR-1/3B/4/9/9C generators
- `backend/app/services/reports.py` — Day Book, Ledger, TB, P&L, BS, stock reports, outstanding reports
- `backend/app/services/bill_wise.py` — bill allocation, party outstanding
- `backend/app/services/coa.py` — default ledgers, account groups, SYS_STOCK_IN_HAND
- `backend/app/services/audit.py` — audit trail
- `backend/app/models/voucher.py` — voucher models, voucher lines, payment allocations
- `backend/app/models/accounting.py` — ledger, account group, journal entry
- `backend/app/models/stock.py` — stock items, stock groups, stock balance
- `backend/app/models/user.py` — company, company member, roles
- `backend/app/models/manufacturing.py` — BOM, production order, BOM line, PO line
- `backend/app/api/v1/vouchers.py` — voucher CRUD endpoints
- `backend/app/api/v1/companies.py` — company CRUD, settings
- `backend/app/api/v1/bills.py` — bill endpoints
- `backend/app/api/v1/reports.py` — report endpoints
- `backend/app/core/security.py` — JWT, password hashing
- `backend/app/core/dependencies.py` — auth, company context, RBAC
- `backend/app/core/config.py` — app settings, JWT expiry
- `backend/app/schemas/voucher.py` — voucher Pydantic schemas
- `backend/alembic/versions/` — migrations
- `backend/tests/test_accounting_integrity.py` — accounting invariant tests
- `backend/tests/test_gstr_service.py` — GSTR tests

### Frontend
- `frontend/src/pages/vouchers/forms/SalesVoucherForm.tsx` — sales voucher form
- `frontend/src/pages/vouchers/forms/PurchaseVoucherForm.tsx` — purchase voucher form
- `frontend/src/pages/ReportsPage.tsx` — reports page
- `frontend/src/pages/GstPage.tsx` — GST page, e-invoice QR modal
- `frontend/src/pages/InventoryPage.tsx` — inventory page
- `frontend/src/pages/ManufacturingPage.tsx` — manufacturing page (broken)
- `frontend/src/pages/CompanySettingsPage.tsx` — company settings
- `frontend/src/components/Modal.tsx` — shared modal
- `frontend/src/components/Select.tsx` — portal-based select (for dark mode fix)
- `frontend/src/index.css` — dark mode token definitions

### Documentation
- `ZLEDGER_FULL_AUDIT.md` — comprehensive audit report (2971 lines)
- `AGENTS.md` — project protocol, dark mode gotchas, React useEffect gotchas
- `ARCHITECTURE.md` — architecture overview
- `STATE.md` — project state
- `README.md` — project readme

---

*End of ZLEDGER_PRODUCTION_ACTION_PLAN.md*

---

## 15A. Phase 0 Baseline — Actual Test Results (2026-09-12)

Run on the live Docker stack (`zledger-api-1` healthy, PostgreSQL 16, Python 3.12.14, pytest 9.1.1).

### Backend test suite

Command:
```bash
cd backend && docker-compose exec -T api python -m pytest tests/ -v --tb=short
```

Result: **564 passed, 0 failed, 0 skipped, 241 warnings** in 102.55s.

Warnings are deprecation noise (SQLAlchemy `Query.get()` legacy, `HTTP_422_UNPROCESSABLE_ENTITY` deprecation, `regex` → `pattern` in bills.py, FastAPI testclient httpx deprecation, SAWarning on bom_lines delete row count). No failures.

#### Notable test classes present (evidence the plan items are partially already addressed)

| Test class | File | What it covers | Relevance to plan |
|------------|------|----------------|-------------------|
| TestBalanceSheet | test_reports_service.py | BS with balanced OB, voucher movements, empty | BS DOES assert total_assets == total_liabilities_and_capital in tests (line 202-205). The issue is the runtime endpoint does NOT assert this on every call — only tests verify it. |
| TestAuditHashChain | test_accounting_integrity.py | Chain verifies clean, tamper detected, created_at in hash | Audit chain is implemented and tested. The E2E audit-trail.spec.ts failure is a frontend/UI or cross-test-state issue, not a backend audit bug. |
| TestAtomicEdit | test_accounting_integrity.py | Edit preserves number and balances, records version snapshot, rejects out-of-FY date | **Voucher editing IS implemented correctly.** `update_voucher()` reverses stock entries, deletes old lines, posts replacement lines, keeps voucher posted. This is the CORRECT pattern (reversal + new entries), not mutation. The plan's A3 concern is RESOLVED by current implementation. |
| TestVoucherDelete | test_vouchers.py | Delete voucher | Delete only allows draft or cancelled vouchers; posted vouchers must be cancelled first. **A4 is RESOLVED** — hard delete of posted vouchers is blocked server-side. |
| TestVoucherEditBlockedByLiveCompliance | test_vouchers.py | Edit blocked by live e-invoice/e-way bill | Edit is guarded. |
| TestReversalVouchers | test_accounting_integrity.py | Cancel creates linked reversal, restore deletes reversal, reversal not editable | Cancel is implemented correctly. |
| TestDebitNoteAdjustment | test_accounting_integrity.py | Debit note reduces purchase outstanding, cancel restores | Return workflow is tested. |
| TestCreditNoteAdjustment | test_accounting_integrity.py | Credit note adjustment reduces outstanding, cancel restores | Return workflow is tested. |
| TestStockReversal | test_accounting_integrity.py | Cancel sales reverses stock, edit sales replaces stock | Stock reversal on cancel/edit is tested. |
| TestTdsPostedVoucherGuard | test_accounting_integrity.py | TDS entry rejected for cancelled voucher | TDS entries are guarded. |
| TestTdsStatutorySurfacesExcludeVoidedVouchers | test_accounting_integrity.py | Returns summary excludes cancelled voucher | TDS reporting excludes voided vouchers. |
| TestTdsTcsEntries / TestTdsTcsSections / TestCalculate / TestDeposit / TestReturns / TestSummary / TestAggregateThresholdSections | test_tds_tcs.py | Full TDS/TCS section/entry/aggregate/deposit/return tests | **TDS IS implemented.** `create_tds_tcs_entry()` creates entries linked to posted vouchers. But the key question is: is TDS auto-deducted ON voucher creation, or only created manually via the TDS API? See below. |
| TestManufacturingAuditRound12 | test_accounting_integrity.py | Manufacturing audit tests | Manufacturing has SOME backend integration tests. |
| test_manufacturing.py | test_manufacturing.py | 20+ manufacturing tests including confirm_production_creates_entries_and_balanced_journal | **Manufacturing IS more functional than the plan assumed.** Production orders DO create stock entries and balanced journals. The plan's "vaporware" characterization is OUTDATED. The manufacturing feature needs RE-EVALUATION, not removal. |
| TestGenerateGstr1 / TestGenerateGstr3b / Gstr1TallyPrimeReference / Gstr1DebitNotes / Gstr3bPostedOnly | test_gstr_service.py | GSTR-1 and GSTR-3B generation tests with voucher data | **GSTR reports are tested.** GSTR-9 and GSTR-9C exist in gstr.py but have NO dedicated tests in test_gstr_service.py (grep found no GSTR9/GSTR9C tests). |
| TestTrialBalance / TestTrialBalanceEndpoint / TestProfitAndLoss / TestProfitAndLossEndpoint | test_reports_service.py / test_reports_endpoints.py | TB, P&L, BS endpoint tests | Reports are tested. |

#### Tests NOT present (gaps confirmed)

- **No test for `GET /setup/trial-balance-status` or `POST /setup/validate-opening-balances`** in the backend suite. These endpoints exist in `app/api/v1/setup.py` but are not called by any test. This is the gap behind plan item A1/A2.
- **No dedicated security test file** (`test_security.py` does not exist). The E2E `api-backend.spec.ts` has cross-cutting auth tests (401 on all protected endpoints, 403 for viewer on POST /vouchers, POST /coa/ledgers, GET /audit) but the backend unit test suite has NO cross-company read/write/delete tests, NO IDOR tests, NO role-escalation tests beyond the member tests.
- **No test for TDS auto-deduction on voucher POST.** The `create_voucher()` path in voucher_service.py does NOT call `create_tds_tcs_entry()`. TDS entries are created via a separate API endpoint (`POST /tds-tcs/entries`). This confirms plan item G1 is VALID — TDS is not auto-posted as ledger entries on voucher creation; it's a manual/secondary workflow.
- **No test for `GET /vouchers/next-number` returning correct values** (E2E test 34 fails — see E2E section).
- **No test for the `SYS_STOCK_IN_HAND` ledger existence** after company creation. Plan item A5 needs re-verification: `seed_system_ledgers()` does NOT create a `SYS_STOCK_IN_HAND` ledger (not in `SYSTEM_LEDGERS` list). The Stock-in-Hand group exists in `TALLY_GROUPS` but no system ledger named "Stock-in-Hand" with `system_code=SYS_STOCK_IN_HAND` is created.

### E2E test suite

Command:
```bash
cd tests/e2e && CHROME_BIN=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome | tail -1) npm test
```

Result: **112 passed, 14 failed, 23 skipped** (timed out at 300s; run was not complete — some tests after the timeout point were not executed).

The E2E run was killed by the 300s timeout. The test order shows the failures are concentrated in:

#### E2E failures (14)

| # | Test | Spec | Likely cause |
|---|------|------|--------------|
| 1, 2 | Admin: Delete Company via UI (2 tests) | admin-delete-ui.spec.ts | UI test; UI may not match current backend; or test state from prior run |
| 7, 8, 9 | Admin Pages load with heading (3 tests) | admin-pages.spec.ts | Admin pages UI; likely login/session state issue or UI route mismatch |
| 15 | GET /auth/me returns current user info | api-backend.spec.ts | **Backend API failure.** Test 14 (login) passes, test 15 (auth/me) fails. This is suspicious — likely test state bleed or the test user token is stale/invalid. Needs investigation. |
| 21 | GET /companies lists companies | api-backend.spec.ts | Likely same auth state issue as test 15 (token after login) |
| 24 | GET /companies/{id} returns details | api-backend.spec.ts | Same |
| 34 | GET /vouchers/next-number returns next number | api-backend.spec.ts | **Backend API failure.** Needs investigation — possibly the voucher numbering endpoint has a bug or the test state is wrong. |
| 35 | POST /vouchers creates journal voucher | api-backend.spec.ts | **Backend API failure.** Same auth/state issue likely. |
| 112 | POST /manufacturing/boms creates BOM | api-backend.spec.ts | **Manufacturing API failure.** The E2E expects a BOM creation endpoint that may have a different shape than what the backend implements. This is the manufacturing API mismatch the plan flagged. |
| 144 | Audit Trail: voucher create/edit/cancel lifecycle lands in audit log with chain verified | audit-trail.spec.ts | **E2E audit test failure.** Backend tests (TestAuditHashChain) PASS. This E2E failure is likely a test-ordering/state issue or the E2E test creates vouchers in a way that doesn't trigger the audit chain the way the backend test does. Needs investigation. |
| 148, 149 | Full login flow to dashboard; logout redirects to login | auth.spec.ts | **UI flow failure.** Tests 145-147 (show login, reject invalid, redirect to company select) PASS. Test 148 (full login → dashboard) fails at 34.2s — likely a timeout waiting for the dashboard to load, or a company-selection step that hangs. |

#### E2E skipped (23)

All in the manufacturing section (tests 113-135). These are skipped because test 112 (BOM creation) failed, and the remaining manufacturing tests depend on it. This confirms the manufacturing E2E suite is blocked by the BOM endpoint mismatch.

### Key findings from baseline vs plan

1. **Voucher editing (A3) is RESOLVED.** The `update_voucher()` implementation in `voucher_service.py` (line 997-1060) correctly reverses stock entries, deletes old lines, and re-posts replacement lines without burning a voucher number. The `TestAtomicEdit` tests confirm this. The plan's concern was based on the AUDIT's suspicion; the actual code is correct.

2. **Voucher deletion (A4) is RESOLVED.** `delete_voucher()` in `vouchers.py` (line 299-329) blocks deletion of posted vouchers. Only draft/cancelled vouchers can be deleted.

3. **Manufacturing is NOT vaporware.** `test_manufacturing.py` has 20+ tests and `test_confirm_production_creates_entries_and_balanced_journal` proves production orders create stock entries + balanced journals. The E2E failure (test 112) is an API shape mismatch, not a complete absence of functionality. The plan's "REMOVE manufacturing" recommendation needs REVISION to "FIX the E2E/API mismatch and verify the manufacturing features that exist."

4. **TDS is NOT auto-deducted on voucher POST.** Confirmed. `create_tds_tcs_entry()` exists but is called separately. Plan item G1 is still VALID but the framing needs adjustment: TDS is a manual/secondary workflow, not missing entirely. The question is whether this is acceptable or whether auto-deduction is needed.

5. **Balance Sheet equation validation is a test-only invariant, not a runtime guard.** `TestBalanceSheet.test_balanced` asserts `total_assets == total_liabilities_and_capital` but the `get_balance_sheet()` function in `reports.py` does NOT raise an error or flag when they differ. The `validate_opening_balances` endpoint exists but is NOT called by the voucher creation flow. Plan items A1/A2 are still VALID.

6. **SYS_STOCK_IN_HAND ledger is NOT created by `seed_system_ledgers()`.** Confirmed. The `SYSTEM_LEDGERS` list in `coa.py` does NOT include a Stock-in-Hand ledger. The Stock-in-Hand group exists but no system ledger. However, the codebase does NOT reference `SYS_STOCK_IN_HAND` anywhere — the string "Stock-in-Hand" appears only in the cash flow report's category list and the groups definition. **Plan item A5 needs REVISION** — there is no `SYS_STOCK_IN_HAND` ledger being referenced. The stock valuation reports use `StockBalance` rows, not a Stock-in-Hand ledger. The concern about stock reports failing may be unfounded for the current implementation, but should be verified.

7. **FIFO vs weighted average: both exist but only weighted_avg is USED.** Confirmed. `voucher_service.py` imports and calls ONLY `update_stock_balance_weighted_avg` (lines 23, 285, 305). `update_stock_balance_fifo` exists in `stock_valuation.py` but is NEVER called by the voucher posting path. The FIFO function is dead code for the current posting path. Plan item A6 is still VALID (dead FIFO code should be removed or clearly marked), but the risk is lower than the plan assumed — the system always uses weighted average for posting.

8. **Negative stock: weighted average outward entry checks `old_qty >= qty`.** Confirmed. `update_stock_balance_weighted_avg` line 80: `if old_qty >= qty and qty > 0:`. If `old_qty < qty`, the outward entry is SILENTLY IGNORED (balance is not updated, no error raised). This is a BUG — selling more than available stock would silently not reduce the stock balance, creating an inconsistency. Plan item A7 is VALID and this is the root cause.

9. **Cross-company isolation: partial backend tests exist.** `test_members.py::test_wrong_company_access` tests that a user from company 1 cannot access company 2's members. But there is NO comprehensive cross-company test suite covering vouchers, ledgers, parties, stock items, bills, payment allocations, reports, etc. Plan items S1/S2/S3 are still VALID.

10. **The E2E auth/me failure (test 15) is the most suspicious backend issue.** Test 14 (login) passes, test 15 (auth/me with the same token) fails. This could be: (a) a test bug where the token is not properly captured, (b) a session/JWT issue, or (c) a real backend regression. Needs investigation before any code changes.

---

## 15B. Revised P0/P1 Status After Baseline

### P0 items — still open

| ID | Status | Notes after baseline |
|----|--------|---------------------|
| A1 | OPEN | BS equation validation exists in tests but not as runtime guard on the endpoint. Endpoints exist but are not wired into the voucher creation flow. |
| A2 | OPEN | `validate_opening_balances` endpoint exists but is not called before allowing transactions. Not enforced as a gate. |
| S1 | OPEN | No security test file exists in backend. E2E has partial coverage (401/403 checks) but no systematic cross-company tests. |
| S2 | OPEN | Cross-company isolation not verified on all endpoints. Only `test_wrong_company_access` for members. |
| S3 | OPEN | IDOR not systematically tested. The voucher endpoints check `v.company_id != company.id` in the API layer, which is good, but this pattern needs verification across ALL endpoints. |

### P1 items — status update

| ID | Status | Notes after baseline |
|----|--------|---------------------|
| A3 | RESOLVED | `update_voucher()` correctly reverses + re-posts. TestAtomicEdit confirms. |
| A4 | RESOLVED | `delete_voucher()` blocks posted voucher deletion. TestVoucherDelete confirms. |
| A5 | REVISED | `SYS_STOCK_IN_HAND` ledger does NOT exist in the system ledgers list, and is NOT referenced anywhere in the codebase. Stock reports use `StockBalance`, not a Stock-in-Hand ledger. The concern may be unfounded for the current implementation, but the absence of a Stock-in-Hand ledger should be verified against the reports that reference "Stock-in-Hand" as a group name. |
| A6 | CONFIRMED (lower risk) | FIFO function exists but is never called. Only weighted_avg is used. Dead FIFO code should still be removed. |
| G1 | CONFIRMED (revised framing) | TDS is not auto-deducted on voucher POST. `create_tds_tcs_entry()` exists as a separate API. The question is whether auto-deduction is required or whether the manual TDS entry flow is acceptable. |
| D1 | RESOLVED (revised) | `SYS_STOCK_IN_HAND` is not in `SYSTEM_LEDGERS` and not referenced. This is not a bug — it's a non-existent concept in the current implementation. The Stock-in-Hand group exists but no system ledger is created for it. |
| D2 | NOT VERIFIED | The `origin` field in BOM line Pydantic was flagged in the audit. Need to verify whether it actually exists in the current schema. |

### New findings not in the original plan

| ID | Finding | Severity | Notes |
|----|---------|----------|-------|
| N1 | `update_stock_balance_weighted_avg` silently ignores outward entries when `old_qty < qty` | P1 | No error, no balance update, no warning. Selling more than stock on hand creates a stock/accounting mismatch. This is the most concrete inventory bug found. |
| N2 | E2E test 15 (auth/me) fails immediately after test 14 (login passes) | P2 | Suspicious. Could be test state bleed or a real backend issue. Must investigate before assuming it's a test bug. |
| N3 | E2E test 34 (vouchers/next-number) and 35 (POST /vouchers) fail | P2 | Same auth/state issue likely, but could be a real voucher numbering regression. Must investigate. |
| N4 | E2E test 112 (manufacturing BOM) fails, blocking 23 manufacturing E2E tests | P2 | Manufacturing API shape mismatch. Manufacturing backend has substantial functionality (20+ tests) but the E2E API contract is different. |
| N5 | GSTR-9 and GSTR-9C have NO tests | P2 | GSTR-1 and GSTR-3B are tested. GSTR-9/GSTR-9C exist in gstr.py but are untested. |
| N6 | `validate_opening_balances` and `trial_balance_status` endpoints are not called anywhere in the codebase (no test, no voucher flow integration) | P1 | These endpoints exist but are dead ends — they don't gate anything. |
| N7 | Manufacturing is functional (20+ backend tests, stock entries, balanced journals) but E2E is blocked by API mismatch | P2 | Plan recommendation to REMOVE manufacturing is OUTDATED. Revised recommendation: fix the E2E/API mismatch and verify the existing manufacturing features. |
