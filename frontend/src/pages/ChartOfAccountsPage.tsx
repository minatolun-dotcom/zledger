import { useEffect, useState, useMemo, useCallback } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import ContextMenu from "../components/ContextMenu";
import GroupForm from "../components/GroupForm";
import LedgerForm from "../components/LedgerForm";
import Select from "../components/Select";
import { useRole } from "../hooks/useRole";
import { showConfirm } from "../components/ConfirmDialog";
import { CoaSkeleton } from "./skeletons";

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
  is_protected: boolean;
  is_active: boolean;
}

interface TreeNode {
  type: "root" | "group" | "ledger";
  id: string;
  name: string;
  nature?: string;
  children: TreeNode[];
  ledgerCount: number;
  subgroupCount: number;
  data: AccountGroup | Ledger;
}

const EXPANDED_KEY = "zledger.coa.expanded";
const BALANCES_KEY = "zledger.coa.balances";

const NATURE_ICONS: Record<string, string> = {
  assets: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008V10.5zm0 3h.008v.008h-.008V13.5zm0 3h.008v.008h-.008V16.5z",
  liabilities: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v-.75A.75.75 0 014.5 3h1.5a.75.75 0 01.75.75v.75M3.75 4.5h16.5M3.75 4.5v12.75M21 4.5v12.75M12 4.5v12.75M4.5 15.75h15m-12.75 3h10.5",
  income: "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  expenses: "M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z",
  capital: "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z",
};

