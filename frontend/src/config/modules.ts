/* ── Shared module definitions, nav groups, and search commands ────────── */
import { useAuthStore } from "../store/auth";

/* ── Module metadata ─────────────────────────────────────────────────── */
export interface ModuleDef {
  id: string;
  label: string;
  description: string;
  icon: string;
}

export const MODULES: ModuleDef[] = [
  { id: "core", label: "Core Accounting", description: "Chart of Accounts, Vouchers, Day Book", icon: "book-open" },
  { id: "reports", label: "Reports", description: "Financial reports, Day Book, Payments", icon: "chart-bar" },
  { id: "fixed_assets", label: "Fixed Assets", description: "Asset categories, register, depreciation", icon: "assets" },
  { id: "inventory", label: "Inventory", description: "Stock groups, items, entries, balance", icon: "package" },
  { id: "manufacturing", label: "Manufacturing", description: "BOMs, Production Orders", icon: "wrench-screwdriver" },
  { id: "batches", label: "Batch Tracking", description: "Batch trace, batch browse", icon: "layers" },
  { id: "gst", label: "GST", description: "GST returns, E-Invoice, E-Way Bill, HSN/SAC", icon: "shield-check" },
  { id: "tds_tcs", label: "TDS / TCS", description: "TDS/TCS sections, entries, returns", icon: "tax" },
  { id: "bank_reconciliation", label: "Bank Reconciliation", description: "Statement import, reconciliation", icon: "scale" },
  { id: "payments", label: "Payments", description: "Payment allocation, receivables", icon: "currency" },
  { id: "import_export", label: "Data Import / Export", description: "Move your accounting data between ZLedger, Tally, CSV and Excel", icon: "upload" },
  { id: "loans", label: "Loans & Advances", description: "Loan tracking, payments, interest calc", icon: "currency" },
  { id: "compliance", label: "Compliance", description: "Ind-AS / Schedule III, Income Tax, ICAI NCE", icon: "shield-check" },
];

/** Modules that are always enabled and cannot be disabled. */
export const ALWAYS_ON = ["core", "reports"];

/* ── Company types ─────────────────────────────────────────────────────── */
export interface CompanyTypeDef {
  id: string;
  label: string;
  description: string;
  defaultModules: string[];
}

export const COMPANY_TYPES: CompanyTypeDef[] = [
  {
    id: "general",
    label: "General Business",
    description: "Receipt, Payment, Income, Expenditure, Contra, Journal, Advances, Fixed Assets",
    defaultModules: ["core", "reports", "fixed_assets", "gst", "payments", "loans", "import_export"],
  },
  {
    id: "ngo",
    label: "NGO / Non-Profit",
    description: "Receipt, Payment, Income, Expenditure, Contra, Journal, Advances",
    defaultModules: ["core", "reports", "payments"],
  },
  {
    id: "shop",
    label: "Shop / Retail",
    description: "Receipt, Payment, Purchase, Sales, Income, Expenditure, Contra, Journal, Advances, Assets",
    defaultModules: ["core", "reports", "inventory", "gst", "payments", "fixed_assets", "import_export"],
  },
  {
    id: "finance",
    label: "Investment / Credit Society / Bank",
    description: "Receipt, Payment, Income, Expenditure, Contra, Journal, Advances, Loans",
    defaultModules: ["core", "reports", "payments", "bank_reconciliation", "loans", "import_export"],
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    description: "Receipt, Payment, Income, Expenditure, Contra, Journal, Advances, Production",
    defaultModules: ["core", "reports", "inventory", "manufacturing", "batches", "gst", "import_export"],
  },
  {
    id: "services",
    label: "Services / Professional",
    description: "Receipt, Payment, Income, Expenditure, Contra, Journal, GST, TDS/TCS",
    defaultModules: ["core", "reports", "gst", "tds_tcs", "payments", "import_export"],
  },
];

/* ── Navigation groups ───────────────────────────────────────────────── */
export interface NavItem { to: string; label: string; icon: string; end?: boolean; module?: string; }
export interface SubGroup { type: "subgroup"; label: string; icon: string; key: string; items: NavItem[]; }
export interface NavGroup {
  label: string; key: string; icon: string;
  /** Module ID that gates this group. null = always visible. */
  module: string | null;
  items: (NavItem | SubGroup)[];
}

