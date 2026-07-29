# Keyboard-Only Workflow Plan (Tally-Inspired)

## Philosophy

Tally ERP/Prime users operate almost entirely without a mouse — accelerators, F-keys, Ctrl+letter combos, and field navigation via Tab/Enter. This plan brings that workflow to ZLedger incrementally, phase by phase, without breaking existing mouse-based UX.

## Current Keyboard Features (Already Implemented)

| Shortcut | Scope | Status |
|---|---|---|
| Ctrl+A | Save voucher | ✅ Done |
| Ctrl+Enter | MasterSelector inline edit | ✅ Done |
| Enter/Tab | Next field (voucher forms) | ✅ Done via `useVoucherKeyboard` |
| Escape | Close topmost modal only | ✅ Done via `useEscapeToClose` stack |
| Escape | Reset form (non-modal context) | ✅ Done |
| Alt+L | Focus ledger quick-create | ✅ Done |
| Tab | Cycle fields within modal (focus trap) | ✅ Done in `MasterSelectorModal` |
| Tab capture skip | `data-master-popup` detection | ✅ Done in `useVoucherKeyboard` |

## Phase 1 — Page Accelerators

Goal: Jump between major pages with Alt+letter from anywhere in the app.

**Mapping:**
- Alt+D → Dashboard (`/`)
- Alt+V → Vouchers (`/vouchers`)
- Alt+C → Chart of Accounts (`/chart-of-accounts`)
- Alt+P → Parties (`/parties`)
- Alt+R → Reports (`/reports`)
- Alt+G → GST (`/gst`)
- Alt+T → TDS/TCS (`/tds-tcs`)
- Alt+I → Inventory (`/inventory`)
- Alt+E → Data Import/Export (`/tally-import`)
- Alt+B → Bank Reconciliation (`/bank-reconciliation`)
- Alt+L → Loans (`/loans`)
- Alt+F → Fixed Assets (`/fixed-assets`)
- Alt+N → Compliance (`/compliance`)

**Implementation:**
- Define mapping in `frontend/src/config/keyboardNav.ts`
- Register a capture-phase `keydown` listener at the App level
- Guard: skip if an input/textarea is focused OR a modal popup is open (`[data-master-popup]` present)
- Use `navigate()` from react-router-dom

**Risk:** Very low — Alt+letter combos don't conflict with existing shortcuts. Guard prevents conflicts inside modals.

## Phase 2 — F-Key Actions

Goal: Common actions from any screen via F-keys.

- F2 → New voucher (opens voucher creation with type selector)
- F3 → Search (focuses Ctrl+K search bar)
- F5 → Refresh current page data
- F7 → Toggle sidebar collapse
- F8 → Toggle dark/light mode

**Implementation:**
- Same capture-phase handler as Phase 1
- Guard: skip if modal is open (`[data-master-popup]`)
- `F5` already navigated by browser — use `e.preventDefault()` + custom refresh

**Risk:** Low — F-keys are currently unused in the app. Browser-default F5 overridden safely.

## Phase 3 — Contextual Action Accelerators

Goal: Within a voucher form, additional Ctrl+letter shortcuts for common actions.

- Ctrl+S → Save (already partially via Ctrl+A — keep Ctrl+A as primary, add Ctrl+S as alias)
- Ctrl+D → Duplicate voucher (load last saved voucher data into new form)
- Ctrl+Shift+V → Paste from clipboard (structured data paste into voucher lines)
- Ctrl+F → Focus search (on list pages)
- Ctrl+N → New record (on list pages — already used for new voucher via `?action=new`)

**Implementation:**
- Extend `useVoucherKeyboard` options to accept more callbacks
- Add to the existing capture-phase handler
- Add new handlers for list-page contexts (outside voucher forms)

**Risk:** Low. Ctrl+S doesn't conflict with browser save (preventDefault). Ctrl+F overrides browser find — acceptable for accounting workflow.

## Phase 4 — Sidebar Navigation via Arrow Keys

Goal: Navigate the sidebar with Up/Down arrows, expand/collapse groups with Left/Right, activate with Enter.

**Implementation:**
- Track focused sidebar item index
- Add `onKeyDown` handler to the sidebar container
- Visual highlight for the focused item

**Risk:** Medium — requires careful interaction with existing sidebar click handlers. Must not trap Tab focus.

## Phase 5 — List/Table Navigation via Keyboard

Goal: Navigate table rows with Up/Down arrows, open with Enter, action with shortcut.

**Implementation:**
- Add row-selection state to `SortableTable`
- Up/Down moves selection highlight
- Enter opens detail modal / navigates to detail page
- Delete key triggers delete action (with confirmation)

**Risk:** Medium — needs opt-in per table (not all tables should be keyboard-navigable). Must not interfere with text input fields inside tables.

## Non-Goals (Deferred)

| Feature | Reason |
|---|---|
| Full menu bar (File/Edit/View) | Tally's menu structure doesn't map to our UI |
| Alt+letter on every single button | Would conflict with too many things |
| Vim-style modal editing | Not applicable to accounting data entry |

## Design Principles

1. **Never break mouse UX.** Keyboard shortcuts are additive.
2. **Modals own focus.** When a modal is open, global shortcuts are suppressed.
3. **Discoverable.** Add shortcut hints to tooltips (`title="Save (Ctrl+A)"`).
4. **Consistent.** Same shortcuts work same way across all pages.
5. **Conservative.** Ship one phase, validate for a week, then proceed.