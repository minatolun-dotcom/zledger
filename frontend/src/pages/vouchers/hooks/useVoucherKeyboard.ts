import { useEffect, useCallback, useRef } from "react";

/**
 * Keyboard navigation for voucher entry forms.
 *
 * Shortcuts (when form is focused):
 *   Enter        → move to next field (skipped when a dropdown popup is open)
 *   Ctrl+Enter   → save voucher
 *   Esc          → reset form (with confirmation if fields are filled)
 *   Ctrl+A       → add new line
 *   Alt+L        → focus ledger quick-create (when on a line)
 */

export interface VoucherKeyboardOptions {
  fieldOrder: string[];
  onSave: () => void;
  onReset?: () => void;
  onAddLine?: () => void;
  onAltL?: () => void;
  isSubmitting?: boolean;
}

/** Check if any MasterSelector / Select dropdown popup is currently open */
function isDropdownOpen(): boolean {
  return document.querySelector("[data-master-popup], [role='listbox']") !== null;
}

function focusField(name: string) {
  // For MasterSelector fields, click the trigger button to open the dropdown
  const msBtn = document.querySelector<HTMLElement>(
    `[data-field="${name}"] button`
  );
  if (msBtn) {
    msBtn.click();
    return;
  }
  // For regular inputs / textareas
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

      // Ctrl+A → save voucher (Tally Prime style)
      if (ctrl && e.key === "a") {
        e.preventDefault();
        if (!isSubmitting) onSave();
        return;
      }

      // Esc → reset (with confirmation if form has data)
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

      // Enter → next field
      if (e.key === "Enter" && !ctrl && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "TEXTAREA" || tag === "BUTTON") return;

        // If Enter is pressed inside a MasterSelector search input, the
        // MasterSelector will handle it (select option, close popup). We
        // advance to the next field after the popup closes (async).
        const inMasterSearch = (e.target as HTMLElement).closest("[data-master-popup] input, [data-master-popup] button");
        if (inMasterSearch) {
          const currentField = (e.target as HTMLElement)
            .closest("[data-field]")
            ?.getAttribute("data-field");
          if (!currentField) return;
          const idx = fieldOrderRef.current.indexOf(currentField);
          if (idx >= 0 && idx < fieldOrderRef.current.length - 1) {
            setTimeout(() => focusField(fieldOrderRef.current[idx + 1]), 50);
          }
          return;
        }

        // If a dropdown popup is open (but Enter wasn't in the search input),
        // let the popup handle it — don't advance.
        if (isDropdownOpen()) return;

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
