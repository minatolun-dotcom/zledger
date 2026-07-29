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

function triggerNewRecord(navigate: ReturnType<typeof useNavigate>) {
  // Look for a button that explicitly says "+ New", "+ New Record", "New Category", "New Asset" etc.
  // Try text content first (more reliable than class names)
  const buttons = document.querySelectorAll<HTMLButtonElement>("button");
  for (const btn of buttons) {
    const text = btn.textContent?.trim() || "";
    if (/^\+?\s*(New|Add|Create)\b/i.test(text) && text.length < 40) {
      btn.click();
      return;
    }
  }
  // Fallback for known list pages — navigate with ?action=new
  const LIST_PATHS = [
    "/vouchers", "/parties", "/chart-of-accounts", "/inventory",
    "/fixed-assets", "/loans", "/bank-reconciliation", "/gst",
    "/tds-tcs", "/payments", "/recurring-templates", "/users",
    "/companies",
  ];
  const path = window.location.pathname;
  if (LIST_PATHS.some((p) => path.startsWith(p))) {
    navigate(path + "?action=new");
  }
}

export function usePageAccelerators() {
  const navigate = useNavigate();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // ── F-keys ──
      if (!e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === "F1") {
          // F1 → toggle keyboard help
          e.preventDefault();
          if (skipWhileEditing()) return;
          window.dispatchEvent(new CustomEvent("toggle-help"));
          return;
        }
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
        if (e.key === "F4") {
          // F4 → new record on current page
          e.preventDefault();
          if (skipWhileEditing()) return;
          triggerNewRecord(navigate);
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

      // ── Alt+F1–F9 → switch to Nth tab in the active tablist ──
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const match = e.key.match(/^F([1-9])$/);
        if (match) {
          const idx = parseInt(match[1]) - 1;
          e.preventDefault();
          if (skipWhileEditing()) return;
          // Find the first visible tablist and click its Nth button
          const tablist = document.querySelector<HTMLElement>("[role='tablist']");
          const buttons = tablist?.querySelectorAll<HTMLButtonElement>("button");
          if (buttons && idx < buttons.length) {
            buttons[idx].click();
          }
          return;
        }
      }

      // ── Ctrl+key accelerators ──
      if (e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key === "f" && !e.shiftKey) {
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
