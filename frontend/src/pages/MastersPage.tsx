import { useEffect, useState, useMemo } from "react";
import { api } from "../api/client";
import ContextMenu from "../components/ContextMenu";

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
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filterGroup, setFilterGroup] = useState("");

  const [grpForm, setGrpForm] = useState({ name: "", parent_id: "", nature: "assets", group_type: "sub" });
  const [ledForm, setLedForm] = useState({ name: "", group_id: "", opening_balance: 0, opening_balance_type: "Dr", gstin: "", alias: "" });
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; group: AccountGroup } | null>(null);

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

  const primaryGroups = useMemo(() => groups.filter((g) => g.group_type === "primary"), [groups]);
  const subGroups = useMemo(() => groups.filter((g) => g.group_type === "sub"), [groups]);

  const searchLower = search.toLowerCase();

  const filteredGroups = useMemo(() => {
    if (!searchLower) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(searchLower));
  }, [groups, searchLower]);

  const displayLedgers = useMemo(() => {
    let result = filterGroup
      ? ledgers.filter((l) => {
          const grp = groups.find((g) => g.id === l.group_id);
          if (!grp) return false;
          return grp.parent_id === filterGroup || l.group_id === filterGroup;
        })
      : ledgers;
    if (searchLower) {
      result = result.filter((l) => l.name.toLowerCase().includes(searchLower));
    }
    return result;
  }, [ledgers, groups, filterGroup, searchLower]);

  const closeForm = () => { setShowForm(false); setEditingId(null); setError(""); };

  // ── Group handlers ──

  const openGroupCreate = () => {
    setEditingId(null);
    setGrpForm({ name: "", parent_id: "", nature: "assets", group_type: "sub" });
    setError("");
    setShowForm(true);
  };

  const openGroupCreateUnder = (parentId: string) => {
    setEditingId(null);
    setGrpForm({ name: "", parent_id: parentId, nature: "assets", group_type: "sub" });
    setError("");
    setShowForm(true);
  };

  const openLedgerCreateForGroup = (groupId: string) => {
    setTab("ledgers");
    setEditingId(null);
    setLedForm({ name: "", group_id: groupId, opening_balance: 0, opening_balance_type: "Dr", gstin: "", alias: "" });
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

  // Group tree for ledger form dropdown
  const groupTree = primaryGroups.map((pg) => ({
    ...pg,
    children: subGroups.filter((sg) => sg.parent_id === pg.id),
  }));

  // Count ledgers per group
  const ledgerCountByGroup = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of ledgers) {
      counts[l.group_id] = (counts[l.group_id] || 0) + 1;
    }
    return counts;
  }, [ledgers]);

  return (
    <div>
      <div className="flex items-center gap-4 border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Masters</h2>
          <p className="text-xs text-slate-500 dark:text-[#94a3b8]">{groups.length} groups · {ledgers.length} ledgers</p>
        </div>
        <div className="flex gap-1 ml-2">
          {(["groups", "ledgers"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); closeForm(); setSearch(""); }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-brand-600 dark:bg-violet-500 text-white"
                  : "text-slate-600 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#252530]"
              }`}
            >
              {t === "groups" ? "Account Groups" : "Ledgers"}
            </button>
          ))}
        </div>
        <button
          onClick={tab === "groups" ? openGroupCreate : openLedgerCreate}
          className="ml-auto rounded-lg bg-brand-600 dark:bg-violet-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600 transition-colors"
        >
          {tab === "groups" ? "+ New Group" : "+ New Ledger"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      {/* ── Group Form ── */}
      {showForm && tab === "groups" && (
        <div className="mt-4 rounded-xl border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4 shadow-sm">
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-[#f1f5f9]">{editingId ? "Edit Group" : "New Group"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Name *</label>
              <input type="text" value={grpForm.name} onChange={(e) => setGrpForm({ ...grpForm, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm" placeholder="e.g. Rent Expense" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Nature *</label>
              <select value={grpForm.nature} onChange={(e) => setGrpForm({ ...grpForm, nature: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm">
                {NATURES.map((n) => <option key={n} value={n}>{n.charAt(0).toUpperCase() + n.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Type</label>
              <select value={grpForm.group_type} onChange={(e) => setGrpForm({ ...grpForm, group_type: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm">
                <option value="primary">Primary</option>
                <option value="sub">Sub-group</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Parent Group</label>
              <select value={grpForm.parent_id} onChange={(e) => setGrpForm({ ...grpForm, parent_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm" disabled={grpForm.group_type === "primary"}>
                <option value="">None (top-level)</option>
                {primaryGroups.map((pg) => (
                  <option key={pg.id} value={pg.id}>{pg.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleGroupSubmit}
              className="rounded-lg bg-brand-600 dark:bg-violet-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600 transition-colors">
              {editingId ? "Save Changes" : "Create Group"}
            </button>
            <button onClick={closeForm}
              className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Ledger Form ── */}
      {showForm && tab === "ledgers" && (
        <div className="mt-4 rounded-xl border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4 shadow-sm">
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-[#f1f5f9]">{editingId ? "Edit Ledger" : "New Ledger"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Name *</label>
              <input type="text" value={ledForm.name} onChange={(e) => setLedForm({ ...ledForm, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm" placeholder="e.g. Rent Expense" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Group *</label>
              <select value={ledForm.group_id} onChange={(e) => setLedForm({ ...ledForm, group_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm">
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
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Balance Type</label>
              <select value={ledForm.opening_balance_type}
                onChange={(e) => setLedForm({ ...ledForm, opening_balance_type: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm">
                <option value="Dr">Dr (Debit)</option>
                <option value="Cr">Cr (Credit)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Alias</label>
              <input type="text" value={ledForm.alias} onChange={(e) => setLedForm({ ...ledForm, alias: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm" placeholder="Optional" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">GSTIN</label>
              <input type="text" value={ledForm.gstin} onChange={(e) => setLedForm({ ...ledForm, gstin: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm" placeholder="Optional" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleLedgerSubmit}
              className="rounded-lg bg-brand-600 dark:bg-violet-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600 transition-colors">
              {editingId ? "Save Changes" : "Create Ledger"}
            </button>
            <button onClick={closeForm}
              className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search + Filter bar */}
      <div className="mt-3 flex items-center gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-[#64748b]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${tab}...`}
            className="w-full rounded-lg border border-slate-200 dark:border-[#252530] bg-white dark:bg-[#111118] py-2 pl-9 pr-3 text-sm text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#94a3b8]">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {tab === "ledgers" && (
          <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-[#252530] bg-white dark:bg-[#111118] px-3 py-2 text-sm text-slate-700 dark:text-[#cbd5e1]">
            <option value="">All groups</option>
            {primaryGroups.map((pg) => <option key={pg.id} value={pg.id}>{pg.name}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-[#94a3b8]">Loading...</p>
      ) : tab === "groups" ? (
        <div className="mt-3 rounded-xl border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f]">
          {filteredGroups.length === 0 ? (
            <div className="p-8 text-center">
              <svg className="mx-auto h-10 w-10 text-slate-300 dark:text-[#252530]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
              <p className="mt-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1]">
                {search ? `No groups matching "${search}"` : "No account groups yet."}
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-[#64748b]">
                {search ? "Try a different search term." : "Account groups organize your ledgers into categories."}
              </p>
              {!search && (
                <button onClick={openGroupCreate} className="mt-3 rounded-lg bg-brand-600 dark:bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600 transition-colors">
                  + Create Group
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-[#1e1e28]">
              {filteredGroups.map((g) => {
                const count = ledgerCountByGroup[g.id] || 0;
                const childSubGroups = g.group_type === "primary"
                  ? subGroups.filter((sg) => sg.parent_id === g.id)
                  : [];
                return (
                  <div key={g.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-[#1e1e28] transition-colors">
                    <svg className="h-4 w-4 shrink-0 text-slate-400 dark:text-[#64748b]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d={
                        g.group_type === "primary"
                          ? "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25z"
                          : "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                      } />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${g.group_type === "primary" ? "font-semibold text-slate-800 dark:text-[#f1f5f9]" : "font-medium text-slate-700 dark:text-[#cbd5e1]"}`}>
                          {g.name}
                        </span>
                        <span className="rounded bg-slate-100 dark:bg-[#252530] px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:text-[#94a3b8] uppercase">
                          {g.nature}
                        </span>
                        {g.is_system && (
                          <span title="System group">
                            <svg className="h-3.5 w-3.5 text-slate-400 dark:text-[#64748b]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                            </svg>
                          </span>
                        )}
                      </div>
                      {childSubGroups.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {childSubGroups.map((sg) => (
                            <span key={sg.id} className="inline-flex items-center gap-1 rounded bg-slate-50 dark:bg-[#252530] px-1.5 py-0.5 text-[11px] text-slate-500 dark:text-[#94a3b8]">
                              {sg.name}
                              {ledgerCountByGroup[sg.id] ? ` (${ledgerCountByGroup[sg.id]})` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {count > 0 && (
                      <span className="text-xs tabular-nums text-slate-400 dark:text-[#64748b]">
                        {count} {count === 1 ? "ledger" : "ledgers"}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, group: g }); }}
                      className="rounded-md px-1.5 py-1 text-slate-400 dark:text-[#64748b] hover:bg-slate-100 dark:hover:bg-[#252530] hover:text-slate-600 dark:hover:text-[#94a3b8] transition-colors"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f]">
          {displayLedgers.length === 0 ? (
            <div className="p-8 text-center">
              <svg className="mx-auto h-10 w-10 text-slate-300 dark:text-[#252530]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
              <p className="mt-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1]">
                {search ? `No ledgers matching "${search}"` : filterGroup ? "No ledgers in this group." : "No ledgers yet."}
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-[#64748b]">
                {search ? "Try a different search term." : filterGroup ? "Create a ledger under this group." : "Ledgers are individual accounts used to record transactions."}
              </p>
              {!search && !filterGroup && (
                <button onClick={openLedgerCreate} className="mt-3 rounded-lg bg-brand-600 dark:bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600 transition-colors">
                  + Create Ledger
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#1e1e28] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Group</th>
                  <th className="px-4 py-2.5 text-right">Opening Balance</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1e1e28]">
                {displayLedgers.map((l) => {
                  const group = groups.find((g) => g.id === l.group_id);
                  return (
                    <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-[#1e1e28] transition-colors">
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-[#f1f5f9]">
                        <div className="flex items-center gap-1.5">
                          {l.name}
                          {l.is_protected && (
                            <span title="System ledger">
                              <svg className="h-3.5 w-3.5 text-slate-400 dark:text-[#64748b]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                              </svg>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-[#94a3b8]">{group?.name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {l.opening_balance > 0
                          ? <span className="text-slate-700 dark:text-[#cbd5e1]">{l.opening_balance_type} {l.opening_balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                          : <span className="text-slate-400 dark:text-[#64748b]">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${
                          l.is_active ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400"
                        }`}>
                          {l.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex gap-2">
                          <button onClick={() => openLedgerEdit(l)} className="text-xs text-slate-500 dark:text-[#94a3b8] hover:text-brand-600 dark:hover:text-violet-400 hover:underline transition-colors">
                            {l.is_protected ? "Edit Balance" : "Edit"}
                          </button>
                          {!l.is_protected && (
                            <button onClick={() => handleLedgerDelete(l)} className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:underline transition-colors">Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            { label: "Edit", onClick: () => openGroupEdit(ctxMenu.group) },
            { label: "Create Ledger", onClick: () => openLedgerCreateForGroup(ctxMenu.group.id) },
            { label: "Create Subgroup", onClick: () => openGroupCreateUnder(ctxMenu.group.id), disabled: ctxMenu.group.group_type !== "primary" },
            { label: "Delete", onClick: () => handleGroupDelete(ctxMenu.group), danger: ctxMenu.group.is_system, disabled: ctxMenu.group.is_system },
          ]}
        />
      )}
    </div>
  );
}
