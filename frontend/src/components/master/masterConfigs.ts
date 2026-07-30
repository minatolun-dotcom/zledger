import { INDIAN_STATES } from "../../components/IndianStates";
import { api } from "../../api/client";

export interface QuickCreateField {
  name: string;
  label: string;
  type: "text" | "select" | "number" | "textarea";
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** For select fields that need dynamic options from an API call */
  fetchOptions?: () => Promise<{ value: string; label: string }[]>;
  /** Allow inline creation of another master from this field (nested create) */
  createEntity?: EntityKey;
  min?: number;
  max?: number;
  step?: string;
  /** Show this field only when the named select field's label contains one of these substrings (case-insensitive) */
  showWhen?: { field: string; labelIncludes: string[] };
}

export interface QuickCreateEntityConfig {
  key: string;
  label: string;
  apiPath: string;
  fields: QuickCreateField[];
  /** Minimum required fields for the quick create modal */
  compactFields: string[];
  /** Skip API calls — used for enum-like fields stored as strings */
  localOnly?: boolean;
}

export type EntityKey =
  | "ledger"
  | "party"
  | "group"
  | "stock_item"
  | "stock_group"
  | "unit"
  | "hsn_sac"
  | "cost_centre"
  | "cost_category"
  | "party_type";

type FieldMap = Record<string, QuickCreateField>;

