import { useCallback, useEffect, useRef, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import useEscapeToClose from "../hooks/useEscapeToClose";

/* Tailwind max-width classes for the panel — keeps call sites declarative. */
const WIDTHS: Record<string, string> = {
  xs: "max-w-xs",
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Panel width — defaults to `md`. Pass a raw Tailwind class to override. */
  maxWidth?: string;
  /** Extra classes for the panel (padding, layout). Default panel has no padding. */
  panelClassName?: string;
  /** Extra classes for the backdrop. */
  backdropClassName?: string;
  /** Adds max-h + scroll for tall modals. */
  scrollable?: boolean;
  /** Close when the backdrop is clicked (default true). */
  closeOnBackdrop?: boolean;
  /** Close on Escape (default true). Disable when a custom Escape handler
   *  (e.g. one that guards against open listboxes) is already registered. */
  closeOnEscape?: boolean;
  /** Escape handler that differs from onClose (default: calls onClose). */
  onEscape?: () => void;
  /** Vertical alignment: `center` (default) or `top`-anchored command palette. */
  align?: "center" | "top";
  /** aria-label for the dialog (e.g. the modal title). */
  label?: string;
  /** id of the element that names this dialog — set `aria-labelledby` instead
   *  of a static `aria-label` (takes precedence; used when the modal renders
   *  its own visible heading). */
  ariaLabelledBy?: string;
  /** Explicit z-index (default 9999). Used by nested/depth-stacked modals
   *  (e.g. master-selector create/edit popups) that must layer above parents. */
  zIndex?: number;
  /** Trap Tab focus inside the panel (for form modals). */
  tabTrap?: boolean;
  /** Marks the overlay with `data-master-popup` so global keyboard shortcuts
   *  (page accelerators, voucher hotkeys) are suppressed while it's open. */
  dataMasterPopup?: boolean;
  /** Forwarded to the panel element (e.g. to auto-focus an inner input). */
  panelRef?: Ref<HTMLDivElement>;
}

/**
 * Shared modal: portal into <body>, blurred backdrop, scale/fade-in animation,
 * Escape-to-close (topmost-modal semantics via useEscapeToClose), body scroll
 * lock, and focus save/restore. Children supply their own header/body/footer —
 * content stays identical to the hand-rolled modals it replaces.
 */
export default function Modal({
  open,
  onClose,
  children,
  maxWidth = "md",
  panelClassName = "",
  backdropClassName = "",
  scrollable = false,
  closeOnBackdrop = true,
  closeOnEscape = true,
  onEscape,
  align = "center",
  label,
  ariaLabelledBy,
  zIndex,
  tabTrap = false,
  dataMasterPopup = false,
  panelRef,
}: ModalProps) {
  const internalPanelRef = useRef<HTMLDivElement | null>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  // Merge the internal panel ref (focus/trap) with the caller's forwarded ref.
  // useCallback so React doesn't detach/reattach the ref on every render.
  const setPanelRef = useCallback(
    (node: HTMLDivElement | null) => {
      internalPanelRef.current = node;
      if (typeof panelRef === "function") {
        panelRef(node);
      } else if (panelRef) {
        (panelRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [panelRef]
  );

  // Escape closes (only the topmost open modal fires).
  useEscapeToClose(open && closeOnEscape, onEscape ?? onClose);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Save focus on open, restore on close.
  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const panel = internalPanelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      // Move focus into the dialog (but not to the first focusable, which
      // would skip it visually — focus the panel itself with tabIndex -1).
      panel.focus();
    }
    return () => { prevFocus.current?.focus?.(); };
  }, [open]);

  // Optional Tab focus trap (for form modals). Reads the ref inside the
  // handler (per AGENTS.md: document-level handlers need refs, not captured
  // values) so the trap stays correct even if the panel re-attaches.
  useEffect(() => {
    if (!open || !tabTrap) return;

    const focusableSelector =
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

    // Arrow const (not a hoisted function declaration) so TS keeps the
    // `internalPanelRef.current` null-narrowing inside the handler.
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const panel = internalPanelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(focusableSelector);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [open, tabTrap]);

  if (!open) return null;

  const widthClass = WIDTHS[maxWidth] ?? maxWidth;

  return createPortal(
    <div
      className={`fixed inset-0 flex justify-center ${
        align === "top" ? "items-start pt-[15vh]" : "items-center p-4 sm:p-6"
      } ${zIndex === undefined ? "z-[9999]" : ""}`}
      style={zIndex !== undefined ? { zIndex } : undefined}
      {...(dataMasterPopup ? { "data-master-popup": "" } : {})}
      onMouseDown={() => closeOnBackdrop && onClose()}
    >
      <div
        className={`absolute inset-0 animate-backdropIn bg-black/40 backdrop-blur-sm ${backdropClassName}`}
      />
      <div
        ref={setPanelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabelledBy ? undefined : label}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={`relative w-full ${widthClass} animate-modalIn rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-[#282832] dark:bg-[#16161f] dark:shadow-dark-xl ${
          scrollable ? "max-h-[90vh] overflow-y-auto" : ""
        } ${panelClassName}`}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
