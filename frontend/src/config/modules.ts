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
  { id: "gst", label: "GST & Compliance", description: "GST returns, E-Invoice, E-Way Bill, HSN/SAC", icon: "shield-check" },
  { id: "tds_tcs", label: "TDS / TCS", description: "TDS/TCS sections, entries, returns", icon: "tax" },
  { id: "bank_reconciliation", label: "Bank Reconciliation", description: "Statement import, reconciliation", icon: "scale" },
  { id: "payments", label: "Payments", description: "Payment allocation, receivables", icon: "currency" },
  { id: "import_export", label: "Import / Export", description: "Tally import, data export", icon: "upload" },
  { id: "loans", label: "Loans & Advances", description: "Loan tracking, payments, interest calc", icon: "currency" },
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
    { to: "/vouchers", label: "Vouchers", icon: "receipt" },
    { to: "/fixed-assets", label: "Fixed Assets", icon: "assets", module: "fixed_assets" },
    { to: "/bank-reconciliation", label: "Reconciliation", icon: "scale", module: "bank_reconciliation" },
    { to: "/loans", label: "Loans & Advances", icon: "currency", module: "loans" },
  ]},
  { label: "Inventory", key: "inventory", icon: "package", module: "inventory", items: [
    { to: "/inventory", label: "Stock & Inventory", icon: "package" },
    { to: "/manufacturing", label: "Manufacturing", icon: "wrench-screwdriver", module: "manufacturing" },
    { to: "/batches", label: "Batches", icon: "layers", module: "batches" },
    { to: "/batch-trace", label: "Batch Trace", icon: "search", module: "batches" },
  ]},
  { label: "GST & Tax", key: "gst-tax", icon: "shield-check", module: null, items: [
    { to: "/gst", label: "GST", icon: "gst", module: "gst" },
    { to: "/tds-tcs", label: "TDS / TCS", icon: "tax", module: "tds_tcs" },
  ]},
  { label: "Reports", key: "reports", icon: "chart-bar", module: null, items: [
    { to: "/daybook", label: "Day Book", icon: "book" },
    { to: "/reports", label: "Financial Reports", icon: "chart" },
    { to: "/payments", label: "Payments & Receivables", icon: "currency", module: "payments" },
  ]},
  { label: "Settings", key: "company", icon: "building", module: null, items: [
    { to: "/company-settings", label: "Company Settings", icon: "settings" },
    { to: "/recurring-templates", label: "Recurring Templates", icon: "receipt" },
    { to: "/tally-import", label: "Import / Export", icon: "upload", module: "import_export" },
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
}

export const SEARCH_COMMANDS: SearchCommand[] = [
  { id: "create-group", label: "Create Account Group", category: "Create", icon: "sitemap", to: "/chart-of-accounts", params: { action: "create-group" }, module: null },
  { id: "create-subgroup", label: "Create Subgroup", category: "Create", icon: "sitemap", to: "/chart-of-accounts", params: { action: "create-subgroup" }, module: null },
  { id: "create-ledger", label: "Create Ledger", category: "Create", icon: "sitemap", to: "/chart-of-accounts", params: { action: "create-ledger" }, module: null },
  { id: "new-voucher", label: "New Voucher", category: "Create", icon: "receipt", to: "/vouchers", params: { action: "new" }, module: null },
  { id: "new-recurring", label: "New Recurring Template", category: "Create", icon: "receipt", to: "/recurring-templates", params: { action: "new" }, module: null },
  { id: "new-stock-group", label: "New Stock Group", category: "Create", icon: "package", to: "/inventory", params: { tab: "groups", action: "new" }, module: "inventory" },
  { id: "new-stock-item", label: "New Stock Item", category: "Create", icon: "package", to: "/inventory", params: { tab: "items", action: "new" }, module: "inventory" },
  { id: "new-stock-entry", label: "New Stock Entry", category: "Create", icon: "package", to: "/inventory", params: { tab: "entries", action: "new" }, module: "inventory" },
  { id: "new-bom", label: "New BOM", category: "Create", icon: "wrench-screwdriver", to: "/manufacturing", params: { tab: "boms", action: "new" }, module: "manufacturing" },
  { id: "new-production-order", label: "New Production Order", category: "Create", icon: "wrench-screwdriver", to: "/manufacturing", params: { tab: "production", action: "new" }, module: "manufacturing" },
  { id: "new-tds-entry", label: "New TDS/TCS Entry", category: "Create", icon: "tax", to: "/tds-tcs", params: { action: "new-entry" }, module: "tds_tcs" },
  { id: "new-tds-section", label: "New TDS/TCS Section", category: "Create", icon: "tax", to: "/tds-tcs", params: { action: "new-section" }, module: "tds_tcs" },
  { id: "new-fy", label: "New Financial Year", category: "Create", icon: "calendar", to: "/company-settings", params: { action: "new-fy" }, module: null },
  { id: "add-member", label: "Add Member", category: "Create", icon: "user", to: "/members", params: { action: "add" }, module: null },
  { id: "new-asset-category", label: "New Asset Category", category: "Create", icon: "assets", to: "/fixed-assets", params: { tab: "categories", action: "new" }, module: "fixed_assets" },
  { id: "new-asset", label: "New Fixed Asset", category: "Create", icon: "assets", to: "/fixed-assets", params: { tab: "register", action: "new" }, module: "fixed_assets" },
  { id: "gst-compliance", label: "GST Compliance", category: "Navigate", icon: "gst", to: "/gst", params: { tab: "compliance" }, module: "gst" },
  { id: "gst-einvoice", label: "E-Invoice", category: "Navigate", icon: "gst", to: "/gst", params: { tab: "einvoice" }, module: "gst" },
  { id: "gst-eway", label: "E-Way Bill", category: "Navigate", icon: "gst", to: "/gst", params: { tab: "eway-bill" }, module: "gst" },
  { id: "gst-hsn", label: "HSN / SAC", category: "Navigate", icon: "gst", to: "/gst", params: { tab: "hsn-sac" }, module: "gst" },
  { id: "gst-registrations", label: "GST Registrations", category: "Navigate", icon: "gst", to: "/gst", params: { tab: "registrations" }, module: "gst" },
  { id: "new-loan", label: "New Loan / Advance", category: "Create", icon: "currency", to: "/loans", params: { action: "new" }, module: "loans" },
  { id: "loans-dashboard", label: "Loans & Advances", category: "Navigate", icon: "currency", to: "/loans", module: "loans" },
  { id: "report-trial-balance", label: "Trial Balance", category: "Navigate", icon: "chart", to: "/reports", params: { tab: "trial-balance" }, module: null },
  { id: "report-pnl", label: "Profit & Loss", category: "Navigate", icon: "chart", to: "/reports", params: { tab: "profit-and-loss" }, module: null },
  { id: "report-balance-sheet", label: "Balance Sheet", category: "Navigate", icon: "chart", to: "/reports", params: { tab: "balance-sheet" }, module: null },
  { id: "import-tally", label: "Import from Tally", category: "Navigate", icon: "upload", to: "/tally-import", module: "import_export" },
  { id: "company-settings", label: "Company Settings", category: "Navigate", icon: "settings", to: "/company-settings", module: null },
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