export const NAV_GROUPS: NavGroup[] = [
  { label: "Accounting", key: "accounting", icon: "book-open", module: null, items: [
    { to: "/chart-of-accounts", label: "Chart of Accounts", icon: "sitemap" },
    { to: "/parties", label: "Parties", icon: "user" },
    { to: "/vouchers", label: "Vouchers", icon: "receipt" },
    { to: "/payments", label: "Payments & Receivables", icon: "currency", module: "payments" },
    { to: "/fixed-assets", label: "Fixed Assets", icon: "assets", module: "fixed_assets" },
    { to: "/bank-reconciliation", label: "Reconciliation", icon: "scale", module: "bank_reconciliation" },
    { to: "/loans", label: "Loans & Advances", icon: "currency", module: "loans" },
  ]},
  { label: "Inventory", key: "inventory", icon: "package", module: "inventory", items: [
    { to: "/inventory", label: "Stock & Inventory", icon: "package" },
    { to: "/manufacturing", label: "Manufacturing", icon: "wrench-screwdriver", module: "manufacturing" },
    { to: "/batches", label: "Batches", icon: "layers", module: "batches" },
  ]},
  { label: "Tax & Compliance", key: "tax-compliance", icon: "shield-check", module: null, items: [
    { to: "/gst", label: "GST", icon: "gst", module: "gst" },
    { to: "/tds-tcs", label: "TDS / TCS", icon: "tax", module: "tds_tcs" },
    { to: "/compliance", label: "Statutory Compliance", icon: "shield-check", module: "compliance" },
  ]},
  { label: "Reports", key: "reports", icon: "chart-bar", module: null, items: [
    { to: "/reports", label: "Financial Reports", icon: "chart" },
  ]},
  { label: "Settings", key: "company", icon: "building", module: null, items: [
    { to: "/company-settings", label: "Company Settings", icon: "settings" },
    { to: "/recurring-templates", label: "Recurring Templates", icon: "receipt" },
    { to: "/tally-import", label: "Data Import / Export", icon: "upload", module: "import_export" },
  ]},
];

/* ── Search commands ─────────────────────────────────────────────────── */
export interface SearchCommand {
  id: string;
  label: string;
  category: string;
  icon: string;
  to: string;
  params?: Record<string, string>;
  /** Module ID that gates this command. null = always visible. */
  module: string | null;
  /** Permission required to run this command. null = no permission gate. */
  permission?: string | null;
}

