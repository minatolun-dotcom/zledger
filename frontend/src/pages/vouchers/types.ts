// ── Shared types for the voucher system ──────────────────────────────────

export interface Ledger {
  id: string;
  name: string;
  system_code?: string | null;
  group_id: string;
  opening_balance: number;
  opening_balance_type: string;
}

export interface Party {
  id: string;
  name: string;
  party_type: string;
  gstin: string | null;
  state_code: string | null;
  ledger_id: string | null;
  address?: string | null;
  pan?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_person?: string | null;
}

export interface AccountGroup {
  id: string;
  company_id: string;
  name: string;
  nature: string;
  system_code: string | null;
  parent_id: string | null;
  group_type: string;
  is_system: boolean;
}

export interface StockGroup {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface Unit {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface CostCentre {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface CostCategory {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface StockItem {
  id: string;
  name: string;
  gst_rate: number;
  hsn_sac_code: string | null;
  unit_of_measure: string;
  opening_rate: number;
}

export interface VoucherLine {
  ledger_id: string;
  stock_item_id: string | null;
  quantity: number | null;
  rate: number | null;
  discount_pct: number;
  discount_amount: number;
  debit: number;
  credit: number;
  line_total: number | null;
  gst_rate: number | null;
  is_rate_inclusive: boolean;
  hsn_sac_id: string | null;
}

export interface Voucher {
  id: string;
  voucher_type: string;
  voucher_number: string;
  voucher_date: string;
  narration: string | null;
  reference: string | null;
  party_id: string | null;
  party_name: string | null;
  ledger_names: string[];
  place_of_supply: string | null;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  round_off_to: number | null;
  counterparty_gstin: string | null;
  counterparty_state_code: string | null;
  document_type: string;
  cancel_reason: string | null;
  cancelled_at: string | null;
  status: string;
  approval_status: string | null;
  lines: {
    id: string;
    ledger_id: string;
    stock_item_id: string | null;
    quantity: number | null;
    rate: number | null;
    discount_pct: number;
    discount_amount: number;
    line_total: number | null;
    debit: number;
    credit: number;
    taxable_value: number | null;
    hsn_sac_id: string | null;
    is_inter_state: boolean;
    is_reverse_charge: boolean;
    is_rate_inclusive: boolean;
    cgst_amount: number | null;
    sgst_amount: number | null;
    igst_amount: number | null;
    cost_centre_id: string | null;
  }[];
}

// ── Voucher type configuration ───────────────────────────────────────────

export type LineStyle = "item" | "ledger" | "amount";

export interface VoucherTypeConfig {
  id: string;
  label: string;
  shortLabel: string;
  icon: string;
  color: string;
  lineStyle: LineStyle;
  showParty: boolean;
  showGst: boolean;
  showReference: boolean;
  showDocumentType: boolean;
  referenceLabel: string;
  description: string;
  /** For amount-based types: auto-select this ledger as "from" */
  defaultFromLedger?: string;
  /** For amount-based types: auto-select this ledger as "to" */
  defaultToLedger?: string;
}

// ── Voucher type registry ────────────────────────────────────────────────

export const VOUCHER_TYPES: VoucherTypeConfig[] = [
  {
    id: "sales",
    label: "Sales Invoice",
    shortLabel: "Sales",
    icon: "◆",
    color: "emerald",
    lineStyle: "item",
    showParty: true,
    showGst: true,
    showReference: true,
    showDocumentType: false,
    referenceLabel: "Invoice No.",
    description: "Record sales to customers with stock items and GST",
  },
  {
    id: "purchase",
    label: "Purchase Invoice",
    shortLabel: "Purchase",
    icon: "◇",
    color: "blue",
    lineStyle: "item",
    showParty: true,
    showGst: true,
    showReference: true,
    showDocumentType: false,
    referenceLabel: "Invoice No.",
    description: "Record purchases from suppliers with stock items and GST",
  },
  {
    id: "payment",
    label: "Payment",
    shortLabel: "Payment",
    icon: "→",
    color: "rose",
    lineStyle: "amount",
    showParty: true,
    showGst: false,
    showReference: true,
    showDocumentType: false,
    referenceLabel: "Cheque / UTR #",
    description: "Record payments made to suppliers or parties",
  },
  {
    id: "receipt",
    label: "Receipt",
    shortLabel: "Receipt",
    icon: "←",
    color: "blue",
    lineStyle: "amount",
    showParty: true,
    showGst: false,
    showReference: true,
    showDocumentType: false,
    referenceLabel: "Cheque / UTR #",
    description: "Record receipts received from customers or parties",
  },
  {
    id: "contra",
    label: "Contra",
    shortLabel: "Contra",
    icon: "↔",
    color: "slate",
    lineStyle: "amount",
    showParty: false,
    showGst: false,
    showReference: true,
    showDocumentType: false,
    referenceLabel: "UTR #",
    description: "Transfer between bank accounts or cash",
  },
  {
    id: "journal",
    label: "Journal",
    shortLabel: "Journal",
    icon: "✎",
    color: "amber",
    lineStyle: "ledger",
    showParty: false,
    showGst: false,
    showReference: false,
    showDocumentType: false,
    referenceLabel: "Reference",
    description: "General journal entries for adjustments and accruals",
  },
  {
    id: "credit_note",
    label: "Credit Note",
    shortLabel: "Cr Note",
    icon: "↩",
    color: "teal",
    lineStyle: "item",
    showParty: true,
    showGst: true,
    showReference: true,
    showDocumentType: false,
    referenceLabel: "Credit Note #",
    description: "Issue credit notes for sales returns or price reductions",
  },
  {
    id: "debit_note",
    label: "Debit Note",
    shortLabel: "Dr Note",
    icon: "↪",
    color: "orange",
    lineStyle: "item",
    showParty: true,
    showGst: true,
    showReference: true,
    showDocumentType: false,
    referenceLabel: "Debit Note #",
    description: "Issue debit notes for purchase returns or price increases",
  },
];

// ── Helper to get config by ID ───────────────────────────────────────────

export function getVoucherConfig(typeId: string): VoucherTypeConfig {
  return VOUCHER_TYPES.find((t) => t.id === typeId) || VOUCHER_TYPES[0];
}

// ── Voucher type color map ──────────────────────────────────────────────

const VOUCHER_COLORS: Record<string, { bg: string; text: string; tab: string; tabActive: string }> = {
  emerald: { bg: "bg-emerald-100 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-400", tab: "hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-400", tabActive: "bg-emerald-500 text-white shadow-sm" },
  blue:    { bg: "bg-blue-100 dark:bg-blue-500/15", text: "text-blue-700 dark:text-blue-400", tab: "hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-700 dark:hover:text-blue-400", tabActive: "bg-blue-500 text-white shadow-sm" },
  rose:    { bg: "bg-rose-100 dark:bg-rose-500/15", text: "text-rose-700 dark:text-rose-400", tab: "hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-400", tabActive: "bg-rose-500 text-white shadow-sm" },
  slate:   { bg: "bg-slate-100 dark:bg-[#64748b]/15", text: "text-slate-700 dark:text-[#94a3b8]", tab: "hover:bg-slate-50 dark:hover:bg-[#64748b]/10 hover:text-slate-700 dark:hover:text-[#94a3b8]", tabActive: "bg-slate-500 text-white shadow-sm" },
  amber:   { bg: "bg-amber-100 dark:bg-amber-500/15", text: "text-amber-700 dark:text-amber-400", tab: "hover:bg-amber-50 dark:hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-400", tabActive: "bg-amber-500 text-white shadow-sm" },
  teal:    { bg: "bg-teal-100 dark:bg-teal-500/15", text: "text-teal-700 dark:text-teal-400", tab: "hover:bg-teal-50 dark:hover:bg-teal-500/10 hover:text-teal-700 dark:hover:text-teal-400", tabActive: "bg-teal-500 text-white shadow-sm" },
  orange:  { bg: "bg-orange-100 dark:bg-orange-500/15", text: "text-orange-700 dark:text-orange-400", tab: "hover:bg-orange-50 dark:hover:bg-orange-500/10 hover:text-orange-700 dark:hover:text-orange-400", tabActive: "bg-orange-500 text-white shadow-sm" },
};

export function getVoucherColor(typeId: string): { bg: string; text: string; tab: string; tabActive: string } {
  const config = VOUCHER_TYPES.find((t) => t.id === typeId);
  return VOUCHER_COLORS[config?.color ?? "slate"] ?? VOUCHER_COLORS.slate;
}

// ── Empty line factory ───────────────────────────────────────────────────

export function emptyItemLine(): VoucherLine {
  return {
    ledger_id: "",
    stock_item_id: null,
    quantity: null,
    rate: null,
    discount_pct: 0,
    discount_amount: 0,
    debit: 0,
    credit: 0,
    line_total: null,
    gst_rate: null,
    is_rate_inclusive: false,
    hsn_sac_id: null,
  };
}

export function emptyLedgerLine(): VoucherLine {
  return {
    ledger_id: "",
    stock_item_id: null,
    quantity: null,
    rate: null,
    discount_pct: 0,
    discount_amount: 0,
    debit: 0,
    credit: 0,
    line_total: null,
    gst_rate: null,
    is_rate_inclusive: false,
    hsn_sac_id: null,
  };
}

export function emptyAmountLine(): VoucherLine {
  return {
    ledger_id: "",
    stock_item_id: null,
    quantity: null,
    rate: null,
    discount_pct: 0,
    discount_amount: 0,
    debit: 0,
    credit: 0,
    line_total: null,
    gst_rate: null,
    is_rate_inclusive: false,
    hsn_sac_id: null,
  };
}

// ── Voucher Summary Data (for sidebar) ─────────────────────────────────

// ── Ledger-driven architecture types ──────────────────────────────────────

/**
 * Classification of a ledger based on its AccountGroup system code.
 * Determines what UI panels to show and how D/C entries behave.
 */
export type LedgerGroupType =
  | "cash"           // Cash-in-hand
  | "bank"           // Bank accounts
  | "sundry_debtors" // Customers (Sundry Debtors)
  | "sundry_creditors" // Suppliers (Sundry Creditors)
  | "income"         // Sales, direct/indirect incomes
  | "expense"        // Direct/indirect expenses
  | "asset"          // Current/fixed assets, investments, stock
  | "liability"      // Current liabilities, loans, provisions
  | "capital"        // Capital, reserves, P&L, drawings
  | "tax"            // Duties, taxes, GST
  | "other";         // Default fallback

/**
 * A single debit/credit entry in a voucher — the atomic unit of
 * double-entry accounting. Every voucher is a set of LedgerEntries
 * where Σ debits == Σ credits.
 */
export interface LedgerEntry {
  ledger_id: string;
  ledger_name?: string;
  group_type?: LedgerGroupType;
  debit: number;
  credit: number;
  /** Stock item details (for item-based vouchers like sales/purchase) */
  stock_item_id?: string | null;
  quantity?: number | null;
  rate?: number | null;
  line_total?: number | null;
  gst_rate?: number | null;
  hsn_sac_id?: string | null;
  is_rate_inclusive?: boolean;
  discount_pct?: number;
  discount_amount?: number;
}

/**
 * Describes a ledger slot in a voucher's UI — which ledgers are
 * shown and what panels they activate.
 */
export interface LedgerSlot {
  /** Unique key for this slot (e.g. "from", "to", "party", "counter") */
  key: string;
  /** Display label */
  label: string;
  /** Placeholder text for the selector */
  placeholder: string;
  /** Hint text shown when no ledger is selected */
  hint?: string;
  /**
   * Which group types are allowed. Empty = all types.
   * When set, the selector filters to matching ledgers.
   */
  allowedGroups?: LedgerGroupType[];
  /**
   * What panel to show when a ledger of a matching type is selected.
   * Map of group_type → panel id to render.
   */
  panels?: Partial<Record<LedgerGroupType, "party" | "payment" | "none">>;
}

/**
 * Configures how a voucher type uses ledger slots.
 * Replaces the old showParty hardcode with flexible slot definitions.
 */
export interface VoucherSlotsConfig {
  /** Ledger slots this voucher type renders (order matters) */
  slots: LedgerSlot[];
  /** Whether this voucher type has item lines (stock items + GST) */
  hasItems: boolean;
  /** Whether this voucher type has a journal-style D/C entry table */
  hasLedgerEntries: boolean;
  /** Whether this voucher type has a single amount transfer */
  hasAmountTransfer: boolean;
}

// ── Mapping from AccountGroup system_code to LedgerGroupType ───────────

export const LEDGER_GROUP_TYPE_MAP: Record<string, LedgerGroupType> = {
  GRP_CASH_IN_HAND: "cash",
  GRP_BANK_ACCOUNTS: "bank",
  GRP_SUNDRY_DEBTORS: "sundry_debtors",
  GRP_SUNDRY_CREDITORS: "sundry_creditors",
  GRP_SALES_ACCOUNTS: "income",
  GRP_PURCHASE_ACCOUNTS: "expense",
  GRP_DIRECT_INCOMES: "income",
  GRP_INDIRECT_INCOMES: "income",
  GRP_DIRECT_EXPENSES: "expense",
  GRP_INDIRECT_EXPENSES: "expense",
  GRP_CURRENT_ASSETS: "asset",
  GRP_FIXED_ASSETS: "asset",
  GRP_INVESTMENTS: "asset",
  GRP_DEPOSITS_ASSETS: "asset",
  GRP_LOANS_ADVANCES_ASSETS: "asset",
  GRP_STOCK_IN_HAND: "asset",
  GRP_SUSPENSE: "asset",
  GRP_CURRENT_LIABILITIES: "liability",
  GRP_LOANS_ADVANCES_LIABILITIES: "liability",
  GRP_PROVISIONS: "liability",
  GRP_DUTIES_TAXES: "tax",
  GRP_GST_INPUT: "tax",
  GRP_GST_OUTPUT: "tax",
  GRP_REVERSE_CHARGE: "tax",
  GRP_CAPITAL_ACCOUNT: "capital",
  GRP_RESERVES_SURPLUS: "capital",
  GRP_PROFIT_LOSS: "capital",
  GRP_DRAWINGS: "capital",
  GRP_OPENING_BALANCE_EQUITY: "capital",
};

/**
 * Given an AccountGroup system_code, return the LedgerGroupType.
 * Defaults to "other" if the code is unknown or missing.
 */
export function getLedgerGroupType(systemCode: string | null | undefined): LedgerGroupType {
  if (!systemCode) return "other";
  return LEDGER_GROUP_TYPE_MAP[systemCode] ?? "other";
}

/**
 * Return human-readable label for a LedgerGroupType.
 */
export function ledgerGroupTypeLabel(type: LedgerGroupType): string {
  const labels: Record<LedgerGroupType, string> = {
    cash: "Cash",
    bank: "Bank",
    sundry_debtors: "Customer",
    sundry_creditors: "Supplier",
    income: "Income",
    expense: "Expense",
    asset: "Asset",
    liability: "Liability",
    capital: "Capital",
    tax: "Tax",
    other: "Other",
  };
  return labels[type];
}

// ── Party type labels ─────────────────────────────────────────────────

export const PARTY_TYPE_LABELS: Record<string, string> = {
  customer: "Customer",
  supplier: "Supplier",
  both: "Supplier and Customer",
  debtor: "Debtor",
  creditor: "Creditor",
  employee: "Employee",
  transporter: "Transporter",
  agent_broker: "Agent / Broker",
  contractor: "Contractor",
  consultant: "Consultant",
  lender: "Lender",
};

/** Human-readable label for a party_type value (falls back to Title Case). */
export function partyTypeLabel(value: string | null | undefined): string {
  if (!value) return "";
  return PARTY_TYPE_LABELS[value] ?? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Dropdown label for a party, e.g. "Royal Emporium (Customer · 29AAAAA1000A1ZA)".
 * Includes GSTIN when present; omits the parenthetical when the party is not a
 * customer/supplier (e.g. cash/bank ledgers shown alongside parties).
 */
export function partyOptionLabel(p: Pick<Party, "name" | "party_type" | "gstin">): string {
  const type = partyTypeLabel(p.party_type);
  if (!type) return p.name;
  return p.gstin ? `${p.name} (${type} · ${p.gstin})` : `${p.name} (${type})`;
}

// ── Voucher Summary Data (for sidebar) ─────────────────────────────────

export interface VoucherSummaryData {
  itemCount: number;
  subtotal: number;
  discountTotal: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number | null;
  netAmount: number;
  /** Party id for party detail card — empty string when none selected */
  partyId: string;
  /** Payment type fields (for AmountVoucherForm) */
  fromLedgerId: string;
  toLedgerId: string;
  amount: number;
  /** Journal fields */
  totalDebit: number;
  totalCredit: number;
}
