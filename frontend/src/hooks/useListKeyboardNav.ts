import { useEffect, useRef, useState } from "react";

/**
 * Canonical list-level keyboard navigation for data tables (Day Book,
 * Voucher List, SortableTable).
 *
 * - ArrowDown / ArrowUp: move the highlighted row
 * - Enter: open the highlighted row
 * - Escape: clear the highlight
 * - Delete / Backspace: run `onDelete` for the highlighted row (optional —
 *   used by SortableTable to trigger the row's danger action)
 *
 * Typing inside inputs/selects/textarea/contentEditable is never hijacked.
 * The hook is document-level (single listener, values read through refs) so it
 * works with virtualized/portal rows and never re-registers on every render —
 * unlike a hand-rolled `keydown` effect that depends on derived state.
 * Callbacks fire outside the state updater, so they run exactly once per key
 * even under StrictMode's double-invoke.
 */
export function useListKeyboardNav<T extends { id: string }>(
  items: T[],
  onOpen: (id: string) => void,
  enabled = true,
  onDelete?: (id: string) => void,
) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const itemsRef = useRef(items);
  const onOpenRef = useRef(onOpen);
  const onDeleteRef = useRef(onDelete);
  const highlightedRef = useRef<string | null>(null);
  itemsRef.current = items;
  onOpenRef.current = onOpen;
  onDeleteRef.current = onDelete;
  highlightedRef.current = highlightedId;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el) {
        const tag = el.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return;
      }
      const list = itemsRef.current;
      if (list.length === 0) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const cur = highlightedRef.current;
        const idx = cur ? list.findIndex((i) => i.id === cur) : -1;
        let next: number;
        if (idx === -1) next = 0;
        else next = e.key === "ArrowDown" ? Math.min(idx + 1, list.length - 1) : Math.max(idx - 1, 0);
        const id = list[next]?.id ?? null;
        highlightedRef.current = id;
        setHighlightedId(id);
      } else if (e.key === "Enter") {
        const cur = highlightedRef.current;
        if (cur) onOpenRef.current(cur);
      } else if (e.key === "Escape") {
        highlightedRef.current = null;
        setHighlightedId(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && onDeleteRef.current) {
        const cur = highlightedRef.current;
        if (cur) {
          e.preventDefault();
          onDeleteRef.current(cur);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [enabled]);

  const clearHighlight = () => {
    highlightedRef.current = null;
    setHighlightedId(null);
  };

  return { highlightedId, setHighlightedId, clearHighlight };
}