export const SEARCH_COMMANDS: SearchCommand[] = [
  // Create commands
  { id: "create-group", label: "Create Account Group", category: "Create", icon: "sitemap", to: "/chart-of-accounts", params: { action: "create-group" }, module: null, permission: "manage_coa" },
  { id: "create-subgroup", label: "Create Subgroup", category: "Create", icon: "sitemap", to: "/chart-of-accounts", params: { action: "create-subgroup" }, module: null, permission: "manage_coa" },
  { id: "create-ledger", label: "Create Ledger", category: "Create", icon: "sitemap", to: "/chart-of-accounts", params: { action: "create-ledger" }, module: null, permission: "manage_coa" },
  { id: "create-party", label: "Create Party", category: "Create", icon: "user", to: "/parties", params: { action: "new" }, module: null, permission: "manage_parties" },
  { id: "new-recurring", label: "New Recurring Template", category: "Create", icon: "receipt", to: "/recurring-templates", params: { action: "new" }, module: null, permission: "manage_recurring" },
  { id: "new-stock-group", label: "New Stock Group", category: "Create", icon: "package", to: "/inventory", params: { tab: "groups", action: "new" }, module: "inventory", permission: "manage_inventory" },
  { id: "new-stock-item", label: "New Stock Item", category: "Create", icon: "package", to: "/inventory", params: { tab: "items", action: "new" }, module: "inventory", permission: "manage_inventory" },
  { id: "new-stock-entry", label: "New Stock Entry", category: "Create", icon: "package", to: "/inventory", params: { tab: "entries", action: "new" }, module: "inventory", permission: "manage_inventory" },
  { id: "new-bom", label: "New BOM", category: "Create", icon: "wrench-screwdriver", to: "/manufacturing", params: { tab: "boms", action: "new" }, module: "manufacturing", permission: "manage_manufacturing" },
  { id: "new-production-order", label: "New Production Order", category: "Create", icon: "wrench-screwdriver", to: "/manufacturing", params: { tab: "production", action: "new" }, module: "manufacturing", permission: "manage_manufacturing" },
  { id: "new-tds-entry", label: "New TDS/TCS Entry", category: "Create", icon: "tax", to: "/tds-tcs", params: { action: "new-entry" }, module: "tds_tcs", permission: "manage_tds_tcs" },
  { id: "new-tds-section", label: "New TDS/TCS Section", category: "Create", icon: "tax", to: "/tds-tcs", params: { action: "new-section" }, module: "tds_tcs", permission: "manage_tds_tcs" },
  { id: "new-fy", label: "New Financial Year", category: "Create", icon: "calendar", to: "/company-settings", params: { action: "new-fy" }, module: null, permission: "manage_financial_years" },
  { id: "add-member", label: "Add Member", category: "Create", icon: "user", to: "/members", params: { action: "add" }, module: null, permission: "manage_members" },
  { id: "new-asset-category", label: "New Asset Category", category: "Create", icon: "assets", to: "/fixed-assets", params: { tab: "categories", action: "new" }, module: "fixed_assets", permission: "manage_assets" },
  { id: "new-asset", label: "New Fixed Asset", category: "Create", icon: "assets", to: "/fixed-assets", params: { tab: "register", action: "new" }, module: "fixed_assets", permission: "manage_assets" },
  { id: "new-loan", label: "New Loan / Advance", category: "Create", icon: "currency", to: "/loans", params: { action: "new" }, module: "loans", permission: "manage_loans" },
  
  // Reports & Export
  { id: "export-daybook", label: "Export Day Book", category: "Export", icon: "download", to: "/vouchers", params: { tab: "daybook", action: "export" }, module: null, permission: null },
  { id: "export-trial-balance", label: "Export Trial Balance", category: "Export", icon: "download", to: "/reports", params: { report: "trial-balance", action: "export" }, module: null, permission: null },
  { id: "export-pl", label: "Export P&L Statement", category: "Export", icon: "download", to: "/reports", params: { report: "pl", action: "export" }, module: null, permission: null },
  { id: "export-balance-sheet", label: "Export Balance Sheet", category: "Export", icon: "download", to: "/reports", params: { report: "balance-sheet", action: "export" }, module: null, permission: null },
  { id: "export-coa", label: "Export Chart of Accounts", category: "Export", icon: "download", to: "/chart-of-accounts", params: { action: "export" }, module: null, permission: null },
  { id: "export-parties", label: "Export Parties", category: "Export", icon: "download", to: "/parties", params: { action: "export" }, module: null, permission: null },
  { id: "export-inventory", label: "Export Stock Summary", category: "Export", icon: "download", to: "/inventory", params: { tab: "balance", action: "export" }, module: "inventory", permission: null },
  
  // Quick Actions
  { id: "refresh-page", label: "Refresh Current Page", category: "Utilities", icon: "refresh", to: "refresh", params: {}, module: null, permission: null },
  { id: "toggle-dark", label: "Toggle Dark Mode", category: "Utilities", icon: "moon", to: "toggle-theme", params: {}, module: null, permission: null },
  { id: "keyboard-help", label: "Keyboard Shortcuts Help", category: "Utilities", icon: "keyboard", to: "show-shortcuts", params: {}, module: null, permission: null },
  { id: "toggle-sidebar", label: "Toggle Sidebar", category: "Utilities", icon: "sidebar", to: "toggle-sidebar", params: {}, module: null, permission: null },
];

/* ── Hook: get enabled modules for the active company ────────────────── */
export function useModules(): string[] {
  const companies = useAuthStore((s) => s.companies);
  const activeCompanyId = useAuthStore((s) => s.activeCompanyId);
  const active = companies.find((c) => c.id === activeCompanyId);
  return active?.modules ?? [];
}

/** Check if a single module is enabled. */
export function useHasModule(moduleId: string): boolean {
  const modules = useModules();
  return modules.includes(moduleId);
}

