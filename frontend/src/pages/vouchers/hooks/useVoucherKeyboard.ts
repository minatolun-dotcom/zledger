import { useEffect, useCallback, useRef } from "react";

/**
 * Keyboard navigation for voucher entry forms.
 *
 * Shortcuts (when form is focused):
 *   Enter        → move to next field
 *   Ctrl+Enter   → save voucher
 *   Esc          → reset / cancel
 *   Ctrl+A       → add new line (item/ledger tables)
 *   Ctrl+/       → toggle help overlay
 *   Alt+L        → focus ledger quick-create (when on a line)
 */

export interface VoucherKeyboardOptions {
  /** Ordered list of data-field names for tab navigation */
  fieldOrder: string[];
  /** Called on Ctrl+Enter */
  onSave: () => void;
  /** Called on Esc */
  onReset?: () => void;
  /** Called on Ctrl+A */
  onAddLine?: () => void;
  /** Called on Alt+L — focus the ledger selector in the current line */
  onAltL?: () => void;
  /** Whether the form is currently submitting (disables Ctrl+Enter) */
  isSubmitting?: boolean;
}

function focusField(name: string) {
  const el = document.querySelector<HTMLElement>(
    `[data-field="${name}"] input, [data-field="${name}"] textarea, [data-field="${name}"] button, [data-field="${name}"] select, [data-field="${name}"]`
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
  onAddLine,
  onAltL,
  isSubmitting,
}: VoucherKeyboardOptions) {
  const fieldOrderRef = useRef(fieldOrder);
  fieldOrderRef.current = fieldOrder;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore when typing inside a modal / dialog
      if ((e.target as HTMLElement).closest("[role='dialog']")) return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+Enter → save
      if (ctrl && e.key === "Enter") {
        e.preventDefault();
        if (!isSubmitting) onSave();
        return;
      }

      // Ctrl+A → add line
      if (ctrl && e.key === "a" && onAddLine) {
        const tag = (e.target as HTMLElement).tagName;
        // Only intercept if not inside a text input (allow native select-all)
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          onAddLine();
        }
        return;
      }

      // Esc → reset
      if (e.key === "Escape" && onReset) {
        e.preventDefault();
        onReset();
        return;
      }

      // Alt+L → focus ledger
      if (e.altKey && e.key === "l") {
        e.preventDefault();
        onAltL?.();
        return;
      }

      // Enter → next field (only when not inside a textarea or button)
      if (e.key === "Enter" && !ctrl && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "TEXTAREA" || tag === "BUTTON") return;

        e.preventDefault();
        const currentField = (e.target as HTMLElement)
          .closest("[data-field]")
          ?.getAttribute("data-field");
        if (!currentField) return;

        const idx = fieldOrderRef.current.indexOf(currentField);
        if (idx >= 0 && idx < fieldOrderRef.current.length - 1) {
          focusField(fieldOrderRef.current[idx + 1]);
        }
      }
    },
    [onSave, onReset, onAddLine, onAltL, isSubmitting]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

/** Focus the first field in the order (called on template load / form mount) */
export function focusFirstField(fieldOrder: string[]) {
  if (fieldOrder.length > 0) {
    setTimeout(() => focusField(fieldOrder[0]), 50);
  }
}
