import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import Select from "../components/Select";
import Modal from "../components/Modal";
import ListSkeleton from "./skeletons/ListSkeleton";
import PartyMasterForm, {
  partyTypeLabel,
  partyLedgerGroupLabel,
  partyValuesToPayload,
  type PartyMasterValues,
} from "../components/master/PartyMasterForm";

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
  credit_limit: number | null;
  maintain_bill_wise: boolean;
  opening_balance: number | null;
  opening_balance_type: string | null;
  outstanding_amount?: number | null;
}

export default function PartiesPage() {
  const navigate = useNavigate();
  const toast = useToastStore();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [limitFilter, setLimitFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [initialValues, setInitialValues] = useState<PartyMasterValues | undefined>();

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

  const openCreate = () => {
    setEditingParty(null);
    setInitialValues(undefined);
    setShowCreate(true);
  };

  const openEdit = (p: Party) => {
    setEditingParty(p);
    setInitialValues({
      name: p.name,
      party_type: p.party_type,
      gstin: p.gstin || "",
      state_code: p.state_code || "",
      pan: p.pan || "",
      contact_person: p.contact_person || "",
      phone: p.phone || "",
      email: p.email || "",
      address: p.address || "",
      credit_limit: p.credit_limit != null ? String(p.credit_limit) : "",
      maintain_bill_wise: p.maintain_bill_wise !== false,
      opening_balance: p.opening_balance != null ? String(p.opening_balance) : "",
      opening_balance_type: p.opening_balance_type || "Dr",
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

  const saveParty = async (values: PartyMasterValues) => {
    setSaving(true);
    try {
      const payload = partyValuesToPayload(values);
      if (editingParty) {
        await api.patch<Party>(`/coa/parties/${editingParty.id}`, payload);
        toast.success(`Updated ${payload.name}`);
      } else {
        await api.post<Party>("/coa/parties", payload);
        toast.success(`Created ${payload.name}`);
      }
      setShowCreate(false);
      setEditingParty(null);
      setInitialValues(undefined);
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
      if (limitFilter === "over" && !(p.credit_limit != null && (p.outstanding_amount ?? 0) > p.credit_limit)) return false;
      if (limitFilter === "within" && (p.credit_limit == null || (p.outstanding_amount ?? 0) > p.credit_limit)) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.gstin || "").toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [parties, typeFilter, limitFilter, search]);

  const typeOptions = useMemo(() => {
    const used = Array.from(new Set(parties.map((p) => p.party_type)));
    return [
      { value: "", label: "All Types" },
      ...used.map((t) => ({ value: t, label: partyTypeLabel(t) })),
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
        <div className="w-44">
          <Select
            value={limitFilter}
            onChange={setLimitFilter}
            options={[
              { value: "", label: "All Limits" },
              { value: "over", label: "⚠ Over Credit Limit" },
              { value: "within", label: "Within Credit Limit" },
            ]}
            placeholder="All Limits"
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
                    <th className="px-4 py-3 whitespace-nowrap">Opening Bal</th>
                    <th className="px-4 py-3 whitespace-nowrap">Credit Limit</th>
                    <th className="px-4 py-3 whitespace-nowrap">Outstanding</th>
                    <th className="px-4 py-3 whitespace-nowrap">Bill-wise</th>
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
                            {partyTypeLabel(p.party_type)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-[#cbd5e1] whitespace-nowrap" title={p.gstin ?? ""}>{p.gstin || "—"}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-[#cbd5e1]">
                          {p.opening_balance != null ? `${p.opening_balance.toLocaleString("en-IN")} ${p.opening_balance_type || ""}` : "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-[#cbd5e1]">
                          {p.credit_limit != null ? `₹${p.credit_limit.toLocaleString("en-IN")}` : "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {p.outstanding_amount != null && p.outstanding_amount > 0 ? (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                p.credit_limit != null && p.outstanding_amount > p.credit_limit
                                  ? "bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400"
                                  : "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                              }`}
                              title={
                                p.credit_limit != null && p.outstanding_amount > p.credit_limit
                                  ? `Outstanding exceeds credit limit of ₹${p.credit_limit.toLocaleString("en-IN")}`
                                  : "Open/partial bills"
                              }
                            >
                              {p.credit_limit != null && p.outstanding_amount > p.credit_limit && (
                                <span aria-hidden>⚠</span>
                              )}
                              ₹{p.outstanding_amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-[#64748b]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {p.maintain_bill_wise !== false ? (
                            <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">On</span>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-500/10 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Off</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {p.ledger_id ? (
                            <button
                              onClick={() => openLedger(p)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-[#1a1a24] dark:text-[#cbd5e1] dark:hover:bg-[#282832]"
                              title={`View ${p.name} in ${partyLedgerGroupLabel(p.party_type)}`}
                            >
                              <span className="text-slate-400 dark:text-[#64748b]">{partyLedgerGroupLabel(p.party_type)}</span>
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

      {/* ── Create / Edit Party Modal (Tally-style Party Master) ────────── */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setEditingParty(null); }} maxWidth="lg" panelClassName="p-5" label={editingParty ? "Edit Party Master" : "New Party Master"}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-[#f1f5f9]">{editingParty ? "Edit Party Master" : "New Party Master"}</h2>
          <button onClick={() => { setShowCreate(false); setEditingParty(null); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-[#94a3b8]">✕</button>
        </div>

        <PartyMasterForm
          key={editingParty?.id || "new"}
          mode={editingParty ? "edit" : "create"}
          initial={initialValues}
          submitLabel={editingParty ? "Save Changes" : "Create Party"}
          submitting={saving}
          onSubmit={saveParty}
          onCancel={() => { setShowCreate(false); setEditingParty(null); }}
        />
      </Modal>
    </div>
  );
}
