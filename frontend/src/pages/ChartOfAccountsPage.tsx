import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import ContextMenu from "../components/ContextMenu";
import GroupForm from "../components/GroupForm";
import LedgerForm from "../components/LedgerForm";
import Select from "../components/Select";
import { useRole } from "../hooks/useRole";
import { showConfirm } from "../components/ConfirmDialog";
import { useFyStore } from "../store/fy";
import { CoaSkeleton } from "./skeletons";
import LedgerDetailModal from "./reports/LedgerDetailModal";
import { LedgerTransactionData } from "./reports/shared.tsx";


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
  closing_balance: number;
  closing_balance_type: string;
  is_protected: boolean;
  is_active: boolean;
  bank_name?: string | null;
  bank_account_number?: string | null;
  gstin?: string | null;
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

export default function ChartOfAccountsPage() {
  const { canEdit } = useRole();
  const toast = useToastStore();
  const { activeFyId } = useFyStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
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
  const [ledgerDetail, setLedgerDetail] = useState<{ id: string; name: string } | null>(null);
  const [ledgerTx, setLedgerTx] = useState<LedgerTransactionData | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const navigate = useNavigate();
  const newMenuRef = useRef<HTMLDivElement>(null);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [formState, setFormState] = useState<{
    type: "group" | "ledger";
    mode: "create" | "edit";
    data?: any;
    parentId?: string;
    parentName?: string;
    groupType?: "primary" | "sub";
  } | null>(null);

  // Category filter (Assets/Liabilities/Income/Expense/Capital) + Trial Balance mode.
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [view, setView] = useState<"tree" | "list" | "tb">(() => {
    try {
      const v = localStorage.getItem("zledger.coa.view");
      return v === "list" ? "list" : v === "tb" ? "tb" : "tree";
    } catch { return "tree"; }
  });

  const load = useCallback(() => {
    setLoading(true);
    const params = activeFyId ? `?financial_year_id=${activeFyId}` : "";
    Promise.all([
      api.get<AccountGroup[]>("/coa/groups"),
      api.get<Ledger[]>(`/coa/ledgers${params}`),
    ])
      .then(([g, l]) => { setGroups(g); setLedgers(l); })
      .finally(() => setLoading(false));
  }, [activeFyId]);

  useEffect(() => { load(); }, [load]);

  // Auto-open form from command palette (?action=create-group|create-subgroup|create-ledger)
  useEffect(() => {
    const action = searchParams.get("action");
    if (!action) return;
    setSearchParams({}, { replace: true });
    if (action === "create-group") setFormState({ type: "group", mode: "create" });
    else if (action === "create-subgroup") setFormState({ type: "group", mode: "create", groupType: "sub" });
    else if (action === "create-ledger") setFormState({ type: "ledger", mode: "create" });
  }, [searchParams]);

  useEffect(() => {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
  }, [expanded]);

  useEffect(() => {
    localStorage.setItem(BALANCES_KEY, String(showBalances));
  }, [showBalances]);

  useEffect(() => {
    try { localStorage.setItem("zledger.coa.view", view); } catch { /* ignore */ }
  }, [view]);

  useEffect(() => {
    if (!showNewMenu) return;
    const handler = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) setShowNewMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNewMenu]);

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
    // Build a tree node for a primary group (with its sub-groups + ledgers).
    const buildNode = (pg: AccountGroup): TreeNode => {
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
    };

    // Equities (capital-nature primaries) are nested under the
    // "Current Liabilities" primary group per the requested COA layout.
    const isCapital = (pg: AccountGroup) => pg.nature === "capital";
    const currentLiabilities = filteredPrimaryGroups.find(
      (pg) => pg.system_code === "GRP_CURRENT_LIABILITIES" || pg.name === "Current Liabilities"
    );
    const capitalPrimaries = filteredPrimaryGroups.filter(
      (pg) => isCapital(pg) && pg.id !== currentLiabilities?.id
    );
    const otherPrimaries = filteredPrimaryGroups.filter(
      (pg) => !isCapital(pg) && pg.id !== currentLiabilities?.id
    );

    const roots: TreeNode[] = otherPrimaries.map(buildNode);
    if (currentLiabilities) {
      const node = buildNode(currentLiabilities);
      // Append capital primaries as children so equities sit under
      // Current Liabilities in the tree.
      node.children = [...node.children, ...capitalPrimaries.map(buildNode)];
      node.subgroupCount += capitalPrimaries.length;
      node.ledgerCount += capitalPrimaries.reduce((acc, cp) => {
        const cl = groupLedgers(cp.id);
        return acc + cl.length + childGroups(cp.id).reduce((a, sg) => a + groupLedgers(sg.id).length, 0);
      }, 0);
      roots.push(node);
    }
    return roots;
  }, [filteredPrimaryGroups, childGroups, groupLedgers]);

  const searchLower = search.toLowerCase();

  // ledger id -> nature of its top-level (primary) group
  const ledgerNature = useMemo(() => {
    const rootNature = (gid: string): string => {
      let g = groups.find((x) => x.id === gid);
      while (g && g.parent_id) g = groups.find((x) => x.id === g!.parent_id) ?? undefined;
      return g?.nature ?? "";
    };
    const map = new Map<string, string>();
    for (const l of ledgers) map.set(l.id, rootNature(l.group_id));
    return map;
  }, [groups, ledgers]);

  const matchIds = useMemo(() => {
    const ids = new Set<string>();
    if (searchLower) {
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
    }
    if (categoryFilter) {
      // include only ledgers whose root-group nature matches the category
      for (const l of ledgers) {
        if (ledgerNature.get(l.id) === categoryFilter) ids.add(l.id);
      }
      for (const g of groups) {
        if (g.nature === categoryFilter) {
          ids.add(g.id);
          let pid = g.parent_id;
          while (pid) { ids.add(pid); const parent = groups.find((pg) => pg.id === pid); pid = parent?.parent_id ?? null; }
        }
      }
    }
    return ids;
  }, [searchLower, groups, ledgers, ledgerNature, categoryFilter]);

  // tree visibility: a node shows if it matches (search/category) OR has a matching descendant
  const isMatch = (id: string) => (!searchLower && !categoryFilter) || matchIds.has(id);

  useEffect(() => {
    if ((searchLower || categoryFilter) && matchIds.size > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        matchIds.forEach((id) => { if (groups.some((g) => g.id === id)) next.add(id); });
        return next;
      });
    }
  }, [searchLower, categoryFilter, matchIds, groups]);

  // Roll up opening/closing balances to every group (sum of descendant ledgers).
  // Dr = positive, Cr = negative; net sign determines the displayed Dr/Cr.
  const groupBalances = useMemo(() => {
    const childMap: Record<string, string[]> = {};
    for (const g of groups) {
      if (g.parent_id) (childMap[g.parent_id] ||= []).push(g.id);
    }
    const ledgerByGroup: Record<string, Ledger[]> = {};
    for (const l of ledgers) (ledgerByGroup[l.group_id] ||= []).push(l);

    const rollup = (groupId: string): { open: number; close: number } => {
      let open = 0, close = 0;
      for (const l of ledgerByGroup[groupId] || []) {
        const o = l.opening_balance_type === "Dr" ? l.opening_balance : -l.opening_balance;
        const c = l.closing_balance_type === "Dr" ? l.closing_balance : -l.closing_balance;
        open += o; close += c;
      }
      for (const cg of childMap[groupId] || []) {
        const r = rollup(cg);
        open += r.open; close += r.close;
      }
      return { open, close };
    };

    const out: Record<string, { open: number; close: number }> = {};
    for (const g of groups) out[g.id] = rollup(g.id);
    return out;
  }, [groups, ledgers]);

  const fmtBal = (v: number): { amt: string; type: "Dr" | "Cr" } => (
    v >= 0
      ? { amt: v.toLocaleString("en-IN", { minimumFractionDigits: 2 }), type: "Dr" }
      : { amt: (-v).toLocaleString("en-IN", { minimumFractionDigits: 2 }), type: "Cr" }
  );

  // Dr = blue tint, Cr = amber tint — subtle accountant-friendly cue.
  const balClass = (type: "Dr" | "Cr") =>
    type === "Dr"
      ? "text-blue-600 dark:text-blue-400"
      : "text-amber-600 dark:text-amber-400";

  // Badges for ledger-kind indicators (bank / GST-linked).
  const LedgerBadges = ({ l }: { l: Ledger }) => (
    <>
      {l.bank_name && (
        <span title={`Bank: ${l.bank_name}${l.bank_account_number ? " · " + l.bank_account_number : ""}`}
          className="shrink-0 rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          🏦 Bank
        </span>
      )}
      {l.gstin && (
        <span title={`GSTIN: ${l.gstin}`}
          className="shrink-0 rounded bg-indigo-50 px-1 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
          GST
        </span>
      )}
    </>
  );

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

  const toggleLedgerActive = useCallback(async (ledger: Ledger) => {
    try {
      await api.patch(`/coa/ledgers/${ledger.id}`, { is_active: !ledger.is_active });
      load();
      toast.success(`${ledger.name} ${ledger.is_active ? "disabled" : "enabled"}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to update ledger");
    }
  }, [load]);

  const openLedgerDetail = useCallback(async (ledger: Ledger) => {
    setLedgerDetail({ id: ledger.id, name: ledger.name });
    setLedgerTx(null);
    setLedgerLoading(true);
    try {
      const data = await api.get<LedgerTransactionData>(
        `/reports/ledger-transactions?ledger_id=${ledger.id}&financial_year_id=${activeFyId}`
      );
      setLedgerTx(data);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load ledger");
    } finally {
      setLedgerLoading(false);
    }
  }, [activeFyId]);

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const match = isMatch(node.id);
    const indent = depth * 28;

    if (node.type === "ledger") {
      const l = node.data as Ledger;
      if (searchLower && !match) return null;
      return (
        <div
          key={node.id}
          onContextMenu={(e) => openCtxMenu(e, node)}
          className={`coa-row group grid items-center py-1.5 px-5 rounded-lg cursor-pointer transition-colors ${
            searchLower && match
              ? "bg-brand-50 dark:bg-blue-500/10"
              : "hover:bg-slate-50 dark:hover:bg-[#1a1a24]"
          }`}
          style={{ paddingLeft: `${indent + 36}px` }}
        >
          {/* Name */}
          <div className="flex items-center gap-2 min-w-0">
            <span className={`truncate text-[14px] ${searchLower && match ? "font-semibold text-brand-700 dark:text-blue-400" : "text-slate-800 dark:text-[#cbd5e1]"}`}>
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
          {/* Quick actions (hover) */}
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            {canEdit && (
              <>
                <button
                  title="View Ledger"
                  onClick={(e) => { e.stopPropagation(); openLedgerDetail(l); }}
                  className="rounded p-1 text-slate-500 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#282832] hover:text-blue-500 dark:hover:text-blue-400"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>
                </button>
                <button
                  title="Create Voucher"
                  onClick={(e) => { e.stopPropagation(); navigate(`/vouchers?action=new`); }}
                  className="rounded p-1 text-slate-500 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#282832] hover:text-blue-500 dark:hover:text-blue-400"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                </button>
                <button
                  title="Edit"
                  onClick={(e) => { e.stopPropagation(); setFormState({ type: "ledger", mode: "edit", data: l }); }}
                  className="rounded p-1 text-slate-500 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#282832] hover:text-blue-500 dark:hover:text-blue-400"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                </button>
                {!l.is_protected && (
                  <button
                    title={l.is_active ? "Disable" : "Enable"}
                    onClick={(e) => { e.stopPropagation(); toggleLedgerActive(l); }}
                    className="rounded p-1 text-slate-500 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#282832] hover:text-amber-500 dark:hover:text-amber-400"
                  >
                    {l.is_active
                      ? <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243l-4.243-4.243" /></svg>
                      : <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                  </button>
                )}
              </>
            )}
          </div>
          {/* Balance */}
          <div className="text-right text-[12px] tabular-nums text-slate-600 dark:text-[#cbd5e1]">
            {showBalances
              ? `₹${l.closing_balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })} ${l.closing_balance_type}`
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
          className={`coa-row grid items-center py-1.5 px-5 rounded-lg cursor-pointer transition-colors ${
            searchLower && match
              ? "bg-brand-50 dark:bg-blue-500/10"
              : "hover:bg-slate-50 dark:hover:bg-[#1a1a24]"
          }`}
          style={{ paddingLeft: `${indent + 12}px` }}
        >
          {/* Name */}
          <div className="flex items-center gap-2 min-w-0">
            <svg
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""} text-slate-400 dark:text-[#64748b]`}
              fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className={`truncate text-[14px] ${isRoot ? "font-semibold text-slate-900 dark:text-[#f1f5f9]" : "font-medium text-slate-700 dark:text-[#cbd5e1]"}`}>
              {node.name}
            </span>
            {node.type === "group" && (node.data as AccountGroup).is_system && (
              <span title="System group (locked)">
                <svg className="h-3 w-3 shrink-0 text-slate-400 dark:text-[#64748b]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </span>
            )}
            {isRoot && node.nature && (
              <span className="shrink-0 rounded bg-slate-100 dark:bg-[#282832] px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:text-[#cbd5e1] uppercase">
                {node.nature}
              </span>
            )}
            {(node.type as string) === "ledger" && <LedgerBadges l={node.data as Ledger} />}
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
          {/* Balance — group rollup (opening / closing) */}
          <div className="text-right text-[12px] tabular-nums leading-tight">
            {showBalances ? (() => {
              const b = groupBalances[node.id];
              if (!b) return "\u00A0";
              const op = fmtBal(b.open);
              const cl = fmtBal(b.close);
              return (
                <>
                  <div className="text-[10px] text-slate-400 dark:text-[#64748b]">Opening</div>
                  <div className={`font-medium ${balClass(op.type)}`}>₹{op.amt} {op.type}</div>
                  <div className="text-[10px] text-slate-400 dark:text-[#64748b] mt-0.5">Closing</div>
                  <div className={`font-medium ${balClass(cl.type)}`}>₹{cl.amt} {cl.type}</div>
                </>
              );
            })() : "\u00A0"}
          </div>
        </div>
        {isExpanded && hasChildren && (
          <div className="animate-in slide-in-from-top-1 duration-100">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
        {isEmpty && (
          <div className="py-2 px-5" style={{ paddingLeft: `${(depth + 1) * 28 + 36}px` }}>
            <p className="text-[12px] italic text-slate-400 dark:text-[#475569]">No ledgers in this group.</p>
          </div>
        )}
      </div>
    );
  };

  const totalGroups = groups.filter((g) => g.group_type === "primary").length;
  const totalSubGroups = subGroups.length;
  const totalLedgers = ledgers.filter((l) => l.is_active).length;

  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.id, g.name);
    return m;
  }, [groups]);

  const ledgerRows = useMemo(() => {
    const rows = ledgers
      .filter((l) => l.is_active)
      .filter((l) => !categoryFilter || ledgerNature.get(l.id) === categoryFilter)
      .map((l) => ({ ledger: l, groupName: groupNameById.get(l.group_id) || "—" }));
    if (filterGroup) rows.sort((a, b) => (a.groupName === b.groupName ? 0 : a.groupName < b.groupName ? -1 : 1));
    else rows.sort((a, b) => a.ledger.name.localeCompare(b.ledger.name));
    return rows;
  }, [ledgers, groupNameById, filterGroup, categoryFilter, ledgerNature]);

  const renderListView = () => (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-[#1a1a24] text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#475569]">
            <th className="px-4 py-3">Ledger</th>
            <th className="px-4 py-3">Group</th>
            <th className="px-4 py-3 text-right">Opening</th>
            <th className="px-4 py-3 text-right">Closing</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-[#1a1a24]">
          {ledgerRows.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500 dark:text-[#94a3b8]">No ledgers found.</td></tr>
          ) : (
            ledgerRows.map(({ ledger: l, groupName }) => {
              const op = fmtBal(l.opening_balance_type === "Dr" ? l.opening_balance : -l.opening_balance);
              const cl = fmtBal(l.closing_balance_type === "Dr" ? l.closing_balance : -l.closing_balance);
              return (
                <tr key={l.id} className="group hover:bg-slate-50 dark:hover:bg-[#1a1a24]">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800 dark:text-[#f1f5f9]">{l.name}</span>
                      {l.is_protected && (
                        <span title="System ledger">
                          <svg className="h-3 w-3 shrink-0 text-slate-400 dark:text-[#64748b]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                        </span>
                      )}
                      <LedgerBadges l={l} />
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${l.is_active ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400"}`}>{l.is_active ? "Active" : "Inactive"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-[#cbd5e1]">{groupName}</td>
                  <td className="px-4 py-2.5 text-right text-[12px] tabular-nums">
                    {showBalances ? <span className={balClass(op.type)}>₹{op.amt} {op.type}</span> : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[12px] tabular-nums">
                    {showBalances ? <span className={balClass(cl.type)}>₹{cl.amt} {cl.type}</span> : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      {canEdit && (
                        <>
                          <button title="View Ledger" onClick={() => openLedgerDetail(l)} className="rounded p-1 text-slate-500 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#282832] hover:text-blue-500 dark:hover:text-blue-400"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg></button>
                          <button title="Create Voucher" onClick={() => navigate("/vouchers?action=new")} className="rounded p-1 text-slate-500 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#282832] hover:text-blue-500 dark:hover:text-blue-400"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg></button>
                          <button title="Edit" onClick={() => setFormState({ type: "ledger", mode: "edit", data: l })} className="rounded p-1 text-slate-500 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#282832] hover:text-blue-500 dark:hover:text-blue-400"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg></button>
                          {!l.is_protected && (
                            <button title={l.is_active ? "Disable" : "Enable"} onClick={() => toggleLedgerActive(l)} className="rounded p-1 text-slate-500 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#282832] hover:text-amber-500 dark:hover:text-amber-400">
                              {l.is_active
                                ? <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243l-4.243-4.243" /></svg>
                                : <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  // Trial Balance mode — flat, grouped by accounting nature (Dr/Cr columns).
  const renderTrialBalance = () => {
    const order: { nature: string; label: string }[] = [
      { nature: "asset", label: "Assets" },
      { nature: "liability", label: "Liabilities" },
      { nature: "capital", label: "Capital & Reserves" },
      { nature: "income", label: "Income" },
      { nature: "expense", label: "Expenses" },
    ];
    const sections = order.map(({ nature, label }) => {
      const rows = ledgers
        .filter((l) => l.is_active && ledgerNature.get(l.id) === nature)
        .map((l) => {
          const v = l.closing_balance_type === "Dr" ? l.closing_balance : -l.closing_balance;
          return { l, bal: fmtBal(v) };
        });
      const totals = rows.reduce(
        (acc, r) => {
          if (r.bal.type === "Dr") acc.dr += r.l.closing_balance;
          else acc.cr += r.l.closing_balance;
          return acc;
        },
        { dr: 0, cr: 0 }
      );
      return { label, rows, totals };
    });
    const grand = sections.reduce(
      (acc, s) => ({ dr: acc.dr + s.totals.dr, cr: acc.cr + s.totals.cr }),
      { dr: 0, cr: 0 }
    );
    return (
      <div className="space-y-4">
        {sections.map((s) => (
          <div key={s.label} className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f]">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] px-4 py-2.5">
              <h3 className="text-[13px] font-semibold text-slate-900 dark:text-[#f1f5f9]">{s.label}</h3>
              <div className="text-[11px] text-slate-400 dark:text-[#64748b] tabular-nums">
                <span className="text-blue-600 dark:text-blue-400">Dr ₹{s.totals.dr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                {" · "}
                <span className="text-amber-600 dark:text-amber-400">Cr ₹{s.totals.cr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
            {s.rows.length === 0 ? (
              <p className="px-4 py-3 text-[12px] italic text-slate-400 dark:text-[#475569]">No ledgers.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100 dark:divide-[#1a1a24]">
                  {s.rows.map(({ l, bal }) => (
                    <tr key={l.id} className="group hover:bg-slate-50 dark:hover:bg-[#1a1a24]">
                      <td className="px-4 py-2 text-slate-700 dark:text-[#cbd5e1]">
                        <button className="text-left hover:text-blue-600 dark:hover:text-blue-400" onClick={() => openLedgerDetail(l)}>{l.name}</button>
                        <span className="ml-2"><LedgerBadges l={l} /></span>
                      </td>
                      <td className="px-4 py-2 text-right text-[12px] tabular-nums">
                        {bal.type === "Dr"
                          ? <span className="text-blue-600 dark:text-blue-400 font-medium">₹{bal.amt} Dr</span>
                          : <span className="text-slate-300 dark:text-[#282832]">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-[12px] tabular-nums">
                        {bal.type === "Cr"
                          ? <span className="text-amber-600 dark:text-amber-400 font-medium">₹{bal.amt} Cr</span>
                          : <span className="text-slate-300 dark:text-[#282832]">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
        <div className="flex items-center justify-between rounded-xl border border-brand-200 dark:border-blue-500/30 bg-brand-50 dark:bg-blue-500/10 px-4 py-3 text-sm font-semibold">
          <span className="text-slate-900 dark:text-[#f1f5f9]">Total</span>
          <div className="tabular-nums">
            <span className="text-blue-600 dark:text-blue-400">Dr ₹{grand.dr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            {"  "}
            <span className="text-amber-600 dark:text-amber-400">Cr ₹{grand.cr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Chart of Accounts</h1>
          <p className="text-sm text-slate-500 dark:text-[#64748b] mt-1">{totalGroups} groups · {totalSubGroups} subgroups · {totalLedgers} ledgers</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <div className="relative" ref={newMenuRef}>
              <button
                onClick={() => setShowNewMenu(!showNewMenu)}
                className="h-8 rounded-lg bg-brand-600 dark:bg-blue-500 px-3 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600 transition-colors"
              >
                + New
              </button>
              {showNewMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] shadow-lg py-1">
                  <button
                    onClick={() => { setShowNewMenu(false); setFormState({ type: "group", mode: "create" }); }}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors"
                  >
                    New Group
                  </button>
                  <button
                    onClick={() => { setShowNewMenu(false); setFormState({ type: "group", mode: "create", groupType: "sub", ...(filterGroup ? { parentId: filterGroup, parentName: primaryGroups.find((g) => g.id === filterGroup)?.name } : {}) }); }}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors"
                  >
                    New Subgroup
                  </button>
                  <button
                    onClick={() => { setShowNewMenu(false); setFormState({ type: "ledger", mode: "create", ...(filterGroup ? { parentId: filterGroup, parentName: primaryGroups.find((g) => g.id === filterGroup)?.name } : {}) }); }}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors"
                  >
                    New Ledger
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => setShowBalances(!showBalances)}
            className={`h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
              showBalances
                ? "border-brand-600 dark:border-blue-500/50 bg-brand-50 dark:bg-blue-500/10 text-brand-700 dark:text-blue-400"
                : "border-slate-200 dark:border-[#282832] text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
            }`}
          >
            {showBalances ? "Hide Balances" : "Show Balances"}
          </button>
          <button onClick={expandAll} className="h-8 rounded-lg border border-slate-200 dark:border-[#282832] px-2.5 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors">
            Expand All
          </button>
          <button onClick={collapseAll} className="h-8 rounded-lg border border-slate-200 dark:border-[#282832] px-2.5 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors">
            Collapse All
          </button>
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-[#282832] overflow-hidden">
            {(["tree", "list", "tb"] as const).map((v) => (
              <button
                key={v}
                onClick={() => { setView(v); try { localStorage.setItem("zledger.coa.view", v); } catch {} }}
                className={`h-8 px-2.5 text-xs font-medium transition-colors ${
                  view === v
                    ? "bg-brand-600 dark:bg-blue-500 text-white"
                    : "text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
                }`}
              >
                {v === "tree" ? "Tree" : v === "list" ? "List" : "Trial Bal"}
              </button>
            ))}
          </div>
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
            className="w-full rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#0f0f16] py-2 pl-9 pr-3 text-sm text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20 transition-colors"
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

      {/* Category filter chips */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {[
          { v: "", label: "All" },
          { v: "asset", label: "Assets" },
          { v: "liability", label: "Liabilities" },
          { v: "income", label: "Income" },
          { v: "expense", label: "Expenses" },
        ].map((c) => (
          <button
            key={c.v}
            onClick={() => setCategoryFilter(c.v)}
            className={`h-7 rounded-full px-3 text-xs font-medium transition-colors ${
              categoryFilter === c.v
                ? "bg-brand-600 dark:bg-blue-500 text-white"
                : "border border-slate-200 dark:border-[#282832] text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1a1a24]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Column Headers — only for tree view; list view has its own <thead> */}
      {!loading && view === "tree" && tree.length > 0 && (
        <div className="coa-row grid items-center mt-4 mb-1 px-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#475569]">
          <div>Name</div>
          <div className="text-right">Status</div>
          <div className="text-right">Count</div>
          <div className="text-right">Balance (Op / Cl)</div>
        </div>
      )}

      {/* Tree / List / Trial Balance */}
      {loading ? (
        <CoaSkeleton />
      ) : view === "tb" ? (
        renderTrialBalance()
      ) : view === "list" ? (
        renderListView()
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] divide-y divide-slate-100 dark:divide-[#1a1a24]">
          {tree.map((node) => renderNode(node))}
          {tree.length === 0 && (
            <div className="p-8 text-center">
              <svg className="mx-auto h-10 w-10 text-slate-300 dark:text-[#282832]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
              <p className="mt-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1]">No account groups found.</p>
              <p className="mt-1 text-xs text-slate-400 dark:text-[#64748b]">Account groups are created automatically when you set up your company.</p>
            </div>
          )}
          {searchLower && tree.length > 0 && tree.every((n) => !isMatch(n.id) && n.children.every((c) => !isMatch(c.id))) && (
            <div className="p-8 text-center">
              <svg className="mx-auto h-10 w-10 text-slate-300 dark:text-[#282832]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
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
          defaultGroupType={formState.groupType}
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

      {/* Ledger detail (from quick-action "View Ledger") */}
      {ledgerDetail && (
        ledgerTx ? (
          <LedgerDetailModal
            ledgerTx={ledgerTx}
            loading={ledgerLoading}
            selectedFy={activeFyId}
            onClose={() => { setLedgerDetail(null); setLedgerTx(null); }}
            onVoucherClick={() => {}}
            onPreview={(url: string) => window.open(url, "_blank")}
          />
        ) : (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => { setLedgerDetail(null); }}>
            <div className="rounded-xl bg-white dark:bg-[#16161f] px-6 py-4 text-sm text-slate-600 dark:text-[#cbd5e1]">
              {ledgerLoading ? "Loading ledger…" : "Could not load ledger."}
            </div>
          </div>
        )
      )}
    </div>
  );
}
