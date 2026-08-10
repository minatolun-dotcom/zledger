/* ── Single source of truth for page tabs ──────────────────────────────
 * One registry drives three things so they can never drift:
 *   1. the <Tabs> bars / tab strips rendered on each page (label + shortcut chip)
 *   2. the F-key → tab map in usePageAccelerators (derived from `shortcut`)
 *   3. the search-palette "page / tab" entries (PAGE_TABS in config/modules.ts,
 *      derived from routes with `urlTab: true`)
 *
 * Adding/renaming a tab should ONLY touch this file.
 * `key` must match the page's active-tab state value exactly.
 * `urlTab: true` means the page reads `?tab=` from the URL (so search entries
 * that navigate with it actually switch the tab). Only mark routes that do.
 *
 * NOTE on /vouchers: F1–F8 are owned by voucher-type switching (checked first
 * in usePageAccelerators), so the workspace tabs carry no shortcuts — declaring
 * them would render misleading kbd chips. The tabs still drive the workspace
 * tab bar and the search entries (via `urlTab`).
 */

export interface PageTabDef<K extends string = string> {
  /** Tab key — matches the page's active-tab state value. */
  key: K;
  /** Label shown on the tab bar. */
  label: string;
  /** F-key shortcut chip, e.g. "F1". Omit for tabs without a shortcut. */
  shortcut?: string;
}

export interface PageTabRoute {
  /** Page reads `?tab=` from the URL → route gets search-palette tab entries. */
  urlTab?: boolean;
  tabs: PageTabDef[];
}