/* ── Per-page tab registry for unified search ────────────────────────── */
// Each entry declares a list of in-page tabs. The search palette uses this
// to surface "page / tab" entries that navigate directly to the tab.
// `params` are merged into the query string when the search item is chosen.
export interface PageTab {
  label: string;
  params?: Record<string, string>;
  /** F-key shortcut for this tab (e.g. "F1", "F2"). */
  key?: string;
}
export const PAGE_TABS: Record<string, PageTab[]> = {
  "/vouchers": [
    { label: "Create", params: { tab: "create" }, key: "F1" },
    { label: "Browse", params: { tab: "browse" }, key: "F2" },
    { label: "Daybook", params: { tab: "daybook" }, key: "F3" },
  ],
  "/fixed-assets": [
    { label: "Asset Register", params: { tab: "register" }, key: "F1" },
    { label: "Categories", params: { tab: "categories" }, key: "F2" },
    { label: "Depreciation", params: { tab: "depreciation" }, key: "F3" },
  ],
  "/inventory": [
    { label: "Stock Groups", params: { tab: "groups" }, key: "F1" },
    { label: "Stock Items", params: { tab: "items" }, key: "F2" },
    { label: "Stock Entries", params: { tab: "entries" }, key: "F3" },
  ],
  "/manufacturing": [
    { label: "BOMs", params: { tab: "boms" }, key: "F1" },
    { label: "Production Orders", params: { tab: "production" }, key: "F2" },
    { label: "Batches", params: { tab: "batches" }, key: "F3" },
    { label: "Work Centers", params: { tab: "workcenters" }, key: "F4" },
    { label: "Routings", params: { tab: "routings" }, key: "F5" },
    { label: "Reports", params: { tab: "reports" }, key: "F6" },
  ],
  "/gst": [
    { label: "E-Invoice", params: { tab: "einvoice" }, key: "F1" },
    { label: "E-Way Bill", params: { tab: "eway-bill" }, key: "F2" },
    { label: "HSN / SAC", params: { tab: "hsn-sac" }, key: "F3" },
    { label: "Registrations", params: { tab: "registrations" }, key: "F4" },
  ],
  "/tds-tcs": [
    { label: "Entries", params: { tab: "entries" }, key: "F1" },
    { label: "Sections", params: { tab: "sections" }, key: "F2" },
    { label: "Returns", params: { tab: "returns" }, key: "F3" },
  ],
  "/reports": [
    { label: "Trial Balance", params: { tab: "trial-balance" }, key: "F1" },
    { label: "Profit & Loss", params: { tab: "profit-and-loss" }, key: "F2" },
    { label: "Balance Sheet", params: { tab: "balance-sheet" }, key: "F3" },
    { label: "Cash Flow", params: { tab: "cash-flow" }, key: "F4" },
    { label: "Aging", params: { tab: "aging" }, key: "F5" },
    { label: "Outstanding", params: { tab: "outstanding" }, key: "F6" },
    { label: "Register", params: { tab: "register" }, key: "F7" },
    { label: "TDS/TCS", params: { tab: "tds-tcs" }, key: "F8" },
    { label: "Stock Summary", params: { tab: "stock-summary" }, key: "F9" },
    { label: "Stock Movement", params: { tab: "stock-movement" }, key: "F10" },
    { label: "Stock Ageing", params: { tab: "stock-ageing" }, key: "F11" },
  ],
  "/payments": [
    { label: "Receivables", params: { tab: "receivables" }, key: "F1" },
    { label: "Payables", params: { tab: "payables" }, key: "F2" },
  ],
  "/loans": [
    { label: "Loans Given", params: { tab: "given" }, key: "F1" },
    { label: "Loans Taken", params: { tab: "taken" }, key: "F2" },
    { label: "Employee Advances", params: { tab: "advances" }, key: "F3" },
    { label: "Summary", params: { tab: "summary" }, key: "F4" },
  ],
  "/compliance": [
    { label: "Schedule III", params: { tab: "schedule-iii" }, key: "F1" },
    { label: "Ind-AS P&L", params: { tab: "indas-pl" }, key: "F2" },
    { label: "Income Tax", params: { tab: "income-tax" }, key: "F3" },
    { label: "ICAI NCE", params: { tab: "icai-nce" }, key: "F4" },
    { label: "GST Compliance Status", params: { tab: "gst-status" }, key: "F5" },
  ],
};

/* ── Voucher type registry for unified search ────────────────────────── */
// Each creates a voucher of the given type — navigates to /vouchers with
// the matching ?type= and ?action=new params.
export interface SearchVoucherType {
  id: string;
  label: string;
}
export const SEARCH_VOUCHER_TYPES: SearchVoucherType[] = [
  { id: "sales", label: "Sales Invoice" },
  { id: "purchase", label: "Purchase Invoice" },
  { id: "payment", label: "Payment" },
  { id: "receipt", label: "Receipt" },
  { id: "contra", label: "Contra" },
  { id: "journal", label: "Journal" },
  { id: "credit_note", label: "Credit Note" },
  { id: "debit_note", label: "Debit Note" },
];