const FIELDS: FieldMap = {
  name: { name: "name", label: "Name", type: "text", required: true, placeholder: "Enter name" },
  description: { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Optional description" },
  party_type: {
    name: "party_type", label: "Party Type", type: "select", required: true,
    createEntity: "party_type",
    options: [
      { value: "customer", label: "Customer" },
      { value: "supplier", label: "Supplier" },
      { value: "both", label: "Supplier and Customer" },
      { value: "employee", label: "Employee" },
      { value: "transporter", label: "Transporter" },
      { value: "agent_broker", label: "Agent / Broker" },
      { value: "contractor", label: "Contractor" },
      { value: "consultant", label: "Consultant" },
      { value: "lender", label: "Lender" },
    ],
  },
  gstin: { name: "gstin", label: "GSTIN", type: "text", required: false, placeholder: "Optional GSTIN" },
  state_code: {
    name: "state_code", label: "State", type: "select", required: false,
    options: INDIAN_STATES.map((s) => ({ value: s.code, label: s.name })),
  },
  group_id: {
    name: "group_id", label: "Group", type: "select", required: true,
    createEntity: "group",
    fetchOptions: async () => {
      const groups = await api.get<any[]>("/coa/groups");
      return groups.map((g) => ({ value: g.id, label: g.name }));
    },
  },
  stock_group_id: {
    name: "stock_group_id", label: "Stock Group", type: "select", required: false,
    createEntity: "stock_group",
    fetchOptions: async () => {
      const groups = await api.get<any[]>("/inventory/groups");
      return groups.map((g) => ({ value: g.id, label: g.name }));
    },
  },
  opening_balance: { name: "opening_balance", label: "Opening Balance", type: "number", required: false, min: 0, step: "0.01" },
  opening_balance_type: {
    name: "opening_balance_type", label: "Balance Type", type: "select", required: false,
    options: [
      { value: "Dr", label: "Debit" },
      { value: "Cr", label: "Credit" },
    ],
  },
  bank_name: { name: "bank_name", label: "Bank Name", type: "text", required: false, placeholder: "e.g. HDFC Bank" },
  bank_account_number: { name: "bank_account_number", label: "Account Number", type: "text", required: false, placeholder: "Bank account number" },
  bank_ifsc: { name: "bank_ifsc", label: "IFSC Code", type: "text", required: false, placeholder: "e.g. HDFC0001234" },
  bank_branch: { name: "bank_branch", label: "Branch", type: "text", required: false, placeholder: "Branch name" },
  unit_of_measure: {
    name: "unit_of_measure", label: "Unit", type: "select", required: false,
    options: [
      { value: "Nos", label: "Nos" },
      { value: "Kgs", label: "Kgs" },
      { value: "Ltr", label: "Ltr" },
      { value: "Mtr", label: "Mtr" },
      { value: "Sqm", label: "Sqm" },
      { value: "Pcs", label: "Pcs" },
      { value: "Box", label: "Box" },
      { value: "Bag", label: "Bag" },
      { value: "Set", label: "Set" },
      { value: "Pair", label: "Pair" },
      { value: "Rft", label: "Rft" },
    ],
  },
  gst_rate: {
    name: "gst_rate", label: "GST Rate", type: "select", required: false,
    options: [
      { value: "0", label: "0%" },
      { value: "0.25", label: "0.25%" },
      { value: "3", label: "3%" },
      { value: "5", label: "5%" },
      { value: "12", label: "12%" },
      { value: "18", label: "18%" },
      { value: "28", label: "28%" },
    ],
  },
  hsn_sac_code: { name: "hsn_sac_code", label: "HSN/SAC Code", type: "text", required: false, placeholder: "e.g. 84713000" },
  item_type: {
    name: "item_type", label: "Item Type", type: "select", required: true,
    options: [
      { value: "goods", label: "Goods" },
      { value: "service", label: "Service" },
    ],
  },
  hsn_code: { name: "code", label: "HSN/SAC Code", type: "text", required: true, placeholder: "e.g. 84713000" },
  code_type: {
    name: "code_type", label: "Code Type", type: "select", required: true,
    options: [
      { value: "hsn", label: "HSN (Goods)" },
      { value: "sac", label: "SAC (Services)" },
    ],
  },
  sku: { name: "sku", label: "SKU", type: "text", required: false, placeholder: "Optional SKU" },
  opening_qty: { name: "opening_qty", label: "Opening Qty", type: "number", required: false, min: 0, step: "0.001" },
  opening_rate: { name: "opening_rate", label: "Opening Rate", type: "number", required: false, min: 0, step: "0.01" },
  valuation_method: {
    name: "valuation_method", label: "Valuation Method", type: "select", required: false,
    options: [
      { value: "weighted_avg", label: "Weighted Average" },
      { value: "fifo", label: "FIFO" },
    ],
  },
};

export const ENTITY_CONFIGS: Record<EntityKey, QuickCreateEntityConfig> = {
  ledger: {
    key: "ledger",
    label: "Ledger",
    apiPath: "/coa/ledgers",
    fields: [
      FIELDS.name, FIELDS.group_id, FIELDS.opening_balance, FIELDS.opening_balance_type, FIELDS.gstin,
      { ...FIELDS.bank_name, showWhen: { field: "group_id", labelIncludes: ["bank"] } },
      { ...FIELDS.bank_account_number, showWhen: { field: "group_id", labelIncludes: ["bank"] } },
      { ...FIELDS.bank_ifsc, showWhen: { field: "group_id", labelIncludes: ["bank"] } },
      { ...FIELDS.bank_branch, showWhen: { field: "group_id", labelIncludes: ["bank"] } },
    ],
    compactFields: ["name", "group_id"],
  },
  party: {
    key: "party",
    label: "Party",
    apiPath: "/coa/parties",
    fields: [FIELDS.name, FIELDS.party_type, FIELDS.gstin, FIELDS.state_code],
    compactFields: ["name", "party_type"],
  },
  group: {
    key: "group",
    label: "Group",
    apiPath: "/coa/groups",
    fields: [FIELDS.name, FIELDS.description],
    compactFields: ["name"],
  },
  stock_item: {
    key: "stock_item",
    label: "Stock Item",
    apiPath: "/inventory/items",
    fields: [FIELDS.name, FIELDS.item_type, FIELDS.stock_group_id, FIELDS.unit_of_measure, FIELDS.gst_rate, FIELDS.hsn_sac_code, FIELDS.sku, FIELDS.opening_qty, FIELDS.opening_rate, FIELDS.valuation_method],
    compactFields: ["name"],
  },
  stock_group: {
    key: "stock_group",
    label: "Stock Group",
    apiPath: "/inventory/groups",
    fields: [FIELDS.name, FIELDS.description],
    compactFields: ["name"],
  },
  unit: {
    key: "unit",
    label: "Unit",
    apiPath: "/masters/units",
    fields: [FIELDS.name, FIELDS.description],
    compactFields: ["name"],
  },
  hsn_sac: {
    key: "hsn_sac",
    label: "HSN/SAC",
    apiPath: "/gst/hsn-sac",
    fields: [FIELDS.hsn_code, FIELDS.description, FIELDS.gst_rate, FIELDS.code_type],
    compactFields: ["code", "description", "gst_rate"],
  },
  cost_centre: {
    key: "cost_centre",
    label: "Cost Centre",
    apiPath: "/masters/cost-centres",
    fields: [FIELDS.name, FIELDS.description],
    compactFields: ["name"],
  },
  cost_category: {
    key: "cost_category",
    label: "Cost Category",
    apiPath: "/masters/cost-categories",
    fields: [FIELDS.name, FIELDS.description],
    compactFields: ["name"],
  },
  party_type: {
    key: "party_type",
    label: "Party Type",
    apiPath: "",
    localOnly: true,
    fields: [FIELDS.name],
    compactFields: ["name"],
  },
};
