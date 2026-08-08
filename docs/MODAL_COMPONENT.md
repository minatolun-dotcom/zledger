# Shared Modal Component (`frontend/src/components/Modal.tsx`)

Every popup/overlay in the app should use the shared `Modal` component. It portals
into `<body>`, renders a blurred backdrop with scale/fade-in animation, and owns the
boilerplate every overlay used to copy-paste: **Escape-to-close (topmost-modal
semantics), backdrop click-to-close, body scroll lock, focus save/restore, and the
dark-theme surface**.

Converting a hand-rolled overlay to `Modal` deletes ~15 lines of duplicated markup
per call site and keeps behavior consistent app-wide (a fix to `Modal` benefits every
popup at once).

## Props

| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| `open` | `boolean` | — | Whether the modal is visible. Callers render `<Modal open={show}>` (or `open` when conditionally mounted). |
| `onClose` | `() => void` | — | Called on Escape, backdrop click (unless disabled), and anything else the caller wires to it. |
| `children` | `ReactNode` | — | Panel content (header/body/footer). The shared Modal adds **no padding** — supply your own via `panelClassName`. |
| `maxWidth` | `string` | `"md"` | Panel width. Named keys: `xs sm md lg xl 2xl 3xl 4xl 5xl 6xl`. Any other string is used verbatim as a Tailwind class (e.g. `max-w-[900px]`). |
| `panelClassName` | `string` | `""` | Extra classes for the panel (padding, layout, rounded corners, overflow). |
| `backdropClassName` | `string` | `""` | Extra classes for the backdrop (e.g. `bg-black/60` to darken). |
| `scrollable` | `boolean` | `false` | Adds `max-h-[90vh] overflow-y-auto` for tall modals. |
| `closeOnBackdrop` | `boolean` | `true` | Set `false` if clicking outside must NOT close (rare). |
| `closeOnEscape` | `boolean` | `true` | Set `false` when a **custom Escape handler already exists** (e.g. a listbox-guarded handler that must close an open `Select` dropdown first). See CompanySelectPage. |
| `onEscape` | `() => void` | `onClose` | Escape handler that differs from `onClose`. |
| `align` | `"center" \| "top"` | `"center"` | `"top"` renders the panel top-anchored at `pt-[15vh]` (command palettes, e.g. Ctrl+K search). |
| `label` | `string` | — | `aria-label` for the dialog (`role="dialog"`). Pass the modal title for a11y. Ignored when `ariaLabelledBy` is set. |
| `ariaLabelledBy` | `string` | — | Sets `aria-labelledby` to the given element id and drops the `aria-label`. Use when the modal renders its own visible heading (e.g. `CompanySelectPage` create form's `<h2>New Company</h2>`). |
| `zIndex` | `number` | `9999` | Explicit z-index for depth-stacked nested modals (master-selector popups use `9999 + depth * 20`). |
| `tabTrap` | `boolean` | `false` | Traps Tab focus inside the panel (form modals). |
| `dataMasterPopup` | `boolean` | `false` | Renders `data-master-popup` on the overlay so global keyboard shortcuts (`usePageAccelerators`, `useVoucherKeyboard`) are suppressed while open. |
| `panelRef` | `Ref<HTMLDivElement>` | — | Forwarded to the panel (e.g. to auto-focus an inner input from an effect). |

## Usage

```tsx
<Modal
  open={show}
  onClose={() => setShow(false)}
  maxWidth="lg"
  panelClassName="p-5"
  scrollable
  label="Edit Ledger"
>
  <h3 className="mb-4 text-base font-semibold">Edit Ledger</h3>
  {/* ...form fields... */}
</Modal>
```

## Converting a hand-rolled overlay

1. Delete the outer `<div className="fixed inset-0 z-[9999] …">` and its inner
   panel `<div className="w-full max-w-… rounded-xl bg-white dark:bg-[#16161f] …">`.
2. Replace with `<Modal open onClose={…} maxWidth="…" panelClassName="…">` wrapping
   the *original panel's children* verbatim. The inner content should not change.
3. Remove the overlay's own Escape handling (`useEscapeToClose`, `keydown` effect)
   unless it does something Modal can't express — then keep it and set
   `closeOnEscape={false}` on Modal.
4. Remove `createPortal` wrappers if present (Modal portals itself).
5. Preserve exact sizes/behavior:
   - `max-w-sm` → `maxWidth="sm"` … `max-w-6xl` → `maxWidth="6xl"`; custom widths pass the class through.
   - `overflow-y-auto` on the panel → `scrollable`.
   - Original padding (`p-4`, `p-5`, `px-6 py-5`…) → `panelClassName`.
   - `z-[99999]` depth stacking → `zIndex` prop.
6. `tsc --noEmit` must stay clean (unused imports from removed hooks will fail with
   `noUnusedLocals` — delete them).

## Intentional non-modal overlays

Not every overlay is a modal. Leave these as-is:
- `AppSidebar` mobile backdrop (`z-30` drawer scrim)
- `Drawer.tsx` (slide-in panel)
- Toast/notification containers (non-blocking)

## Escape semantics (nested modals)

`Modal` uses the shared `useEscapeToClose` hook (capture-phase, topmost-modal
semantics): when several modals are open, Escape closes the **innermost** one only.
Nested-modals pattern:

```tsx
// Parent modal that must NOT eat Escape while a child is open:
<Modal open onClose={close} closeOnEscape={!childOpen}>…</Modal>
{childOpen && <ChildModal open onClose={closeChild} />}
```

## Dark mode

The panel uses the app's custom dark surface (`dark:bg-[#16161f]`,
`dark:border-[#282832]`, `dark:shadow-dark-xl`). Never override with Tailwind's
default slate palette (`dark:bg-slate-800` etc.) — see AGENTS.md dark palette table.
