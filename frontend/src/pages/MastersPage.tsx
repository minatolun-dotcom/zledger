import { useEffect, useState } from "react";
import { api } from "../api/client";

interface AccountGroup {
  id: string;
  name: string;
  system_code: string | null;
  parent_id: string | null;
  group_type: string;
  nature: string;
  is_system: boolean;
}

interface Ledger {
  id: string;
  name: string;
  system_code: string | null;
  group_id: string;
  opening_balance: number;
  opening_balance_type: string;
  gstin: string | null;
  alias: string | null;
  is_active: boolean;
  is_protected: boolean;
}

type Tab = "groups" | "ledgers";

const NATURES = ["assets", "liabilities", "income", "expenses", "capital"];

export default function MastersPage() {
  const [tab, setTab] = useState<Tab>("groups");
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filterGroup, setFilterGroup] = useState("");

  const [grpForm, setGrpForm] = useState({ name: "", parent_id: "", nature: "assets", group_type: "sub" });
  const [ledForm, setLedForm] = useState({ name: "", group_id: "", opening_balance: 0, opening_balance_type: "Dr", gstin: "", alias: "" });

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<AccountGroup[]>("/coa/groups"),
      api.get<Ledger[]>("/coa/ledgers"),
    ])
      .then(([g, l]) => { setGroups(g); setLedgers(l); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const primaryGroups = groups.filter((g) => g.group_type === "primary");
  const subGroups = groups.filter((g) => g.group_type === "sub");

  const displayLedgers = filterGroup
    ? ledgers.filter((l) => {
        const grp = groups.find((g) => g.id === l.group_id);
        if (!grp) return false;
        return grp.parent_id === filterGroup || l.group_id === filterGroup;
      })
    : ledgers;

  const closeForm = () => { setShowForm(false); setEditingId(null); setError(""); };

  // ── Group handlers ──

  const openGroupCreate = () => {
    setEditingId(null);
    setGrpForm({ name: "", parent_id: "", nature: "assets", group_type: "sub" });
    setError("");
    setShowForm(true);
  };

  const openGroupEdit = (g: AccountGroup) => {
    setEditingId(g.id);
    setGrpForm({
      name: g.name,
      parent_id: g.parent_id ?? "",
      nature: g.nature,
      group_type: g.group_type,
    });
    setError("");
    setShowForm(true);
  };

  const handleGroupSubmit = async () => {
    if (!grpForm.name.trim()) { setError("Name is required"); return; }
    setError("");
    const body: any = {
      name: grpForm.name.trim(),
      nature: grpForm.nature,
      group_type: grpForm.group_type,
      parent_id: grpForm.parent_id || null,
    };
    try {
      if (editingId) {
        await api.patch(`/coa/groups/${editingId}`, body);
      } else {
        await api.post("/coa/groups", body);
      }
      closeForm();
      load();
    } catch (err: any) {
      setError(err?.detail || "Failed to save group");
    }
  };

  const handleGroupDelete = async (g: AccountGroup) => {
    if (g.is_system) { setError("Cannot delete system group"); return; }
    if (!confirm(`Delete group "${g.name}"?`)) return;
    try {
      await api.del(`/coa/groups/${g.id}`);
      load();
    } catch (err: any) {
      setError(err?.detail || "Failed to delete group");
    }
  };

  // ── Ledger handlers ──

  const openLedgerCreate = () => {
    setEditingId(null);
    setLedForm({ name: "", group_id: "", opening_balance: 0, opening_balance_type: "Dr", gstin: "", alias: "" });
    setError("");
    setShowForm(true);
  };

  const openLedgerEdit = (l: Ledger) => {
    setEditingId(l.id);
    setLedForm({
      name: l.name,
      group_id: l.group_id,
      opening_balance: l.opening_balance,
      opening_balance_type: l.opening_balance_type,
      gstin: l.gstin ?? "",
      alias: l.alias ?? "",
    });
    setError("");
    setShowForm(true);
  };

  const handleLedgerSubmit = async () => {
    if (!ledForm.name.trim() || !ledForm.group_id) { setError("Name and group are required"); return; }
    setError("");
    const body = {
      name: ledForm.name.trim(),
      group_id: ledForm.group_id,
      opening_balance: ledForm.opening_balance || 0,
      opening_balance_type: ledForm.opening_balance_type,
      gstin: ledForm.gstin || null,
      alias: ledForm.alias || null,
    };
    try {
      if (editingId) {
        await api.patch(`/coa/ledgers/${editingId}`, body);
      } else {
        await api.post("/coa/ledgers", body);
      }
      closeForm();
      load();
    } catch (err: any) {
      setError(err?.detail || "Failed to save ledger");
    }
  };

  const handleLedgerDelete = async (l: Ledger) => {
    if (l.is_protected) { setError("Cannot delete system ledger"); return; }
    if (!confirm(`Delete ledger "${l.name}"?`)) return;
    try {
      await api.del(`/coa/ledgers/${l.id}`);
      load();
    } catch (err: any) {
      setError(err?.detail || "Failed to delete ledger");
    }
  };

  // Group tree: nest sub-groups under primary groups
  const groupTree = primaryGroups.map((pg) => ({
    ...pg,
    children: subGroups.filter((sg) => sg.parent_id === pg.id),
  }));

  return (
    <div>
      <div className="flex items-center gap-4 border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Masters</h2>
        <div className="flex gap-1">
          {(["groups", "ledgers"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); closeForm(); }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === t
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#252530]"
              }`}
            >
              {t === "groups" ? "Account Groups" : "Ledgers"}
            </button>
          ))}
        </div>
        <button
          onClick={tab === "groups" ? openGroupCreate : openLedgerCreate}
          className="ml-auto rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          {tab === "groups" ? "+ New Group" : "+ New Ledger"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      {/* ── Group Form ── */}
      {showForm && tab === "groups" && (
        <div className="mt-4 rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-[#f1f5f9]">{editingId ? "Edit Group" : "New Group"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Name *</label>
              <input type="text" value={grpForm.name} onChange={(e) => setGrpForm({ ...grpForm, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm dark:bg-[#252530] dark:text-[#f1f5f9]" placeholder="e.g. Rent Expense" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Nature *</label>
              <select value={grpForm.nature} onChange={(e) => setGrpForm({ ...grpForm, nature: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm dark:bg-[#252530] dark:text-[#f1f5f9]">
                {NATURES.map((n) => <option key={n} value={n}>{n.charAt(0).toUpperCase() + n.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Type</label>
              <select value={grpForm.group_type} onChange={(e) => setGrpForm({ ...grpForm, group_type: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm dark:bg-[#252530] dark:text-[#f1f5f9]">
                <option value="primary">Primary</option>
                <option value="sub">Sub-group</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Parent Group</label>
              <select value={grpForm.parent_id} onChange={(e) => setGrpForm({ ...grpForm, parent_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm dark:bg-[#252530] dark:text-[#f1f5f9]" disabled={grpForm.group_type === "primary"}>
                <option value="">None (top-level)</option>
                {primaryGroups.map((pg) => (
                  <option key={pg.id} value={pg.id}>{pg.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleGroupSubmit}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
              {editingId ? "Save Changes" : "Create Group"}
            </button>
            <button onClick={closeForm}
              className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Ledger Form ── */}
      {showForm && tab === "ledgers" && (
        <div className="mt-4 rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-[#f1f5f9]">{editingId ? "Edit Ledger" : "New Ledger"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Name *</label>
              <input type="text" value={ledForm.name} onChange={(e) => setLedForm({ ...ledForm, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm dark:bg-[#252530] dark:text-[#f1f5f9]" placeholder="e.g. Rent Expense" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Group *</label>
              <select value={ledForm.group_id} onChange={(e) => setLedForm({ ...ledForm, group_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm dark:bg-[#252530] dark:text-[#f1f5f9]">
                <option value="">Select group</option>
                {groupTree.map((pg) => (
                  <optgroup key={pg.id} label={`${pg.name} (${pg.nature})`}>
                    {pg.children.map((sg) => (
                      <option key={sg.id} value={sg.id}>{sg.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Opening Balance</label>
              <input type="number" step="0.01" value={ledForm.opening_balance}
                onChange={(e) => setLedForm({ ...ledForm, opening_balance: parseFloat(e.target.value) || 0 })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm dark:bg-[#252530] dark:text-[#f1f5f9]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Balance Type</label>
              <select value={ledForm.opening_balance_type}
                onChange={(e) => setLedForm({ ...ledForm, opening_balance_type: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm dark:bg-[#252530] dark:text-[#f1f5f9]">
                <option value="Dr">Dr (Debit)</option>
                <option value="Cr">Cr (Credit)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Alias</label>
              <input type="text" value={ledForm.alias} onChange={(e) => setLedForm({ ...ledForm, alias: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm dark:bg-[#252530] dark:text-[#f1f5f9]" placeholder="Optional" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">GSTIN</label>
              <input type="text" value={ledForm.gstin} onChange={(e) => setLedForm({ ...ledForm, gstin: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm dark:bg-[#252530] dark:text-[#f1f5f9]" placeholder="Optional" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleLedgerSubmit}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
              {editingId ? "Save Changes" : "Create Ledger"}
            </button>
            <button onClick={closeForm}
              className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-[#94a3b8]">Loading...</p>
      ) : tab === "groups" ? (
        <div className="mt-4 space-y-3">
          {groupTree.map((pg) => (
            <div key={pg.id} className="rounded-xl border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-800 dark:text-[#f1f5f9]">{pg.name}</h3>
                  <span className="rounded-full bg-slate-100 dark:bg-[#252530] px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-[#94a3b8] uppercase">{pg.nature}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openGroupEdit(pg)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#252530] hover:text-brand-600"
                    title={pg.is_system ? "Rename display name" : "Edit group"}>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                  {!pg.is_system && (
                    <button onClick={() => handleGroupDelete(pg)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 dark:text-[#94a3b8] hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                      title="Delete group">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {pg.children.map((sg) => (
                  <span key={sg.id} className="group relative inline-flex items-center rounded-full border border-slate-200 dark:border-[#252530] bg-slate-50 dark:bg-[#252530] px-2.5 py-1 text-xs text-slate-600 dark:text-[#cbd5e1]">
                    {sg.name}
                    <button onClick={() => openGroupEdit(sg)}
                      className="ml-1 text-slate-400 dark:text-[#64748b] hover:text-brand-600 dark:hover:text-brand-400" title={sg.is_system ? "Rename" : "Edit"}>
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                      </svg>
                    </button>
                    {!sg.is_system && (
                      <button onClick={() => handleGroupDelete(sg)}
                        className="text-slate-400 dark:text-[#64748b] hover:text-red-600 dark:hover:text-red-400" title="Delete">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </span>
                ))}
                {pg.children.length === 0 && (
                  <span className="text-xs text-slate-400 dark:text-[#64748b] italic">No sub-groups</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <div className="mb-3">
            <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm dark:bg-[#252530] dark:text-[#f1f5f9]">
              <option value="">All groups</option>
              {primaryGroups.map((pg) => <option key={pg.id} value={pg.id}>{pg.name}</option>)}
            </select>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1e1e28] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                <th className="pb-2">Name</th>
                <th className="pb-2">Group</th>
                <th className="pb-2 text-right">Opening Bal</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayLedgers.map((l) => {
                const group = groups.find((g) => g.id === l.group_id);
                return (
                  <tr key={l.id} className="border-b border-slate-100 dark:border-[#1e1e28]">
                    <td className="py-2 font-medium text-slate-900 dark:text-[#f1f5f9]">
                      {l.name}
                      {l.is_protected && (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:text-amber-400" title="System ledger — display name can be changed">
                          SYSTEM
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{group?.name ?? "—"}</td>
                    <td className="py-2 text-right">
                      {l.opening_balance > 0
                        ? `${l.opening_balance_type} ${l.opening_balance.toLocaleString("en-IN")}`
                        : "—"}
                    </td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        l.is_active ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400"
                      }`}>
                        {l.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <div className="inline-flex gap-2">
                        <button onClick={() => openLedgerEdit(l)} className="text-xs text-slate-500 dark:text-[#94a3b8] hover:text-brand-600 dark:hover:text-brand-400 hover:underline">
                          {l.is_protected ? "Edit Balance" : "Edit"}
                        </button>
                        {!l.is_protected && (
                          <button onClick={() => handleLedgerDelete(l)} className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:underline">Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {displayLedgers.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-slate-400 dark:text-[#64748b]">
                  {filterGroup ? "No ledgers in this group." : "No ledgers yet."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
