import { useEffect, useRef } from "react";

/**
 * Keyboard navigation for voucher entry forms.
 *
 *   Ctrl+A / Ctrl+S → save voucher (Tally Prime style)
 *   Ctrl+D          → duplicate voucher
 *   Alt+A           → open create dropdown for the current field
 *   Enter / Tab     → move to next field
 *   Esc             → reset form
 */

export interface VoucherKeyboardOptions {
  fieldOrder: string[];
  onSave: () => void;
  onDuplicate?: () => void;
  onReset?: () => void;
  isSubmitting?: boolean;
  /** Restrict handler to events inside this container (for edit modal isolation) */
  scopeRef?: React.RefObject<HTMLElement | null>;
}

function focusField(name: string, clickButton = true) {
  // First, try to find an element that has data-field directly on it
  let el = document.querySelector<HTMLElement>(
    `input[data-field="${name}"], textarea[data-field="${name}"], select[data-field="${name}"]`
  );
  
  // If not found, try the old pattern: input/textarea/select inside [data-field]
  if (!el) {
    el = document.querySelector<HTMLElement>(
      `[data-field="${name}"] input, [data-field="${name}"] textarea, [data-field="${name}"] select`
    );
  }
  
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
  onDuplicate,
  onReset,
  isSubmitting,
  scopeRef,
}: VoucherKeyboardOptions) {
  const fieldOrderRef = useRef(fieldOrder);
  fieldOrderRef.current = fieldOrder;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;
  const onDuplicateRef = useRef(onDuplicate);
  onDuplicateRef.current = onDuplicate;
  const scopeRefRef = useRef(scopeRef);
  scopeRefRef.current = scopeRef;

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;

      // Scope check: if scopeRef is set, only handle events inside it
      const scope = scopeRefRef.current;
      if (scope?.current && !scope.current.contains(target)) return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+A or Ctrl+S → save voucher (Tally Prime style)
      if ((ctrl && e.key === "a") || (ctrl && e.key === "s")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!isSubmittingRef.current) onSaveRef.current();
        return;
      }

      // Ctrl+D → duplicate voucher
      if (ctrl && e.key === "d") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onDuplicateRef.current?.();
        return;
      }

      // Alt+A → open the current field's create dropdown (Tally Prime style)
      if (e.altKey && !ctrl && e.key.toLowerCase() === "a") {
        e.preventDefault();
        e.stopImmediatePropagation();
        // Popup already open → let MasterSelector handle typing/selection
        if (document.querySelector("[data-master-popup]")) return;
        const fieldName =
          findPortalField(target) ??
          target.closest("[data-field]")?.getAttribute("data-field");
        if (fieldName) focusField(fieldName, true);
        return;
      }

      // Esc → reset (only when no popup/dialog is open — never wipe the form
      // while a master dropdown or modal is on screen; the popup/modal handles
      // its own Escape to close). Otherwise Escape after quick-create would
      // silently clear the voucher the user just filled in.
      if (e.key === "Escape" && onResetRef.current) {
        if (document.querySelector("[data-master-popup]") || document.querySelector("[role='dialog']")) {
          return;
        }
        e.preventDefault();
        onResetRef.current();
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
        if (target.tagName === "BUTTON" && !target.closest("[data-field]")) return;

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
      const order = fieldOrderRef.current;
      const idx = order.indexOf(currentField);
      let nextField: string | null = null;

      if (idx >= 0 && idx < order.length - 1) {
        // In the curated order → next ordered field
        nextField = order[idx + 1];
      } else {
        // Not in the curated order (or on the last ordered field): fall back
        // to DOM order so fields the order omits (voucher no, reference,
        // payment mode, …) still advance predictably instead of native Tab
        // jumping to an arbitrary focusable element.
        const scope = scopeRefRef.current?.current ?? document;
        const domFields = Array.from(scope.querySelectorAll<HTMLElement>("[data-field]"));
        const domIdx = domFields.findIndex(
          (el) => el.getAttribute("data-field") === currentField
        );
        if (domIdx >= 0 && domIdx < domFields.length - 1) {
          nextField = domFields[domIdx + 1].getAttribute("data-field");
        }
      }

      if (nextField) {
        e.preventDefault();
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
