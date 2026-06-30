import { useEffect, useState, useMemo, useCallback } from "react";
import { api } from "../api/client";
import ContextMenu from "../components/ContextMenu";
import GroupForm from "../components/GroupForm";
import LedgerForm from "../components/LedgerForm";

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

export default function MastersPage() {
  const [tab, setTab] = useState<Tab>("groups");
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; group: AccountGroup } | null>(null);
  const [formState, setFormState] = useState<{
    type: "group" | "ledger";
    mode: "create" | "edit";
    data?: any;
    parentId?: string;
    parentName?: string;
  } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<AccountGroup[]>("/coa/groups"),
      api.get<Ledger[]>("/coa/ledgers"),
    ])
      .then(([g, l]) => { setGroups(g); setLedgers(l); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const handleGroupDelete = useCallback(async (g: AccountGroup) => {
    if (g.is_system) return;
    if (!confirm(`Delete group "${g.name}"?`)) return;
    try {
      await api.del(`/coa/groups/${g.id}`);
      load();
    } catch (err: any) {
      alert(err?.detail || "Failed to delete group");
    }
  }, [load]);

  const handleLedgerDelete = useCallback(async (l: Ledger) => {
    if (l.is_protected) return;
    if (!confirm(`Delete ledger "${l.name}"?`)) return;
    try {
      await api.del(`/coa/ledgers/${l.id}`);
      load();
    } catch (err: any) {
      alert(err?.detail || "Failed to delete ledger");
    }
  }, [load]);

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
              onClick={() => { setTab(t); setSearch(""); }}
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
          onClick={() => setFormState(tab === "groups"
            ? { type: "group", mode: "create" }
            : { type: "ledger", mode: "create" }
          )}
          className="ml-auto rounded-lg bg-brand-600 dark:bg-violet-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600 transition-colors"
        >
          {tab === "groups" ? "+ New Group" : "+ New Ledger"}
        </button>
      </div>

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
                <button onClick={() => setFormState({ type: "group", mode: "create" })} className="mt-3 rounded-lg bg-brand-600 dark:bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600 transition-colors">
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
                <button onClick={() => setFormState({ type: "ledger", mode: "create" })} className="mt-3 rounded-lg bg-brand-600 dark:bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600 transition-colors">
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
                          <button onClick={() => setFormState({ type: "ledger", mode: "edit", data: l })} className="text-xs text-slate-500 dark:text-[#94a3b8] hover:text-brand-600 dark:hover:text-violet-400 hover:underline transition-colors">
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
            { label: "Edit", onClick: () => setFormState({ type: "group", mode: "edit", data: ctxMenu.group }) },
            { label: "Create Ledger", onClick: () => setFormState({ type: "ledger", mode: "create", parentId: ctxMenu.group.id, parentName: ctxMenu.group.name }) },
            { label: "Create Subgroup", onClick: () => setFormState({ type: "group", mode: "create", parentId: ctxMenu.group.id, parentName: ctxMenu.group.name }),
              disabled: ctxMenu.group.group_type !== "primary" },
            { label: "Delete", onClick: () => handleGroupDelete(ctxMenu.group), danger: ctxMenu.group.is_system, disabled: ctxMenu.group.is_system },
          ]}
        />
      )}

      {/* Forms */}
      {formState?.type === "group" && (
        <GroupForm
          mode={formState.mode}
          initialValues={formState.mode === "edit" ? formState.data : undefined}
          parentGroupId={formState.parentId}
          parentGroupName={formState.parentName}
          primaryGroups={primaryGroups}
          onClose={() => setFormState(null)}
          onSaved={load}
        />
      )}
      {formState?.type === "ledger" && (
        <LedgerForm
          mode={formState.mode}
          initialValues={formState.mode === "edit" ? formState.data : undefined}
          groupId={formState.parentId}
          groupName={formState.parentName}
          primaryGroups={primaryGroups}
          subGroups={subGroups}
          onClose={() => setFormState(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
