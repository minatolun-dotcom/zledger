# ZLedger Design System

## Overview

ZLedger is a dark-native accounting and GST compliance dashboard. The canvas is deep navy (`--surface-page` #0f0f16), with elevated surfaces in `--surface-card` (#16161f) and `--surface-elevated` (#1a1a24). Borders use `--border-default` (#282832). The system reads as professional, data-dense, and trustworthy — every screen has clear hierarchy, controlled whitespace, and unambiguous actions.

The brand accent is blue (`--accent` #3b82f6) — used for primary CTAs, active states, link text, and focus rings. Success states use green (`--success` #22c55e), warnings use amber (`--warning` #f59e0b), errors use red (`--error` #ef4444).

Type uses **Inter** (400/500/600 weights) for all surfaces — no secondary display face. The system relies on weight, size, and color contrast rather than font switching for hierarchy. Data-heavy tables and long lists use condensed spacing; modals and forms use generous internal padding.

Component voltage comes from **real data rendered in context** — tables with sortable columns, searchable dropdowns with inline create/edit, portal-based modals with focus trapping. ZLedger doesn't illustrate features; it shows the actual accounting data at every step.

**Key Characteristics:**
- Dark canvas (`#0f0f16`) with elevated card surfaces (`#16161f`, `#1a1a24`). Primary CTA uses `--accent` (#3b82f6) with white text.
- Single typeface: **Inter** (400/500/600). No secondary display font. Hierarchy via weight + size + color.
- Subtle border tones (`--border-default` #282832, `--border-subtle` #1a1a24) define card boundaries without hard shadows.
- Data rendered directly in tables — accounting ledgers, voucher lists, GST returns, stock items. Every list is a real data table with search, sort, and pagination.
- Portal-based modals with z-index stacking, focus trapping, and Escape-stack behavior (topmost modal closes first).
- Inline master creation via `MasterSelector` — create/edit ledgers, groups, parties, stock items without leaving the voucher form.
- Responsive sidebar (collapsible) + fixed top header. Sidebar groups: Accounting, Inventory, GST & Tax, Compliance, Reports, Settings.
- The only light surfaces are temporary (modals, dropdown popups) — the app is dark-first.

## Colors

### Brand & Accent
- **Accent** (`--accent` — #3b82f6): Primary CTAs, active tab indicators, link text, focus rings, selected states. Hover shifts to `--accent-hover` (#2563eb).
- **Accent Soft** (`--accent-soft` — rgba(59,130,246,0.1)): Selected row backgrounds, active pill backgrounds in dark mode.
- **Primary Text** (`--text-primary` — #f1f5f9): All headlines and primary body text on dark surfaces.
- **Secondary Text** (`--text-secondary` — #cbd5e1): Default running-text color.
- **Muted Text** (`--text-muted` — #94a3b8): Secondary text — sub-headings, breadcrumbs, table header labels.
- **Disabled Text** (`--text-disabled` — #64748b): Disabled controls, placeholder text, fine-print.

### Surface
- **Page** (`--surface-page` — #0f0f16): The default page floor — deepest background.
- **Card** (`--surface-card` — #16161f): Cards, panels, section containers.
- **Elevated** (`--surface-elevated` — #1a1a24): Input fields, dropdown options hover, sidebar active item.
- **Input** (`--surface-input` — #0f0f16): Text input backgrounds inside cards.
- **Border Default** (`--border-default` — #282832): Card borders, input borders, table dividers.
- **Border Subtle** (`--border-subtle` — #1a1a24): Section dividers, subtle separators.
- **Overlay** (`--overlay` — rgba(0,0,0,0.4)): Modal and drawer backdrops.

### Semantic
- **Success** (`--success` — #22c55e): Created/imported counts, confirmation badges, success toasts.
- **Success Soft** (`--success-soft` — rgba(34,197,94,0.1)): Success state backgrounds.
- **Warning** (`--warning` — #f59e0b): Warning callouts, pending states.
- **Warning Soft** (`--warning-soft` — rgba(245,158,11,0.1)): Warning state backgrounds.
- **Error** (`--error` — #ef4444): Validation errors, deletion actions, error toasts.
- **Error Soft** (`--error-soft` — rgba(239,68,68,0.1)): Error state backgrounds.

### Light Mode Overrides
When `html` does NOT have class `dark`, all surfaces invert:
- Page becomes `#f8fafc`, cards become `#ffffff`, borders become `#e2e8f0`.
- Text maps: primary → `#0f172a`, secondary → `#334155`, muted → `#64748b`.
- Accent stays #3b82f6 throughout.

## Typography

### Font Family
**Inter** (400/500/600) on all surfaces — body, headings, buttons, navigation, tables, code labels. The system has no secondary display face. Fallback: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.

Monospace (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`) is used for code snippets, voucher numbers, and tabular identifiers — never for body text.

### Hierarchy

| Token | Size | Weight | Line Height | Use |
|---|---|---|---|---|
| `heading-lg` | 18px | 600 | 1.3 | Page titles (h1), section headers |
| `heading-md` | 16px | 600 | 1.4 | Card titles, modal headers, subsection heads |
| `heading-sm` | 14px | 600 | 1.4 | Table column headers, list labels, tab labels |
| `body-md` | 14px | 400 | 1.5 | Default body text, table cells, list items |
| `body-sm` | 13px | 400 | 1.5 | Secondary text, descriptions, helper text |
| `caption` | 11px | 500 | 1.3 | Badge labels, file sizes, period tags |
| `button` | 14px | 500 | 1.0 | Primary and secondary button labels |
| `button-sm` | 12px | 500 | 1.0 | Small buttons, inline actions |
| `nav-link` | 14px | 500 | 1.4 | Sidebar navigation items |
| `tabular` | 13px | 400 | 1.4 | Voucher numbers, ledger names in tables — monospace |
| `code` | 13px | 400 | 1.5 | Inline code, API examples — monospace |

### Principles
Inter at all weights handles every role — no display face. Hierarchy is conveyed through size (14px body vs 18px h1), weight (600 for headings vs 400 for body), and color contrast (`--text-primary` vs `--text-muted`). Data tables use `body-md` (14px) for readability; dense list views (`body-sm` 13px) only when space is constrained.

## Layout

### Spacing System
- **Base unit:** 4px.
- **Tokens:** `xxs` 4px · `xs` 8px · `sm` 12px · `md` 16px · `lg` 24px · `xl` 32px · `xxl` 48px · `section` 64px.
- **Page padding:** 24px (`lg`) on desktop, 16px (`md`) on mobile.
- **Card internal padding:** 24px (`lg`) for standard cards, 16px (`md`) for compact cards (tables inside cards).
- **Modal internal padding:** 20px–24px.
- **Grid gaps:** 12px–16px between cards in multi-up grids.

### Page Structure
- **Fixed top header** (~56px): Logo left, search center, FY selector + settings + notifications right.
- **Collapsible sidebar** (240px expanded, ~64px collapsed): Groups — Accounting, Inventory, GST & Tax, Compliance, Reports, Settings. Each group expandable.
- **Main content area**: Remaining viewport width, scrollable. Max content width ~1200px centered for forms, full-width for tables.
- **Tab bars**: Gradient-underline pill style (`<Tabs>` component), used on most pages for sub-navigation.

### Whitespace Philosophy
ZLedger is data-dense but not cramped. Standard cards have 24px padding; data tables inside cards have 12px cell padding. The page reads as "professional accounting software" — enough whitespace to distinguish sections, dense enough to show 20+ rows of ledger data without scrolling. Modal dialogs have generous internal padding (20–24px) for focused data entry.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Page surface | `--surface-page` (#0f0f16) | Default floor |
| Card | `--surface-card` (#16161f), 1px `--border-default` border | Panels, sections, containers |
| Elevated | `--surface-elevated` (#1a1a24), 1px `--border-default` border | Input fields, hover states, active items |
| Dropdown/Portal | `--surface-card` (#16161f), subtle shadow (`0 4px 16px rgba(0,0,0,0.3)`) | Dropdown lists, popovers, date pickers |
| Modal | `--surface-card` (#16161f), 1px `--border-default` border, above `--overlay` backdrop | Dialogs, forms, previews |
| Drawer | Same as modal, slides in from right | Bank reconciliation match panel, detail views |

ZLedger uses **color contrast + borders** for elevation rather than drop shadows. The card surface is one step lighter than the page floor. Modals and dropdowns add a faint shadow for separation from the overlay backdrop. No heavy shadows, no neumorphism, no glassmorphism.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `rounded-sm` | 4px | Checkboxes, small badges |
| `rounded-md` | 6px | Input fields, buttons, Select dropdown trigger |
| `rounded-lg` | 8px | Cards, modals, table containers |
| `rounded-xl` | 12px | Large containers, DropZone borders |
| `rounded-pill` | 9999px | Period/chip buttons, status badges, XML badges |
| `rounded-full` | 50% | Avatars, icon buttons |

## Components

### Top Header

**`top-header`** — Fixed bar across the top of every page. ~56px tall, `--surface-card` background with `--border-subtle` bottom border. Left: ZLedger logo + app name ("Zledger"). Center: search bar (`input[placeholder="Search pages, actions..."]`) with Ctrl+K shortcut hint. Right cluster: FY selector dropdown, Settings gear icon, Notification bell with unread count, User avatar/menu.

### Sidebar

**`sidebar`** — Collapsible left panel. 240px when expanded, ~64px when collapsed (icons only). `--surface-card` background. Groups: Accounting (Chart of Accounts, Parties, Vouchers, Fixed Assets, Reconciliation), Inventory (Stock & Inventory, Manufacturing, Batches), GST & Tax (GST, TDS/TCS), Compliance (Statutory Compliance), Reports (Financial Reports, Payments & Receivables), Settings (Company Settings, Recurring Templates, Data Import/Export). Active link highlighted with `--accent` text. Each group collapsible. Collapse toggle at bottom.

### Buttons

**`button-primary`** — Primary CTA. Background `--accent` (#3b82f6), text `#ffffff`, type `button` (Inter 14px / 500), padding 8px × 16px, rounded `rounded-md` (6px). Hover: `--accent-hover` (#2563eb). Disabled: opacity 50%.

**`button-secondary`** — Outline button. Background transparent, text `--text-primary`, 1px `--border-default` border, same padding + height + radius as primary. Hover: `--surface-elevated` background.

**`button-ghost`** — Minimal button. No border, no background on default state. Text `--text-secondary`. Hover: `--surface-elevated` background. Used for icon-only toolbar actions, inline "Edit" / "Delete" links.

**`button-danger`** — Destructive action. Background `--error` (#ef4444), white text. Same sizing as primary. Used for "Delete", "Undo import" actions.

**`button-icon`** — Square icon button, 28–36px. Same variants as above (primary/secondary/ghost). Used in table action columns.

### Inputs & Forms

**`text-input`** — Text/email/number input. Background `--surface-input` (#0f0f16), text `--text-primary`, type `body-md`, border 1px `--border-default`, rounded `rounded-md` (6px), padding 8px × 12px. Focus: ring 1px `--accent`, border `--accent`. Placeholder: `--text-disabled`.

**`select-trigger`** — Portal-based custom Select component (never native `<select>` in dark mode). Trigger looks like `text-input` with chevron icon. Dropdown is portal-rendered with search, keyboard navigation, and `--surface-card` background.

**`searchable-select`** — `<SearchableSelect>` component. Input + dropdown with real-time filtering. Used for ledger/party/stock-item selection in voucher forms. Inline create ("Create 'X'") and edit (pencil icon with Ctrl+Enter) integrated.

**`date-input`** — `<DateInput>` component. Custom date picker with calendar popover. Format: YYYY-MM-DD.

### Tables

**`data-table`** — The primary data display. `<SortableTable>` component. Header row with sortable column labels (`heading-sm` weight). Alternating row backgrounds (even rows `--surface-elevated`). Cell padding 8px × 12px. Right-aligned numeric columns (amounts, quantities). Action column (rightmost) with icon buttons.

**`table-row-click`** — Row click opens detail modal/drawer (pattern A). Used for DayBook, Payments, AuditLog.

**`table-row-actions`** — Row click + inline icon buttons (pattern B). Used for Manufacturing, Routings, Stock Items.

**`table-row-kebab`** — Row click + kebab menu (pattern C). Used for AdminUsers, RecurringTemplates.

### Cards & Containers

**`page-card`** — Standard section card. Background `--surface-card`, 1px `--border-default` border, rounded `rounded-lg` (8px), padding 24px (`lg`). Used for every content section on every page.

**`compact-card`** — Table container card. Same background/border/radius, padding 0 (the table header serves as the top edge). Used for list pages (Chart of Accounts, Stock Items, Vouchers).

**`stats-card`** — Summary metric card. Background `--surface-card`, border + radius as standard, padding 16px. Used in dashboard-style summaries (import preview counts, dashboard widgets). Center-aligned with large number + label.

**`detail-modal`** — Modal dialog for viewing/editing a record. Background `--surface-card`, rounded `rounded-lg` (8px), internal padding 20–24px. `fixed inset-0` with `--overlay` backdrop. Close on Escape (topmost in stack), click-outside, or × button.

### Modals

**`modal-backdrop`** — `fixed inset-0 z-[9999] flex items-center justify-center bg-black/40`. Clicking backdrop closes the topmost modal.

**`modal-content`** — `w-full max-w-lg rounded-xl bg-[#16161f] p-5 shadow-xl`. Stop propagation on click inside to prevent backdrop close.

**`modal-stack`** — When multiple modals are open, each gets incrementally higher z-index (`9999 + depth * 20`). Escape closes only the topmost, not all. Tab cycles within the top modal only (focus trapping).

### DropZone

**`drop-zone`** — File upload target. Border: 2px dashed `--border-default`, rounded `rounded-xl` (12px), padding 32px. Hover/drag: border `--accent`, background `--accent-soft`. Accepts multiple files. Shows file names after selection. Used on Tally Import and CSV Import pages.

**`upload-progress`** — Progress bar shown during upload. Full-width bar, 8px height, `--border-subtle` track, `--accent` fill. Percentage label aligned right. File name shown above bar.

### Tags / Badges

**`status-badge`** — Small rounded pill for status indicators. Padding 2px × 8px, rounded `rounded-pill`, text `caption` (11px / 500). Color variants: green (`--success` bg 0.1 opacity), amber (`--warning`), red (`--error`), blue (`--accent`).

**`xml-badge`** — Badge for XML file indicators. "Masters" in green, "Vouchers" in blue. `caption` size, `rounded-pill`, text-colored background at 0.1 opacity.

**`period-chip`** — Period folder picker chip. Toggle button style, `rounded-pill`, active state uses `--accent` border + bg at 0.1 opacity.

### Navigation

**`tabs`** — Shared `<Tabs>` component. Pill-group container (`rounded-full bg-slate-100 dark:bg-[#1a1a24]`), active tab rendered as raised pill (`rounded-full bg-white dark:bg-[#282832]` with shadow). Pill-in-pill style matching Cal.com nav-pill-group. Optional count badge. API: `<Tabs tabs active onChange className />`. Used on most pages for sub-navigation.

**`step-indicator`** — Multi-step progress bar. Steps: "Upload & Parse", "Validation", "Preview", "Complete". Active step: blue highlight. Completed steps: green with checkmark. Connecting lines between steps.

### Tally Import Specific

**`tally-source-card`** — Source selection card (2-up grid). Icon + label + description. Tally Import (blue "T" icon), CSV Import (green "CSV" icon). Hover: border `--accent`, background `--accent-soft`.

**`upload-summary`** — Post-upload file list card. Shows each uploaded file name with parsed content counts (e.g., "35g 14l 3v"). Used in Validation step.

**`recent-imports`** — Compact list on source selection page. Last 3 import jobs with filename, item count, status, date. "View" / "Details" action buttons.

**`entity-selector`** — 3- or 4-up grid of entity type cards (Ledgers, Parties, Stock Items, Vouchers). Selected card: `--accent` border + background. Used in CSV import flow.

## Interaction Patterns

### Modal Stacking
1. Each modal registers its close handler with a shared `useEscapeToClose` hook.
2. Hook maintains a stack of handlers — only the topmost (most recently registered) fires on Escape.
3. When top modal closes, its handler is removed from the stack; next Escape press closes the next modal.
4. Each modal has `data-master-popup` attribute so `useVoucherKeyboard` skips Tab handling when a modal is open.
5. Focus trapping cycles Tab within the top modal only (first → last → first with Shift+Tab reverse).

### Keyboard Shortcuts (Voucher Forms)
- `Ctrl+A` — Save voucher.
- `Ctrl+Enter` — Quick-edit selected item in MasterSelector.
- `Enter` — Move to next form field.
- `Tab` — Move to next form field (same as Enter).
- `Escape` — Close topmost modal / reset form.
- `Alt+L` — Focus ledger quick-create.
- Shortcuts are registered with `useVoucherKeyboard` hook, uses capture phase, skips when a `[data-master-popup]` is open.

### Focus Management
- Modal opens: auto-focus first text input/textarea via `setTimeout(50ms)`.
- Modal closes: restore focus to element that triggered the modal (saved in `focusRef`).
- MasterSelector inline edit: saves `document.activeElement` before opening, restores on close.
- Tab trapping: custom `useEffect` in each modal, wraps focus from last → first and first → last.

### File Upload
- DropZone accepts drag-and-drop or click-to-browse.
- Multiple files allowed (`multiple` attribute).
- Single file → `POST /tally-import/upload`.
- Multiple files → `POST /tally-import/upload-multiple` (merged into one import job).
- ZIP files → `POST /tally-import/upload-archive`.
- Upload uses `XMLHttpRequest` for progress tracking (not `fetch`).
- Progress bar shows file name + percentage.

## Do's and Don'ts

### Do
- Use `--accent` (#3b82f6) for primary CTAs, active states, focus rings. The app is blue-accented.
- Keep data tables as the primary content display. ZLedger is an accounting app — lists, ledgers, and vouchers are the product.
- Use `<Select>` (portal component) instead of native `<select>` everywhere in dark mode. Native select popups cannot be themed on Linux.
- Use `data-field` attributes on form fields for keyboard navigation.
- Apply the custom dark palette (`#16161f`, `#1a1a24`, `#282832`) — NOT Tailwind default slate.
- Trap Tab focus inside open modals. Test with stacked modals.
- Register Escape handlers through `useEscapeToClose` (shared stack), not direct `document.addEventListener`.

### Don't
- Don't use native `<select>` in dark mode — the OS-rendered dropdown popup is white/unthemeable on Linux.
- Don't use Tailwind default slate colors (`dark:bg-slate-700`, `dark:border-slate-600`) — use the custom palette.
- Don't add direct `document.addEventListener('keydown', ...)` for Escape in new modals — use `useEscapeToClose`.
- Don't skip focus trapping on modals — Tab must stay within the modal boundary.
- Don't add `:any` type annotations — use `unknown`, domain types, or type guards.
- Don't extract one-line wrapper functions — inline unless it creates a durable contract.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 768px | Sidebar hidden (hamburger toggle); tables horizontal-scroll; modals full-width; page padding 16px |
| Tablet | 768–1024px | Sidebar collapsed by default; 2-up grids; tables compact |
| Desktop | 1024–1440px | Full sidebar (240px); 3-up grids; standard tables |
| Wide | > 1440px | Max content width ~1400px; centered layout for forms |

### Touch Targets
- All interactive elements minimum 36 × 36px.
- Form inputs minimum 36px height.
- Sidebar links minimum 40px tap area.
- Modal close × button minimum 32 × 32px.

## Known Gaps

- No formal loading skeleton pattern documented — current implementation uses inline "Loading..." text or spinner.
- Toast/notification positioning (bottom-right by convention) not formalized.
- Animation timing (modal open/close, sidebar collapse, tab transitions) not codified.
- Print styles for reports (PDF export) not documented.
- Chart/visualization patterns (dashboard graphs) limited to basic metric cards.