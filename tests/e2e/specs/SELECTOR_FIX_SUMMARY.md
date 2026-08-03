# Selector Fixes Summary

All 11 assigned spec files now compile via `npx playwright test <file> --list`.

---

## batch-tracking.spec.ts (7 tests)
- **Tab navigation fixes** (`getByRole("tab", ...)` instead of `getByRole("button", ...)`):
  - `Batches` (Manufacturing page tab): 4 occurrences (lines 18, 22, 31, 64)
  - `Batch Trace` (BatchBrowsePage tab): 1 occurrence (line 86)

## reports-tabs.spec.ts (7 tests)
- **Tab navigation fixes** (`getByRole("tab", ...)` instead of `getByRole("button", ...)`):
  - `Trial Balance`: 1 occurrence (line 14)
  - `Profit & Loss`: 1 occurrence (line 18)
  - `Balance Sheet`: 1 occurrence (line 25)
  - `Cash Flow`: 1 occurrence (line 32)
  - `Aging`: 1 occurrence (line 38)
  - `Outstanding`: 1 occurrence (line 43)
  - `Stock Summary`: 1 occurrence (line 48)

## gstr-annual.spec.ts (2 tests)
- **Tab navigation fixes** (`getByRole("tab", ...)` instead of `getByRole("button", ...)`):
  - `GST Status`: 2 occurrences (lines 18, 27)

## compliance-gstr.spec.ts (2 tests)
- **Tab navigation fixes** (`getByRole("tab", ...)` instead of `getByRole("button", ...)`):
  - `GST Status`: 2 occurrences (lines 18, 34)

## tds-tcs.spec.ts (1 test)
- **Tab navigation fix** (`getByRole("tab", ...)` instead of `getByRole("button", ...)`):
  - `Certificates`: 1 occurrence (line 139)

## profile.spec.ts (1 test)
- **Tab navigation fix** (`getByRole("tab", ...)` instead of `getByRole("button", ...)`):
  - `Security`: 1 occurrence (line 36)

## payments-receivables.spec.ts (1 test)
- **Tab navigation fix** (`getByRole("tab", ...)` instead of `getByRole("button", ...)`):
  - `Payables`: 1 occurrence (line 46)

## fixed-assets.spec.ts (1 test)
- **Tab navigation fixes** (`getByRole("tab", ...)` instead of `getByRole("button", ...)`):
  - `Asset Register`: 2 occurrences (lines 28, 61)
  - `Categories`: 2 occurrences (lines 29, 33)
  - `Depreciation`: 2 occurrences (lines 30, 89)

## gst-pages.spec.ts (2 tests)
- **Selector fixes**:
  - Line 55: HSN/SAC delete modal z-index from `z-[99999]` to `z-[9999]` (ConfirmDialog uses `z-[9999]`)
  - Line 56: Same z-index fix for Delete button click
  - Line 87: Cancel button selector to use `.last()` to target the correct Cancel button in DOM

## inventory.spec.ts (4 tests)
- **Tab navigation fixes** (`getByRole("tab", ...)` instead of `getByRole("button", ...)`):
  - `Stock Groups`: 1 occurrence (line 14)
  - `Stock Items`: 3 occurrences (lines 15, 51, 75, 115)
  - `Stock Entries`: 1 occurrence (line 16)

## gst-challans.spec.ts (3 tests)
- **Tab navigation fixes** (`getByRole("tab", ...)` instead of `getByRole("button", ...)`):
  - `E-Invoice`: 1 occurrence (line 18)
  - `E-Way Bill`: 1 occurrence (line 19)
  - `HSN / SAC`: 1 occurrence (line 20)
  - `Registrations`: 1 occurrence (line 21)
- **Type safety fix**: Replaced `(page as any).__errors` with `(page as Page & { __errors?: string[] }).__errors`

---

## Verification Command

All files verified with:
```bash
cd /home/popsickle/ktMedia/Media1/Project/Zledger/tests/e2e
npx playwright test specs/<file>.spec.ts --list
```
