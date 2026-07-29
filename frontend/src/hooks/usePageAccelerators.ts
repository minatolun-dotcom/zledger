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
  const tag = (document.activeElement as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
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
