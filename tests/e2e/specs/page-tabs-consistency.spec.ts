import { test, expect } from "@playwright/test";
import { PAGE_TAB_DEFS } from "../../../frontend/src/config/pageTabs";

/**
 * Registry consistency guard for config/pageTabs.ts.
 *
 * PAGE_TAB_DEFS is the single source of truth for tab bars, the F-key map
 * (usePageAccelerators) and the search palette (modules.ts PAGE_TABS). Those
 * consumers are derived, but the registry itself can still drift from the
 * pages' active-tab state unions — a renamed tab key compiles fine and breaks
 * F-key switching / tab matching at runtime. These golden sets make that fail
 * loudly in CI instead.
 *
 * When you change a page's tab keys/shortcuts, update BOTH the page union and
 * the golden sets below.
 */

const GOLDEN_KEYS: Record<string, string[]> = {
  "/vouchers": ["create", "browse", "daybook"],
  "/fixed-assets": ["register", "categories", "depreciation"],
  "/inventory": ["groups", "items", "entries", "balance", "movement", "aging", "bom"],
  "/manufacturing": ["boms", "production", "batches", "workcenters", "routings", "reports"],
  "/gst": ["einvoice", "eway-bill", "hsn-sac", "registrations", "gstr1", "gstr3b", "gstr2b", "itc-reversal"],
  "/tds-tcs": ["entries", "sections", "returns", "certificates"],
  "/reports": [
    "trial-balance", "profit-and-loss", "balance-sheet", "cash-flow", "aging",
    "outstanding", "register", "tds-tcs", "stock-summary", "stock-movement", "stock-ageing",
  ],
  "/payments": ["receivables", "payables"],
  "/loans": ["given", "taken", "advances", "summary"],
  "/compliance": ["schedule-iii", "indas-pl", "income-tax", "icai-nce", "gst-status", "deferred-tax", "gratuity"],
  "/batches": ["browse", "expiring", "trace", "report"],
  "/company-settings": ["general", "tax", "contact", "numbering", "financial-years", "modules"],
  "/tally-import": ["import", "export", "history"],
  "/bank-reconciliation": ["all", "suggested", "unreconciled", "reconciled"],
  "/profile": ["profile", "security"],
};

const GOLDEN_SHORTCUTS: Record<string, Record<string, string>> = {
  "/vouchers": {}, // F1–F8 are owned by voucher-type switching — never add shortcuts here
  "/fixed-assets": { F1: "register", F2: "categories", F3: "depreciation" },
  "/inventory": { F1: "groups", F2: "items", F3: "entries", F4: "balance", F5: "movement", F6: "aging", F7: "bom" },
  "/manufacturing": { F1: "boms", F2: "production", F3: "batches", F4: "workcenters", F5: "routings", F6: "reports" },
  "/gst": { F1: "einvoice", F2: "eway-bill", F3: "hsn-sac", F4: "registrations", F5: "gstr1", F6: "gstr3b", F7: "gstr2b", F8: "itc-reversal" },
  "/tds-tcs": { F1: "entries", F2: "sections", F3: "returns", F4: "certificates" },
  "/reports": {
    F1: "trial-balance", F2: "profit-and-loss", F3: "balance-sheet", F4: "cash-flow",
    F5: "aging", F6: "outstanding", F7: "register", F8: "tds-tcs",
    F9: "stock-summary", F10: "stock-movement", F11: "stock-ageing",
  },
  "/payments": { F1: "receivables", F2: "payables" },
  "/loans": { F1: "given", F2: "taken", F3: "advances", F4: "summary" },
  "/compliance": {
    F1: "schedule-iii", F2: "indas-pl", F3: "income-tax", F4: "icai-nce",
    F5: "gst-status", F6: "deferred-tax", F7: "gratuity",
  },
  "/batches": { F1: "browse", F2: "expiring", F3: "trace", F4: "report" },
  "/company-settings": { F1: "general", F2: "tax", F3: "contact", F4: "numbering", F5: "financial-years", F6: "modules" },
  "/tally-import": { F1: "import", F2: "export", F3: "history" },
  "/bank-reconciliation": {},
  "/profile": {},
};

/** Routes that read `?tab=` from the URL → get search-palette tab entries. */
const GOLDEN_URL_TAB = [
  "/vouchers", "/fixed-assets", "/inventory", "/manufacturing", "/gst",
  "/tds-tcs", "/reports", "/payments", "/loans", "/compliance", "/company-settings",
];

test.describe("Page tab registry consistency (config/pageTabs.ts)", () => {
  test("registry routes match the golden route set", () => {
    expect(Object.keys(PAGE_TAB_DEFS).sort()).toEqual(Object.keys(GOLDEN_KEYS).sort());
  });

  test("every route's tab keys match its page's tab union (golden sets)", () => {
    for (const [path, golden] of Object.entries(GOLDEN_KEYS)) {
      const tabs = PAGE_TAB_DEFS[path]?.tabs ?? [];
      expect(tabs.map((t) => t.key), path).toEqual(golden);
    }
  });

  test("every route's shortcuts match the golden F-key map exactly", () => {
    for (const [path, golden] of Object.entries(GOLDEN_SHORTCUTS)) {
      const shortcuts = Object.fromEntries(
        (PAGE_TAB_DEFS[path]?.tabs ?? [])
          .filter((t) => t.shortcut)
          .map((t) => [t.shortcut, t.key])
      );
      expect(shortcuts, path).toEqual(golden);
    }
  });

  test("no duplicate keys or shortcuts within any route", () => {
    for (const [path, route] of Object.entries(PAGE_TAB_DEFS)) {
      const keys = new Set(route.tabs.map((t) => t.key));
      expect(keys.size, `${path} duplicate key`).toBe(route.tabs.length);
      const shortcuts = route.tabs.map((t) => t.shortcut).filter(Boolean);
      expect(new Set(shortcuts).size, `${path} duplicate shortcut`).toBe(shortcuts.length);
    }
  });

  test("urlTab routes are exactly the URL-tab-aware set (search palette)", () => {
    const urlTab = Object.entries(PAGE_TAB_DEFS)
      .filter(([, route]) => route.urlTab)
      .map(([path]) => path)
      .sort();
    expect(urlTab).toEqual([...GOLDEN_URL_TAB].sort());
  });

  test("derived search entries (modules.ts PAGE_TABS) only cover urlTab routes", () => {
    // Mirrors the derivation in config/modules.ts
    const derived = Object.fromEntries(
      Object.entries(PAGE_TAB_DEFS).flatMap(([path, route]) => {
        if (!route.urlTab) return [];
        return [[path, route.tabs.map((t) => ({ label: t.label, params: { tab: t.key }, key: t.shortcut }))]];
      })
    );
    expect(Object.keys(derived).sort()).toEqual([...GOLDEN_URL_TAB].sort());
    // Every search entry's params.tab must equal its registry key, and the
    // shortcut hint (key field) must equal the registry shortcut.
    for (const [path, entries] of Object.entries(derived)) {
      const registryTabs = PAGE_TAB_DEFS[path].tabs;
      expect(entries.length).toBe(registryTabs.length);
      registryTabs.forEach((t, i) => {
        expect((entries[i].params as { tab: string }).tab).toBe(t.key);
        expect(entries[i].key).toBe(t.shortcut);
      });
    }
  });
});
