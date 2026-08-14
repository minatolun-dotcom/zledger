import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import Select from "../components/Select";
import IndianStateSelect from "../components/IndianStateSelect";
import Modal from "../components/Modal";
import ListSkeleton from "./skeletons/ListSkeleton";

interface Party {
  id: string;
  name: string;
  party_type: string;
  gstin: string | null;
  state_code: string | null;
  ledger_id: string | null;
  pan: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
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
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  const resetForm = () => {
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
  };

  const openCreate = () => {
    setEditingParty(null);
    resetForm();
    setShowCreate(true);
  };

  const openEdit = (p: Party) => {
    setEditingParty(p);
    setForm({
      name: p.name,
      party_type: p.party_type,
      gstin: p.gstin || "",
      state_code: p.state_code || "",
      pan: p.pan || "",
      contact_person: p.contact_person || "",
      phone: p.phone || "",
      email: p.email || "",
      address: p.address || "",
    });
    setShowCreate(true);
  };

  const handleDelete = async (p: Party) => {
    if (!window.confirm(`Delete party "${p.name}"? This cannot be undone.`)) return;
    setDeletingId(p.id);
    try {
      await api.del(`/coa/parties/${p.id}`);
      toast.success(`Deleted ${p.name}`);
      load();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete party");
    } finally {
      setDeletingId(null);
    }
  };

  const saveParty = async () => {
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
      if (editingParty) {
        await api.patch<Party>(`/coa/parties/${editingParty.id}`, payload);
        toast.success(`Updated ${payload.name}`);
      } else {
        await api.post<Party>("/coa/parties", payload);
        toast.success(`Created ${payload.name}`);
      }
      setShowCreate(false);
      resetForm();
      setEditingParty(null);
      load();
    } catch (err: any) {
      toast.error(err?.message || (editingParty ? "Failed to update party" : "Failed to create party"));
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
  const stats = useMemo(() => {
    let customers = 0, suppliers = 0, both = 0, other = 0;
    let withGstin = 0, withoutGstin = 0;
    for (const p of parties) {
      if (p.party_type === "customer") customers++;
      else if (p.party_type === "supplier") suppliers++;
      else if (p.party_type === "both") both++;
      else other++;
      if (p.gstin) withGstin++;
      else withoutGstin++;
    }
    return { total: parties.length, customers, suppliers, both, other, withGstin, withoutGstin };
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
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-[#f1f5f9]">Parties</h1>
          <p className="text-sm text-slate-500 dark:text-[#94a3b8]">
            Customers, suppliers and other parties. Each party is linked to a ledger under
            Trade Receivables or Trade Payables.
          </p>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────── */}
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

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="flex gap-5 items-start">
        {/* Table */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <ListSkeleton title="Parties" cols={4} rows={6} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#282832]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-[#1a1a24] dark:bg-[#16161f] dark:text-[#94a3b8]">
                    <th className="px-4 py-3 whitespace-nowrap">Name</th>
                    <th className="px-4 py-3 whitespace-nowrap">Type</th>
                    <th className="px-4 py-3 whitespace-nowrap">GSTIN</th>
                    <th className="px-4 py-3 whitespace-nowrap">Linked Ledger</th>
                    <th className="px-4 py-3 whitespace-nowrap">Actions</th>
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
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-[#f1f5f9]" title={p.name}>{p.name}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-500 dark:text-blue-400">
                            {typeLabel(p.party_type)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-[#cbd5e1] whitespace-nowrap" title={p.gstin ?? ""}>{p.gstin || "—"}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
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
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => openEdit(p)}
                              className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-[#1a1a24] dark:text-[#cbd5e1] dark:hover:bg-[#282832]"
                              title={`Edit ${p.name}`}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(p)}
                              disabled={deletingId === p.id}
                              className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
                              title={`Delete ${p.name}`}
                            >
                              {deletingId === p.id ? "…" : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Sidebar cards ──────────────────────────────────────────────── */}
        <div className="w-[300px] shrink-0 hidden lg:block self-start sticky top-4">
          <div className="space-y-4">

            {/* Party Summary */}
            {!loading && (
              <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
                <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">Party Summary</h3>
                <div className="space-y-1.5">
                  {[
                    { label: "Total", value: stats.total, color: "" },
                  ].map((r) => (
                    <div key={r.label} className="flex justify-between items-center">
                      <span className="text-slate-500 dark:text-[#94a3b8]">Total</span>
                      <span className="font-semibold text-slate-900 dark:text-[#f1f5f9]">{r.value}</span>
                    </div>
                  ))}
                </div>
                <hr className="border-slate-100 dark:border-[#282832]" />
                <div className="space-y-1.5">
                  {[
                    { label: "Customers", value: stats.customers, badge: "bg-blue-500" },
                    { label: "Suppliers", value: stats.suppliers, badge: "bg-emerald-500" },
                    { label: "Both", value: stats.both, badge: "bg-purple-500" },
                    { label: "Other", value: stats.other, badge: "bg-slate-400" },
                  ].filter((r) => r.value > 0).map((r) => (
                    <button
                      key={r.label}
                      onClick={() => setTypeFilter(r.label.toLowerCase() === "customers" ? "customer" : r.label.toLowerCase() === "suppliers" ? "supplier" : r.label.toLowerCase() === "both" ? "both" : "")}
                      className="flex justify-between items-center w-full text-left cursor-pointer rounded-md px-2 py-1 -mx-2 hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${r.badge}`} />
                        <span className="text-slate-600 dark:text-[#cbd5e1]">{r.label}</span>
                      </span>
                      <span className="font-medium text-slate-800 dark:text-[#f1f5f9]">{r.value}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* GSTIN Compliance */}
            {!loading && (
              <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
                <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">GSTIN Compliance</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-[#94a3b8]">Registered</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{stats.withGstin}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-[#94a3b8]">Unregistered</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">{stats.withoutGstin}</span>
                  </div>
                  {stats.total > 0 && (
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-[#282832] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${(stats.withGstin / stats.total) * 100}%` }}
                      />
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 dark:text-[#64748b] pt-0.5">
                    {stats.total > 0 ? Math.round((stats.withGstin / stats.total) * 100) : 0}% of parties have GSTIN
                  </p>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            {!loading && (
              <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
                <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">Quick Actions</h3>
                <button
                  onClick={openCreate}
                  className="flex items-center gap-2 w-full rounded-lg bg-brand-500/10 px-3 py-2 text-sm font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-500/20 cursor-pointer transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Create Party
                </button>
                <button
                  onClick={() => navigate("/chart-of-accounts")}
                  className="flex items-center gap-2 w-full rounded-lg bg-slate-100 dark:bg-[#1a1a24] px-3 py-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-200 dark:hover:bg-[#282832] cursor-pointer transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Chart of Accounts
                </button>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── Create / Edit Party Modal ────────────────────────────────────── */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setEditingParty(null); }} maxWidth="lg" panelClassName="p-5" label={editingParty ? "Edit Party" : "Create Party"}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-[#f1f5f9]">{editingParty ? "Edit Party" : "Create Party"}</h2>
              <button onClick={() => { setShowCreate(false); setEditingParty(null); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-[#94a3b8]">✕</button>
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
                onClick={saveParty}
                disabled={saving}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                {saving ? (editingParty ? "Saving..." : "Creating...") : (editingParty ? "Save Changes" : "Create Party")}
              </button>
            </div>
      </Modal>
    </div>
  );
}
