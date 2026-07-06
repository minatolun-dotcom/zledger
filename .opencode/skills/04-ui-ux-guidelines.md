# UI/UX Guidelines

## Design Philosophy
Desktop-first ERP interface designed for professional accounting users. Prioritize data density, keyboard efficiency, and visual clarity over decorative elements. This is a tool, not a showcase — every pixel must earn its place.

## Anti-AI-Slop Rules
AI-generated design clusters around three default looks. Avoid all three unless the brief explicitly calls for one:
1. Warm cream background (#F4F1EA) + high-contrast serif + terracotta accent
2. Near-black background + single acid-green or vermilion accent
3. Broadsheet layout + hairline rules + zero border-radius + newspaper columns

**Instead:** Ground design in the subject. Accounting software's "subject" is financial precision — use structured data, clear hierarchy, and deliberate whitespace. Typography carries personality; pair display and body faces intentionally. Structural devices (numbers, labels, dividers) must encode truth, not decorate.

## Design Process
When creating or significantly redesigning a UI:
1. **Brainstorm** a compact plan: color palette (4-6 named hex values), type scale (display + body + utility faces), layout concept (ASCII wireframes), signature element
2. **Critique** against the brief — if any part reads like a generic default, revise it
3. **Build** following the plan exactly, deriving every color/type decision from it
4. **Critique again** — screenshot if possible, remove one unnecessary element before shipping

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

## Design Tokens (CSS Variables)
Define tokens in `index.css` for consistent theming across the app:
```css
:root {
  /* Spacing */
  --space-xs: 0.25rem;    /* 4px */
  --space-sm: 0.5rem;     /* 8px */
  --space-md: 0.75rem;    /* 12px */
  --space-lg: 1rem;       /* 16px */
  --space-xl: 1.5rem;     /* 24px */
  --space-2xl: 2rem;      /* 32px */

  /* Typography */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --text-xs: 0.75rem;
  --text-sm: 0.8125rem;
  --text-base: 0.875rem;
  --text-lg: 1rem;
  --text-xl: 1.25rem;

  /* Colors */
  --color-brand-500: #8b5cf6;
  --color-brand-600: #7c3aed;
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
}
```
Reference tokens in Tailwind via `theme.extend.colors` and `theme.extend.spacing`.

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
- **Compound Components**: For complex components (DataTable, Form, etc.), use compound component pattern:
  ```tsx
  <DataTable>
    <DataTable.Header>...</DataTable.Header>
    <DataTable.Body>...</DataTable.Body>
    <DataTable.Footer>...</DataTable.Footer>
  </DataTable>
  ```
  This enables flexible composition without prop drilling.
- **CVA (Class Variance Authority)**: Use for component variants:
  ```tsx
  import { cva, type VariantProps } from 'class-variance-authority';
  const buttonVariants = cva('base-classes', {
    variants: {
      variant: { primary: '...', secondary: '...', danger: '...' },
      size: { sm: '...', md: '...', lg: '...' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  });
  ```

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
- **8px grid**: All spacing should be multiples of 4px (Tailwind default) for visual rhythm

## Accessibility (WCAG AA)
- Every form input needs a label (visible or sr-only)
- `aria-label` on icon-only buttons
- `role="dialog"` and `aria-modal="true"` on modal overlays
- Focus rings on all interactive elements (`focus:ring-2 focus:ring-brand-500`)
- Color contrast: All text meets WCAG AA standards (4.5:1 normal text, 3:1 large text)
- Keyboard navigable: All interactive elements reachable via Tab
- **Focus management**: When modals open, focus moves to first focusable element. When they close, focus returns to trigger.
- **Screen reader**: Use `aria-live="polite"` for dynamic content updates (toast notifications, form validation errors)
- **Reduced motion**: Respect `prefers-reduced-motion` — disable animations for users who request it
- **Error identification**: Form errors must be associated with their fields via `aria-describedby`
- **Skip links**: Add skip-to-content link for keyboard users on page-heavy screens

## Writing in Design
- **Active voice**: Button labels say what happens: "Save changes" not "Submit"
- **Consistent vocabulary**: Button says "Publish", toast says "Published" — same word through the flow
- **Specific > clever**: "5 transactions pending" not "Some work remains"
- **Failure messages**: Explain what went wrong and how to fix it. Never apologize. Never be vague.
- **Empty states**: Invitation to act, not dead ends. "No vouchers yet. Create your first voucher."
- **Sentence case** for all UI text. No title case.

## What NOT to do
- No unnecessary confirmation dialogs (accounting users want speed)
- No decorative animations that slow down interaction
- No native `<select>` elements — always use the custom `Select` component
- No inline action columns in tables — use right-click context menu or click-to-open modals
- No white backgrounds without `dark:` variants
- No generic placeholder text — use real examples from the domain
- No icons without labels (unless globally recognized like search, settings)
- No modals for information that could be inline or a toast
