import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import Select from "../components/Select";
import IndianStateSelect from "../components/IndianStateSelect";
import ListSkeleton from "./skeletons/ListSkeleton";

interface Party {
  id: string;
  name: string;
  party_type: string;
  gstin: string | null;
  state_code: string | null;
  ledger_id: string | null;
}

const PARTY_TYPE_LABELS: Record<string, string> = {
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
// a receivable ledger (Trade Receivables).
const PAYABLE_TYPES = new Set([
  "supplier",
  "both",
  "employee",
  "transporter",
  "agent_broker",
  "contractor",
  "consultant",
  "lender",
]);

function typeLabel(type: string): string {
  return PARTY_TYPE_LABELS[type] ?? type;
}

function ledgerGroupLabel(type: string): string {
  return PAYABLE_TYPES.has(type) ? "Sundry Creditors" : "Sundry Debtors";
}

export default function PartiesPage() {
  const navigate = useNavigate();
  const toast = useToastStore();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    party_type: "customer",
    gstin: "",
    state_code: "",
    pan: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
  });

  const load = () => {
    setLoading(true);
    api
      .get<Party[]>("/coa/parties")
      .then((data) => setParties(data))
      .catch((err) => toast.error(err?.message || "Failed to load parties"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createParty = async () => {
    if (!form.name.trim()) {
      toast.error("Party name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        party_type: form.party_type,
        gstin: form.gstin.trim() || null,
        state_code: form.state_code || null,
        pan: form.pan.trim() || null,
        contact_person: form.contact_person.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
      };
      await api.post<Party>("/coa/parties", payload);
      toast.success(`Created ${payload.name}`);
      setShowCreate(false);
      setForm({
        name: "",
        party_type: "customer",
        gstin: "",
        state_code: "",
        pan: "",
        contact_person: "",
        phone: "",
        email: "",
        address: "",
      });
      load();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create party");
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parties.filter((p) => {
      if (typeFilter && p.party_type !== typeFilter) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.gstin || "").toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [parties, typeFilter, search]);

  const typeOptions = useMemo(() => {
    const used = Array.from(new Set(parties.map((p) => p.party_type)));
    return [
      { value: "", label: "All Types" },
      ...used.map((t) => ({ value: t, label: typeLabel(t) })),
    ];
  }, [parties]);

  const openLedger = (p: Party) => {
    // Open the COA with the relevant Trade Receivables / Trade Payables group expanded
    // and the party's ledger pre-selected via search.
    const params = new URLSearchParams();
    params.set("q", p.name);
    navigate(`/chart-of-accounts?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-[#f1f5f9]">Parties</h1>
          <p className="text-sm text-slate-500 dark:text-[#94a3b8]">
            Customers, suppliers and other parties. Each party is linked to a ledger under
            Trade Receivables or Trade Payables.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="h-9 shrink-0 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white transition-colors hover:bg-brand-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          + Create Party
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or GSTIN"
          className="w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9] dark:placeholder-[#64748b]"
        />
        <div className="w-44">
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            options={typeOptions}
            placeholder="All Types"
          />
        </div>
      </div>

      {loading ? (
        <ListSkeleton title="Parties" cols={4} rows={6} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-[#282832]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-[#1a1a24] dark:bg-[#16161f] dark:text-[#94a3b8]">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">GSTIN</th>
                <th className="px-4 py-3">Linked Ledger</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500 dark:text-[#94a3b8]">
                    No parties found.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-[#1a1a24] dark:hover:bg-[#16161f]"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-[#f1f5f9]">{p.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-500 dark:text-blue-400">
                        {typeLabel(p.party_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-[#cbd5e1]">{p.gstin || "—"}</td>
                    <td className="px-4 py-3">
                      {p.ledger_id ? (
                        <button
                          onClick={() => openLedger(p)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-[#1a1a24] dark:text-[#cbd5e1] dark:hover:bg-[#282832]"
                          title={`View ${p.name} in ${ledgerGroupLabel(p.party_type)}`}
                        >
                          <span className="text-slate-400 dark:text-[#64748b]">{ledgerGroupLabel(p.party_type)}</span>
                          <span className="text-blue-500 dark:text-blue-400">→ {p.name}</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-[#64748b]">No ledger linked</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <div
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-[#282832] dark:bg-[#16161f]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-[#f1f5f9]">Create Party</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-[#94a3b8]">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Name *</label>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. ABC Traders"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Party Type</label>
                <Select
                  value={form.party_type}
                  onChange={(v) => setForm({ ...form, party_type: v })}
                  options={Object.entries(PARTY_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">GSTIN</label>
                  <input
                    value={form.gstin}
                    onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                    placeholder="22AAAAA0000A1Z5"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">PAN</label>
                  <input
                    value={form.pan}
                    onChange={(e) => setForm({ ...form, pan: e.target.value })}
                    placeholder="AAAAA0000A"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Contact Person</label>
                  <input
                    value={form.contact_person}
                    onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Phone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Email</label>
                  <input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">State</label>
                  <IndianStateSelect
                    value={form.state_code}
                    onChange={(v) => setForm({ ...form, state_code: v })}
                    placeholder="Select state"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Address</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                />
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-400 dark:text-[#64748b]">
              A ledger is auto-created under {ledgerGroupLabel(form.party_type)} and linked to this party.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:bg-[#1a1a24]"
              >
                Cancel
              </button>
              <button
                onClick={createParty}
                disabled={saving}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                {saving ? "Creating..." : "Create Party"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
