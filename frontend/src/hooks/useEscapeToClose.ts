import { useEffect } from "react";

/**
 * Registers an Escape key listener on `document` while `open` is true.
 * Automatically cleans up when `open` becomes false or the callback changes.
 */
export default function useEscapeToClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handler, { capture: true });
    return () => document.removeEventListener("keydown", handler, { capture: true });
  }, [open, onClose]);
}