export default function ChartOfAccountsPage() {
  const { canEdit } = useRole();
  const toast = useToastStore();
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showBalances, setShowBalances] = useState(() => {
    try { return localStorage.getItem(BALANCES_KEY) === "true"; } catch { return false; }
  });
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(EXPANDED_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null);
  const [filterGroup, setFilterGroup] = useState("");
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

  useEffect(() => {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
  }, [expanded]);

  useEffect(() => {
    localStorage.setItem(BALANCES_KEY, String(showBalances));
  }, [showBalances]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allIds = new Set(groups.map((g) => g.id));
    setExpanded(allIds);
  }, [groups]);

  const collapseAll = useCallback(() => { setExpanded(new Set()); }, []);

  const primaryGroups = useMemo(() => groups.filter((g) => g.group_type === "primary"), [groups]);
  const subGroups = useMemo(() => groups.filter((g) => g.group_type === "sub"), [groups]);

  const groupLedgers = useCallback(
    (groupId: string) => ledgers.filter((l) => l.group_id === groupId && l.is_active),
    [ledgers]
  );

  const childGroups = useCallback(
    (parentId: string) => subGroups.filter((sg) => sg.parent_id === parentId),
    [subGroups]
  );

  const filteredPrimaryGroups = useMemo(
    () => filterGroup ? primaryGroups.filter((pg) => pg.id === filterGroup) : primaryGroups,
    [primaryGroups, filterGroup]
  );

  const tree: TreeNode[] = useMemo(() => {
    return filteredPrimaryGroups.map((pg) => {
      const children: TreeNode[] = [];
      const sgList = childGroups(pg.id);
      let totalChildLedgers = 0;
      for (const sg of sgList) {
        const sgLedgers = groupLedgers(sg.id);
        totalChildLedgers += sgLedgers.length;
        children.push({
          type: "group",
          id: sg.id,
          name: sg.name,
          children: sgLedgers.map((l) => ({
            type: "ledger" as const,
            id: l.id,
            name: l.name,
            children: [],
            ledgerCount: 0,
            subgroupCount: 0,
            data: l,
          })),
          ledgerCount: sgLedgers.length,
          subgroupCount: 0,
          data: sg,
        });
      }
      const directLedgers = groupLedgers(pg.id);
      for (const l of directLedgers) {
        children.push({
          type: "ledger",
          id: l.id,
          name: l.name,
          children: [],
          ledgerCount: 0,
          subgroupCount: 0,
          data: l,
        });
      }
      return {
        type: "root" as const,
        id: pg.id,
        name: pg.name,
        nature: pg.nature,
        children,
        ledgerCount: directLedgers.length + totalChildLedgers,
        subgroupCount: sgList.length,
        data: pg,
      };
    });
  }, [filteredPrimaryGroups, childGroups, groupLedgers]);

  const searchLower = search.toLowerCase();
  const matchIds = useMemo(() => {
    if (!searchLower) return new Set<string>();
    const ids = new Set<string>();
    for (const g of groups) {
      if (g.name.toLowerCase().includes(searchLower)) {
        ids.add(g.id);
        let pid = g.parent_id;
        while (pid) {
          ids.add(pid);
          const parent = groups.find((pg) => pg.id === pid);
          pid = parent?.parent_id ?? null;
        }
      }
    }
    for (const l of ledgers) {
      if (l.name.toLowerCase().includes(searchLower)) {
        ids.add(l.id);
        const grp = groups.find((g) => g.id === l.group_id);
        if (grp) { ids.add(grp.id); if (grp.parent_id) ids.add(grp.parent_id); }
      }
    }
    return ids;
  }, [searchLower, groups, ledgers]);

  useEffect(() => {
    if (searchLower && matchIds.size > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        matchIds.forEach((id) => { if (groups.some((g) => g.id === id)) next.add(id); });
        return next;
      });
    }
  }, [searchLower, matchIds, groups]);

  const isMatch = (id: string) => !searchLower || matchIds.has(id);

  const openCtxMenu = (e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, node });
  };

  const handleGroupDelete = useCallback(async (group: AccountGroup) => {
    if (group.is_system) return;
    if (!await showConfirm(`Delete group "${group.name}"?`, { danger: true, confirmLabel: "Delete" })) return;
    try {
      await api.del(`/coa/groups/${group.id}`);
      load();
      toast.success(`Group "${group.name}" deleted`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete group");
    }
  }, [load]);

  const handleLedgerDelete = useCallback(async (ledger: Ledger) => {
    if (ledger.is_protected) return;
    if (!await showConfirm(`Delete ledger "${ledger.name}"?`, { danger: true, confirmLabel: "Delete" })) return;
    try {
      await api.del(`/coa/ledgers/${ledger.id}`);
      load();
      toast.success(`Ledger "${ledger.name}" deleted`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete ledger");
    }
  }, [load]);

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const match = isMatch(node.id);
    const indent = depth * 20;

    if (node.type === "ledger") {
      const l = node.data as Ledger;
      if (searchLower && !match) return null;
      return (
        <div
          key={node.id}
          onContextMenu={(e) => openCtxMenu(e, node)}
          className={`coa-row grid items-center py-1.5 px-3 rounded-lg cursor-pointer transition-colors ${
            searchLower && match
              ? "bg-brand-50 dark:bg-violet-500/10"
              : "hover:bg-slate-50 dark:hover:bg-[#1e1e28]"
          }`}
          style={{ paddingLeft: `${indent + 28}px` }}
        >
          {/* Name */}
          <div className="flex items-center gap-2 min-w-0">
            <svg className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-[#64748b]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className={`truncate text-[13px] ${searchLower && match ? "font-semibold text-brand-700 dark:text-violet-400" : "text-slate-800 dark:text-[#cbd5e1]"}`}>
              {l.name}
            </span>
            {l.is_protected && (
              <span title="System ledger">
                <svg className="h-3 w-3 shrink-0 text-slate-400 dark:text-[#64748b]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </span>
            )}
          </div>
          {/* Status */}
          <div className="flex justify-end">
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              l.is_active ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400"
            }`}>
              {l.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          {/* Count — empty for ledgers */}
          <div />
          {/* Balance */}
          <div className="text-right text-[12px] tabular-nums text-slate-600 dark:text-[#94a3b8]">
            {showBalances && l.opening_balance > 0
              ? `₹${l.opening_balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })} ${l.opening_balance_type}`
              : "\u00A0"}
          </div>
        </div>
      );
    }

    // Group node
    if (searchLower && !match) {
      const hasMatchDescendant = node.children.some((c) => {
        if (c.type === "ledger") return matchIds.has(c.id);
        return matchIds.has(c.id) || c.children.some((cc) => matchIds.has(cc.id));
      });
      if (!hasMatchDescendant) return null;
    }

    const childSubgroupCount = node.type === "root" ? node.subgroupCount : 0;
    const isRoot = node.type === "root";
    const isEmpty = isExpanded && !hasChildren;

    return (
      <div key={node.id}>
        <div
          onClick={() => toggle(node.id)}
          onContextMenu={(e) => openCtxMenu(e, node)}
          className={`coa-row grid items-center py-1.5 px-3 rounded-lg cursor-pointer transition-colors ${
            searchLower && match
              ? "bg-brand-50 dark:bg-violet-500/10"
              : "hover:bg-slate-50 dark:hover:bg-[#1e1e28]"
          }`}
          style={{ paddingLeft: `${indent + 8}px` }}
        >
          {/* Name */}
          <div className="flex items-center gap-2 min-w-0">
            <svg
              className={`h-3 w-3 shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""} text-slate-400 dark:text-[#64748b]`}
              fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            {isRoot ? (
              <svg className="h-4 w-4 shrink-0 text-slate-500 dark:text-[#94a3b8]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d={NATURE_ICONS[node.nature ?? "assets"] ?? NATURE_ICONS.assets} />
              </svg>
            ) : (
              <svg className="h-4 w-4 shrink-0 text-slate-400 dark:text-[#64748b]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
            )}
            <span className={`truncate text-[13px] ${isRoot ? "font-semibold text-slate-900 dark:text-[#f1f5f9]" : "font-medium text-slate-700 dark:text-[#cbd5e1]"}`}>
              {node.name}
            </span>
            {isRoot && node.nature && (
              <span className="shrink-0 rounded bg-slate-100 dark:bg-[#252530] px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:text-[#94a3b8] uppercase">
                {node.nature}
              </span>
            )}
          </div>
          {/* Status — empty for groups */}
          <div />
          {/* Count */}
          <div className="text-right text-[12px] text-slate-500 dark:text-[#64748b]">
            {(() => {
              const parts: string[] = [];
              if (childSubgroupCount > 0) parts.push(`${childSubgroupCount} Groups`);
              if (node.ledgerCount > 0) parts.push(`${node.ledgerCount} Ledgers`);
              return parts.length > 0 ? parts.join(" · ") : "\u00A0";
            })()}
          </div>
          {/* Balance — empty for groups */}
          <div />
        </div>
        {isExpanded && hasChildren && (
          <div className="animate-in slide-in-from-top-1 duration-100">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
        {isEmpty && (
          <div className="py-2 px-3" style={{ paddingLeft: `${(depth + 1) * 20 + 28}px` }}>
            <p className="text-[12px] italic text-slate-400 dark:text-[#475569]">No ledgers in this group.</p>
          </div>
        )}
      </div>
    );
  };

  const totalGroups = groups.filter((g) => g.group_type === "primary").length;
  const totalSubGroups = subGroups.length;
  const totalLedgers = ledgers.filter((l) => l.is_active).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Chart of Accounts</h2>
          <p className="text-xs text-slate-500 dark:text-[#94a3b8]">{totalGroups} groups · {totalSubGroups} subgroups · {totalLedgers} ledgers</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => setFormState(filterGroup
                ? { type: "ledger", mode: "create", parentId: filterGroup, parentName: primaryGroups.find((g) => g.id === filterGroup)?.name }
                : { type: "group", mode: "create" }
              )}
              className="rounded-lg bg-brand-600 dark:bg-violet-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600 transition-colors"
            >
              {filterGroup ? "+ New Ledger" : "+ New"}
            </button>
          )}
          <button
            onClick={() => setShowBalances(!showBalances)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              showBalances
                ? "border-brand-600 dark:border-violet-500/50 bg-brand-50 dark:bg-violet-500/10 text-brand-700 dark:text-violet-400"
                : "border-slate-200 dark:border-[#252530] text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
            }`}
          >
            {showBalances ? "Hide Balances" : "Show Balances"}
          </button>
          <button onClick={expandAll} className="rounded-lg border border-slate-200 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530] transition-colors">
            Expand All
          </button>
          <button onClick={collapseAll} className="rounded-lg border border-slate-200 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530] transition-colors">
            Collapse All
          </button>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="mt-3 flex items-center gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-[#64748b]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups and ledgers..."
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
        <Select
          value={filterGroup}
          onChange={setFilterGroup}
          options={[{ value: "", label: "All Groups" }, ...primaryGroups.map((g) => ({ value: g.id, label: g.name }))]}
          className="w-48"
        />
      </div>

      {/* Column Headers */}
      {!loading && tree.length > 0 && (
        <div className="coa-row grid items-center mt-4 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#475569]">
          <div>Name</div>
          <div className="text-right">Status</div>
          <div className="text-right">Count</div>
          <div className="text-right">Balance</div>
        </div>
      )}

      {/* Tree */}
      {loading ? (
        <CoaSkeleton />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] divide-y divide-slate-100 dark:divide-[#1e1e28]">
          {tree.map((node) => renderNode(node))}
          {tree.length === 0 && (
            <div className="p-8 text-center">
              <svg className="mx-auto h-10 w-10 text-slate-300 dark:text-[#252530]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
              <p className="mt-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1]">No account groups found.</p>
              <p className="mt-1 text-xs text-slate-400 dark:text-[#64748b]">Account groups are created automatically when you set up your company.</p>
            </div>
          )}
          {searchLower && tree.length > 0 && tree.every((n) => !isMatch(n.id) && n.children.every((c) => !isMatch(c.id))) && (
            <div className="p-8 text-center">
              <svg className="mx-auto h-10 w-10 text-slate-300 dark:text-[#252530]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <p className="mt-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1]">No results for "{search}"</p>
              <p className="mt-1 text-xs text-slate-400 dark:text-[#64748b]">Try a different search term.</p>
            </div>
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
            ...(ctxMenu.node.type === "ledger" ? [
              ...(canEdit ? [{ label: "Edit", onClick: () => setFormState({ type: "ledger", mode: "edit", data: ctxMenu.node.data }) }] : []),
            ] : [
              ...(canEdit ? [{ label: "Edit", onClick: () => setFormState({ type: "group", mode: "edit", data: ctxMenu.node.data }) }] : []),
              ...(canEdit ? [{ label: "Create Ledger", onClick: () => setFormState({ type: "ledger", mode: "create", parentId: ctxMenu.node.id, parentName: ctxMenu.node.name }) }] : []),
              ...(canEdit ? [{ label: "Create Subgroup", onClick: () => setFormState({ type: "group", mode: "create", parentId: ctxMenu.node.id, parentName: ctxMenu.node.name }),
                disabled: ctxMenu.node.type !== "root" }] : []),
            ]),
            ...(canEdit ? [{ label: "Delete", onClick: () => {
              if (ctxMenu.node.type === "ledger") handleLedgerDelete(ctxMenu.node.data as Ledger);
              else handleGroupDelete(ctxMenu.node.data as AccountGroup);
            }, danger: true, disabled: ctxMenu.node.type === "ledger" ? (ctxMenu.node.data as Ledger).is_protected : (ctxMenu.node.data as AccountGroup).is_system }] : []),
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
