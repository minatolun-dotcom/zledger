import { useEffect, useRef } from "react";

/**
 * Keyboard navigation for voucher entry forms.
 *
 * Shortcuts (capture phase — fires before all other handlers):
 *   Ctrl+A / Ctrl+Enter → save voucher (Tally Prime style)
 *   Enter / Tab         → move to next field
 *   Esc                 → reset form
 *   Alt+L               → focus ledger quick-create
 */

export interface VoucherKeyboardOptions {
  fieldOrder: string[];
  onSave: () => void;
  onReset?: () => void;
  onAltL?: () => void;
  isSubmitting?: boolean;
  /** Restrict handler to events inside this container (for edit modal isolation) */
  scopeRef?: React.RefObject<HTMLElement | null>;
}

function focusField(name: string, clickButton = true) {
  // Prefer input/textarea/select (won't open dropdowns)
  const el = document.querySelector<HTMLElement>(
    `[data-field="${name}"] input, [data-field="${name}"] textarea, [data-field="${name}"] select`
  );
  if (el) {
    el.focus();
    if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && typeof el.select === "function") {
      el.select();
    }
    return;
  }
  // Fallback: MasterSelector button
  const msBtn = document.querySelector<HTMLElement>(
    `[data-field="${name}"] button`
  );
  if (msBtn) {
    if (clickButton) msBtn.click();
    else msBtn.focus();
  }
}

/** Find the data-field name for an element inside a MasterSelector portal */
function findPortalField(target: HTMLElement): string | null {
  const popup = target.closest("[data-master-popup]");
  if (popup) {
    return popup.getAttribute("data-parent-field") || null;
  }
  return null;
}

export function useVoucherKeyboard({
  fieldOrder,
  onSave,
  onReset,
  onAltL,
  isSubmitting,
  scopeRef,
}: VoucherKeyboardOptions) {
  const fieldOrderRef = useRef(fieldOrder);
  fieldOrderRef.current = fieldOrder;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;
  const onAltLRef = useRef(onAltL);
  onAltLRef.current = onAltL;
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;
  const scopeRefRef = useRef(scopeRef);
  scopeRefRef.current = scopeRef;

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;

      // Scope check: if scopeRef is set, only handle events inside it
      const scope = scopeRefRef.current;
      if (scope?.current && !scope.current.contains(target)) return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+A → save voucher (Tally Prime style)
      if (ctrl && e.key === "a") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!isSubmittingRef.current) onSaveRef.current();
        return;
      }

      // Esc → reset
      if (e.key === "Escape" && onResetRef.current) {
        e.preventDefault();
        onResetRef.current();
        return;
      }

      // Alt+L → focus ledger
      if (e.altKey && e.key === "l") {
        e.preventDefault();
        onAltLRef.current?.();
        return;
      }

      // Enter → next field
      if (e.key === "Enter" && !ctrl && !e.altKey) {
        if (target.tagName === "TEXTAREA") return;

        // Inside MasterSelector popup search: let MasterSelector handle selection,
        // then advance to next field WITHOUT opening its dropdown (focus only)
        const portalField = findPortalField(target);
        if (portalField) {
          advanceFromField(portalField, e, false);
          return;
        }

        // If a MasterSelector popup is open but focus is NOT inside it, skip
        if (document.querySelector("[data-master-popup], [role='listbox']")) return;

        advanceFromTarget(target, e, true);
      }

      // Tab → next field (never blocked by button/tag checks)
      if (e.key === "Tab" && !e.shiftKey && !ctrl && !e.altKey) {
        if (target.tagName === "TEXTAREA") return;
        if (target.tagName === "BUTTON") return;

        // Inside MasterSelector popup: skip
        if (findPortalField(target)) return;
        // If a dropdown is open elsewhere, skip
        if (document.querySelector("[data-master-popup], [role='listbox']")) return;

        advanceFromTarget(target, e, true);
      }
    }

    function advanceFromTarget(target: HTMLElement, e: KeyboardEvent, clickButton: boolean) {
      const currentField = target.closest("[data-field]")?.getAttribute("data-field");
      if (!currentField) return;
      advanceFromField(currentField, e, clickButton);
    }

    function advanceFromField(currentField: string, e: KeyboardEvent, clickButton: boolean) {
      const idx = fieldOrderRef.current.indexOf(currentField);
      if (idx >= 0 && idx < fieldOrderRef.current.length - 1) {
        e.preventDefault();
        const nextField = fieldOrderRef.current[idx + 1];
        setTimeout(() => focusField(nextField, clickButton), 0);
      }
    }

    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, []);
}

/** Focus the first field in the order */
export function focusFirstField(fieldOrder: string[]) {
  if (fieldOrder.length > 0) {
    setTimeout(() => focusField(fieldOrder[0], false), 50);
  }
}
