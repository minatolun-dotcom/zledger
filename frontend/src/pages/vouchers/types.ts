// ── Shared types for the voucher system ──────────────────────────────────

export interface Ledger {
  id: string;
  name: string;
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
}

export interface AccountGroup {
  id: string;
  name: string;
  parent_id: string | null;
  group_type: string;
  nature: string;
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
    showDocumentType: true,
    referenceLabel: "Invoice #",
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
    showDocumentType: true,
    referenceLabel: "Invoice #",
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
    color: "violet",
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
  violet:  { bg: "bg-violet-100 dark:bg-violet-500/15", text: "text-violet-700 dark:text-violet-400", tab: "hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:text-violet-700 dark:hover:text-violet-400", tabActive: "bg-violet-500 text-white shadow-sm" },
  slate:   { bg: "bg-slate-100 dark:bg-slate-500/15", text: "text-slate-700 dark:text-slate-400", tab: "hover:bg-slate-50 dark:hover:bg-slate-500/10 hover:text-slate-700 dark:hover:text-slate-400", tabActive: "bg-slate-500 text-white shadow-sm" },
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
  };
}
