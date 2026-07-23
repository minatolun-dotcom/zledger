import { useEffect, useRef } from "react";

/**
 * Keyboard navigation for voucher entry forms.
 *
 * Shortcuts (capture phase — fires before all other handlers):
 *   Ctrl+A / Ctrl+Enter → save voucher (Tally Prime style)
 *   Enter / Tab         → move to next field
 *   Esc                 → reset form (with confirmation)
 *   Alt+L               → focus ledger quick-create
 */

export interface VoucherKeyboardOptions {
  fieldOrder: string[];
  onSave: () => void;
  onReset?: () => void;
  onAltL?: () => void;
  isSubmitting?: boolean;
}

function focusField(name: string) {
  const msBtn = document.querySelector<HTMLElement>(
    `[data-field="${name}"] button`
  );
  if (msBtn) {
    msBtn.click();
    return;
  }
  const el = document.querySelector<HTMLElement>(
    `[data-field="${name}"] input, [data-field="${name}"] textarea, [data-field="${name}"] select`
  );
  if (el) {
    el.focus();
    if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && typeof el.select === "function") {
      el.select();
    }
  }
}

export function useVoucherKeyboard({
  fieldOrder,
  onSave,
  onReset,
  onAltL,
  isSubmitting,
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

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest("[role='dialog']")) return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+A → save voucher (Tally Prime style)
      if (ctrl && e.key === "a") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!isSubmittingRef.current) onSaveRef.current();
        return;
      }

      // Ctrl+Enter → save voucher
      if (ctrl && e.key === "Enter") {
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

      // Enter → next field (skip in textareas, buttons, and when a popup is open)
      if (e.key === "Enter" && !ctrl && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "TEXTAREA" || tag === "BUTTON") return;

        const inMasterSearch = (e.target as HTMLElement).closest(
          "[data-master-popup] input, [data-master-popup] button"
        );
        if (inMasterSearch) {
          advanceField(e);
          return;
        }

        if (document.querySelector("[data-master-popup], [role='listbox']")) return;

        advanceField(e);
      }

      // Tab → next field (same as Enter but doesn't fire in master popups)
      if (e.key === "Tab" && !e.shiftKey && !ctrl && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "TEXTAREA" || tag === "BUTTON") return;
        if ((e.target as HTMLElement).closest("[role='dialog']")) return;
        if (document.querySelector("[data-master-popup], [role='listbox']")) return;

        advanceField(e);
      }
    }

    function advanceField(e: KeyboardEvent) {
      const currentField = (e.target as HTMLElement)
        .closest("[data-field]")
        ?.getAttribute("data-field");
      if (!currentField) return;

      const idx = fieldOrderRef.current.indexOf(currentField);
      if (idx >= 0 && idx < fieldOrderRef.current.length - 1) {
        e.preventDefault();
        const nextField = fieldOrderRef.current[idx + 1];
        setTimeout(() => focusField(nextField), 0);
      }
    }

    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, []);
}

/** Focus the first field in the order */
export function focusFirstField(fieldOrder: string[]) {
  if (fieldOrder.length > 0) {
    setTimeout(() => focusField(fieldOrder[0]), 50);
  }
}
