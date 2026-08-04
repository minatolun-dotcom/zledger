import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { VOUCHER_TYPE_KEYS } from "../config/shortcuts";

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
  m: "/payments",
  u: "/manufacturing",
  x: "/batches",
  s: "/company-settings",
  j: "/recurring-templates",
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
    "/chart-of-accounts",
    "/parties",
    "/inventory/items",
    "/inventory/groups",
    "/inventory/units",
    "/fixed-assets",
    "/loans",
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
      // ── F-keys: Tally-style voucher type switching (F1-F8) ──
      // Only on the vouchers page; on other pages F-keys keep browser defaults.
      if (!e.altKey && !e.ctrlKey && !e.metaKey) {
        if (window.location.pathname === "/vouchers" || window.location.pathname === "/vouchers/") {
          // F-key → voucher type id, inverted from the canonical map
          const typeMap: Record<string, string> = Object.fromEntries(
            Object.entries(VOUCHER_TYPE_KEYS).map(([type, key]) => [key, type])
          );
          if (e.key in typeMap) {
            e.preventDefault();
            if (!skipWhileEditing()) {
              window.dispatchEvent(new CustomEvent("switch-voucher-type", { detail: { type: typeMap[e.key] } }));
            }
            return;
          }
        }

        // ── F-keys: Tab switching for pages with tabs ──
        // F1-F11 switch tabs on pages with tab navigation
        const path = window.location.pathname;
        const PAGE_TAB_KEYS: Record<string, Record<string, string>> = {
          "/vouchers": { F1: "create", F2: "browse", F3: "daybook" },
          "/fixed-assets": { F1: "register", F2: "categories", F3: "depreciation" },
          "/inventory": { F1: "groups", F2: "items", F3: "entries" },
          "/manufacturing": { F1: "boms", F2: "production", F3: "batches", F4: "workcenters", F5: "routings", F6: "reports" },
          "/gst": { F1: "einvoice", F2: "eway-bill", F3: "hsn-sac", F4: "registrations", F5: "gstr1", F6: "gstr3b", F7: "gstr2b", F8: "itc-reversal" },
          "/tds-tcs": { F1: "entries", F2: "sections", F3: "returns", F4: "certificates" },
          "/reports": { F1: "trial-balance", F2: "profit-and-loss", F3: "balance-sheet", F4: "cash-flow", F5: "aging", F6: "outstanding", F7: "register", F8: "tds-tcs", F9: "stock-summary", F10: "stock-movement", F11: "stock-ageing" },
          "/payments": { F1: "receivables", F2: "payables" },
          "/loans": { F1: "given", F2: "taken", F3: "advances", F4: "summary" },
          "/compliance": { F1: "schedule-iii", F2: "indas-pl", F3: "income-tax", F4: "icai-nce", F5: "gst-status", F6: "deferred-tax", F7: "gratuity" },
          "/batches": { F1: "browse", F2: "expiring", F3: "trace", F4: "report" },
          "/company-settings": { F1: "general", F2: "tax", F3: "contact", F4: "numbering", F5: "financial-years", F6: "modules" },
          "/tally-import": { F1: "import", F2: "export", F3: "history" },
        };

        const tabMap = PAGE_TAB_KEYS[path];
        if (tabMap && e.key in tabMap) {
          e.preventDefault();
          if (!skipWhileEditing()) {
            window.dispatchEvent(new CustomEvent("switch-tab", { detail: { tab: tabMap[e.key] } }));
          }
          return;
        }
       }

      // ── Alt+F1–F8 global actions ──
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (e.key === "F1") {
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
          e.preventDefault();
          if (skipWhileEditing()) return;
          triggerNewRecord(navigate);
          return;
        }
        if (e.key === "F5") {
          e.preventDefault();
          if (skipWhileEditing()) return;
          navigate(0);
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
          document.documentElement.classList.add("color-theme-transitioning");
          document.documentElement.classList.toggle("dark");
          localStorage.setItem(
            "theme",
            document.documentElement.classList.contains("dark") ? "dark" : "light"
          );
          setTimeout(
            () => document.documentElement.classList.remove("color-theme-transitioning"),
            300
          );
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
