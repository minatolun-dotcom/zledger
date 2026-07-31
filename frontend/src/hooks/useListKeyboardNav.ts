import { useEffect, useRef, useState } from "react";

/**
 * List-level keyboard navigation for voucher tables (Day Book, Voucher List).
 *
 * - ArrowDown / ArrowUp: move the highlighted row
 * - Enter: open the highlighted row
 * - Escape: clear the highlight
 *
 * Typing inside inputs/selects/textarea is never hijacked. The hook is
 * document-level so it works with virtualized/portal rows.
 */
export function useListKeyboardNav<T extends { id: string }>(
  items: T[],
  onOpen: (id: string) => void,
  enabled = true,
) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const itemsRef = useRef(items);
  const onOpenRef = useRef(onOpen);
  itemsRef.current = items;
  onOpenRef.current = onOpen;

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
        setHighlightedId((cur) => {
          const idx = cur ? list.findIndex((i) => i.id === cur) : -1;
          let next: number;
          if (idx === -1) next = 0;
          else next = e.key === "ArrowDown" ? Math.min(idx + 1, list.length - 1) : Math.max(idx - 1, 0);
          return list[next]?.id ?? null;
        });
      } else if (e.key === "Enter") {
        setHighlightedId((cur) => {
          if (cur) onOpenRef.current(cur);
          return cur;
        });
      } else if (e.key === "Escape") {
        setHighlightedId(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [enabled]);

  const clearHighlight = () => setHighlightedId(null);

  return { highlightedId, setHighlightedId, clearHighlight };
}
