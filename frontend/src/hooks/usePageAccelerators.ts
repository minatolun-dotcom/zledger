import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export const ACCELERATORS: Record<string, string> = {
  d: "/",
  v: "/vouchers",
  c: "/chart-of-accounts",
  p: "/parties",
  r: "/reports",
  g: "/gst",
  t: "/tds-tcs",
  i: "/inventory",
  e: "/tally-import",
  b: "/bank-reconciliation",
  l: "/loans",
  f: "/fixed-assets",
  n: "/compliance",
};

export function usePageAccelerators() {
  const navigate = useNavigate();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Only fire on Alt+letter (no Ctrl, no Shift, no Meta)
      if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // Skip if a modal/popup is open
      if (document.querySelector("[data-master-popup]")) return;
      // Skip if a searchable select dropdown is open
      if (document.querySelector("[role='listbox']")) return;
      // Skip if a drawer is open
      if (document.querySelector("[data-drawer]")) return;

      const path = ACCELERATORS[e.key.toLowerCase()];
      if (path) {
        e.preventDefault();
        e.stopPropagation();
        navigate(path);
      }
    }

    document.addEventListener("keydown", handler, { capture: true });
    return () => document.removeEventListener("keydown", handler, { capture: true });
  }, [navigate]);
}
