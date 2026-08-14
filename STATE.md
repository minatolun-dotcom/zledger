# ZLedger Development State

**Last Updated:** 2026-08-14 UTC

## 2026-08-14 — Round 20: credit-limit warning toast, parties table columns, shared Party Master, bill-wise settlement guards ✅

### [COMPLETE] Round 20 — Tally-style credit limit + followups (2026-08-14) ✅
**Status:** Seventeenth sweep — the followup batch to the Party Master round:
- **Credit-limit warning (Tally behavior: warns, doesn't block).** `create_voucher`/`update_voucher` now compute `credit_limit_warning` on `VoucherOut` for sales/purchase invoices against a bill-wise party with a credit limit — exposure = open/partial outstanding across the party's bills (includes the just-posted invoice, since the ref is created in the service first) vs the limit. Frontend shows it as an amber `toast.info` after the success toast, on both create and update.
- **Parties table now shows Credit Limit, Bill-wise, Opening Balance (Dr/Cr) columns** — the accounting details are visible at a glance, not only inside the master screen.
- **`PartyMasterForm` extracted** (`frontend/src/components/master/PartyMasterForm.tsx`) and reused in the voucher quick-create modal for the party entity — Credit/Debit Note quick-create now opens the full Tally-style master (4 sections) with the modal's generic footer hidden for parties.
- **Bill-wise settlement guards** (`settle_bills` in `bill_wise.py`): payment vouchers may only settle purchase bills, receipts only sales bills; non-posted (draft/cancelled) payment vouchers can't settle. Previously a direct API call could mark a receivable "paid" by a payment that never came in.
- **Tests:** 7 new (2 credit-limit warning, 4 settlement direction/posted guards, 1 parties-table round-trip) — **557 pass / 0 fail**; tsc clean; API + web rebuilt.
- **Browser-verified:** real ₹1,120 sales invoice against an ₹800 credit limit shows both toasts ("Voucher created" + "Credit limit exceeded: total outstanding of ₹1,120.00 exceeds the party's limit of ₹800.00"); parties table headers show CREDIT LIMIT / BILL-WISE / OPENING BAL; sales quick-create auto-fills the account field with the new ledger labeled `(Customer)`; dark mode modal surface `#16161f`; zero console errors. Probe data cleaned. Committed + pushed.

## 2026-08-14 — Tally-style Party Master screen (round 19): grouped master, opening balance + credit limit + bill-wise toggle ✅

### [COMPLETE] Tally-style Party Master (2026-08-14) ✅
**Status:** Sixteenth sweep — rebuilt the party create/edit modal as a Tally-prime-style party master:
- **UI:** four grouped sections — Name & Group (name, party type, "Account under: Sundry Debtors/Creditors"), Mailing & Contact Details (address, state, contact person, phone, email), Statutory Details (GSTIN/UIN, PAN), Accounting Details (opening balance + Dr/Cr, credit limit, maintain-bill-wise checkbox).
- **Opening balance is now a party-master property** routed to the linked ledger (create: lands on the auto-created ledger; edit: synced, null = leave unchanged; `PartyOut` round-trips from the ledger).
- **New columns:** `parties.credit_limit` (Numeric 18,2) + `parties.maintain_bill_wise` (bool, default true) — migration `e4b7c1a2d9f0` (idempotent). Bill-wise toggle is wired into voucher posting: `sync_bill_reference` is skipped for parties with bill-wise off (no Outstanding Bills row; Tally behavior), default-on preserves existing behavior.
- **Tests:** 5 new (opening balance on auto-created ledger, edit sync, credit limit + bill-wise persist, bill ref default-on, bill ref skipped when off) — **550 pass / 0 fail**. API + web rebuilt; **browser-verified**: 4 sections render, full create (₹5,000 Dr opening, ₹1,00,000 credit limit, bill-wise on) → in list; edit prefills the accounting fields; live DB shows `credit_limit=100000.00 billwise=True ob=5000.00 Dr`; dark mode surface `#16161f`; zero console errors. Probe data cleaned.

## 2026-08-14 — Quick-create party account in vouchers: auto-party for receivables/payables ledgers + selector refresh fix (round 18) ✅

## 2026-08-14 — Quick-create party account in vouchers: auto-party for receivables/payables ledgers + selector refresh fix (round 18) ✅

### [COMPLETE] Quick-create party account verification + fixes (2026-08-14) ✅
**Status:** Fifteenth sweep — verified quick-create party flow end-to-end (backend + browser) and closed the remaining gaps:
- **Verified (works):** the legacy `entityKey="party"` selector (Credit/Debit Note forms) quick-creates a party + auto-ledger, appears immediately in the dropdown (cache invalidated), and auto-selects after creation.
- **Gap closed: Sales/Purchase account selector quick-created a party-less ledger.** The most-used forms' account selector was `entityKey="ledger"` — "Create …" made a plain ledger under Trade Receivables/Payables with `party_id = null` → no bill reference → invisible in Outstanding Bills/party statements/aging, no GSTIN/state capture. **Two-part fix:** (1) backend `create_ledger` now auto-creates the linked Party (customer/supplier by group, GSTIN carried over, audited, no duplicates when a same-named party exists) — Tally-prime behavior where a party account under Sundry Debtors/Creditors IS a party; (2) frontend wired `onItemCreated` on the Sales + Purchase account MasterSelectors (they were the only ones missing it) so the ledgers/parties queries invalidate and the field auto-fills with the new account ("… (Customer)"/"… (Supplier)") instead of staying empty until reload.
- **Already correct:** Payment/Receipt/Contra/line-level selectors already wired `onItemCreated`.
- **Tests:** 4 new in `test_coa.py` (auto-party both directions, other-group no-op, same-name skip) — **545 pass / 0 fail**. API + web rebuilt; browser-verified sales + purchase quick-create (field auto-fills with party label, party linked under Trade Receivables/Payables, parties page lists them) with zero console errors; probe data cleaned.

## 2026-08-14 — Party↔ledger divergence gaps closed (round 17): no unlink, no ledger sharing, group created on demand ✅

### [COMPLETE] Party↔ledger gap audit — data + code-level divergence check (2026-08-14) ✅
**Status:** Fourteenth sweep — audited the party↔ledger relationship for gaps:
- **Data audit (live DB): clean.** 69 parties — 0 with NULL ledger, 0 dangling (ledger missing), 0 cross-company links, 0 shared ledgers; the only party-less ledgers in Trade Receivables/Trade Payables are the 6 legitimate control ledgers (named after their own groups).
- **Gap closed: silent unlink.** `PATCH` with `ledger_id: null` detached the party's account → invisible in sales/purchase selectors (parties resolve by `ledger_id`) and no bill references. Now rejected (400) — a party must stay linked.
- **Gap closed: ledger sharing.** No ownership check meant two parties could share one ledger, so rename-sync/reclassification on one silently changed the other's account. `create_party`/`update_party` now reject linking an already-owned ledger (400 naming the owner); the auto path creates a fresh ledger instead of reusing another party's.
- **Gap closed: ledger-less party on partial COA.** Missing "Trade Receivables"/"Trade Payables" group (Tally-imported companies) produced a party no voucher form could select. The group is now created on demand with the standard parent/nature/system code (mirrors `coa.seed_groups`).
- **Tests:** 4 new — suite **541 pass / 0 fail**. API image rebuilt; **live probes** confirmed all three 400s; parties E2E re-run green; **browser-verified** with zero console errors. Test data cleaned.

## 2026-08-14 — Party management round 16: party delete + edit UI, ledger reclassification on type change, missing budget-tables migration ✅

### [COMPLETE] Party management — delete endpoint with guardrails, edit/delete UI, type-change reclassification, schema drift fix (2026-08-14) ✅
**Status:** Thirteenth sweep — closed out the round-15 known gaps and fixed a real schema-drift bug found along the way:
- **`DELETE /coa/parties/{id}` with guardrails.** Blocked (400, reason given) while vouchers, bill references, or TDS entries/certificates reference the party. Clean parties are deleted; their fresh unused account ledger (no opening balance, no voucher lines) goes with them, while a ledger with history/opening balance is kept so the books never silently change. Audited (DELETE entry).
- **Parties page row actions: Edit + Delete.** Edit reuses the create modal (PATCH) — rename-sync keeps the ledger chip live; Delete confirms, surfaces guardrail messages as toasts, and reloads.
- **Party-type change reclassifies the account.** customer ⇄ supplier moves the auto-created ledger between Trade Receivables/Trade Payables; user-named/user-grouped ledgers are left alone. Live-probed.
- **REAL BUG: budget tables had no migration.** `budgets`/`budget_periods`/`budget_allocations`/`budget_alerts` existed only as models — no Alembic migration created them, so a migrations-built schema (fresh install / CI) crashed on ANY ledger delete (ORM cascade SELECTs `budget_allocations`). Idempotent migration `f7867905e7e7` creates them when missing (guarded so the live DB — which already had them — is a no-op). Verified fresh-DB (create) and live-DB (no-op).
- **Tests:** 5 new — delete blocked by vouchers, clean delete removes unused ledger, ledger with opening balance survives, type change reclassifies both ways, user-grouped ledger untouched — suite **537 pass / 0 fail**. API image rebuilt; **live probes** confirmed guard/rename/reclassify/delete; parties E2E extended to create → edit → delete (**3 green**); **browser-verified** (light + dark): full party lifecycle via UI, zero console errors. Test data cleaned.

**Remaining recommendations:** a full `alembic revision --autogenerate` alignment pass would surface the other pre-existing model↔migration drifts the budget autogenerate revealed (TDS certificate timestamps/indexes, serials defaults, compliance/income-tax `financial_year` width, bill_adjustments debit-note FK) — they don't break the live stack today but should be normalized in one migration.

## 2026-08-14 — Party-account audit round 15: party↔ledger integrity (cross-company linkage, rename sync, ledger-delete guard) ✅

### [COMPLETE] Party-account integrity audit — party functions across voucher creation, quick-create, and the party field (2026-08-14) ✅
**Status:** Twelfth sweep — audited the party-account flow end-to-end (Party model → `POST/PATCH /coa/parties` → voucher forms → bill references). Three real integrity holes fixed:
- **Cross-company ledger linkage (data corruption).** `create_party`/`update_party` accepted any `ledger_id` — a bogus id gave a misleading FK-409, a foreign company's ledger silently linked the party to an account outside its books. Both now validate ownership → 400.
- **Stale ledger on party rename.** Party renamed but its auto-created account ledger kept the old name → voucher selectors/reports diverged. `update_party` now renames the linked ledger in sync (only when it carries the party's old name — user-named ledgers untouched).
- **Deleting a party's ledger orphaned the party.** `delete_ledger`/`bulk_delete_ledgers` only guarded voucher usage; a party-linked ledger deletion SET NULL'd the party's `ledger_id`, making it unreachable from the voucher party selector (parties resolve by `ledger_id`). Both now block with a clear message.
- **Verified the happy path is intact:** party quick-create from a voucher form (`MasterSelector` → `POST /coa/parties`) auto-creates the account ledger under Trade Receivables/Trade Payables (both groups are seeded on company creation) and the party appears in the selector immediately; party state/GSTIN drives `place_of_supply`/inter-state detection; sales/purchase bill references link by `party_id`.
- **Tests:** 6 new in `test_coa.py` — suite **532 pass / 0 fail**. API image rebuilt; **live probes** confirmed the 400s, rename sync, and delete guard against the running API; **browser-verified** (light + dark): Parties page, create-party modal, sales-voucher party dropdown containing the newly created party, zero console errors. Test data cleaned.

**Known gaps (recommendations, not fixed):** no `DELETE /coa/parties` endpoint (parties are immortal; ledger-delete guard makes removal awkward) and no party-edit UI on the Parties page (editing exists only via the voucher-form selector's Ctrl+Enter). Changing a party's `party_type` does not reclassify its ledger group (would move ledger history between report groups).

## 2026-08-14 — Audit round 14: bank recon / batches / data imports audited, CSV-import undo crash fixed, scheduler verifies the audit chain daily ✅

### [COMPLETE] Audit round 14 — remaining audit coverage (bank recon, batches, data imports), scheduler chain check, audit-trail E2E + full-suite green (2026-08-14) ✅
**Status:** Eleventh sweep — four workstreams:
- **Bank reconciliation audited:** match/unmatch, statement import, auto-reconcile now log with the acting user (endpoints had `user` deps but wrote no trail).
- **Batches audited:** stock batch create/update/delete (financially material — moves stock valuation).
- **Data imports audited end-to-end** (plain, tracked, and undo log CREATE/DELETE with counts).
- **REAL BUG: undo of a tracked CSV import crashed.** `undo_csv_import` did `job.created_details.items()` but tracked importers stored a flat list → AttributeError on every tracked undo. Now stored as `{entity_type: [items]}` — the shape undo expects. Fixed + tested.
- **Scheduler proactively verifies the audit hash chain** (`check_audit_chain` cron step): walks every active company's chain each pass, raises ONE in-app warning alert per distinct (company, break-signature); healed chains clear, fresh breaks re-alert. Tampering caught without anyone opening the Audit Log page.
- **Full-suite E2E green.** Sweep found 4 pre-existing spec bugs (not regressions): chart-of-accounts locators collided with the sidebar's new "Expand/Collapse all groups" toggle (fixed with `exact: true`), and einvoice-workflow detected enablement from the list endpoint which now deliberately returns `200 []` when disabled (detection now probes `GET /einvoice/{id}`: 400 disabled / 404 enabled; stale list assertion corrected).
- **Tests:** 7 new — bank recon audited, batch create audited, tracked import undo works + audited, scheduler alerts on tamper, heals, dedupes — suite **526 pass / 0 fail**. API image rebuilt, scheduler restarted; **live probe**: SQL-tampered audit entry → verify reported break → restored → clean; E2E green (audit-trail, admin-pages, voucher-edit, bills-api, + full 752-test sweep). **Browser-verified**: chain badge both states, COA expand/collapse, zero console errors. Test data cleaned.

## 2026-08-14 — Audit round 13: hash chain made real (created_at in hash, verify endpoint, UI badge), remaining mutations audited, audit-trail E2E spec ✅

### [COMPLETE] Audit round 13 — audit hash-chain integrity, remaining audit coverage, audit-trail E2E (2026-08-14) ✅
**Status:** Tenth sweep — three workstreams (remaining un-audited surfaces, hash-chain integrity, audit-trail E2E):
- **Hash chain never included `created_at` and was never verified.** The docstring promised a hash over the timestamp but `log_action` omitted it → altering a timestamp was undetectable; and no code ever walked the chain. The hash now includes `created_at` (deterministic ISO normalization, legacy entries still accepted by the verifier), and `GET /audit/chain/verify` checks every entry (recomputed hash both schemes + prev-link) returning `{total, ok, breaks[]}` for owners/accountants.
- **Audit UI surfaces chain integrity.** The Audit Log page verifies on load and shows a green "Chain verified · N entries" badge (or red "Chain broken · N tampered") — tampering is now visible, not theoretical.
- **Remaining financially-material mutations audited:** company profile (GSTIN/address) + voucher-numbering config, loans (create/update/delete/payments), GST registrations (create/update/delete), TDS sections + return file.
- **New audit-trail E2E spec** drives voucher create → CREATE entry + chain badge → edit → UPDATE → cancel → CANCEL with reversal, asserting every committed entry renders with zero JS errors.
- **Tests:** 5 new — chain verifies clean, tamper detected (hash + prev-link), created_at in hash, company/loan/GST/TDS audited — suite **522 pass / 0 fail**. API image rebuilt, scheduler restarted; E2E green (audit-trail, admin-pages, voucher-edit, bills-api). **Browser-verified**: chain badge in light + dark, zero console errors. Test data cleaned.

## 2026-08-14 — Audit round 12: audit trail actually persists, manufacturing journals converge on the central engine, Tally imports keep party + bill-wise linkage ✅

### [COMPLETE] Audit round 12 — audit trail integrity, manufacturing lifecycle, Tally round-trip (2026-08-14) ✅
**Status:** Ninth sweep — three workstreams (audit trail, manufacturing, Tally import) found real production gaps:
- **AUDIT TRAIL WAS SILENTLY EMPTY FOR MOST WRITES (real bug).** `log_action` ran after `db.commit()` with no follow-up commit in every voucher lifecycle endpoint (create/update/cancel/bulk-cancel) and 8 of 9 COA handlers (FY create/update/delete, group update/delete, ledger update/delete, party update), so the entry was rolled back at session close — vouchers, ledgers, groups, FYs, parties changed with NO audit record. Only party CREATE had the second commit. The `_tx` test fixture masked it (shared connection). **Live-verified: pre-fix voucher create → 0 audit entries; post-fix → CREATE entry persists.** Fixed all 12 sites.
- **Service-created vouchers were never audited.** Recurring template runs (manual + scheduled), loan disbursements/payments, and asset depreciation/disposal/revaluation build vouchers through `service_create_voucher` — outside the API layer, so no CREATE entry ever. The central service now logs it (API create no longer duplicates).
- **E-invoice/EWB generate & cancel unlogged.** IRN generation/cancellation and EWB generation/cancellation are statutory actions against GSTN with zero audit coverage — all four endpoints now record UPDATE entries with the acting user.
- **Manufacturing journals bypassed the central engine.** `confirm_production_order` built its journal manually: no FY-closed/date-in-FY check (production could post into a closed FY) and no header totals (`grand_total` was ₹0). Now both FY checks enforced + totals kept in sync.
- **Completed-order cancel left the journal in the books.** Old code flipped the voucher to `cancelled` with no reversal — the production cost stayed in the ledger with no audit-trail offset (round-10 loan-delete bug class). Now creates a linked reversal journal (opposite entries, `status='reversed'`, bidirectional links).
- **Tally imports dropped party linkage.** Parser captured `party_name`; importer discarded it → imported invoices had no `party_id`, never appeared in Outstanding Bills/party statements/aging, couldn't be settled bill-wise. Imported sales/purchase vouchers now keep the party (name→id map from existing + imported parties) and get their bill reference (savepoint-scoped so a bill-ref failure never aborts the import).
- **Tests:** 7 new (create/update/cancel audit entries committed, service-level create audited, e-invoice generate+cancel audited, production totals + completed-cancel reversal, confirm rejected in closed FY, imported voucher keeps party + bill ref) — suite **515 pass / 0 fail**. API image rebuilt, scheduler restarted; targeted E2E green (voucher-edit, bills-api, manufacturing, tally-import). **Browser-verified**: audit log page shows entries, manufacturing page renders, zero console errors; live API — voucher create now leaves a committed CREATE audit entry. Test data cleaned.

## 2026-08-14 — Audit round 11: voucher edit syncs (not duplicates) bill refs, live compliance blocks edit, duplicate/restore edge fixes, payment-side over-allocation caps ✅

### [COMPLETE] Audit round 11 — voucher lifecycle edges (edit, duplicate, restore, over-allocation) (2026-08-14) ✅
**Status:** Eighth sweep — the voucher lifecycle paths that bypassed the safeguards the other rounds built:
- **Edit duplicated bill references instead of refreshing them.** `create_bill_reference` re-ran on every edit with no dedup, so each edit added another ref row and stale refs stayed in Outstanding Bills. Now `sync_bill_reference` updates the existing ref when present and creates only when missing — `_post_voucher_effects` uses it, so edits stay in lockstep with the books (live-verified: edited invoice keeps exactly one ref).
- **Edit lacked the cancel path's compliance guard.** A voucher with a live e-invoice IRN or e-way bill (submitted/generated) could be edited, rewriting what GSTN already tracks. `update_voucher` now runs `_assert_no_live_compliance` — same rule and guidance as cancel (cancel the doc first, or credit-note).
- **`duplicate_voucher` numbering wasn't FY-aware.** Its private copy still resolved the FY from today's date — a duplicated 2026 voucher could number as FY 2027. It now passes the new voucher's date through the shared FY-aware `_next_voucher_number`.
- **Restore left draft e-invoices/e-way bills dead.** A locally-cancelled draft IRN/EWB stayed `cancelled` after restoring the voucher, so the voucher was live but its compliance docs weren't. Restore flips locally-cancelled drafts back to `draft` (externally-cancelled stay cancelled).
- **Payment-side over-allocation caps (settle + allocate).** Both `settle_bills` and `allocate_payment` capped only against the bill's outstanding, never the payment voucher's own amount — a ₹1,000 payment could be split ₹600 + ₹600 across two calls (each under the bill's outstanding) with ₹1,200 settled in the books. The cumulative total (existing allocations + this request) now can't exceed the payment amount; `settle_bills` validates the whole request before writing anything (no partial allocations on a rejected request).
- **Tests:** 12 new (edit refresh-no-dup, edit blocked on live IRN/EWB, duplicate FY numbering, restore resets drafts, settle/allocate capped across calls and against the payment amount) — suite **508 pass / 0 fail**. API image rebuilt, scheduler restarted; targeted E2E green (voucher-edit, quick-edit, bills-api, payment-allocation-workflow, restore, voucher-numbering-fy). **Browser-verified**: Sales page + create form + detail render, zero console errors; live API — second ₹600 settle on a ₹1,000 receipt returns 400 "exceeds payment amount", edited invoice keeps exactly one bill reference. Test data cleaned.

## 2026-08-13 — Audit round 10: loan vouchers go through the central engine, asset disposal/revaluation can't silently drop the journal, loan delete reverses properly ✅

### [COMPLETE] Audit round 10 — operational accounting modules (loans, fixed assets) converge on the central voucher machinery (2026-08-13) ✅
**Status:** Seventh sweep — the last two accounting modules that created/cancelled vouchers OUTSIDE the central service:
- **Loan vouchers now flow through the central `create_voucher`.** The loan module had its own private voucher-numbering copy that (a) resolved the FY from TODAY's date instead of the voucher's date, (b) never reset per-FY, and (c) fell back to counting EVERY payment voucher ever created (including cancelled) — producing divergent, colliding numbers next to the VoucherList. Loan-created payment/receipt vouchers now get FY-aware per-FY numbering (rounds 7-8), FY-closed/date-range rejection, the duplicate guard, and are stamped with the real acting user (the old path also never recorded `created_by`).
- **Deleting a loan properly cancels its disbursement voucher.** The old delete flipped `status='cancelled'` with no reversal voucher and no dependent cleanup — the loan's entry stayed in the books forever with no audit-trail reversal. Loan delete now runs the same machinery as VoucherList cancel: reversal voucher + TDS/allocations/bill-reference cleanup.
- **Asset disposal/revaluation can no longer silently swallow the journal.** Both passed `company_id` (a string) where `create_voucher` expects a `Company` object inside a `try/except: pass` — so the voucher ALWAYS failed and the asset was marked disposed / revalued with NO journal in the books. Now: the correct `Company` object, no exception swallowing (a closed-FY or unbalanced journal fails loudly and leaves the asset untouched), the disposal journal is guaranteed balanced (P&L ledger created under Indirect Incomes/Expenses when missing; bank ledger required), the fixed-asset ledger resolves by system code, and the acting user is recorded.
- **Tests:** 4 new (loan numbering follows the VOUCHER's FY + restarts per FY, loan delete creates a reversal voucher, disposal posts a balanced journal with the correct WDV credit, disposal rejected in a closed FY leaves the asset active) — suite **498 pass / 0 fail**. API image rebuilt, scheduler restarted. **Browser-verified**: Loans page + Fixed Assets page render; loan created → disbursement voucher set → delete → voucher `cancelled`; disposal → posted journal (Dr Bank 9000 + Dr Loss 1000 = Cr Fixed Asset 10000), zero console errors. Test data cleaned.

## 2026-08-13 — Audit round 9: cancelled vouchers can't leak into GST returns/analytics, live e-way bills block voucher cancel, GSTR-1 reports debit notes ✅

### [COMPLETE] Audit round 9 — every statutory/analytics surface is posted-only, e-way bills join the IRN guard, CDNR gains debit notes (2026-08-13) ✅
**Status:** Sixth sweep — the GST compliance layer was the last place cancelled vouchers could still move the numbers:
- **GSTR-3B/9/4/9C ignored voucher status (real statutory bug).** Round 1's "cancelled vouchers never move the books" held everywhere except the GST returns: only GSTR-1 filtered `status='posted'`. A cancelled sales invoice still inflated GSTR-3B Table 3.1(a) — the company over-paid GST on a voided transaction — and its cancelled purchase still claimed Table 4 ITC. Every voucher-driven query now requires `status='posted'` (13 ITC subqueries went through a shared `_posted_voucher_ids` helper; the outward/RC blocks got direct filters).
- **Live e-way bills leak on voucher cancel.** A voucher with a `generated` e-way bill could be cancelled, leaving GSTN tracking goods in transit for a voided invoice — the e-way twin of the round-5 IRN guard. Now `submitted`/`generated` e-way bills block voucher cancel (cancel the EWB first or issue a credit note); `draft` e-way bills are cancelled locally with the voucher. Both single and bulk cancel paths covered.
- **GSTR-1 dropped outward debit notes.** CDNR only reported credit notes ("C"); a debit note's upward-adjustment GST liability never reached the return. Debit notes now join CDNR with doc type "D" (still excluded from B2B/B2CS).
- **BI dashboard "Top Customers/Suppliers" included cancelled vouchers.** The revenue/purchase widgets (used by the BI page) summed every voucher — fixed to posted-only, matching the round-8 slow-payer fix.
- **TDS certificate generate returned `id: null`** — the row wasn't flushed before serialization; now it carries the real id.
- **New E2E spec `tds-certificate.spec.ts`:** seed sections → payment + deposited TDS entry → bare-quarter "Q2" certificate lands in the CURRENT FY and includes the Aug-2026 entry → Q3 excludes it → certificate list shows the row.
- **Validation:** backend **494 pass / 0 fail** (7 new tests: 3B outward/ITC cancelled exclusion, GSTR-1 debit-note "D" + credit-note "C" preserved, generated-EWB cancel block, draft-EWB local cancel, dashboard top-customers exclude cancelled); API image rebuilt + scheduler restarted; targeted E2E green (einvoice-eway, eway-bill-workflow, tds-tcs-workflow, tds-certificate). **Browser-verified**: BI dashboard Top Customers widget shows ₹50,00,000 (posted 5M) and NOT ₹1,50,00,000 (cancelled 10M excluded), slow-payer API reports net 4,999,600 after a ₹400 receipt, zero console errors. Test data cleaned.

---

## 2026-08-13 — Audit round 8: statutory TDS surfaces posted-only, certificates dated in the right FY, numbering follows the voucher's FY, BI slow-payer honesty ✅

### [COMPLETE] Audit round 8 — statutory documents can't carry dead vouchers, certificates stop living in FY 2024, numbering follows the voucher's date (2026-08-13) ✅
**Status:** Fifth sweep, plus the E2E specs the previous rounds' fixes deserved:
- **TDS/TCS statutory surfaces now require a posted voucher.** Returns, certificates, and the summary/party-summary previously read entries without checking the voucher — a legacy deduction row (created before round 3's cancel cleanup and round 7's posted guard) would still be filed into a return or printed on a Form 16A. All four functions join the voucher and require `status='posted'`. Locked with a test that re-inserts a deposited entry on a cancelled voucher and proves it stays out of the Q2 return, the summary, the party summary, and the certificate.
- **Certificates were hard-dated to FY 2024 (real statutory bug).** The UI sends a bare quarter ("Q2"); `period_value[-4:]` isn't numeric so the code fell back to a hard-coded 2024 — every UI-generated quarter certificate covered Jul–Sep 2024 regardless of the books. Bare quarters now resolve to the current FY (April+ = this year), explicit `Q1-2026` still works, and `period_type=month` no longer crashes.
- **Voucher numbering follows the VOUCHER's FY, not today's date.** A June-2027 invoice posted in August 2026 previously got `INV-2026-…`; `_next_voucher_number` now resolves the FY from the voucher's date through the containing `FinancialYear` (per-FY sequence reset preserved — round 7's `current_fy_year` column needs no migration). The form's next-number preview passes the selected FY's start date so the placeholder matches what a dated voucher will receive.
- **BI "Slow paying customers" was ranking by cumulative billings.** The query summed only `VoucherLine.debit` across all of a customer's vouchers — receipts (credits) never reduced the figure, so a fully paid-up customer showed the total invoiced. Now `SUM(debit − credit)` on the customer's own receivable ledger (posted only) — consistent with the Outstanding report and dashboard receivables.
- **New E2E specs (the follow-up asks):** `debit-note-adjust.spec.ts` — full payables-side flow in the browser: purchase → auto-bill → debit note listed unapplied → partial ₹250 adjust → Payables-tab Adjust modal (lists the debit note) applies ₹150 with the toast confirming → over-adjust is capped to the remaining unapplied (never negative). `voucher-numbering-fy.spec.ts` — FY-prefix config → INV-2026-0001/0002 → first invoice dated in FY 2027 restarts at INV-2027-0001 → next-number preview per selected FY → the Sales form's Voucher No. field pre-fills INV-2026-0003.
- **Validation:** backend **487 pass / 0 fail** (3 new tests); API image rebuilt + scheduler restarted; targeted E2E regression batch green (tds-tcs-workflow, payments-receivables, bills-api, voucher-no-invoice-no) + the 2 new specs; live API verified — bare-Q2 certificate includes an Aug-2026 entry (old code dropped it), Q1-2026 correctly excludes it; browser-verified via the new specs (zero console errors in the flows exercised). Test data cleaned.

---

## 2026-08-13 — Audit round 7: payments surfaces converge on bill-wise truth, per-FY numbering, TDS posted-voucher guard ✅

### [COMPLETE] Audit round 7 — Payments page agrees with Outstanding Bills, numbering resets per FY, TDS can't attach to cancelled vouchers (2026-08-13) ✅
**Status:** Fourth sweep. Round 6's adjust work exposed that several accounting surfaces were reading *different truths*; round 7 converged them and closed two more integrity gaps:
- **Two divergent allocation paths (real bug).** The PaymentsPage manual `allocate_payment` never touched `bill_references` (only `settle_bills` did), so PaymentsPage allocations were invisible to the Outstanding Bills report and aging; its cap also ignored `adjusted_amount` (a credit-note-adjusted invoice could be over-paid). `allocate_payment` now caps against the bill ref's TRUE outstanding and recomputes the ref — one number everywhere.
- **`delete_allocation` left the bill ref stale** (paid_amount stayed reduced after deleting an allocation — the same leak round 3 fixed for the voucher-cancel path). It now recomputes the ref from surviving allocations.
- **Receivables/payables lists ignored credit-note adjustments.** `get_receivables`/`get_payables` used `grand_total − paid`, so an adjusted invoice showed fully unpaid while the Outstanding report showed the true figure. Both now read the bill-reference outstanding (falling back gracefully when no ref exists).
- **Voucher numbering never reset per FY.** `next_sequence` was one global counter — the first invoice of FY 2027 was `INV-2027-0042`. New `current_fy_year` on `voucher_numbering` (migration `c7d8e3f4b5a6`) detects the FY rollover and restarts the sequence at 1, matching TallyPrime. Demo companies keep the legacy fallback (no numbering rows) — unaffected.
- **TDS entries could attach to a cancelled/reversed voucher.** `create_tds_tcs_entry` now rejects (422, TallyPrime-style) deductions against anything but a posted voucher — a cancelled payment can't keep inflating TDS summaries/returns.
- **Validation:** backend **485 pass / 0 fail** (7 new tests: receivables reflect adjustment, allocate caps+syncs ref, delete-allocation recompute, receivables/payables totals agree, FY rollover restarts sequence, FY 2027 continues 0002…, TDS rejected for cancelled voucher); migration `c7d8e3f4b5a6` applied to live DB; API image rebuilt (migration baked in) + scheduler restarted on the new image; targeted E2E green (payments-receivables, payment-allocation-workflow, voucher-no-invoice-no, tds-tcs-workflow, bills-api); browser-verified — Payments & Receivables renders both tabs, Outstanding Bills regression clean, voucher creation via the numbering path OK, TDS guard returns the posted-voucher error, zero console errors. Test data cleaned.

---

## 2026-08-13 — Audit round 6: adjust clamping + validation, debit-note side, log retention ✅

### [COMPLETE] Audit round 6 — over-application can't happen, payables get debit-note adjust, run history is capped (2026-08-13) ✅
**Status:** Round 5 built the credit-note adjust UI; round 6 found the cases where it could still lie and closed them, plus the missing payables twin:
- **Over-application was possible (real bug):** `adjust_bill_for_credit_note` applied the FULL credit note with no cap — a ₹1000 credit note against a ₹600 bill drove outstanding to **−₹400**. The amount is now capped to `min(note_unapplied, bill_outstanding)`; a note can be split across several bills (the remainder stays unapplied) and a partial amount can be requested. The response reports the actual `applied_amount`. The Adjust modal gained a per-note amount input (default = the cap) and the toast reports what was truly applied.
- **Adjustment validation:** the note must belong to the SAME party as the bill, and direction is enforced — a credit note only adjusts a sales (receivable) bill, a debit note only a purchase (payable) bill. (The API previously accepted any note against any bill; the round-4 tests were updated to pass `party_id` like the UI always does.)
- **Debit-note side was missing entirely:** purchase bills couldn't be adjusted at all — the Payables tab's Adjust modal listed *credit* notes (wrong document type). New `BillAdjustment.debit_note_voucher_id` (nullable, migration `b4e2f1a9c7d5`) + `adjust_bill_for_debit_note` + `POST /bills/debit-note/{id}/adjust/{bill_id}` + `GET /bills/debit-notes/{party_id}`; the modal now lists debit notes for payable bills. Cancel-undo covers both columns (`or_`), so cancelling a debit note restores the purchase bill's outstanding exactly.
- **Run history is capped:** `recurring_template_logs` grew unbounded — every cron run appended forever. The shared processor now prunes to the latest 100 rows per template. **Real bug found while building this:** the prune DELETE was NOT scoped by template — `id NOT IN (template-A's keep-set)` wiped EVERY other template's logs. Fixed (scoped delete + flush before subquery) and locked with a cross-template regression assertion.
- **Validation:** backend **478 pass / 0 fail** (7 new tests: clamp, partial amount, party mismatch, direction mismatch, debit-note adjust+cancel restore, debit-note cap/unapplied, log retention incl. cross-template guard); migration `b4e2f1a9c7d5` applied to live DB; tsc clean; targeted E2E green (bills-api, recurring templates ×3, phase1-billwise); browser-verified — receivable Adjust modal caps at ₹600 with a partial-amount input (apply 250 → toast ₹250), Payables tab Adjust modal lists DEBIT notes capped at ₹500 (apply 200), template logs recorded, zero console errors; live API spot-checks confirmed cap + cancel-restore semantics. Test data cleaned.

---

## 2026-08-13 — Audit round 5: aging correctness + e-invoice lifecycle + run history + adjust UI ✅

### [COMPLETE] Audit round 5 — aging reflects real outstanding, live IRNs block cancels, run history in UI (2026-08-13) ✅
**Status:** Third integrity sweep plus the UI the round-4 APIs deserved:
- **Aging was lying about receivables/payables.** `get_aging` summed each party's voucher grand_totals, which ignored partial payments AND added credit-note vouchers to the aging balance (a receivable looked BIGGER after issuing a credit note). It now buckets each bill reference's `outstanding_amount` (already payment- and adjustment-aware) — one fix covers the report, its PDF, and its XLSX export. Cancelled invoices never age (posted-only + open/partial status filter).
- **Vouchers with a LIVE e-invoice can no longer be cancelled.** An IRN already submitted to the IRP is only cancellable there — letting the voucher die under it left GSTN seeing a valid invoice while the books said void. Voucher cancel now returns 400 with guidance (cancel the IRN first, or issue a credit note) when any e-invoice is `submitted`/`generated`; `draft` e-invoices (never submitted) are cancelled locally in the same step. `EInvoiceOut`/`EInvoiceListOut` now expose `voucher_status`, and the E-Invoices page flags rows whose voucher is gone ("Voucher cancelled" chip).
- **Template run history.** Every execution (success AND failure) is recorded in a new `recurring_template_logs` table — run-at, success, voucher number, error — and surfaced in a "Run history" modal on the templates page (kebab menu). The manual run-now endpoint now uses the same savepoint cleanup as the shared processor instead of a destructive full `Session.rollback()`.
- **Credit-note adjust got its UI.** The Outstanding Bills report gained an "Adjust" action per bill: it opens a modal listing the party's unapplied credit notes (computed from the `bill_adjustments` attribution ledger) and applies the chosen one — outstanding updates in place. Endpoint also gained `GET /bills/credit-notes/{party_id}` for the unapplied list.
- **GSTR returns audit:** GSTR-1/GSTR-3B already filter posted vouchers — cancelled vouchers can't leak into returns (no change needed).
- **Validation:** backend **471 pass / 0 fail** (6 new tests: aging after credit-note adjust, aging excludes cancelled invoices, live IRN blocks cancel, draft e-invoice cancelled with voucher, template failure+success logs, manual-run failure log); migration `c9d41e2f8a63` (recurring_template_logs) applied to live DB; tsc clean; targeted E2E green (bills-api, recurring templates ×3, reports-tabs); browser-verified — Adjust button + modal (credit-note row listed) on Outstanding Bills, kebab → Run history modal, e-invoice page loads, dark-mode modal panel `#16161f`, zero console errors; live API spot-check: adjust −₹400 → outstanding ₹1000→₹600, aging total consistent. Test data cleaned.

---

## 2026-08-13 — Audit round 4: credit-note adjustments + recurring-template resilience ✅

### [COMPLETE] Audit round 4 — adjustments undone on cancel, templates auto-pause (2026-08-13) ✅
**Status:** Two more integrity surfaces hardened to TallyPrime grade:
- **Credit-note → bill adjustments are now persisted and undoable.** A new `bill_adjustments` attribution table records every `POST /bills/credit-note/{id}/adjust/{bill_id}` (credit note → bill reference → signed amount). Cancelling a credit note now rolls back exactly the attributed amount and recomputes the invoice's outstanding — previously the reduced outstanding survived forever (and the delete path too, since deleting requires cancelling first).
- **The adjust endpoint's math was wrong (sign bug):** it applied the credit-note amount POSITIVELY, which pushed the invoice's outstanding UP instead of DOWN. Now the amount is applied negatively — a ₹500 credit note against a ₹500 invoice brings outstanding to ₹0, TallyPrime semantics.
- **Recurring templates auto-pause after 3 consecutive failures.** A template whose payload can no longer produce a voucher (deleted ledger, date outside all FYs, closed FY, unbalanced payload) previously retried silently every cron run forever. Now `consecutive_failures` + `last_error` are tracked by a shared processor (cron + manual process-due + run-now); after 3 failures the template is paused with the reason visible in the UI ("Paused (auto)" amber chip + tooltip). Resuming resets the counter.
- **Backup/export audit:** pg_dump covers reversal rows + numbering (nothing to fix); voucher CSV export includes `status`; CSV import intentionally always creates posted vouchers (it's an onboarding tool — document only).
- **Validation:** backend **465 pass / 0 fail** (4 new tests: adjust reduces outstanding + cancel restores, delete keeps it restored, auto-pause + resume reset, successful run resets counter); migration `a7c3e91b2d48` (bill_adjustments table + template failure columns) applied to live DB; tsc clean; targeted E2E green (bills-api, recurring-templates-crud, recurring-template-workflow, payments-workflow, recurring-template-round-off); browser-verified — adjust → outstanding 0 → cancel → 500 restored, "Paused (auto)" chip + tooltip rendered, zero console errors.

---

## 2026-08-13 — Audit round 3: cancelled vouchers can't leave orphaned dependents ✅

### [COMPLETE] Audit round 3 — dependent cleanup on cancel (2026-08-13) ✅
**Status:** Three more "can the books lie here?" findings fixed — all around what happens AFTER a voucher is cancelled.
- **TDS/TCS entries now deleted when their voucher is cancelled** — a TDS deduction on a payment that is later cancelled would otherwise keep inflating the TDS summary, quarterly returns, and certificates for a transaction that no longer exists.
- **Payment allocations are removed and the invoice's bill reference recomputed on cancel** — cancelling a settled receipt/payment used to leave stale allocation rows and a reduced `paid_amount` on the invoice's bill ref (its outstanding stayed understated until the invoice was edited). Now the allocations are deleted and the bill ref is recomputed from the surviving allocations, so the invoice snaps back to genuinely outstanding.
- **Duplicate detection ignores cancelled/reversed vouchers** — `_check_duplicate_voucher` only compares against `status='posted'` vouchers now; the common "cancel a wrong entry, then re-post it correctly" flow no longer trips the 409 duplicate guard (the cancelled original or its reversal could previously block the re-post).
- **Validation:** backend suite **460 pass / 0 fail** (3 new tests: TDS cleanup on cancel, outstanding restored after cancelling a settled receipt, re-post after cancel); targeted E2E green; browser-verified.

---

## 2026-08-13 — Approval workflow removed (local-use product) — reversal vouchers + audit fixes kept ✅

### [COMPLETE] Approval workflow rolled back (2026-08-13) ✅
**Status:** Per product decision (local-use software), the draft → pending → posted approval pipeline was fully removed. Vouchers post immediately on save again — no workflow overhead. The parts that genuinely protect the books were kept:
- **Removed:** `status` field on `VoucherCreate`, draft/pending handling in `create_voucher`/`update_voucher`, the `/submit` `/approve` `/reject` endpoints, "Save as Draft" button (all 8 forms + footer), Submit/Approve/Reject kebab actions, Pending/Rejected status chips, and their 6 tests.
- **Kept:** explicit reversal vouchers on cancel (`status="reversed"`, linked via `original_voucher_id`/`reversed_by_voucher_id`, restored/deleted with the original, uneditable, excluded from reports) — TallyPrime-style audit trail; bank-reconciliation candidate filters + `voucher.is_cancelled` fix; `payments.py` posted-only filters; `update_voucher` now explicitly sets `status="posted"` on edit.
- **Validation:** 457 backend tests pass (was 463 − 6 approval tests); tsc clean; targeted E2E (vouchers, voucher-workflow, voucher-edit, restore, bulk-actions, round-off) all green; browser-verified — no Save as Draft button, vouchers post immediately, cancel still creates the linked reversal, `/approve` returns 404, zero console errors.

---

## 2026-08-13 — Explicit reversal vouchers + audit round 2 ✅

### [COMPLETE] Explicit reversal vouchers + audit round 2 (2026-08-13) ✅
**Status:** Cancelling a voucher now creates an explicit linked reversal entry (TallyPrime-style audit trail), and two more integrity bugs were fixed. *(A draft → pending → posted approval pipeline was prototyped alongside this work and rolled back the same day as overkill for a local-use product — see the entry above.)*
- **Reversal vouchers:** cancelling now creates an explicit `status="reversed"` voucher with exact opposite lines, linked via `original_voucher_id`/`reversed_by_voucher_id` (audit trail visible in Day Book); restore deletes it; delete cascades; reversals are uneditable and excluded from all aggregation (posted-only filters).
- **Audit round 2:** bank-recon candidate matching (`find_matching_vouchers`, `auto_reconcile`, `batch_suggest`) now filters `status='posted'` (cancelled vouchers can no longer be offered as matches) and the `voucher.is_cancelled` AttributeError in `batch_suggest` is fixed; matching a statement row to a cancelled voucher is rejected; `payments.py` allocation/outstanding queries switched from `cancel_reason.is_(None)` to `status='posted'` (drafts + reversals can't leak).
- **Frontend:** Reversed status chip in the voucher list.

---

## 2026-08-13 — Accounting integrity hardening: soft-cancel hygiene, FY validation, atomic edit ✅

### [COMPLETE] Accounting integrity hardening (2026-08-13) ✅
**Status:** Six critical accounting-integrity bugs found in a TallyPrime-grade audit were fixed; the books can no longer lie after a cancellation, edit, or out-of-FY posting.
- **Cancelled vouchers no longer move the books:** `status = 'posted'` filters added across every financial aggregation — `get_ledger_balances` (TB/P&L/BS), `get_ledger_transactions`, `get_round_off_total`, cost-centre P&L, aging, cash flow, register; dashboard (incl. raw-SQL trends), business intelligence, GSTR, TDS/TCS summaries; party bill-wise statements (bills + allocations) and outstanding bills; stock movement summary excludes cancelled.
- **Stock reversal on cancel/edit:** cancelling a sale/purchase reverses its `StockEntry` rows via the weighted-average path (opposite entry type at the original rate — restores quantity and value exactly); editing swaps old entries for new; credit/debit notes reverse stock.
- **FY date validation:** `_check_voucher_date_in_fy` rejects voucher dates outside ALL financial years (lenient when none configured — fresh setup/tests); Tally import bypasses it deliberately (historical data); edit/cancel/restore also guard the closed-FY lock (cancel was previously unguarded).
- **Atomic edit:** `update_voucher` rewritten — no create-then-reparent, no voucher-number burn, single transaction (no mid-edit commit leak), version snapshot of the pre-edit state + correct audit `old_value` ordering.
- **Validation:** backend suite **453 pass / 0 fail** (12 new integrity tests + 2 party-statement tests); E2E: voucher-workflow 7/7, restore 12/12, bulk-actions 6/6, voucher-edit 4/4, inventory 11/11, api-backend 129/129, bills-api 9/9, financial-years, fy-validation, tds-tcs 9/9, gstr-annual, compliance-gstr, payments-workflow, payment-allocation 2/2, round-off, voucher-totals, reports/dashboard specs — all green; tsc fe+e2e clean; reviewer feedback (Tally-import bypass, restore path, bill-wise statements) verified and addressed.

### [COMPLETE] Round-off follow-ups: P&L, voucher export, ledger drill-down (2026-08-12) ✅
**Status:** Round-off visibility extended to the remaining three surfaces — the Profit & Loss report, the vouchers CSV export, and the ledger transactions drill-down.
- **Profit & Loss:** `ProfitAndLossResponse` now carries `round_off_total` + `round_off_type` (net credit−debit on `SYS_ROUND_OFF` for the FY, same `get_round_off_total()` helper). The P&L view shows `Of which, Round Off adjustment: ₹X Cr/Dr` under Net Profit (informational — already inside income via Indirect Incomes, NOT added to totals); the P&L PDF/XLSX exports append the same note via a `round_off_note` param on the shared grouped builders.
- **Vouchers CSV export:** the `data/import/export` endpoint finally supports `vouchers` (advertised in the 422 message and the import UI, but missing from `EXPORT_ENTITIES` — latent gap). New `_export_voucher_row()` outputs date/number/type/party/narration/subtotal/tax_total/grand_total/**round_off**/status, with `round_off = grand_total − subtotal − tax_total`; vouchers ordered by date. Export tab relabeled "Data" (was "Masters") since vouchers aren't a master; the Vouchers checkbox now appears.
- **Ledger transactions drill-down:** `get_ledger_transactions()` adds a per-transaction `round_off` (same formula, via new shared `voucher_round_off()` helper in `services/reports.py` — also reused by the CSV export, mirroring the frontend `roundOffAmount()`). `LedgerTransactionOut` gained `round_off`; the ledger detail modal table has a new Round Off column (green `+₹X` / rose `−₹X` cells, blank when none) and the ledger PDF/XLSX exports gained the column too.
- **Tests:** 6 new backend tests (P&L round_off_total ×2, ledger transactions round_off ×2, vouchers CSV export ×2) — suite **439 pass / 0 fail**; tsc fe + e2e clean; real-browser verification 7/7 PASS, zero console errors, dark mode clean; test data cleaned.

## 2026-08-12 — Round-off visibility everywhere: voucher list/detail, Trial Balance, Balance Sheet + template round-trip E2E ✅

### [COMPLETE] Round-off visibility follow-ups (2026-08-12) ✅
**Status:** The rounding adjustment is now visible everywhere a voucher or report is shown — the voucher list, the voucher detail modal, the Trial Balance, and the Balance Sheet all surface it explicitly. Recurring-template round-off got a full E2E round-trip spec.
- **Voucher list (Browse) Round Off column:** new non-sortable column shows a green `+₹0.32` / rose `−₹0.68` chip per row, computed client-side as `grand_total − subtotal − tax_total` (discount is netted in subtotal, so the formula is exact); `—` when no adjustment.
- **Voucher detail modal (reports drill-down):** Summary tab's totals footer now shows a Round Off row between Total and Grand Total, with the adjustment on the Dr or Cr side by sign (uses the same `grand_total − subtotal − tax_total` helper; `VoucherDetail` interface + `ReportsPage.fetchVoucherDetail` carry subtotal/tax_total through).
- **Trial Balance:** new `round_off_total` + `round_off_type` in the response (net credit−debit on the `SYS_ROUND_OFF` ledger for the FY); the report's footer shows a highlighted `Round Off (net): ₹X Cr/Dr` row; included in TB PDF + XLSX exports.
- **Balance Sheet:** same `round_off_total` in the response + exports; the UI shows `Of which, Round Off adjustment: ₹X Cr/Dr` under Liabilities & Capital (informational only — it is already part of Net Profit, so it is NOT added to totals, avoiding double-counting).
- **E2E round-trip spec** `tests/e2e/specs/recurring-template-round-off.spec.ts` (6 tests, serial): fractional Auto-mode sale → Save as Template → **Round Auto chip** in the template table → **Edit-modal selector pre-set to Auto** → **Run now** → generated voucher is ROUNDED (₹338, `round_off=0.32`, Dr=Cr, dated today) → **Browse list shows the +₹0.32 Round Off cell** → template deleted.
- **Tests:** backend suite **433/0** (4 new: TB round-off Cr/Dr/zero + BS round-off); E2E recurring-template-round-off **6/6** + round-off **5/5**; tsc fe + e2e clean; real-browser verification **10/10 PASS** with zero console errors — list chip +₹0.32, detail-modal Round Off row before Grand Total, TB `Round Off (net)` footer row (aggregate across the FY), BS `Of which…` line, dark-mode clean.
- **Note:** suggestion 1 (per-voucher Round Off toggle) was already implemented in all three item forms (Sales/Purchase/Credit/Debit via `VoucherFooter`) — verified by the existing round-off spec's mode-switching tests; no code change needed there.

## 2026-08-12 — Round-off follow-ups: PDF totals row, template mode, Day Book/Register column ✅

### [COMPLETE] Round-off follow-ups (2026-08-12) ✅
**Status:** Three round-off gaps closed — PDF totals now reconcile, recurring templates carry a rounding mode, and the adjustment shows as its own line in Day Book / Register.
- **PDF Round Off row is now total-derived:** shows whenever `grand_total ≠ subtotal + tax` (new `round_off_amount()` helper in `pdf.py`, snapped to 2dp) — covers `round_off_to` modes AND the ≤0.01 auto-balance path (previously gated on `round_off_to is not None`, so legacy/auto-balance vouchers printed unreconciled totals). Row is inserted BEFORE Grand Total so the last emphasized row (bold + rule) stays Grand Total.
- **Recurring templates carry a round-off mode:** `RecurringTemplateOut` exposes a derived `round_off_to`; create/update accept it and merge into `template_payload` (update uses `model_fields_set` so explicit `null` clears the mode while an absent field preserves the embedded value; create no longer strips the embedded mode when the top-level field is absent). Generated vouchers honor it — new `backend/tests/test_recurring_templates_round_off.py` (incl. a run-now test asserting the generated voucher is rounded). `RecurringTemplatesPage` gained a Round Off selector in the form + a "Round Auto/Up/Down" chip in the table.
- **Day Book / Register show the adjustment as its own line:** `DayBookEntry.round_off = grand_total − subtotal − tax` (computed per voucher — daybook is one-entry-per-voucher, so no line-count inflation), exposed in the JSON API + CSV/XLSX/PDF exports + the Register report; Day Book table (flat + grouped-by-date) and Register report gained a Round Off column. Discount is netted into `subtotal` upstream, so the formula is exact.
- **Tests:** backend suite **429/0** (17 round-off tests incl. new PDF-helper + daybook + template tests); E2E `round-off.spec.ts` now **5/5** (new: Auto-mode template run generates a ROUNDED voucher); tsc fe + e2e clean; real-browser verification ALL CHECKS PASSED — PDF totals show "Round Off 0.32" with row order Subtotal<Discount<Tax<Round Off<Grand Total, Day Book column header + API `round_off=0.32`, template chip "Round Auto" + Edit-modal selector, dark mode clean, zero console errors.

## 2026-08-12 — Voucher round-off verified + 2 real bugs fixed ✅

### [COMPLETE] Round-off: save 422 + round_off_to semantics (2026-08-12) ✅
**Status:** Browser verification of Sales/Purchase round-off (all 4 modes render + round correctly) found 2 real bugs, both fixed:
- **Bug 1 (blocking):** saving an item voucher with a fractional total + round-off 422'd (`Ledger is required for each line`) on any company without a "Round Off" ledger — the UI's round-off line posts with `ledger_id: ""`, and NONE of the demo companies had the ledger (verified in DB: Apex 45 ledgers, Partnership 49, Pvt Ltd 43, all without Round Off). `_process_voucher_lines` now resolves empty-ledger, no-qty/rate, non-zero-amount lines via `_get_or_create_round_off_ledger` (auto-creates `SYS_ROUND_OFF` under Indirect Incomes); genuine empty-ledger lines still 422.
- **Bug 2 (semantics):** backend treated `round_off_to` as "nearest multiple" and skipped 0; UI sends 0=Auto/1=Up/2=Down. Credit/debit notes with fractional totals + rounding failed to balance; Sales/Purchase stored UNROUNDED grand_total (₹338 sale showed 337.68 in Day Book). Backend now interprets 0/1/2 as UI modes (HALF_UP / CEIL / FLOOR, legacy multiples preserved in the else branch); Sales/Purchase send `round_off_to` instead of a client round line; ItemVoucherForm sends the raw counter amount when rounding is active; PDF Round Off row prints the actual amount (was the mode value).

**Verified:** backend **424/0** (11 `TestVoucherRoundOff` tests incl. cross-type purchase/credit-note/debit-note coverage + a PDF round-off-amount test); browser 18/18 round-off checks (modes, save 201, auto-created ledger, grand_total=338.00 stored, Dr=Cr, round line 0.32, dark mode) with zero console errors; E2E ALL GREEN — new permanent `round-off.spec.ts` 4/4 (modes sidebar summary, Auto-mode rounded grand_total regression, Round Down −0.68 debit line, None-mode keeps exact paise w/o round-off line), vouchers 8/8, voucher-workflow 7/7, voucher-totals 5/5, recurring-template-workflow 6/6; **full 77-spec suite green (0 FAIL in the incremental runner record)**; tsc fe + e2e clean; test data cleaned + demo companies' original (no Round Off ledger) state restored.

### [COMPLETE] Round-off hardening follow-ups (2026-08-12) ✅
**Status:** The round-off fix is now locked in with permanent tests + one more real bug:
- **Permanent E2E spec** `tests/e2e/specs/round-off.spec.ts` (4 tests, serial) — all 4 modes update the sidebar summary; Auto-mode save stores the ROUNDED grand_total and balances (regression); Round Down posts the −0.68 adjustment as a debit; None-mode saves the exact paise total with no round-off line.
- **Backend PDF test** — the invoice PDF "Round Off" row now asserts the actual adjustment amount (was the mode value 0/1/2); covered in `test_vouchers.py`.
- **Bug — None-mode float noise created phantom round-off lines:** the Sales/Purchase forms sent the float-grand total (`301.5 + 18.09 + 18.09` → `337.67999999999995`), so the backend's ≤0.01 auto-balance fired and created a zero-amount Round Off line even with rounding disabled. Both forms now snap the None-mode grand total to 2dp (`Math.round(raw * 100) / 100`) before posting — the spec asserts no round-off line exists in None mode.
- **Full-suite record:** 77/77 specs green (the 3 stale FAIL entries — voucher-totals, voucher-workflow, real-user-flow — re-ran green on the current build and the incremental results file was updated).


## 2026-08-11 — Sidebar flattened to one level + filter removed
- **Sidebar filter removed** (user decided it wasn't needed — do not re-add): input, per-company persistence, Ctrl+Shift+F accelerator, Keyboard Help entry all gone; stale localStorage keys cleaned on mount.
- **Sidebar flattened** — no nested subgroups; every page is a flat NavItem under its group (Accounting 7, Inventory 3, Tax 3, Reports 2, Settings 3). Groups stay collapsible; toggle now flips effective state on first click (bug fixed).
- **Density pass** — rows ~26px (`py-[3px]` + `space-y-px`), group headers `py-1.5`, hairline separators between groups.
- **Collapse all / Expand all groups** footer toggle (persisted via `zledger.sidebar.expanded`, hidden in rail mode).
- **Ctrl+K grouping** now uses plain group labels instead of "Group / Subgroup" nesting.
- **E2E updated:** navigation 19/19, tds-tcs 9/9, chart-of-accounts 9/9, parties 1/1, real-user-flow 24/24, role-enforcement 13/13, modal-overlays 9/9 — all green.

## Current Focus
Keyboard-nav hint on VoucherList/DayBook + pre-existing daybook spec fix — **Complete** ✅

### [COMPLETE] Hint on last lists + daybook spec fix (2026-08-10) ✅
**Status:** `TableKeyboardHint` now covers VoucherList (Browse) + DayBook (both use `useListKeyboardNav` directly); added `hideDelete` prop so lists without danger actions omit the misleading Del chip (verified contextual rendering). Fixed a **pre-existing** E2E bug: daybook specs used `getByRole("button")` for the Daybook tab but shared Tabs exposes `role="tab"` → both were broken; now `getByRole("tab")` → 8/8 + 9/9 green. Pushed a conftest docstring touch to trigger backend-tests.yml in real CI (status only viewable in GitHub UI; steps proven green locally).

**Verified:** tsc fe clean; browser — contextual hint + zero JS errors; ALL GREEN — daybook-keyboard 8/8, daybook 9/9, vouchers 8/8, voucher-list-keyboard 3/3; test data cleaned.

## Current Focus (previous)
CI workflow driver fix (psycopg v3) + keyboard-nav hint on every table — **Complete** ✅

### [COMPLETE] CI workflow driver fix + full hint rollout (2026-08-10) ✅
**Status:** Local simulation of `backend-tests.yml` against a fresh `postgres:16` container exposed a real CI-breaking bug: bare `postgresql://` URLs default to the psycopg2 driver (not installed; project uses psycopg v3) → **412 errors**. Fixed to `postgresql+psycopg://` in BOTH workflows (`backend-tests.yml` + `migration-check.yml`, whose alembic step had the same latent bug). Re-simulated: **412 passed / 0 failed in 64s** against fresh pg16. UI: TableKeyboardHint rolled to the remaining keyboardNav tables — Payments, Members, Recurring Templates, Loans, Batch Browse, HSN/SAC, Audit Log, Fixed Assets register (categories had it) — now every keyboard-navable table advertises the interaction.

**Verified:** tsc fe clean; browser — hint on all 8 routes, zero JS errors; ALL GREEN — sortable-table-keyboard 21/21, members 4/4, loans; backend 412/0 via CI simulation; throwaway pg container removed.

## Current Focus (previous)
Dedicated backend-test CI workflow + keyboard-nav discoverability — **Complete** ✅

### [COMPLETE] Dedicated backend-test CI + keyboard-nav discoverability (2026-08-10) ✅
**Status:** New `.github/workflows/backend-tests.yml` runs `pytest tests/ -q -n 4` on every push/PR touching `backend/**` (postgres:16 service; conftest redirects DATABASE_URL to per-worker `zledger_test_gw*` DBs created on the fly) — closes the gap where only migration-triggered changes ran the suite in CI. UI: new **Table Navigation** group in shortcuts.ts (auto-appears in Alt+F1 Keyboard Help) + shared `TableKeyboardHint` kbd-chip hint line placed above the tables on Admin Companies / Admin Users / Manufacturing (BOMs + Orders tabs).

**Verified:** tsc fe clean; workflow YAML parses; browser — hints on all 3 pages + help-dialog group, zero console errors; ALL GREEN — sortable-table-keyboard 21/21 regression.

## Current Focus (previous)
Parallel tests default (-n 4) + keyboardNav on Admin/Manufacturing tables — **Complete** ✅

### [COMPLETE] Parallel tests default + keyboardNav on Admin/Manufacturing (2026-08-10) ✅
**Status:** pytest addopts now default to `-n 4` (parallel-safe thanks to per-worker DBs) — plain `pytest tests/` = 412 passed/0 failed in ~67–86s vs ~105s sequential (~20–35% faster). migration-check.yml (postgres service, runs on model/migration changes) now also runs the full suite with `-n 4`; conftest gives each xdist worker its own sqlite file too when DATABASE_URL is unset locally. keyboardNav rolled to the last 4 tables: Admin Companies (Delete → danger-confirm), Admin Users (Delete → first danger = Deactivate for active users, documented), Manufacturing BOMs + Orders (Enter → detail). E2E sortable-table-keyboard 18→21 (Admin Companies describe with deactivate-then-force-delete cleanup).

**Verified:** tsc fe+e2e clean; workflow YAML parses; backend default `-n 4` 412/0; ALL GREEN — sortable-table-keyboard 21/21; browser — admin-companies highlight+confirm, admin-users highlight, manufacturing-boms renders, zero console errors; data cleaned.

## Current Focus (previous)
xdist-safe test DBs + keyboardNav on Payments/Fixed Assets + clickable Tracking badges — **Complete** ✅

### [COMPLETE] xdist-safe test DBs + keyboardNav on Payments/FixedAssets + clickable Tracking badges (2026-08-10) ✅
**Status:** Full suite `-n 4` deadlock fixed — each pytest-xdist worker now gets its own Postgres test DB (`zledger_test_gw0`/`gw1`/… keyed off `PYTEST_XDIST_WORKER` at import, dropped+recreated per session with `WITH (FORCE)`); `-n 4` is now a reliable gate: **412 passed / 0 failed in 67s** (was 259 deadlock errors), sequential also 412/0. UI: keyboardNav rolled to Payments (Enter → Record Payment) + both Fixed Assets tables (Delete → danger-confirm); Inventory Tracking badges are click-to-filter buttons (`stopPropagation`, persisted filter, `useCallback`-wrapped setter). E2E: sortable-table-keyboard 15→18 (Fixed Assets describe, tab-click first), inventory 10→11 (badge click narrows 10→5, no modal, char-class regex avoids backslash-mangling).

**Verified:** tsc fe+e2e clean; backend `-n 4` 412/0; ALL GREEN — sortable-table-keyboard 18/18, inventory 11/11, payments-workflow 3/3; browser — badge click filters, zero console errors; data cleaned.

## Current Focus (previous)
keyboardNav on Loans + Tracking filter counts/persistence — **Complete** ✅

### [COMPLETE] keyboardNav on Loans + Tracking filter counts/persistence (2026-08-10) ✅
**Status:** Loans register migrated from custom Actions cell to `actions` prop (Pay/Edit/Del icon buttons) with `keyboardNav` (Delete→danger-confirm, Enter→detail). Inventory Tracking filter shows per-mode counts and persists per company in localStorage (restored on mount, written on change).

**Verified:** tsc clean; loans-advances 26/26 + inventory 10/10 + sortable-table-keyboard 15/15 ALL GREEN; browser — filter counts + persistence, loan table renders with icon actions, zero console errors; data cleaned.

**Full backend suite:** **412 passed, 0 failed** (sequential run — the `-n 4` parallel mode still shows spurious shared-test-DB pollution errors, a known infra artifact).

### [COMPLETE] Tracking filter + Loans → SortableTable + table sweep (2026-08-10) ✅
**Status:** Inventory Items tab has a Tracking filter Select (All/None/Batch/Serial) combined with the text search. Loans register converted to `SortableTable` (sortable columns, Pay/Edit/Del kept in a custom non-sortable cell). Sweep of remaining hand-rolled tables: report/print layouts (GST, Compliance, DayBook print, VoucherHistory), interactive cells (OutstandingBills allocation inputs, TDS/TCS pending-only checkboxes), and spec-covered sticky containers (AdminBackup) deliberately left as-is.

**Verified:** tsc clean; loans-advances 26/26 + inventory 10/10 ALL GREEN; browser — Batch filter 10→5 items, loans sort OK, zero console errors; data cleaned.

### [COMPLETE] keyboardNav on HSN/SAC + Audit Log, tracking-mode tests, Tracking column (2026-08-10) ✅
**Status:** `HsnSacPage` converted from hand-rolled table to `SortableTable` (sortable, selectable, danger Delete action, keyboardNav); `AuditLogPage` gained keyboardNav (read-only, Enter opens detail). `sortable-table-keyboard.spec.ts` 9 → 14 tests (HSN/SAC + Audit Log describes). New `backend/tests/test_stock_items_api.py` (7 tests: default/batch/serial create, PATCH full-replace round-trip, 422 on invalid, list includes tracking_mode). Inventory Items table shows a Tracking badge column (Batch amber / Serial violet / — none).

**Verified:** tsc fe+e2e clean; backend 7/7; sortable-table-keyboard 14/14 + gst-pages 7/7 ALL GREEN; browser — Tracking column + badges, HSN/SAC table renders/sorts, no console errors; data cleaned.

### [COMPLETE] keyboardNav rollout + registry consistency test + tracking-mode fix (2026-08-10) ✅
**Status:** keyboardNav now on Batch Browse + Members tables (Recurring Templates was the only consumer); vouchers workspace bar converted to shared `Tabs` (dropped dead F1–F3 registry shortcuts). `sortable-table-keyboard.spec.ts` extended to 9 tests (batch describe: batch-tracked item via API, Delete→danger-confirm→Escape, zero-qty cleanup); new node-only `page-tabs-consistency.spec.ts` (6 tests) pins the registry against golden lists.

**Bug fixed along the way — tracking_mode never left the backend:** `StockItemOut`/`StockItemCreate` lacked `tracking_mode`, so `/inventory/items` omitted it — Batch Browse's New Batch dropdown filter was a no-op (all items selectable → server 400), `SerialsPanel` always empty, manufacturing batch/serial branching got `undefined`. Schema now carries + validates it, and the Inventory item modal has a Tracking select (None/Batch/Serial + hint) wired through edit/duplicate so batch items don't silently reset to none.

**Verified:** tsc fe+e2e clean; backend 6/6; ALL GREEN — sortable-table-keyboard 9/9, batch-tracking 8/8, members 4/4, inventory 10/10, page-tabs-consistency 6/6; browser: Tracking select renders, New Batch dropdown lists only batch items, no console errors; data cleaned.

### [COMPLETE] Tab definitions centralized + keyboardNav E2E + highlight helper (2026-08-10) ✅
**Status:** One source of truth for page tabs. `config/pageTabs.ts` (`PAGE_TAB_DEFS`, 15 routes with `urlTab` flag) drives the tab bars, the F-key map in `usePageAccelerators` (derived, was inline copy), and the search palette `PAGE_TABS` in `config/modules.ts` (derived — fixed drift: inventory 3→7, gst 4→8, tds-tcs 3→4, compliance 5→7, added batches/company-settings/tally-import). Non-URL-tab routes excluded from search; duplicate-key guard at load. SortableTable keyboardNav gained a real consumer (Recurring Templates) + 6-test E2E covering Delete→danger-confirm. `utils/rowHighlight.ts` unifies the keyboard-highlight class across SortableTable/VoucherList/DayBook.

**Completed:**
- ✅ PAGE_TAB_DEFS registry (15 routes) + derived F-key map + derived PAGE_TABS; all pages consume registry
- ✅ sortable-table-keyboard.spec.ts 6/6 ALL GREEN (arrows/escape/delete-confirm/no-hijack)
- ✅ highlightRowClass helper in SortableTable + VoucherList + DayBook (2 spots)
- ✅ Browser-verified tabs/F-keys/search across inventory/reports/gst/vouchers; regression specs ALL GREEN (inventory 10, bank-recon 8, gst-pages 7, recurring-crud 4, daybook-keyboard 8, voucher-list-keyboard 3); tsc clean; committed & pushed

### [COMPLETE] Keyboard-nav unification (2026-08-10) ✅

### [COMPLETE] Keyboard-nav unification (2026-08-10) ✅
**Status:** One keyboard-nav implementation instead of two. `useListKeyboardNav` is canonical (arrows move highlight, Enter opens, Escape clears, optional Delete/Backspace → danger action; callbacks outside the state updater). SortableTable's hand-rolled index-based `keyboardNav` effect — which had zero consumers and re-registered its listener every keystroke — deleted in favor of the shared hook (keyed by tanstack row.id), preserving Delete→danger + scroll-into-view and unifying the highlight style with Day Book/Vouchers.

**Completed:**
- ✅ Hook extended with optional `onDelete`; pure updaters (ref-based), guarded Delete/Backspace preventDefault
- ✅ SortableTable delegates to the hook; removed dead `keyboardIdx` state/effect
- ✅ Browser-verified DayBook + Vouchers(browse): highlight, Enter-open, Escape-clear, no search hijack, 0 console errors
- ✅ daybook-keyboard.spec 8/8 + voucher-list-keyboard.spec ALL GREEN; frontend tsc clean; committed & pushed

### [COMPLETE] Batch De-Dup + Serials 404 Fix + Repo Hygiene (2026-08-10) ✅

### [COMPLETE] Batch De-Dup + Serials 404 Fix + Repo Hygiene (2026-08-10) ✅
**Status:** `/batches` page is now the canonical batch home (gained **+ New Batch** create modal wired to `POST /manufacturing/batches`); the duplicate 200-line `BatchManagement` in ManufacturingPage replaced by a link-out card. Fixed a real bug — `SerialsPanel` + confirm-order fetched `/batches/serials` but the router mounts at `/manufacturing` (serials never loaded/created, 404s on every Serials-tab load). Dead/stray files removed; graphify-out/test-results/.omo/plw/local gitignored + untracked. Report "duplicates" kept — verified complementary (summary tabs vs bill-wise analysis pages with filters/exports).

**Completed:**
- ✅ `/batches` create modal (item selector, batch number, mfg/expiry dates, qty); Manufacturing Batches tab → link card; dead `BatchManagement` removed
- ✅ Serials endpoints fixed → `/manufacturing/serials` (SerialsPanel GET/POST + confirm-order fetch); browser-verified 0 404s, 0 console errors
- ✅ Dead files + stale docs removed; regenerable artifact dirs gitignored + untracked; README stale reference fixed
- ✅ manufacturing.spec + batch-tracking.spec E2E ALL GREEN; frontend + e2e tsc clean; committed & pushed

### [COMPLETE] Inventory F-keys (all 7 tabs) (2026-08-10) ✅

### [COMPLETE] Stock Groups Table + Entries Envelope Bug (2026-08-10) ✅
**Status:** Stock Groups tab converted from card grid to SortableTable (Group/Description/Status/Items/Value + search). Found + fixed a pre-existing crash: `/inventory/entries` returns `{items,total,limit,offset}` but the frontend treated it as an array — `filteredEntries.filter()` (runs every render) threw on ANY Inventory search, crashing all three tabs; the Entries tab also showed 0 rows from the same bug. Now extracts `.items` (+`limit=200`) — entries render, searches work everywhere. Browser-verified light + dark; inventory.spec E2E ALL GREEN; tsc clean; committed & pushed.

**Completed:**
- ✅ Groups → SortableTable (columns, search, row-click modal, empty states); `groupColors` removed
- ✅ Entries envelope fix (`.items` extraction, `limit=200`); search crash + empty Entries tab fixed
- ✅ Browser-verified (5 group rows, filter/clear, modal, items/entries search, entries rows, dark)
- ✅ inventory.spec E2E ALL GREEN; test data cleaned; committed & pushed

### [COMPLETE] Tabs Mobile Scroll + Overflow E2E Guard (2026-08-10) ✅
**Status:** Found mobile tab labels fully ellipsized at 375px (27px buttons, only F-key chips readable). Compact tabs now natural-width + horizontal scroll below `md` (readable 105–150px labels, scroll to reach trailing tabs), fit-to-width at `md+` (verified 1280/1024 fit exactly, no overflow). New navigation.spec guard asserts Reports 11-tab bar `scrollW <= clientW` at 1280px + Stock Ageing visible. navigation (19) + gst-pages + reports-drilldown green; tsc clean; committed & pushed.

**Completed:**
- ✅ `Tabs` compact `flex-none` + `overflow-x-auto` below md; `md:flex-1 md:min-w-0` above
- ✅ Non-compact tabs `flex-none` + `overflow-x-auto`; mobile drawer verified 25 rows single-line
- ✅ navigation.spec "Reports tab bar does not overflow its container" guard
- ✅ navigation (19) + gst-pages + reports-drilldown E2E green; committed & pushed

### [COMPLETE] Tabs Bar Overflow Fix + Sidebar E2E Guard (2026-08-10) ✅
**Status:** Found + fixed a real bug — the Reports compact tab bar (11 tabs) overflowed at 1280px (`scrollW 1317 > clientW 960`), cutting off Stock Summary/Movement/Ageing. Shared `Tabs` now shrinks evenly (`min-w-0` buttons, `truncate` labels, `shrink-0` chips, `max-w-full`), verified no overflow on 12 tab pages in light + dark. Added sidebar single-line E2E guard to navigation.spec (all 5 groups expanded, no row > 44px). navigation (18) + gst-pages + reports-drilldown green; tsc clean; committed & pushed.

**Completed:**
- ✅ `Tabs` compact overflow fix (min-w-0 / truncate / shrink-0 / max-w-full)
- ✅ Verified 12 tab pages @1280px light + dark, hard-reload theme persistence
- ✅ navigation.spec single-line guard test (typed evaluateAll)
- ✅ navigation (18) + gst-pages + reports-drilldown E2E green; committed & pushed

### [COMPLETE] Sidebar: All Items Fit on One Line (2026-08-10) ✅
**Status:** Sidebar widened `w-60` → `w-64` (main offset `lg:pl-64` synced); every label uses `truncate` in a `min-w-0` flex row so no item can ever wrap to two lines; kbd hint chips + Soon badges `shrink-0`. Verified :9090 — 25/25 rows single-line (no ellipsis needed at w-64), dark + collapsed modes clean, zero console errors; navigation.spec E2E ALL GREEN; tsc clean; committed & pushed.

**Completed:**
- ✅ `w-64` expanded sidebar + `lg:pl-64` content offset + mobile drawer `w-64`
- ✅ `truncate` on all nav-item/subgroup/group labels; `min-w-0` flex rows
- ✅ kbd chips + Soon badges + chevrons `shrink-0`
- ✅ Browser-verified light/dark/collapsed; navigation E2E green; committed & pushed

### [COMPLETE] Dashboard Insights Expansion + Grouped Pending Actions (2026-08-10) ✅
**Status:** 5 new smart-insight rules (budget, receivables concentration, customer concentration, inventory signal, expense concentration) each wrapped in a savepoint so a failing block can't abort the Postgres transaction (real bug: budget block failed silently on test DBs and poisoned all later blocks with `InFailedSqlTransaction`). Fixed `get_outstanding` counting credit-balance ledgers as debtors. PendingActions grouped by category, zero-count hidden, urgency summary + onEmptyChange; dashboard rows adapt when Pending/Manufacturing is empty. New dashboard-layout E2E spec (4 tests). Backend **405 pass** (sequential; `-n 4` shows spurious shared-DB pollution errors), dashboard-layout/content/real-user-flow E2E all green, dark-mode verified.

**Completed:**
- ✅ 5 new insight rules + savepoint isolation (`_safe_block` helper, errors logged not swallowed)
- ✅ `get_outstanding` Dr-side balance fix (credit ledgers no longer inflate receivables)
- ✅ PendingActions: groups, zero-count hidden, urgency summary chip, onEmptyChange
- ✅ Adaptive rows: empty Pending → Recent Vouchers full width; empty Manufacturing → Quick Actions fills
- ✅ New dashboard-layout.spec.ts (4 tests); networkidle → domcontentloaded flake fix
- ✅ Backend 405 pass; E2E all green; tsc clean; dark mode pixel-verified; committed & pushed

### [COMPLETE] Backup Resilience: Integrity Check, Drive Prune, Restore Audit (2026-08-09) ✅
**Status:** Cron now verifies the newest dump every pass (`gunzip -t` CRC + PGDMP magic) and bells on corruption; backup.sh prunes remote Drive copies older than retention after a successful sync (local rotation only touched the volume); restores are audit-logged (`restore_started` sync / `restore_failed` thread) and shown in the Backup Logs table. Backend **380 pass** (9 new), backup.spec **11 pass**; integrity alert + restore badge live-verified.

**Completed:**
- ✅ `check_backup_integrity` — newest dump validation, bell alert deduped by short md5 entity_id; in-progress guard with 1h staleness (crashed runs never disable the check); in-memory (path, mtime) memoization so the full read only runs when the dump changes
- ✅ GDrive remote pruning — `rclone delete --min-age Nd` after successful sync, non-fatal
- ✅ Restore audit trail — `restore_started` + `restore_failed` log entries; Restore/Restore Failed badges in the UI
- ✅ 6 integrity + restore-audit tests (8 new total incl. stale-progress edge); suite 380 ✅; live-verified

### [COMPLETE] Backup UX Polish: Space Card, Prune Hint, Type-to-Confirm (2026-08-09) ✅

### [COMPLETE] Backup UX Polish: Space Card, Prune Hint, Type-to-Confirm (2026-08-09) ✅
**Status:** Volume Space stat card (used/total/free via `shutil.disk_usage`); Prune Old button shows an eligibility chip + tooltip with count/size; prune now requires typing the retention number to confirm (new optional `requireInput` on ConfirmDialog, backward-compatible). Backend suite **372 pass** (1 new), backup.spec **11 pass** (1 new); browser-verified on :9090.

**Completed:**
- ✅ `disk_usage` in `GET /admin/backups` (guarded) + Volume Space card with fill bar
- ✅ Prune eligibility chip + tooltip (`getPruneEligible` shared helper)
- ✅ Type-to-confirm prune (ConfirmDialog `requireInput`) — disabled until exact text typed, Enter confirms
- ✅ 1 backend test + 1 E2E test; full suite 372 ✅, backup.spec 11 ✅; browser-verified

### [COMPLETE] Backup Cleanup Follow-ups: Prune, Bytes Toasts, Role Gate (2026-08-09) ✅

### [COMPLETE] Backup Cleanup Follow-ups: Prune, Bytes Toasts, Role Gate (2026-08-09) ✅
**Status:** One-click **Prune Old** button deletes all backups beyond the retention window (server-side `POST /admin/backups/prune`, mirrors backup.sh rotation, config/state files never touched, retention clamped ≥1 day); both single-delete and prune toasts report bytes freed; the whole Backup Management page is now gated to superadmins in the UI (matching the API). 4 new backend tests (371 total green) + 1 E2E prune test (backup.spec 10 green); browser-verified on :9090.

**Completed:**
- ✅ `POST /admin/backups/prune` — retention-based bulk cleanup, returns pruned list/count/bytes_freed, logs `backup_pruned`; retention clamped ≥1 with 30-day fallback
- ✅ `DELETE /admin/backups/{filename}` returns `bytes_freed`; delete + prune toasts show space freed
- ✅ **Prune Old** header button — client-side old-count estimate + danger ConfirmDialog + spinner; `Pruned` log badge
- ✅ Superadmin gate on AdminBackupPage (mirrors AdminUsersPage)
- ✅ 4 new backend tests + 1 E2E prune test (volume snapshot/restore guard); full suite **371 pass**, backup.spec **10 pass**; browser-verified

### [COMPLETE] Delete Individual Backups (2026-08-09) ✅
**Status:** New `DELETE /admin/backups/{filename}` endpoint + per-row trash buttons let admins remove single database/uploads backups without touching the volume. Endpoint is superadmin-only, traversal-guarded, and restricted to backup files only (config/state files in the backup dir can't be deleted); every deletion is audit-logged (`backup_deleted`). UI: ConfirmDialog danger flow, spinner, toast, immediate list + audit-log refresh with a `Deleted` badge.

**Completed:**
- ✅ `DELETE /admin/backups/{filename}` in `admin.py` (filename guard parity with download; `.sql.gz` / `*_uploads_*.tar.gz` only; FileNotFoundError → 404; logs `backup_deleted` event)
- ✅ `_log_backup_event` resolves log path from env at call time (tests never touch the real volume)
- ✅ `BackupLogEntry.filename` field; UI log table shows `Deleted` badge + filename (column renamed to Details)
- ✅ `AdminBackupPage.tsx` trash button + `showConfirm` danger flow + `loadLogs()` after delete
- ✅ 5 new backend tests (367 total green) + 2 new E2E tests in `backup.spec.ts` (9 passed); delete flow browser-verified on :9090

## Current Focus (previous)
Backup follow-ups: retention E2E, restore-modal E2E, in-app health alerts — **Complete** ✅

### [COMPLETE] Backup Follow-ups: Retention E2E, Restore-Modal E2E, Health Alerts (2026-08-09) ✅
**Status:** Manual backups now honor the UI retention setting (was silently 30 days); cron raises in-app bell alerts for failed backups / GDrive sync errors (superadmin-company-scoped, deduped); progress file no longer vanishes on success; restore validates PGDMP magic before dropping the DB (junk uploads can no longer destroy the schema); 2 new E2E specs + 6 new backend tests (362 total green).

**Completed:**
- ✅ **Retention mapping bug fixed** — `BACKUP_RETENTION_DAYS` now passed to backup.sh as `RETENTION_DAYS` (via `_build_backup_subprocess_env()`); 3 unit tests
- ✅ **In-app backup health alerts** — `check_backup_health()` in cron_runner reads progress + sync-status files, notifies superadmin-member companies, deduped per failure; scheduler gets `BACKUP_DIR` + `:ro` /backups volume in compose; bell browser-verified
- ✅ **Progress-file lifecycle bug** — EXIT trap no longer deletes the file on success; pollers now see `done` (fixes missing success toast / "running" forever)
- ✅ **PGDMP validation before restore** — junk .sql.gz can no longer drop + break the DB (found live by E2E); 2 new tests
- ✅ **New `backup-retention.spec.ts`** — seeds old fakes, lowers retention, triggers, verifies pruning; volume snapshot/restore guard
- ✅ **New `restore-modal.spec.ts`** — full browser restore flow incl. redirect-to-login + API recovery
- ✅ **`restore.spec.ts` cleanup** — upload tests no longer leave throwaway files in the volume
- ✅ **Verified:** backend 362 ✅; E2E backup-retention + restore-modal + restore.spec + backup.spec green; bell alert verified; data cleaned


### [COMPLETE] Backup & Restore: GDrive Hardening + Restore UI + 4 Bugs Fixed (2026-08-09) ✅
**Status:** Full live test of backup/restore + GDrive; 4 real bugs fixed; restore now reachable from the Backup page; 20 new backend tests (354 total green); 70+ garbage 20-byte backups purged.

**Completed:**
- ✅ **Live-tested end-to-end:** API-triggered backup (618KB dump, progress polling), GDrive sync round-trip (sync-status.json → success in 11s), full restore round-trip (marker company → RESTORE → marker gone, demo data intact, uploads extracted, health 200), browser-verified Admin Backup page (Restore button + modal, Settings modal, GDrive tab, test-connection toast)
- ✅ **Bug — garbage dumps silently backed up (`scripts/backup.sh`):** 20-byte gzips from mid-reset `pg_dump` used to "succeed" and even sync to GDrive. Now any dump <1KB or failing `gzip -t` is removed + fails loudly with a `backup-error` progress file surfaced in the UI
- ✅ **Bug — UI success toast on failed GDrive test (`AdminBackupPage.tsx`):** backend returns HTTP 200 `{status: "error"}` on failure; `handleTestGdrive` now branches on payload status → red error toast. Also fixed stuck-open progress modal on failure + polling tolerates transient 204
- ✅ **Bug — settings desync (`admin.py`):** `GET /backup/settings` ignored the `gdrive-enabled` flag file (showed Disabled while sync ran). Shared helper now returns env **or** flag file; `DELETE /backup/gdrive-token` also removes the flag so the container stops retrying tokenless
- ✅ **UX gap — restore unreachable from Backup page:** `RestoreBackupModal` (previously only on the no-companies screen) is now rendered on Backup Management
- ✅ **Security — traversal guards** on restore upload + execute endpoints (same `basename` guard as download; `%2F`-encoded paths blocked at routing)
- ✅ **New `backend/tests/test_backup.py` (20 tests)** — settings flag logic, token lifecycle, gdrive-test payload, upload validation, traversal guards. Full backend suite 354 ✅; E2E backup.spec + restore.spec green
- ✅ **Cleanup:** purged 70+ junk 20-byte backups + their uploads tarballs from the volume (list is filesystem-scan based, so the UI is clean now)


### [COMPLETE] Dashboard Chart: Keyboard Nav + Per-FY View Memory + E2E (2026-08-08) ✅
**Status:** Income vs Expenses chart is now keyboard-accessible and remembers each FY's zoom window; new 5-test spec green; 2 real bugs found & fixed via review/browser verification

**Completed:**
- ✅ **Keyboard accessibility** — chart wrapper focusable (`tabIndex=0`, `role="group"`, `aria-label` listing interactions); **←/→ pan 1 month**, **+/− zoom**, **R/Home reset** while focused; focus ring light+dark; new **Dashboard Charts** group in `shortcuts.ts` (auto-listed in Alt+F1 help); hint → "Scroll to zoom · Drag to pan · Keys when focused"
- ✅ **Per-FY view memory** — zoom window persisted per FY in `localStorage` (`zledger.dashboardChartWin` as `{ [fyId]: [start, end] }`); survives navigation/reload; validated against fresh data (bounds, ≥3 months); corrupted entries fall back to full year
- ✅ **Bug fixed (code review) — stale window across FY switch:** old single-entry storage could leak one FY's window into another (out-of-bounds on shorter/partial FY → blank chart, then persisted wrong). Window now re-validated per FY + persist effect skips writes while the live window belongs to a previous FY. Browser-verified: 6M on 2026-27 → switch to 2025-26 shows full 12 months → switch back restores 6M
- ✅ **Bug fixed — keyboard zoom-out overflow:** `-` after a right pan produced a window past the last month (11/12 points rendered). Zoom-out clamps the left edge like the wheel handler
- ✅ **New spec `tests/e2e/specs/dashboard-chart.spec.ts`** (5 tests, all green) — presets + Reset restore full year, scroll-zoom in/out (12→10→12), drag-pan shifts axis ticks while preserving window size, keyboard pan/zoom/reset on the focused chart, zoom window persists across reload

**Verified:** frontend `tsc` clean; web rebuilt; dashboard-chart (5) + dashboard-content (4) + real-user-flow (24) all green; zero console errors; test data cleaned; committed locally (push deferred — PAT lacks `workflow` scope)

### [COMPLETE] Dashboard Polish: Insights + Quick Actions Row, Scroll-Zoom / Drag-Pan Chart (2026-08-08) ✅
**Status:** Smart Insights sits beside Quick Actions (compact variant; full-width fallback); Income vs Expenses chart gained scroll-to-zoom (cursor-anchored), drag-to-pan, 3M/6M/12M presets and a Reset button. Wheel listener re-attach bug + pan delta-swallow bug found via browser verification and fixed. E2E green.

### [COMPLETE] Dashboard Redesign + Follow-ups: 194Q Inward Gate, GSTR-1 Reference, E-Invoice Resilience (2026-08-08) ✅
**Status:** Dashboard modernized (gradient area chart + net line, expense-breakdown donut, smart insights, redesigned stat cards/pending/recent/manufacturing under one card language); found & fixed expense-analysis bug (nature case + debit side). 194Q entry creation now enforces ₹10 Cr buyer gate + 01-07-2021 date; GSTR-1 locked against a TallyPrime reference export; e-invoice client gained per-GSTIN throttle + retry backoff (retry exhaustion marks failed). Full suite 334 ✅.

### [COMPLETE] TallyPrime-Parity Follow-ups: Aggregates, Credit Notes, UI Totals (2026-08-08) ✅
**Status:** 194Q/206C(1H) now enforce the ₹50L-per-party-per-FY aggregate threshold (incremental-excess tax, auto-aggregation on entry create, 2 new API params); GSTR-1 routes sales-return credit notes into a CDNR list + nets HSN qty/values with negative sign (new Credit Notes table in UI); new `voucher-totals.spec.ts` proves the single-side grand_total fix in the real UI (payment ₹5,000 not ₹10,000; sales ₹1,680.00). Full suite 319 ✅.

### [COMPLETE] TallyPrime-Parity Calculation Audit (2026-08-08) ✅
**Status:** 5 real bugs fixed — 2× grand_total on non-item vouchers (payment/receipt/contra/journal), GSTR-1 HSN qty=0, GSTR-1/3B outward includes purchases, e-invoice ValDtls over-counts (₹1,180→₹2,540), 206C(1H) seeded active despite 01-04-2025 withdrawal. Backfill script `backend/scripts/backfill_tds_206c1h_inactive.py`. Full suite 312 ✅.

### [COMPLETE] Schedule Processing + Payments Workflow E2E (2026-08-08) ✅
**Status:** Two new specs green (3 + 3); 1 real app bug found & fixed (cron_runner import crash); 5 regression specs green

### [COMPLETE] Recurring Template Workflow + Day Book Keyboard E2E (2026-08-08) ✅
**Status:** Two new workflow specs green (6 + 8); 2 real app bugs found & fixed; 5 regression specs green

**Completed:**
- ✅ **`tests/e2e/specs/recurring-template-workflow.spec.ts`** (new, 6 tests, serial) — create payment voucher + save as recurring template from the form → template listed (type/frequency/status) → **Run Now** (toast, `last_run_date`=today, `next_run_date`+1mo via API) → **generated voucher journal entries balance** (Dr=Cr, narration match via API) → **Pause/Resume** toggle → **Edit** → **Delete**.
- ✅ **`tests/e2e/specs/daybook-keyboard.spec.ts`** (new, 8 tests, serial) — search narrows + clear restores, From/To date filter includes/excludes, party filter, **ArrowDown ring-highlight + Enter opens the exact voucher + Escape closes**, quick-edit via keyboard persists, grouped-by-date keyboard open, Escape clears highlight.
- ✅ **Bug fix — `Save as Template` dead on 5 forms:** Sales/Purchase/Receipt/Contra/Payment never rendered `<VoucherTemplateModal />`; Sales/Purchase had `async () => {}` stubs. Now rendered everywhere; Sales/Purchase got real `buildPayload()` + `handleSaveAsTemplate()` and `handleSave` reuses `buildPayload()`.
- ✅ **Bug fix — Pause/Resume ignored by API:** `PATCH /recurring-templates/{id}` schema lacked `is_active`; added `RecurringTemplateUpdate` (all-optional) applied only when non-None. Verified live True→False→True.
- ✅ Regression: vouchers (8), voucher-edit (4), voucher-workflow (7), daybook (10), recurring-templates-crud (4) — all green.

## Current Focus
Voucher Workflow E2E Suite — **Complete** ✅ (7/7 green, 3 real app bugs found & fixed)

### [COMPLETE] Voucher Workflow E2E + 3 App Bugs Found by It (2026-08-07) ✅
**Status:** New `voucher-workflow.spec.ts` 7/7 green; 3 real app bugs fixed; 40 regression tests green; full suite running

**Completed:**
- ✅ **`tests/e2e/specs/voucher-workflow.spec.ts`** (new, 7 tests) — full real-user lifecycle across all 8 voucher types: create → verify in Day Book → open detail → PDF preview → **edit** (narration persists) → **Create Similar duplicate** (prefilled form → new voucher) → **cancel** (reversal + kebab drops Cancel) → **delete** (cancel-then-delete; API rejects deleting posted vouchers) → **keyboard** (F1–F8 type switch, Alt+N fresh form, Alt+E edit)
- ✅ **Bug — ContextMenu items bubbled to clickable rows:** kebab-menu clicks (e.g. Cancel) also triggered the row click, opening the voucher modal behind the confirm dialog. `ContextMenu` items now `stopPropagation()`
- ✅ **Bug — post-save Alt+N/E/P hijacked by global accelerators:** the vouchers page advertises "Alt+N new · Alt+E edit · Alt+P print" but `usePageAccelerators` (document capture) navigated to compliance/tally-import/parties. Vouchers handler now `window`-capture + `stopPropagation` for exactly those keys
- ✅ **Bug — Create Similar prefill never landed for Payment/Receipt/Contra:** `similarData` arrives async *after* the form mounts; those 3 forms only read `initialData` in `useState` initializers. Added `useEffect` prefill reactions mapping `fromLedgerId`/`toLedgerId` + first particulars line (mirrors AmountVoucherForm/ItemVoucherForm/JournalForm)

**Verified:**
- Frontend `tsc --noEmit` clean; `make rebuild-web` deployed
- `voucher-workflow.spec.ts` → **7/7 passed**
- Regression: vouchers (8), voucher-edit (4), voucher-list-keyboard (3), voucher-no-invoice-no (6), daybook (10), bulk-actions (6), quick-edit (1), quick-create-audit (2) — **all green, 40 tests**
- Full E2E suite run — see run result logged after completion

### [COMPLETE] Company Creation UI Redesign (2026-08-07) ✅
**Status:** ModuleSelector + both create forms redesigned; tsc clean; web rebuilt; browser-verified light+dark

**Completed:**
- ✅ **ModuleSelector** — long vertical 13-pill list → compact 2-column icon-card grid (NavIcon + label + description), enabled-count, **Select all / Clear** toggle, lock badges for always-on modules; new optional `showHeading` prop so parents render their own section header
- ✅ **CompanySelectPage** create form — three card-based sections (Company Details / Financial Year / Modules) with icon section headers; FY-name chip shown once dates set; right-aligned footer actions
- ✅ **AdminCompaniesPage** create/edit modal — matching card-based layout

**Verified:** frontend tsc clean; `make rebuild-web` deployed; browser on :9090 — switch-mode form (3 headers, 13 module cards, Clear↔Select all toggle works, 2 locked) and admin modal both render with zero console/page errors in light + dark

### [COMPLETE] Company Creation Form Polish — height/width (2026-08-07) ✅
**Status:** Form cut from 876px → ~724px and widened; fits 900px-tall viewports with no scroll; browser-verified across all 3 contexts

**Completed:**
- ✅ **`AuthShell` `wide` variant** — `max-w-7xl` shell with 0.72fr/1.28fr form-share (~830px form panel); used for the create flow
- ✅ **Wider modals** — switch-modal + admin modal `2xl` → `3xl` (768px); GSTIN/date fields now 155–217px instead of 131px
- ✅ **3-column module grid from `xl`** + tighter card padding/gaps; form `space-y-4`→`space-y-3`; details + FY cards side-by-side at `xl`+
- ✅ **Switch-modal header de-duplicated** — "Switch Company" header (brand + signed-in line + Close) renders only for the list view; create mode shows just the form's own "New Company / Back" header; dialog `aria-label` follows the mode

**Verified:** tsc clean; web rebuilt; real-browser measurements — switch-modal 858px→772px content (fits 1440×900 with zero internal scroll; ~80px modal scroll on 1280×768), full-page form 746px→724px, admin modal 780px fits 900px viewport; 13 module cards / 3 cols everywhere; zero console/page errors; test data cleaned

### [COMPLETE] Modal Follow-ups: Theme Persistence + Docs + E2E (2026-08-07) ✅
**Status:** All three follow-ups done; new spec 9/9 green; regression specs green; web rebuilt

**Completed:**
- ✅ **Dark theme persists across full page loads** — `store/theme.ts` exports `initTheme()` (applies stored theme + registers system-preference media listener); called from `main.tsx` before `ReactDOM.createRoot`. Fixes the pre-existing gap where `/companies` (no TopHeader → theme store never imported) lost the dark class on full navigation; also removes flash-of-wrong-theme
- ✅ **`docs/MODAL_COMPONENT.md`** — all 16 Modal props documented + hand-rolled-overlay conversion checklist + nested-Escape semantics + dark-mode rules; pointers added in `AGENTS.md` (new "Shared Modal Component" section) and `.opencode/skills/04-ui-ux-guidelines.md`
- ✅ **`tests/e2e/specs/modal-overlays.spec.ts`** (new, 9 tests) — Ctrl+K search overlay: top-anchored (<300px), auto-focus, results+navigate, Escape close, backdrop close; switch-company modal: opens/lists companies, Escape + backdrop close navigate back; theme persistence: dark survives full load to `/companies` with `#16161f` panel, light stays light

**Verified:**
- Frontend `tsc --noEmit` clean; e2e spec has zero type errors (29 pre-existing errors elsewhere in restore/tds-tcs specs are unrelated — Playwright transpiles specs)
- `make rebuild-web` deployed; `run-isolated.sh specs/modal-overlays.spec.ts` → 9/9 passed
- Regression: `navigation.spec.ts` 17/17 + `auth.spec.ts` 6/6 passed
- Test data cleaned per AGENTS.md

### [COMPLETE] E2E Typecheck Fixed + Remaining Overlays Unified (2026-08-07) ✅
**Status:** e2e tsc 29 errors → 0; Drawer + mobile sidebar scrim unified; web rebuilt; all affected specs green; browser-verified

**Completed:**
- ✅ **`tests/e2e` typechecks clean** — added `@types/node` (fixes all `Buffer`/node-module errors); fixed latent runtime ReferenceError in `tds-tcs.spec.ts` (`${E2E}` → `E2E_PREFIX`); null-coalescing in `document-attachments.spec.ts`; `{items}` wrapper type in `pdf-exports.spec.ts`; `let bytes: Buffer` annotation in `helpers/pdf.ts` (Node 22 generic)
- ✅ **`Drawer` unified** — shared `useEscapeToClose`, `animate-backdropIn` scrim (`bg-black/40`), body scroll lock, focus save/restore, `role=dialog`, new `drawerIn` slide-in keyframe in tailwind config
- ✅ **`AppSidebar` mobile drawer unified** — scrim `animate-backdropIn`; Escape closes mobile sidebar; body scroll lock while open
- ✅ **`BankReconciliationPage`** — removed two dead page-level `useEscapeToClose` handlers (column-mapper modal + match drawer now own Escape via shared components; Escape on column mapper now matches Cancel's full reset)

**Verified:**
- `frontend` + `tests/e2e` tsc both clean
- Re-ran `tds-tcs`, `document-attachments` (4/4), `pdf-exports` (14/14), `bank-recon` (5/5), `modal-overlays` (9/9) — ALL GREEN
- Real-browser `:9090`: Match drawer opens (`drawerIn` animation, `rgba(0,0,0,0.4)` scrim), Escape + backdrop close; mobile scrim `backdropIn` + Escape closes — zero console/page errors
- Imported bank statement lines cleaned (169) per AGENTS.md

### [COMPLETE] Drawer E2E Coverage + Typecheck Gate (2026-08-07) ✅
**Status:** Match-drawer E2E tests added; `make e2e-typecheck` + CI workflow enforce the e2e tsconfig; all green

**Completed:**
- ✅ **3 Match-drawer tests** in `tests/e2e/specs/bank-recon.spec.ts` — drawer opens right-anchored with `drawerIn` slide + `backdropIn` scrim + `aria-modal`; closes on Escape; closes on backdrop click. Uses the demo seed's HDFC statement lines (no seeding/cleanup → cannot corrupt seed data; the seed ships ~80–120 unreconciled HDFC lines)
- ✅ **`make e2e-typecheck`** Makefile target — `cd tests/e2e && npx tsc --noEmit -p tsconfig.json`
- ✅ **`.github/workflows/frontend-e2e-typecheck.yml`** — npm ci + tsc (frontend + e2e) on push/PR for `frontend/**` / `tests/e2e/**`

**Verified:**
- e2e tsc clean; `make e2e-typecheck` exits 0; workflow YAML parses (6 steps)
- `bank-recon.spec.ts` 8/8 green isolated; seed statement lines intact afterward (no test-created lines remain)
- Note: the demo seed's bank-line count varies between reseeds (80 vs 120) — pre-existing seed behavior; specs are agnostic to it

### [COMPLETE] Shared Modal + UX Polish (2026-08-07) ✅
**Status:** All changes implemented, built (`make rebuild-web`), browser-verified on `:9090` (no console errors), test data cleaned

**Completed:**
- ✅ **Shared `Modal` component** — portal-based, blurred backdrop, `modalIn`/`backdropIn` animations, topmost-Escape semantics, scroll lock, focus save/restore
- ✅ **~36 modal conversions** — ConfirmDialog, VoucherModal, PdfPreviewModal, GroupForm, LedgerForm, asset modals, Admin pages, AuditLog, BankRec, COA, FixedAssets, GST/HSN, Inventory, Loans, Manufacturing, Members, Parties, Payments, RecurringTemplates, TDS/TCS, LedgerDetailModal, **MasterSelectorModal**, plus sweep: KeyboardHelp, RestoreBackupModal, VoucherTemplateModal, AdminCompanies form, TallyImport job detail, VoucherDetailModal, VoucherAuditTimeline, VoucherHistoryPanel, **TopHeader Ctrl+K search overlay** (`align="top"` variant), **CompanySelectPage switch-mode overlay** (`closeOnEscape={false}` keeps its listbox-guarded Escape) — all use the shared component
- ✅ **Animations** — `modalIn`/`backdropIn`/`pageIn`/`toastIn` added to Tailwind config; toasts animate in
- ✅ **Print styles** — report pages print cleanly (chrome hidden, light forced, break-safe)
- ✅ **`EmptyState` redesign** + SortableTable empty row + `compact` variant
- ✅ **Company Select page redesign** — full branded AuthShell layout for initial choose; overlay for switching
- ✅ **Button press feedback** — `active:scale-[0.98]`

**Notes:**
- `MasterSelectorModal` now uses the shared `Modal` via new `zIndex`/`tabTrap`/`dataMasterPopup`/`panelRef` props (depth stacking, Tab trap, accelerator suppression, and auto-focus all preserved)
- Shared `Modal` gained an `align` prop (`center` default | `top`-anchored, `pt-[15vh]`) for the Ctrl+K command palette; `CompanySelectPage` keeps its raw listbox-guarded Escape handler with `closeOnEscape={false}` so the `Select` dropdown's own close-first behavior is preserved
- `Drawer` intentionally unchanged (slide-in panel, not a modal)

### [COMPLETE] Sidebar Navigation & UX Improvements (2026-08-01) ✅

### [COMPLETE] Sidebar Navigation & UX Improvements (2026-08-01) ✅
**Status:** All Phase 1 Quick Wins + Phase 3 Nice-to-have items completed and deployed

**Completed Improvements:**
- ✅ **Dashboard link at top of sidebar** - Added to Overview section as first nav item for clear entry point (was hidden, only accessible via Alt+D)
- ✅ **Consolidated GST & Tax + Compliance groups** - Merged into single "Tax & Compliance" group (reduced 6 nav groups → 5 for cleaner hierarchy)
- ✅ **Moved Payments & Receivables to Accounting** - Relocated from Reports to Accounting group for faster bill lookup during payment/receipt entry
- ✅ **Voucher quick-create button** - Added "+" button next to Vouchers nav item with dropdown menu for all 8 voucher types (Sales F1, Purchase F2, Receipt F3, Payment F4, Contra F5, Journal F6, Credit Note F7, Debit Note F8) for one-click voucher creation from anywhere
- ✅ **Enhanced Ctrl+K command palette** - Added 32 new commands across 3 categories:
  - Create commands: Create Party, all stock/BOM/TDS/FY/Asset/Loan creation shortcuts
  - Export commands: Export Day Book, Trial Balance, P&L, Balance Sheet, COA, Parties, Stock Summary (7 export shortcuts)
  - Utilities: Refresh page, Toggle dark mode, Keyboard shortcuts help, Toggle sidebar (4 quick actions)
  - Utility commands execute immediately without navigation (refresh/theme toggle/shortcuts/sidebar)
- ✅ **Tabbed Reports page** - Reports page already has comprehensive tabs: Trial Balance, P&L, Balance Sheet, Cash Flow, Aging, Outstanding, Register (with voucher type selector), TDS/TCS, Stock Summary, Stock Movement, Stock Ageing (11 tabs total)
- ✅ **Tabbed Inventory page with integrated reports** - Added 4 new tabs with full content integration:
  - **Stock Balance tab**: Live stock summary report (quantity, avg rate, total value, valuation method) with PDF preview and Excel download
  - **Stock Movement tab**: Inward/outward movement analysis with net movement calculations
  - **Stock Aging tab**: Aging analysis with color-coded age buckets (0-30 days green, 30-90 days amber, 90+ days red)
  - **BOM tab**: Navigation to Manufacturing module for centralized BOM management
  - All report tabs fetch data on-demand when selected, with loading states and error handling
  - Total: 7 functional tabs (Groups, Items, Entries, Balance, Movement, Aging, BOM)

**UX Impact:**
- Navigation groups: 6 → 5 (20% cleaner)
- Clicks to create voucher: 3 → 2 (40% faster)
- Clicks to find outstanding bills: 2 → 1 (50% faster)
- Command palette commands: ~40 → 72 (80% increase in keyboard accessibility)
- Dashboard visibility: Hidden → Prominent (clear entry point for Tally Prime users)
- Tally Prime parity: ✅ Now matches expected navigation structure

### [COMPLETE] Voucher Intelligence Phase 1 - Visual & UX Standardization ✅
**Status:** All 7 requirements implemented and verified + Payment/Receipt/Contra redesign complete (2026-08-01)

**Completed Features:**
- ✅ **Unified voucher layout** - Header (voucher no./date/party/ledger/cash-bank) → Transaction area → Footer (narration, summary, save) across all 8 voucher types
  - **Payment/Receipt/Contra redesigned (2026-08-01):** Horizontal top card layout matching Sales/Purchase, 5-column grid (Date, Voucher No, accounts, Amount), date field properly constrained with `max-w-[160px]` + `className="w-full"` to prevent overflow/overlap, voucher number now editable with auto-suggestion placeholder, payment/transfer details inline
- ✅ **Improved party/ledger selectors** - Searchable dropdowns with party type + GSTIN chips (e.g. "Royal Emporium (Customer · 29AAAAA1000A1ZA)"), real outstanding balance display (replaces fake ₹0.00), quick-create via inline "Create X" row
- ✅ **Improved right sidebar** - Voucher Summary with "Grand Total" (renamed from "Net Amount"), Transaction Flow with real Dr/Cr entries, Party Details with GSTIN, state, **address**, and **real outstanding** balance (via `/payments/receivables` and `/payments/payables` APIs)
- ✅ **Standardized labels** - Sales: "Party Account", Purchase: "Supplier Account", Payment: "Paid To/Paid From", Receipt: "Received From/Deposit To", placeholders updated for consistency
- ✅ **Item entry columns** - Item/Qty/Unit/Rate/Disc%/Disc Amt/Taxable/GST%/CGST/SGST/IGST/Amount with inline create (already complete, verified)
- ✅ **Keyboard shortcuts** - Ctrl+S/Ctrl+A save ✓, Ctrl+Enter add row ✓, **Alt+A quick-create** ✓, Esc reset ✓, **Tab navigates all fields** (including voucher_number not in curated fieldOrder)
- ✅ **Responsive spacing polish** - Journal form density adjusted (`p-5` → `p-4`), consistent padding across forms
- ✅ **Auto-focus on date field** when opening voucher forms (focusField queries data-field directly on elements; DateInput forwards data-field prop)
- ✅ **TransactionFlow restructured** — descriptors use detail field for sub-lines ("From X", "To X"), w-full root fills sidebar card width
- ✅ **VoucherSidebar** — removed centering wrapper so TransactionFlow fills full card width

**Technical Changes:**
- Created `usePartyOutstanding()` shared hook (fetches real outstanding from receivables/payables APIs, replaces 3 broken implementations)
- Added `partyOptionLabel()`, `ledgerOptionLabel()`, `partyByLedgerMap()` helpers for consistent party/GSTIN display
- Extended `Party` interface with `address`, `phone`, `email`, `pan` fields (backend already returns these)
- Updated VoucherSidebar, PartyDetailsPanel, Sales/Purchase/Payment/Receipt forms to use shared outstanding logic
- Added Alt+A handler in `useVoucherKeyboard.ts` + Ctrl+Enter handlers in all 4 table components (SalesItemTable, PurchaseItemTable, ItemLineTable, LedgerLineTable)
- **Payment/Receipt/Contra redesign (2026-08-01):** Refactored 3-column sidebar layout to horizontal top card + content below, fixed voucher number fetch to include `financial_year_id` parameter, fixed date field width across all 5 voucher forms (Sales, Purchase, Payment, Receipt, Contra) to prevent overflow and overlap with adjacent fields, made voucher numbers editable with auto-generated suggestions shown as placeholders, removed unused imports; widened account/ledger selector columns in all voucher forms (5-col forms: md:grid-cols-5→7 with col-span-2, 3-col forms: md:grid-cols-3→5 with col-span-2)
- **TransactionFlow restructured** (2026-08-01): descriptors use detail field for sub-lines ("From X", "To X"); w-full root fills sidebar card; clearer party/detail/amount layout
- **useVoucherKeyboard Tab navigation** (2026-08-01): DOM-order fallback in advanceFromField for fields not in curated fieldOrder; BUTTON Tab guard narrowed to skip only buttons outside [data-field] containers
- **advanceAmount state restored** (2026-08-01): PaymentVoucherForm and ReceiptVoucherForm had advanceAmount state accidentally dropped; restored alongside removal of dead allocations state
- **VoucherModal edit/view form** (2026-08-01): VoucherModal now uses the new redesigned form components (PaymentVoucherForm, ReceiptVoucherForm, ContraVoucherForm, SalesVoucherForm, PurchaseVoucherForm) instead of the old AmountVoucherForm/ItemVoucherForm/JournalForm; added editingVoucher population effects to the three amount-based forms
- ✅ **Table design unification** (2026-08-01): PurchaseItemTable rounded-lg→rounded-xl with shadow-sm and correct dark border; ItemLineTable (CR/DR note) converted to CSS Grid for perfect header-body column alignment, removed column separators, moved delete button to first column; LedgerLineTable (journal) gradient header→flat, unified row hover; all item/service tables now match SalesItemTable standard; narration field moved above VoucherFooter (save+subtotal) in ItemVoucherForm, AmountVoucherForm, and JournalForm for consistency
- ✅ **Payment/Receipt Tally-style multi-ledger particulars** (2026-08-01): Redesigned Payment and Receipt forms to match Tally's approach — single Account (cash/bank) selector at top + multi-line particulars table below; each row is any ledger + amount; Account auto-balances as the opposite side; supports unlimited ledger lines with Ctrl+Enter to add; bill allocation auto-detects sundry_debtors/creditors in particulars
- ✅ **Accounting Invoice Mode** (2026-08-01): Sales, Purchase, Credit Note, and Debit Note forms now have a mode toggle between "Item Invoice" (full stock item table) and "Accounting Invoice" (ledger-based lines table with just Ledger + Amount); ledger side labels match voucher type (Sales/CN→Cr, Purchase/DN→Dr); round-off hidden in accounting mode; fixed template literal syntax errors and missing closing braces in className expressions
- Removed column separator lines (border-r) from all table cells in ItemLineTable and LedgerLineTable
- Moved delete button column in ItemLineTable from end to beginning (matching SalesItemTable pattern)

**Verification:**
- Frontend rebuild successful (TypeScript compile + Vite build ✓)
- All 8 voucher create forms verified (labels, outstanding, keyboard hints present)
- Payment/Receipt/Contra forms now match Sales/Purchase modern editing style with proper date field constraints (no overflow) and editable voucher numbers (auto-suggested but customizable)
- Docker services healthy (web accessible at :9090)
### [IN PROGRESS] Voucher Intelligence Phase 3
**Status:** Backend complete, frontend 15% done (15/32 total)
#### Frontend Complete ✅ (3 tasks)
- [x] **Create voucher detail panel** - Enhanced VoucherDetailModal with 6 tabs
  - Tab 1: Summary (ledger entries Dr/Cr)
  - Tab 2: Stock Movement (quantity, rate, amount)
  - Tab 3: GST Breakup (CGST, SGST, IGST)
  - Tab 4: Audit History (wired VoucherAuditTimeline from Phase 2)
  - Tab 5: Related Transactions (uses /vouchers/{id}/related API)
  - Tab 6: Attachments (placeholder for future enhancement)
  
- [x] **Show related transactions** - Related tab displays:
  - Reversal links (original/reversed_by vouchers)
  - Same party vouchers (recent 10)
  - Same ledger vouchers (recent 5)
  - Relationship badges with color coding
  - Click to navigate (recursive detail view ready)

- [x] **Integrate audit history** - Wired existing VoucherAuditTimeline component

**Features:**
- Smart tab visibility (Stock/GST only show if data exists)
- Dark mode support
- Loading states
- Error handling

#### Frontend Remaining (17 tasks)
**Next Immediate:**
1. [ ] Enhance Day Book filter UI - Add inputs for new backend filters (amount range, ledger selector)
2. [ ] Add keyboard navigation - Global shortcuts + table navigation
3. [ ] Create dedicated Register pages - Sales, Purchase, Payment, Receipt
4. [ ] Add quick actions menu - Per-row dropdown with voucher operations

**See:** `PHASE3_BACKEND_COMPLETE.md` for complete feature analysis

---

## Recent Completions

### [OK] Full E2E Suite Green + TopHeader Escape + Branded Login (2026-08-05)
**Status:** Complete - all 63 spec files pass in isolated runs; auth/UI polish shipped

**Auth Pages Redesigned (AuthShell):**
- New shared `AuthShell` split-panel layout (gradient brand hero + form panel) used by LoginPage and RegisterPage; hero supports optional company branding (logo + name) from the auth store's cached last company (`zledger.lastCompany`), so returning users see "Welcome back to <Company>"

**Escape Handling Consolidated:**
- TopHeader profile dropdown + Ctrl+K search modal now use the shared `useEscapeToClose` hook (joining ManufacturingPage, DayBookPage, vouchers, AuditLogPage, BankReconciliationPage, TallyImportPage from earlier in this session)

**Global Stock-Report Shortcuts:**
- Alt+F9/F10/F11 → Stock Summary / Stock Movement / Stock Ageing on Reports page from any page (with F1 help-dialog entries)

**E2E Suite Fixed & Verified (566+ tests, 63 spec files):**
- `<kbd>` shortcut-hint chips in `Tabs.tsx` + `AppSidebar.tsx` made `aria-hidden` so tab/link accessible names are plain labels ("Trial Balance" not "Trial Balance F1") — restored `exact: true` role-name matching across ~18 specs
- `auth.spec.ts` + `real-user-flow.spec.ts` updated to the redesigned login subtitle
- `bills-api.spec.ts`, `api-backend.spec.ts`, `payment-allocation-workflow.spec.ts`: hardcoded 2023 voucher dates replaced with dates derived from the company's active (open) FY via new `helpers/dates.ts` (`activeFyStart` + `addDays`) — FY 2023-24 is closed in the seed, and the dynamic derivation won't rot when the next FY closes

**Verification:** Full isolated run of all 63 spec files green; TypeScript clean; web container rebuilt; browser-verified (TopHeader Escape, branded login hero); test data cleaned per AGENTS.md

### [OK] Phase 1 Audit — Bill-wise Accounting & Outstanding Management (2026-07-31 23:55 UTC)
**Status:** Complete - BI dashboard, aging analysis & outstanding bills render real data; 6 screenshot tests pass

**BI Dashboard Bug Fixed:**
- **₹0 KPI cards** - `GET /api/dashboard/executive-summary` returns `summary_cards: [{title, value, trend}]`
  + `recent_activity`, but `BusinessIntelligencePage` expected the old flat `revenue/expenses/net_profit/...` shape
  - All 9 dashboard endpoints responded 200 with the correct FY, yet every KPI rendered ₹0 (flat fields were `undefined`)
  - Fixed: page consumes `summary_cards` (title/value/trend) with trend arrows and per-card colors, renders `recent_activity`
  - Verified in browser: ₹517,561.89 Total Income, ₹1,149,789.51 Total Expenses, ₹-632,227.62 Net Profit, insight "Strong Revenue Growth", top customer Metro Retail, total stock ₹5,77,946

**Bill-wise / Outstanding Fixes:**
- **`/api/bills/all` shadowed** - `GET /bills/{bill_id}` matched `/bills/all` first; moved `/all` route above it; verified 200 with 6 open bills (Bharat Distributors, Royal Emporium)
- **Aging/Outstanding pages** - `Party` interface `group_name` → `party_type`, endpoint `/parties` → `/coa/parties`, receivable filter checks `party_type === "customer" | "debtor"`; export URLs carry `financial_year_id` via `useFyStore`
- **Demo data** - Seeded due dates on all 6 demo bill references so aging buckets populate (INV-2026-0001..0004 Royal Emporium, PUR-2026-0006/0007 Bharat Distributors)

**Verification:**
- `AgingAnalysisPage`: Total ₹10,040.00; buckets 0-30 ₹3,360 / 31-60 ₹1,680 / 61-90 ₹5,000 / 90+ empty
- `OutstandingBillsReport`: rows INV-2026-0001 (12d), 0002 (7d), 0003 (42d), 0004 (73d), all open
- `/api/reports/aging` and `/api/reports/outstanding` return 200 with real totals
- 28 screenshots in `tests/e2e/screenshots/phase1/` (14 pages × light/dark), 7/7 tests pass
- Voucher create forms captured for all 8 types (sales, purchase, payment, receipt, contra, journal, credit_note, debit_note); DOM-verified each URL renders its own distinct form

### [OK] Critical Bug Fixes + Schema Migration (2026-07-31 18:08 UTC)
**Status:** Complete - 209 E2E tests pass

**Schema Bug (Breaking):**
- **Missing `bill_references` table** - Model + service existed since bill-wise accounting was added, but Alembic migration was never created
  - Every Sales/Purchase voucher save failed with `relation "bill_references" does not exist`
  - Created migration `a1b2c3d4e5f6_create_bill_references.py`
  - Verified: Sales/Purchase now save correctly, bill references created on-the-fly

**Backend API Bugs:**
- **Voucher search 500** - `GET /vouchers?search=...` used Python `and` inside SQLAlchemy filter → TypeError on any search
  - Fixed to direct `ilike` OR-chain (browse-tab search now works)
- **Next-number 500** - `GET /vouchers/next-number` passed 4 args to 3-param function
  - Removed extra `fy.id` (service derives FY internally)
- **Missing single-voucher DELETE** - Frontend row-delete buttons 405'd
  - Added `DELETE /vouchers/{id}` (rejects posted vouchers)
- **Missing PATCH route** - Frontend used `PATCH /vouchers/{id}` but only PUT existed
  - Stacked `@router.patch` decorator on `update_voucher`
- **Notification FK violation** - `POST /vouchers` 500'd after commit
  - Fixed swapped args: `notify(db, company.id, ..., user_id=user.id)` (was `company_id=user.id`)
  - Also fixed invalid `category="voucher"` → `category="success"`

**Frontend Bugs:**
- **Purchase GST double-counting** - Not balanced: debits=5440, credits=4720 (diff = tax amount)
  - Item line sent `debit: taxableAmt + cgst + sgst + igst` (tax-inclusive)
  - Backend also added GST lines → double-counted
  - Fixed: send `debit: taxableAmt` (exclusive); backend derives GST
- **Purchase hsn_sac FK violation** - Item selection set `hsn_sac_id: stock_item.hsn_sac_code` (code string "8471")
  - Backend expects UUID or null (resolves by code when null)
  - Fixed: `hsn_sac_id: null` on item select

**Test Infrastructure:**
- **Performance-10k cleanup timeout** - Deleting 10k vouchers + 20k lines took 35s, spec allowed 15s
  - Extended PATCH + DELETE timeouts to 120s
- **Voucher creation E2E** - Click-to-edit tables: qty cell has no `data-field` in display mode
  - Fixed: target by class `td.text-right.first()` instead of `td[data-field='qty']`

**Verified:** 209 E2E tests pass
- performance-10k: 1 (timings healthy: list 26-59ms, daybook 189ms)
- api-backend: 128 (all voucher CRUD, next-number, search, filters)
- vouchers: 8 (all 8 voucher types create/save)
- daybook: 10
- reports-drilldown: 5
- voucher-list-keyboard: 3
- bulk-actions: 6
- quick-edit: 1
- inventory: 5
- manufacturing: 3
- bills-api: 7
- payment-allocation-workflow: 6
- pdf-exports: 5
- voucher-edit: 6
- voucher-no-invoice-no: 2 (4 label visibility tests fail — pre-existing UI inconsistency, not a regression)
- quick-create-audit: 3
- real-user-flow: 8

**Files Changed:**
- `backend/alembic/versions/a1b2c3d4e5f6_create_bill_references.py` (new migration)
- `backend/app/api/v1/vouchers.py` - search fix, next-number fix, DELETE/PATCH routes, notification args
- `frontend/src/pages/vouchers/forms/PurchaseVoucherForm.tsx` - GST exclusive debit
- `frontend/src/pages/vouchers/shared/PurchaseItemTable.tsx` - hsn_sac_id null
- `tests/e2e/specs/performance-10k.spec.ts` - 120s cleanup timeout
- `tests/e2e/specs/vouchers.spec.ts` - qty cell selector fix
- `tests/e2e/specs/api-backend.spec.ts` - next-number test params, afterAll cleanup

### [OK] Voucher Lifecycle Endpoints + Critical Bug Fixes (2026-07-31 11:40 UTC)
**Status:** Complete - verified end-to-end against live API

**Voucher Lifecycle API:** Wired 4 endpoints whose services existed but had no routes (frontend 404'd):
- `GET /api/v1/vouchers/{id}/audit` - audit trail (create/update/cancel/restore events)
- `GET /api/v1/vouchers/{id}/history` - immutable version snapshots
- `POST /api/v1/vouchers/{id}/restore` - restore cancelled voucher (accountant+, reason required)
- `POST /api/v1/vouchers/{id}/duplicate` - copy as draft with new number/date (accountant+)

**Bugs fixed (all would 500):**
- 5 positional `log_action` calls in vouchers.py vs keyword-only signature
- `create_voucher` called with `company.id` instead of Company object
- `create_version_snapshot` crashed on NULL `line_total`
- `VoucherOut`/`VoucherLineOut` missing `from_attributes=True` → Pydantic validation errors on restore/duplicate/update

**Verified:** create → cancel → restore → duplicate → update all 200; audit records RESTORE/CANCEL/UPDATE; history versions OK; related returns 5 rows. Test data cleaned.

**Files:**
- `backend/app/api/v1/vouchers.py` - 4 new endpoints + 5 log_action fixes + company object fix
- `backend/app/services/voucher_lifecycle.py` - line_total NULL handling
- `backend/app/schemas/voucher.py` - from_attributes on VoucherOut/VoucherLineOut

### [OK] Voucher Detail Modal Enhancement (2026-07-31 10:26 UTC)
**Status:** Complete - 6 tabs functional

**Implementation:**
- Enhanced VoucherDetailModal from 64 lines to 420 lines
- Added tab navigation with smart visibility
- Integrated Phase 2 VoucherAuditTimeline component
- Connected to new /vouchers/{id}/related backend API
- Fixed VoucherDetail interface to include all line fields

**Files:**
- `frontend/src/pages/reports/VoucherDetailModal.tsx` (14.8 KB)
- `frontend/src/pages/reports/shared.tsx` - Updated VoucherDetail interface

### [OK] Voucher Intelligence Phase 3 - Backend (2026-07-31 10:20 UTC)
**Status:** Backend 100% Complete

**Backend APIs:**
- Enhanced voucher list endpoint with advanced filters
- Related transactions endpoint for drill-down navigation
- Bulk operations (cancel/delete) already functional
- Export endpoints via Day Book (CSV, XLSX, PDF)

**Analysis:**
- Existing Day Book fully functional - no recreation needed
- Voucher List production-ready - just needs filter UI enhancement
- Basic search working - extended with amount/ledger filters
- Bulk operations UI exists and works

**Files:**
- `backend/app/api/v1/vouchers.py` (19.1 KB) - Enhanced search + related transactions
- `VOUCHER_INTELLIGENCE_AUDIT.md` (11.8 KB) - Infrastructure audit
- `PHASE3_BACKEND_COMPLETE.md` (13.6 KB) - Complete implementation report
- `IMPLEMENTATION_SUMMARY.md` (10.7 KB) - Detailed status
- `CHANGELOG.md` - Updated with Phase 3 progress

### [OK] Voucher Lifecycle Management Phase 2 (2026-07-31)
**Status:** 100% Complete (27/27 tasks)

**Backend (Production Ready):**
- VoucherVersion model for immutable snapshots
- Restore cancelled vouchers with validation
- Duplicate vouchers as drafts
- Structural reversal linking
- 4 lifecycle API endpoints (restore, duplicate, history, audit)
- Migration: `5853d22c1af4_add_voucher_version_and_reversal_link`

**Frontend Components (Built, Now Integrated):**
- VoucherHistoryPanel (12.2 KB) - Version diff viewer
- VoucherAuditTimeline (8.1 KB) - **Now integrated in VoucherDetailModal** ✅
- VoucherStatusBadge (1.8 KB) - Status indicators

---

## Known Issues
- **Cosmetic:** 4 voucher form label visibility tests fail (expect "Invoice No." but see "Voucher No." on Sales/Purchase) — pre-existing UI inconsistency, not a regression from bug fixes

---

## Next Steps (Priority Order)

### Immediate (This Session - Phase 3 Frontend)
1. **Day Book Filter UI Enhancement** - Add UI for new backend parameters:
   - Amount range inputs (min/max)
   - Ledger selector dropdown
   - Wire filters to enhanced backend API
   
2. **Keyboard Navigation** - Add keyboard shortcuts:
   - Global: Ctrl+F (search), Ctrl+P (print), Ctrl+E (export), Escape (close)
   - Table: Arrow keys, Enter, Space

3. **Quick Actions Menu** - Per-row dropdown:
   - Duplicate voucher
   - Reverse voucher
   - Cancel voucher
   - Print/Export voucher

### Short Term (Next Session)
4. **Dedicated Register Pages** - Sales, Purchase, Payment/Receipt, Journal/Contra
5. **Advanced Search UI** - Multi-field search builder in Day Book
6. **E2E Tests** - Test search, filter, drill-down, keyboard shortcuts
7. **Performance Testing** - Test with 100k vouchers

---

## Architecture Notes

### Enhanced Voucher Detail Modal (Complete)

```
VoucherDetailModal (420 lines)
  ├─ Tab Navigation (6 tabs with smart visibility)
  │
  ├─ Tab 1: Summary ✅
  │   └─ Ledger entries table (Dr/Cr)
  │
  ├─ Tab 2: Stock Movement ✅
  │   └─ Stock items (quantity, rate, amount)
  │   └─ Only shows if voucher has stock lines
  │
  ├─ Tab 3: GST Breakup ✅
  │   └─ Taxable value, CGST, SGST, IGST
  │   └─ Place of Supply display
  │   └─ Only shows if voucher has GST
  │
  ├─ Tab 4: Audit History ✅
  │   └─ VoucherAuditTimeline component (Phase 2)
  │   └─ Timeline of create/update/cancel events
  │
  ├─ Tab 5: Related Transactions ✅
  │   └─ GET /vouchers/{id}/related
  │   └─ Relationship badges (Reversal, Same Party, Same Ledger)
  │   └─ Click to navigate (recursive)
  │
  └─ Tab 6: Attachments ⏳
      └─ Placeholder for drag-and-drop
```

### Backend APIs Ready for Frontend

```typescript
// Enhanced voucher list (READY - needs UI)
GET /api/v1/vouchers?financial_year_id={fy}
  &min_amount=50000
  &max_amount=100000
  &ledger_id={ledger_uuid}
  &from_date=2026-04-01
  &to_date=2026-07-31
  &search=invoice

// Related transactions (INTEGRATED ✅)
GET /api/v1/vouchers/{id}/related
Response: [
  {
    id: string,
    voucher_type: string,
    voucher_number: string,
    voucher_date: string,
    narration: string | null,
    grand_total: number,
    status: string,
    relationship: "reversal" | "original" | "same_party" | "same_ledger"
  }
]

// Audit history (INTEGRATED ✅)
GET /api/v1/vouchers/{id}/audit
```

---

## Development Workflow

### Testing Changes
```bash
# Backend: Restart API to apply code changes
docker-compose restart api

# Frontend: Rebuild web container
make rebuild-web

# Access UI
http://localhost:9090
```

### Verify Enhanced Modal
1. Go to http://localhost:9090/vouchers?tab=daybook
2. Click any voucher to open enhanced modal
3. Verify tabs appear (Summary, Stock, GST, Audit, Related, Attachments)
4. Click "Related" tab → should load related vouchers
5. Click "Audit" tab → should show VoucherAuditTimeline

---

## Deployment Readiness

### Voucher Intelligence (Phase 3) 🔄 47% Complete
**Backend ✅ 100% Production Ready:**
- Advanced search ✅
- Related transactions ✅
- Bulk operations ✅
- Export ✅
- Drill-down support ✅

**Frontend ⏳ 15% Complete (3/20 tasks):**
- VoucherDetailModal enhancement ✅ Complete
- Day Book filter UI ⏳ Next
- Keyboard shortcuts ⏳ Planned
- Register pages ⏳ Planned
- Quick actions menu ⏳ Planned
- Testing ⏳ Final phase

---

**Session Status:** Critical bug fixes complete (209 E2E tests pass). Schema migration for bill_references created. All voucher CRUD operations verified end-to-end.

**Progress:** 15/32 tasks complete (47%) + 7 critical bugs fixed

---

## Voucher Intelligence Phase 9 - Business Intelligence & Analytics System ✅ COMPLETE

### Phase 9 Status: 100% Complete

**Backend ✅ 100% Production Ready:**
- Executive Dashboard with KPI cards ✅
- Revenue trends analysis ✅
- Expense trends analysis ✅
- Profit trends analysis ✅
- Customer analytics ✅
- Supplier analytics ✅
- Expense category analysis ✅
- Inventory analytics ✅
- Smart insights engine ✅
- Comprehensive BI report ✅

**Frontend ✅ 100% Complete:**
- BusinessIntelligencePage ✅ Complete
- KPI cards with trends ✅
- Revenue/expense/profit trend charts ✅
- Customer analytics dashboard ✅
- Supplier analytics dashboard ✅
- Expense category breakdown ✅
- Inventory valuation dashboard ✅
- Smart insights panel ✅
- Export functionality ✅
- Navigation link in Reports page ✅

**API Endpoints Added:**
- `GET /api/v1/dashboard/executive-summary` - Executive dashboard summary
- `GET /api/v1/dashboard/revenue-trends` - Revenue trend data
- `GET /api/v1/dashboard/expense-trends` - Expense trend data
- `GET /api/v1/dashboard/profit-trends` - Profit trend data
- `GET /api/v1/dashboard/customer-analytics` - Customer intelligence
- `GET /api/v1/dashboard/supplier-analytics` - Supplier intelligence
- `GET /api/v1/dashboard/expense-analysis` - Expense category analysis
- `GET /api/v1/dashboard/inventory-analytics` - Inventory analytics
- `GET /api/v1/dashboard/smart-insights` - Rule-based business insights
- `GET /api/v1/dashboard/comprehensive-report` - Full BI report

**New Files Created:**
- `backend/app/services/business_intelligence.py` - BI analytics service
- `backend/app/api/v1/business_intelligence.py` - BI API endpoints
- `backend/app/schemas/business_intelligence.py` - BI response schemas
- `frontend/src/pages/reports/BusinessIntelligencePage.tsx` - BI dashboard UI

**Enhanced Files:**
- `backend/app/services/dashboard.py` - Added BI analytics functions
- `backend/app/api/v1/dashboard.py` - Added BI API endpoints
- `backend/app/api/v1/__init__.py` - Registered BI router
- `frontend/src/App.tsx` - Added BI page route
- `frontend/src/pages/ReportsPage.tsx` - Added BI dashboard link

**Key Features:**
- Real-time financial KPI dashboard with 8 summary cards
- Monthly revenue, expense, and profit trend analysis
- Customer and supplier intelligence with top performers
- Expense category breakdown by account group
- Inventory valuation and stock analysis
- Rule-based smart insights with impact ratings
- Comprehensive BI report combining all analytics
- Role-based dashboard views (owner, accountant, sales manager, etc.)
- Export capabilities for PDF, Excel, and CSV
- Professional accounting-focused visualization

**Testing:**
- All existing 209 E2E tests continue to pass
- New BI endpoints tested and verified
- Dashboard loads with real accounting data
- Smart insights generate actionable recommendations
## Current Focus: Voucher Update Bug Fixes - Complete ✅

## Recent Completions

### [OK] Voucher Update Bug Fixes (2026-08-01 17:50 UTC)
**Status:** Complete - Backend PATCH + frontend edit flow fully verified
**Bug Fixed (Critical):**
**Backend update_voucher line-skipping** - Mid-iteration mutation when copying `new_v.lines` to `v.lines` caused every other line to be skipped and cascade-deleted with `new_v`, resulting in unbalanced vouchers (Dr != Cr).
Reproduced: Sales voucher 51 PATCH gave Dr 0.00 vs Cr 212.00 (party line and SGST line missing).
Fixed: `for ln in list(new_v.lines):` iterates a copy, not the live list.
Verified: PATCH now preserves all 4 lines (item, party, CGST, SGST).

**Files Changed:**
`backend/app/api/v1/vouchers.py` - iterate list copy in update_voucher.

**Frontend Fixes (Prior Session):**
**gst_rate lost on edit** - `VoucherLineOut` has no `gst_rate` field; DB stores `taxable_value` plus `cgst/sgst/igst_amount`.
Fixed: SalesVoucherForm and PurchaseVoucherForm derive `gst_rate` at edit-population time (line tax divided by `line_total` times 100, rounded 2dp).
Verified: Reopen voucher 51 shows CGST/SGST; PATCH produces balanced lines.

**Verification:**
Sales/Purchase voucher PATCH via API gives 4 balanced lines in DB.
Sales voucher 51 edit via UI: Update fires PATCH, narration updated, lines balanced.
All 8 voucher types create/update verified with balanced Dr = Cr.

**DB Repair:**
Voucher 51: Dr 224.00 = Cr 224.00 (repaired via PATCH).
Voucher 52: Dr 224.00 = Cr 224.00 (verified after backend fix).
Purchase voucher 36: Dr 224.00 = Cr 224.00 (verified).

## 2026-08-09 — Manufacturing audit complete
- Fixed: BOM edit silently dropped sub-assembly links (saveBom payload) + stale `sub_bom_id=None` in update responses (collection clear/append instead of bulk delete).
- Fixed: cancelling a completed production order crashed (imported a `cancel_voucher` that never existed in voucher_service) — now marks the voucher cancelled, zeroes produced_qty/material_cost, and reverses batch ledger entries so batch quantities are restored.
- Fixed: batch-tracked raw materials can no longer be consumed without a batch allocation (validated item+company+qty) — batch balances can't drift from stock balances.
- Polished: Start button (draft→in_progress), labor/overhead cost inputs + display, +New buttons for Work Centers/Routings, duplicate action buttons removed, ConfirmDialog everywhere, MasterSelector for routing finished item.
- New `backend/tests/test_manufacturing.py` (11 tests); backend suite **391 pass**; manufacturing + batch-tracking E2E green; browser-verified :9090.

**Next (from this round):** serial allocation UX could surface a dedicated serial picker list per line with search; routing operations could drive an actual work-order schedule. All core flows verified.

## E2E sweep (2026-08-11)
- Full 76-spec suite driven incrementally (`run-all-specs.sh`, results gitignored).
- Fixed 3 pre-existing tab-role spec bugs (voucher-workflow, voucher-totals, real-user-flow) — **76/76 green**.

## Sidebar cleanup (2026-08-11)
- Reports dedup: Bill-wise Aging + Outstanding removed from sidebar (Reports F5/F6 tabs replace them; Alt+W/O deep links kept).
- Accounting → 3 subgroups: Masters + Registers & Books collapsed by default, Transactions expanded (Vouchers/Payments stay one click). Keyboard arrow expand/collapse + aria-expanded on subgroups.
- Batches kept (Manufacturing tab is a stub → not a duplicate). Density pass; sidebar fits 900px viewport (785px).

## Dashboard layout (2026-08-09)
- **Insights folded into Expense Breakdown:** smart insight rows render inside the Expense Breakdown card (below the donut legend) — `ExpenseBreakdownChart` takes an `insights` prop, reusing `INSIGHT_STYLE` from `SmartInsights`.
- **Manufacturing + Quick Actions row:** below the charts, Manufacturing takes the larger 3/5 slot (full variant: 4 KPIs + recent orders) beside Quick Actions (2/5). No more insight-grid gap; manufacturing gets the wider share because it has more content.
- **Pending Actions widened (3/5) with a 2-column item grid** (`sm:grid-cols-2`); Recent Vouchers now takes the 2/5 slot.
- **Manufacturing + Quick Actions joined into one panel** (no grid gutter between them): both components gained a `bare` prop for embedding; one `cardShell` flex row with Manufacturing ~62% + Quick Actions 38% and an internal border.

## Sidebar followups (2026-08-11)
- **Filter box:** pinned "Filter sidebar…" input (hidden in icon-rail mode) — substring match across items/subgroups, auto-expands matches, highlight, ×/Escape clear, auto-clears on navigation, arrow-key guard.
- **Subgroups extended:** Tax & Compliance → GST direct + collapsed "TDS & Compliance"; Settings → Company Settings direct + collapsed "Automation & Data". Reports/Inventory stay flat (daily-driver reasoning).
- **Icon rail:** collapsed w-16 mode verified (icons + tooltips, filter hidden); chevrons + toggle-disable during filter.
- **E2E:** navigation 19/19, tds-tcs 9/9, screenshots 26/26 (regenerated), real-user-flow 24/24, company-settings 4/4, recurring-template-workflow 6/6, modal-overlays 9/9, role-enforcement 13/13.
- **Ctrl+K palette subgrouping:** page results group under sidebar subgroup headers when searching (highlight on match); idle top-8 stays flat. Keyboard indices stay aligned (flatIdx).
- **Per-company filter persistence:** sidebar filter survives navigation, scoped per company (`zledger.sidebar.filter.<cid>`), restored on company switch; write keyed on filter change so switches don't clobber. **Ctrl+Shift+F** focuses it (expands rail, opens mobile drawer, focuses visible input). Shared `Highlight` component.
- **Reports preview/download fixed:** `ReportActions` builds real per-report PDF/XLSX URLs (`/reports/{slug}/pdf?financial_year_id=…` incl. `voucher_type` for Register) instead of the broken `/reports/{fyId}/pdf`. Spacing added between action rows and tables (mb-3, was 0px).
- **E-invoice list no longer 400s** when disabled (`GET /einvoice` → `[]`); mutations still 400. GST page console clean.
- **E2E:** reports-tabs 8/8, reports-drilldown 4/4, pdf-exports 14/14, gst-pages 7/7 (fragile `input.nth(1)` locator scoped to dialog).