export const PAGE_TAB_DEFS: Record<string, PageTabRoute> = {
  "/vouchers": {
    urlTab: true,
    tabs: [
      { key: "create", label: "Create" },
      { key: "browse", label: "Browse" },
      { key: "daybook", label: "Daybook" },
    ],
  },
  "/fixed-assets": {
    urlTab: true,
    tabs: [
      { key: "register", label: "Asset Register", shortcut: "F1" },
      { key: "categories", label: "Categories", shortcut: "F2" },
      { key: "depreciation", label: "Depreciation", shortcut: "F3" },
    ],
  },
  "/inventory": {
    urlTab: true,
    tabs: [
      { key: "groups", label: "Stock Groups", shortcut: "F1" },
      { key: "items", label: "Stock Items", shortcut: "F2" },
      { key: "entries", label: "Stock Entries", shortcut: "F3" },
      { key: "balance", label: "Stock Balance", shortcut: "F4" },
      { key: "movement", label: "Stock Movement", shortcut: "F5" },
      { key: "aging", label: "Stock Aging", shortcut: "F6" },
      { key: "bom", label: "Bill of Materials", shortcut: "F7" },
    ],
  },
  "/manufacturing": {
    urlTab: true,
    tabs: [
      { key: "boms", label: "BOMs", shortcut: "F1" },
      { key: "production", label: "Orders", shortcut: "F2" },
      { key: "batches", label: "Batches", shortcut: "F3" },
      { key: "workcenters", label: "Work Centers", shortcut: "F4" },
      { key: "routings", label: "Routings", shortcut: "F5" },
      { key: "reports", label: "Reports", shortcut: "F6" },
    ],
  },
  "/gst": {
    urlTab: true,
    tabs: [
      { key: "einvoice", label: "E-Invoice", shortcut: "F1" },
      { key: "eway-bill", label: "E-Way Bill", shortcut: "F2" },
      { key: "hsn-sac", label: "HSN / SAC", shortcut: "F3" },
      { key: "registrations", label: "Registrations", shortcut: "F4" },
      { key: "gstr1", label: "GSTR-1", shortcut: "F5" },
      { key: "gstr3b", label: "GSTR-3B", shortcut: "F6" },
      { key: "gstr2b", label: "GSTR-2B", shortcut: "F7" },
      { key: "itc-reversal", label: "ITC Rev.", shortcut: "F8" },
    ],
  },
  "/tds-tcs": {
    urlTab: true,
    tabs: [
      { key: "entries", label: "Entries", shortcut: "F1" },
      { key: "sections", label: "Sections", shortcut: "F2" },
      { key: "returns", label: "Returns", shortcut: "F3" },
      { key: "certificates", label: "Certificates", shortcut: "F4" },
    ],
  },
  "/reports": {
    urlTab: true,
    tabs: [
      { key: "trial-balance", label: "Trial Balance", shortcut: "F1" },
      { key: "profit-and-loss", label: "Profit & Loss", shortcut: "F2" },
      { key: "balance-sheet", label: "Balance Sheet", shortcut: "F3" },
      { key: "cash-flow", label: "Cash Flow", shortcut: "F4" },
      { key: "aging", label: "Aging", shortcut: "F5" },
      { key: "outstanding", label: "Outstanding", shortcut: "F6" },
      { key: "register", label: "Register", shortcut: "F7" },
      { key: "tds-tcs", label: "TDS/TCS", shortcut: "F8" },
      { key: "stock-summary", label: "Stock Summary", shortcut: "F9" },
      { key: "stock-movement", label: "Stock Movement", shortcut: "F10" },
      { key: "stock-ageing", label: "Stock Ageing", shortcut: "F11" },
    ],
  },
  "/payments": {
    urlTab: true,
    tabs: [
      { key: "receivables", label: "Receivables (Customers owe us)", shortcut: "F1" },
      { key: "payables", label: "Payables (We owe suppliers)", shortcut: "F2" },
    ],
  },
  "/loans": {
    urlTab: true,
    tabs: [
      { key: "given", label: "Loans Given", shortcut: "F1" },
      { key: "taken", label: "Loans Taken", shortcut: "F2" },
      { key: "advances", label: "Employee Advances", shortcut: "F3" },
      { key: "summary", label: "Summary", shortcut: "F4" },
    ],
  },
  "/compliance": {
    urlTab: true,
    tabs: [
      { key: "schedule-iii", label: "Schedule III BS", shortcut: "F1" },
      { key: "indas-pl", label: "Ind-AS P&L", shortcut: "F2" },
      { key: "income-tax", label: "Income Tax", shortcut: "F3" },
      { key: "icai-nce", label: "ICAI NCE", shortcut: "F4" },
      { key: "gst-status", label: "GST Status", shortcut: "F5" },
      { key: "deferred-tax", label: "Deferred Tax", shortcut: "F6" },
      { key: "gratuity", label: "Gratuity", shortcut: "F7" },
    ],
  },
  "/company-settings": {
    urlTab: true,
    tabs: [
      { key: "general", label: "General", shortcut: "F1" },
      { key: "tax", label: "Tax", shortcut: "F2" },
      { key: "contact", label: "Contact & Bank", shortcut: "F3" },
      { key: "numbering", label: "Voucher Numbering", shortcut: "F4" },
      { key: "financial-years", label: "Financial Years", shortcut: "F5" },
      { key: "modules", label: "Modules", shortcut: "F6" },
    ],
  },
  /* Routes below keep F-keys + registry-driven tab bars but do NOT read
   * `?tab=` from the URL, so they get no search-palette tab entries. */
  "/batches": {
    tabs: [
      { key: "browse", label: "Browse", shortcut: "F1" },
      { key: "expiring", label: "Expiry Alerts", shortcut: "F2" },
      { key: "trace", label: "Batch Trace", shortcut: "F3" },
      { key: "report", label: "Report", shortcut: "F4" },
    ],
  },
  "/tally-import": {
    tabs: [
      { key: "import", label: "Import", shortcut: "F1" },
      { key: "export", label: "Export", shortcut: "F2" },
      { key: "history", label: "History", shortcut: "F3" },
    ],
  },
  "/bank-reconciliation": {
    tabs: [
      { key: "all", label: "All" },
      { key: "suggested", label: "Suggested" },
      { key: "unreconciled", label: "Unreconciled" },
      { key: "reconciled", label: "Reconciled" },
    ],
  },
  "/profile": {
    tabs: [
      { key: "profile", label: "Profile" },
      { key: "security", label: "Security" },
    ],
  },
};

// Sanity check: no duplicate keys or shortcuts within a route (a duplicate
// would silently break F-key switching / tab matching — warn loudly).
for (const [path, route] of Object.entries(PAGE_TAB_DEFS)) {
  const keys = new Set<string>();
  const shortcuts = new Set<string>();
  for (const t of route.tabs) {
    if (keys.has(t.key)) console.warn(`[pageTabs] duplicate tab key "${t.key}" in ${path}`);
    keys.add(t.key);
    if (t.shortcut) {
      if (shortcuts.has(t.shortcut)) console.warn(`[pageTabs] duplicate shortcut "${t.shortcut}" in ${path}`);
      shortcuts.add(t.shortcut);
    }
  }
}
