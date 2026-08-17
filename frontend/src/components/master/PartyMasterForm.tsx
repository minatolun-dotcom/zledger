import { useState } from "react";
import Select from "../Select";
import IndianStateSelect from "../IndianStateSelect";

export const PARTY_TYPE_LABELS: Record<string, string> = {
  customer: "Customer",
  supplier: "Supplier",
  both: "Supplier and Customer",
  employee: "Employee",
  transporter: "Transporter",
  agent_broker: "Agent / Broker",
  contractor: "Contractor",
  consultant: "Consultant",
  lender: "Lender",
};

// Party types that map to a payable ledger (Trade Payables) rather than
// a receivable ledger (Trade Receivables). "both" is a receivable (Tally:
// a Both party defaults to Sundry Debtors) so the Sales dropdown can list it.
export const PAYABLE_TYPES = new Set([
  "supplier",
  "employee",
  "transporter",
  "agent_broker",
  "contractor",
  "consultant",
  "lender",
]);

export function partyTypeLabel(type: string): string {
  return PARTY_TYPE_LABELS[type] ?? type;
}

export function partyLedgerGroupLabel(type: string): string {
  return PAYABLE_TYPES.has(type) ? "Sundry Creditors" : "Sundry Debtors";
}

export interface PartyMasterValues {
  name: string;
  party_type: string;
  gstin: string;
  state_code: string;
  pan: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  credit_limit: string;
  maintain_bill_wise: boolean;
  opening_balance: string;
  opening_balance_type: string;
}

export function emptyPartyMasterValues(): PartyMasterValues {
  return {
    name: "",
    party_type: "customer",
    gstin: "",
    state_code: "",
    pan: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    credit_limit: "",
    maintain_bill_wise: true,
    opening_balance: "",
    opening_balance_type: "Dr",
  };
}

/** Convert raw form values into the PartyCreate/PATCH payload. */
export function partyValuesToPayload(values: PartyMasterValues) {
  const num = (v: string): number | null => (v.trim() === "" ? null : Number(v));
  return {
    name: values.name.trim(),
    party_type: values.party_type,
    gstin: values.gstin.trim() || null,
    state_code: values.state_code || null,
    pan: values.pan.trim() || null,
    contact_person: values.contact_person.trim() || null,
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    address: values.address.trim() || null,
    credit_limit: num(values.credit_limit),
    maintain_bill_wise: values.maintain_bill_wise,
    opening_balance: num(values.opening_balance),
    opening_balance_type: values.opening_balance_type,
  };
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[#282832]">
      <div className="rounded-t-lg bg-slate-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:bg-[#1a1a24] dark:text-[#94a3b8]">
        {title}
      </div>
      {children}
    </div>
  );
}

interface PartyMasterFormProps {
  initial?: Partial<PartyMasterValues>;
  submitLabel: string;
  submitting?: boolean;
  mode?: "create" | "edit";
  autoFocusName?: boolean;
  onSubmit: (values: PartyMasterValues) => void;
  onCancel?: () => void;
}

export default function PartyMasterForm({
  initial,
  submitLabel,
  submitting = false,
  mode = "create",
  autoFocusName = true,
  onSubmit,
  onCancel,
}: PartyMasterFormProps) {
  const [form, setForm] = useState<PartyMasterValues>(() => ({
    ...emptyPartyMasterValues(),
    ...(initial || {}),
  }));
  const [nameError, setNameError] = useState("");

  const set = <K extends keyof PartyMasterValues>(key: K, value: PartyMasterValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "name" && nameError) setNameError("");
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      setNameError("Party name is required");
      return;
    }
    onSubmit(form);
  };

  return (
    <div>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        {/* ── Name & Group ── */}
        <Section title="Name & Group">
          <div className="grid grid-cols-2 gap-3 p-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Name *</label>
              <input
                autoFocus={autoFocusName}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. ABC Traders"
                className={inputCls}
              />
              {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Party Type</label>
              <Select
                value={form.party_type}
                onChange={(v) => set("party_type", v)}
                options={Object.entries(PARTY_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              />
              <p className="mt-1 text-[11px] text-slate-400 dark:text-[#64748b]">
                Account under:{" "}
                <span className="font-semibold text-slate-600 dark:text-[#cbd5e1]">
                  {partyLedgerGroupLabel(form.party_type)}
                </span>
              </p>
            </div>
          </div>
        </Section>

        {/* ── Mailing & Contact Details ── */}
        <Section title="Mailing & Contact Details">
          <div className="space-y-3 p-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Address</label>
              <textarea
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                rows={2}
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">State</label>
                <IndianStateSelect
                  value={form.state_code}
                  onChange={(v) => set("state_code", v)}
                  placeholder="Select state"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Contact Person</label>
                <input
                  value={form.contact_person}
                  onChange={(e) => set("contact_person", e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Phone</label>
                <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Email</label>
                <input value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>
        </Section>

        {/* ── Statutory Details ── */}
        <Section title="Statutory Details">
          <div className="grid grid-cols-2 gap-3 p-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">GSTIN/UIN</label>
              <input
                value={form.gstin}
                onChange={(e) => set("gstin", e.target.value)}
                placeholder="22AAAAA0000A1Z5"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">PAN</label>
              <input
                value={form.pan}
                onChange={(e) => set("pan", e.target.value)}
                placeholder="AAAAA0000A"
                className={inputCls}
              />
            </div>
          </div>
        </Section>

        {/* ── Accounting Details ── */}
        <Section title="Accounting Details">
          <div className="grid grid-cols-2 gap-3 p-3">
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Opening Balance</label>
                <input
                  type="number"
                  value={form.opening_balance}
                  onChange={(e) => set("opening_balance", e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Type</label>
                <Select
                  value={form.opening_balance_type}
                  onChange={(v) => set("opening_balance_type", v)}
                  options={[{ value: "Dr", label: "Dr" }, { value: "Cr", label: "Cr" }]}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Credit Limit</label>
              <input
                type="number"
                value={form.credit_limit}
                onChange={(e) => set("credit_limit", e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
          </div>
          <div className="border-t border-slate-200 px-3 py-2.5 dark:border-[#1a1a24]">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-[#cbd5e1]">
              <input
                type="checkbox"
                checked={form.maintain_bill_wise}
                onChange={(e) => set("maintain_bill_wise", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-brand-600 dark:border-[#282832] dark:accent-blue-500"
              />
              Maintain bill-wise details
              <span className="text-[11px] font-normal text-slate-400 dark:text-[#64748b]">
                — track Outstanding Bills, payments and credit notes against this party's invoices
              </span>
            </label>
          </div>
        </Section>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-400 dark:text-[#64748b]">
          {mode === "create" ? (
            <>
              Account auto-created under{" "}
              <span className="font-semibold">{partyLedgerGroupLabel(form.party_type)}</span> and linked to this party.
            </>
          ) : (
            <>
              Linked ledger:{" "}
              <span className="font-semibold">{partyLedgerGroupLabel(form.party_type)}</span> — renaming or changing the
              type updates the account.
            </>
          )}
        </p>
        <div className="flex shrink-0 justify-end gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:bg-[#1a1a24]"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {submitting ? "Saving..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
