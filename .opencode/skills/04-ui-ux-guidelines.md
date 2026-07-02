# UI/UX Guidelines

## Design Philosophy
Desktop-first ERP interface designed for professional accounting users. Prioritize data density, keyboard efficiency, and visual clarity over decorative elements.

## Layout
- **Desktop-first**: Optimized for 1366px+ screens. Mobile is not a primary target.
- **Sidebar**: Fixed-width (`w-80`, 320px) with collapsible module groups. Active state with violet accent.
- **Content area**: Flexible width, min-w-0 for text truncation support.
- **Tables**: Dense layout (`py-1.5` rows), fixed column widths for predictable alignment.

## Dark Mode
- **System**: `darkMode: 'class'` on `<html>`. Theme store with light/dark/auto (system) modes.
- **Surface layers** (dark mode):
  | Layer | Hex | Usage |
  |-------|-----|-------|
  | Surface 0 | `#0a0a0f` | Page background |
  | Surface 1 | `#111118` | Sidebar, panels |
  | Surface 2 | `#18181f` | Cards, modals |
  | Surface 3 | `#1e1e28` | Hover/active |
  | Surface 4 | `#252530` | Elevated elements |
- **Typography** (dark mode):
  | Level | Color | Used for |
  |-------|-------|----------|
  | Primary | `#f1f5f9` | Headings, important values |
  | Secondary | `#cbd5e1` | Body text, inputs |
  | Muted | `#64748b` | Labels, metadata, badges |
- **Accent**: Violet-500 (`#8b5cf6`) for active nav, focus states, important buttons.
- **Shadows**: Custom dark shadow scale (`shadow-dark-sm` through `shadow-dark-xl`).
- **All components** must have `dark:` variants alongside light classes.

## Component Patterns
- **Select**: Custom dropdown with keyboard nav (arrows, Enter, Escape), portal rendering, viewport-aware positioning.
- **Calendar**: `position: fixed`, z-index `99999`, viewport bounds checking.
- **ContextMenu**: Right-click support, portal rendering, viewport-aware positioning, z-index `99999`.
- **Modals**: Centered overlay with backdrop click-to-close. Header shows actions (Edit/Duplicate/Delete), form body below.
- **Badges**: Use pill badges for status (Active/Inactive, Open/Closed, Paid/Unpaid).
  - Light: `bg-{color}-50 text-{color}-700`
  - Dark: `dark:bg-{color}-500/10 dark:text-{color}-400`
- **Buttons**: Primary (filled brand), Secondary (outlined), Danger (red).
  - Primary: `bg-brand-600 hover:bg-brand-700 text-white`
  - Secondary: `border border-slate-300 hover:bg-slate-50`

## Keyboard & Interaction
- **Ctrl+K** / `/` opens global search
- **Right-click** opens context menu on data rows (never inline action buttons in tables)
- **Tab** navigates between form fields, **Enter** submits
- Arrow keys in Select/Custom dropdowns
- **Escape** closes modals, dropdowns, popups

## Spacing System
- **Consistent padding**: `px-3`, `py-1.5` for table cells and form inputs
- **Gaps**: `gap-2` (tight), `gap-3` (default), `gap-4` (loose) for grid layouts
- **Form spacing**: `space-y-4` between field groups, `space-y-2` between label and input
- **Section margins**: `mb-3` or `mb-4` between sections

## Accessibility
- Every form input needs a label (visible or sr-only)
- `aria-label` on icon-only buttons
- `role="dialog"` and `aria-modal="true"` on modal overlays
- Focus rings on all interactive elements (`focus:ring-2 focus:ring-brand-500`)
- Color contrast: All text meets WCAG AA standards
- Keyboard navigable: All interactive elements reachable via Tab

## What NOT to do
- No unnecessary confirmation dialogs (accounting users want speed)
- No decorative animations that slow down interaction
- No native `<select>` elements — always use the custom `Select` component
- No inline action columns in tables — use right-click context menu or click-to-open modals
- No white backgrounds without `dark:` variants
