import { useEffect, useRef } from "react";

let isRegistered = false;
const handlers = new Set<() => void>();

function globalEscapeHandler(e: KeyboardEvent) {
  if (e.key === "Escape" && handlers.size > 0) {
    // Only the most recently registered handler (top modal) fires
    const top = [...handlers].pop();
    if (top) {
      e.stopPropagation();
      top();
    }
  }
}

/**
 * Registers an Escape key listener on `document` while `open` is true.
 * When multiple modals are stacked, only the topmost one closes on Escape.
 */
export default function useEscapeToClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const handler = () => onCloseRef.current();
    handlers.add(handler);

    if (!isRegistered) {
      document.addEventListener("keydown", globalEscapeHandler, { capture: true });
      isRegistered = true;
    }

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0 && isRegistered) {
        document.removeEventListener("keydown", globalEscapeHandler, { capture: true });
        isRegistered = false;
      }
    };
  }, [open]);
}