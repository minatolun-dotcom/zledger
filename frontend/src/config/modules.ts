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
    { to: "/fixed-assets", label: "Fixed Assets", icon: "assets", module: "fixed_assets" },
    { to: "/bank-reconciliation", label: "Reconciliation", icon: "scale", module: "bank_reconciliation" },
    { to: "/loans", label: "Loans & Advances", icon: "currency", module: "loans" },
  ]},
  { label: "Inventory", key: "inventory", icon: "package", module: "inventory", items: [
    { to: "/inventory", label: "Stock & Inventory", icon: "package" },
    { to: "/manufacturing", label: "Manufacturing", icon: "wrench-screwdriver", module: "manufacturing" },
    { to: "/batches", label: "Batches", icon: "layers", module: "batches" },
  ]},
  { label: "GST & Tax", key: "gst-tax", icon: "shield-check", module: null, items: [
    { to: "/gst", label: "GST", icon: "gst", module: "gst" },
    { to: "/tds-tcs", label: "TDS / TCS", icon: "tax", module: "tds_tcs" },
  ]},
  { label: "Compliance", key: "compliance", icon: "shield-check", module: "compliance", items: [
    { to: "/compliance", label: "Statutory Compliance", icon: "shield-check" },
  ]},
  { label: "Reports", key: "reports", icon: "chart-bar", module: null, items: [
    { to: "/reports", label: "Financial Reports", icon: "chart" },
    { to: "/payments", label: "Payments & Receivables", icon: "currency", module: "payments" },
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
  { id: "create-group", label: "Create Account Group", category: "Create", icon: "sitemap", to: "/chart-of-accounts", params: { action: "create-group" }, module: null, permission: "manage_coa" },
  { id: "create-subgroup", label: "Create Subgroup", category: "Create", icon: "sitemap", to: "/chart-of-accounts", params: { action: "create-subgroup" }, module: null, permission: "manage_coa" },
  { id: "create-ledger", label: "Create Ledger", category: "Create", icon: "sitemap", to: "/chart-of-accounts", params: { action: "create-ledger" }, module: null, permission: "manage_coa" },
  { id: "new-voucher", label: "New Voucher", category: "Create", icon: "receipt", to: "/vouchers", params: { action: "new" }, module: null, permission: "create_voucher" },
  { id: "browse-vouchers", label: "Browse Vouchers", category: "Navigate", icon: "table", to: "/vouchers", params: { tab: "browse" }, module: null },
  { id: "daybook", label: "Day Book", category: "Navigate", icon: "book", to: "/vouchers", params: { tab: "daybook" }, module: null },
  { id: "voucher-register", label: "Voucher Register", category: "Navigate", icon: "table", to: "/vouchers", params: { tab: "browse" }, module: null },
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
  { id: "gst-compliance", label: "GST Compliance Status", category: "Navigate", icon: "gst", to: "/compliance", params: { tab: "gst-status" }, module: "compliance" },
  { id: "gst-einvoice", label: "E-Invoice", category: "Navigate", icon: "gst", to: "/gst", params: { tab: "einvoice" }, module: "gst" },
  { id: "gst-eway", label: "E-Way Bill", category: "Navigate", icon: "gst", to: "/gst", params: { tab: "eway-bill" }, module: "gst" },
  { id: "gst-hsn", label: "HSN / SAC", category: "Navigate", icon: "gst", to: "/gst", params: { tab: "hsn-sac" }, module: "gst" },
  { id: "gst-registrations", label: "GST Registrations", category: "Navigate", icon: "gst", to: "/gst", params: { tab: "registrations" }, module: "gst" },
  { id: "new-loan", label: "New Loan / Advance", category: "Create", icon: "currency", to: "/loans", params: { action: "new" }, module: "loans", permission: "manage_loans" },
  { id: "loans-dashboard", label: "Loans & Advances", category: "Navigate", icon: "currency", to: "/loans", module: "loans" },
  { id: "report-trial-balance", label: "Trial Balance", category: "Navigate", icon: "chart", to: "/reports", params: { tab: "trial-balance" }, module: null },
  { id: "report-pnl", label: "Profit & Loss", category: "Navigate", icon: "chart", to: "/reports", params: { tab: "profit-and-loss" }, module: null },
  { id: "report-balance-sheet", label: "Balance Sheet", category: "Navigate", icon: "chart", to: "/reports", params: { tab: "balance-sheet" }, module: null },
  { id: "import-tally", label: "Data Import / Export", category: "Navigate", icon: "upload", to: "/tally-import", module: "import_export" },
  { id: "company-settings", label: "Company Settings", category: "Navigate", icon: "settings", to: "/company-settings", module: null },
  { id: "compliance-dashboard", label: "Statutory Compliance", category: "Navigate", icon: "shield-check", to: "/compliance", module: "compliance" },
  { id: "compliance-schedule-iii", label: "Schedule III Balance Sheet", category: "Navigate", icon: "shield-check", to: "/compliance", params: { tab: "schedule-iii" }, module: "compliance" },
  { id: "compliance-income-tax", label: "Income Tax Computation", category: "Navigate", icon: "shield-check", to: "/compliance", params: { tab: "income-tax" }, module: "compliance" },
  { id: "compliance-icai-nce", label: "ICAI NCE Statements", category: "Navigate", icon: "shield-check", to: "/compliance", params: { tab: "icai-nce" }, module: "compliance" },
  { id: "compliance-gst-status", label: "GST Compliance Status", category: "Navigate", icon: "shield-check", to: "/compliance", params: { tab: "gst-status" }, module: "compliance" },
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
