// ── Shared types for the voucher system ──────────────────────────────────

export interface Ledger {
  id: string;
  name: string;
  group_id: string;
  opening_balance: number;
  opening_balance_type: string;
  currency: string | null;
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
  fc_debit: number | null;
  fc_credit: number | null;
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
  place_of_supply: string | null;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  currency: string | null;
  exchange_rate: number | null;
  round_off_to: number | null;
  counterparty_gstin: string | null;
  counterparty_state_code: string | null;
  document_type: string;
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
    fc_debit: number | null;
    fc_credit: number | null;
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
    icon: "M",
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
    icon: "M",
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
    icon: "J",
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
    icon: "C",
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
    icon: "D",
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
    fc_debit: null,
    fc_credit: null,
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
    fc_debit: null,
    fc_credit: null,
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
    fc_debit: null,
    fc_credit: null,
    line_total: null,
    gst_rate: null,
    is_rate_inclusive: false,
  };
}
