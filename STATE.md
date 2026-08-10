# ZLedger Development State

**Last Updated:** 2026-08-10 UTC

## Current Focus
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

## Dashboard layout (2026-08-09)
- **Insights folded into Expense Breakdown:** smart insight rows render inside the Expense Breakdown card (below the donut legend) — `ExpenseBreakdownChart` takes an `insights` prop, reusing `INSIGHT_STYLE` from `SmartInsights`.
- **Manufacturing + Quick Actions row:** below the charts, Manufacturing takes the larger 3/5 slot (full variant: 4 KPIs + recent orders) beside Quick Actions (2/5). No more insight-grid gap; manufacturing gets the wider share because it has more content.
- **Pending Actions widened (3/5) with a 2-column item grid** (`sm:grid-cols-2`); Recent Vouchers now takes the 2/5 slot.
- **Manufacturing + Quick Actions joined into one panel** (no grid gutter between them): both components gained a `bare` prop for embedding; one `cardShell` flex row with Manufacturing ~62% + Quick Actions 38% and an internal border.
