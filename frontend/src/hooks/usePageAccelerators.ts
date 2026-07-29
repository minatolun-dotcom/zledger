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

function skipWhileEditing(): boolean {
  // Only skip for modals/popups/drawers — NOT for input fields.
  // F-keys and Alt+letter should work even when focus is in a form field.
  if (document.querySelector("[data-master-popup]")) return true;
  if (document.querySelector("[role='listbox']")) return true;
  if (document.querySelector("[data-drawer]")) return true;
  return false;
}

export function usePageAccelerators() {
  const navigate = useNavigate();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // ── F-keys ──
      if (!e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === "F2") {
          e.preventDefault();
          if (skipWhileEditing()) return;
          navigate("/vouchers?action=new");
          return;
        }
        if (e.key === "F3") {
          e.preventDefault();
          if (skipWhileEditing()) return;
          const trigger = document.querySelector<HTMLButtonElement>("button:has(kbd)");
          trigger?.click();
          return;
        }
        if (e.key === "F5") {
          e.preventDefault();
          if (skipWhileEditing()) return;
          navigate(0); // reload current route
          return;
        }
        if (e.key === "F7") {
          e.preventDefault();
          if (skipWhileEditing()) return;
          const toggleBtn = document.querySelector<HTMLButtonElement>(
            '[title*="sidebar"]'
          );
          toggleBtn?.click();
          return;
        }
        if (e.key === "F8") {
          e.preventDefault();
          if (skipWhileEditing()) return;
          // Enable smooth transition
          document.documentElement.classList.add("color-theme-transitioning");
          document.documentElement.classList.toggle("dark");
          localStorage.setItem(
            "theme",
            document.documentElement.classList.contains("dark") ? "dark" : "light"
          );
          // Remove transition class after animation completes
          setTimeout(
            () => document.documentElement.classList.remove("color-theme-transitioning"),
            300
          );
          return;
        }
      }

      // ── Ctrl+key accelerators ──
      if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        if (e.key === "f") {
          // Ctrl+F → focus search on current page
          e.preventDefault();
          if (skipWhileEditing()) return;
          const searchInput = document.querySelector<HTMLInputElement>(
            'input[placeholder*="earch"]'
          );
          searchInput?.focus();
          searchInput?.select();
          return;
        }
        if (e.key === "n") {
          // Ctrl+N → new record on current page
          e.preventDefault();
          if (skipWhileEditing()) return;
          // Try clicking the first "+ New" or "+ Add" button
          const newBtn = document.querySelector<HTMLButtonElement>(
            'button:has(svg), [class*="New"], [class*="new"]'
          );
          if (newBtn) {
            newBtn.click();
          } else {
            // Fallback: navigate with ?action=new param
            const path = window.location.pathname;
            navigate(path + "?action=new");
          }
          return;
        }
      }

      // ── Alt+letter page accelerators ──
      if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;
      if (skipWhileEditing()) return;

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
