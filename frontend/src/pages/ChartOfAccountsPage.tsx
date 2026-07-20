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

export default function ChartOfAccountsPage() {
  const { canEdit } = useRole();
  const toast = useToastStore();
  const { activeFyId } = useFyStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  // Balance column view: opening | closing | both
  const [balanceView, setBalanceView] = useState<"opening" | "closing" | "both">(() => {
    try {
      const v = localStorage.getItem("zledger.coa.balanceView");
      return v === "opening" || v === "closing" || v === "both" ? v : "both";
    } catch { return "both"; }
  });
  const [hideEmpty, setHideEmpty] = useState(false);
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

  const isFullyExpanded = groups.length > 0 && groups.every((g) => expanded.has(g.id));

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

  // ledger id -> quick-filter tags (bank / tax / party) for the chip filters
  const ledgerTags = useMemo(() => {
    const groupName = (gid: string) => groups.find((g) => g.id === gid)?.name?.toLowerCase() ?? "";
    const map = new Map<string, Set<string>>();
    for (const l of ledgers) {
      const tags = new Set<string>();
      if (l.bank_name) tags.add("bank");
      if (l.gstin) tags.add("tax");
      const gn = groupName(l.group_id);
      if (gn.includes("receivable") || gn.includes("payable") || gn.includes("parties")) tags.add("party");
      map.set(l.id, tags);
    }
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

  // Tree/List columns are colour-coded by column role, not Dr/Cr:
  // Opening = blue, Closing = orange — so the two money columns never mix.
  const openClass = "text-blue-600 dark:text-blue-400";
  const closeClass = "text-orange-600 dark:text-orange-400";

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

  // Tree grid: Name | Opening | Closing (Count is shown under the group name, not in the balance area).
  // NOTE: must be STATIC literal class strings so Tailwind's content scanner emits them.
  const TREE_GRID =
    balanceView === "both"
      ? "grid grid-cols-[1fr_160px_160px] items-center gap-2"
      : "grid grid-cols-[1fr_190px] items-center gap-2";

  const renderCount = (sub: number, led: number) => {
    if (sub === 0 && led === 0) return <span className="italic text-slate-400 dark:text-[#475569]">(0 ledgers)</span>;
    const parts: string[] = [];
    if (sub > 0) parts.push(`${sub} Groups`);
    if (led > 0) parts.push(`${led} Ledgers`);
    return <>{parts.join(" · ")}</>;
  };

  const TreeView = () => (
    <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] overflow-hidden">
      <div className={`${TREE_GRID} border-b-2 border-slate-200 dark:border-[#282832] bg-slate-50 dark:bg-[#0f0f16] px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] shadow-sm`}>
        <div>Name</div>
        {balanceView !== "closing" && <div className="text-right">Opening</div>}
        {balanceView !== "opening" && <div className="text-right">Closing</div>}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-[#1a1a24]">
        {tree.map((node) => renderTreeNode(node))}
        {tree.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-slate-600 dark:text-[#cbd5e1]">No account groups found.</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-[#64748b]">Account groups are created automatically when you set up your company.</p>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 border-t border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#0f0f16] px-5 py-2 text-[11px] text-slate-500 dark:text-[#94a3b8]">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> <span className="font-semibold text-blue-600 dark:text-blue-400">Opening</span> balance</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> <span className="font-semibold text-orange-600 dark:text-orange-400">Closing</span> balance</span>
      </div>
    </div>
  );

  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const match = isMatch(node.id);
    const indent = depth * 24;

    if (node.type === "ledger") {
      const l = node.data as Ledger;
      if (searchLower && !match) return null;
      const op = fmtBal(l.opening_balance_type === "Dr" ? l.opening_balance : -l.opening_balance);
      const cl = fmtBal(l.closing_balance_type === "Dr" ? l.closing_balance : -l.closing_balance);
      return (
        <div
          key={node.id}
          onContextMenu={(e) => openCtxMenu(e, node)}
          className={`${TREE_GRID} group px-5 py-1.5 rounded-lg cursor-pointer transition-colors ${
            searchLower && match ? "bg-brand-50 dark:bg-blue-500/10" : "hover:bg-slate-50 dark:hover:bg-[#1a1a24]"
          }`}
          style={{ paddingLeft: `${indent + 36}px` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`truncate text-[13px] ${searchLower && match ? "font-semibold text-brand-700 dark:text-blue-400" : "text-slate-600 dark:text-[#94a3b8]"}`}>{l.name}</span>
            {l.is_protected && (
              <span title="System ledger"><svg className="h-3 w-3 shrink-0 text-slate-400 dark:text-[#64748b]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg></span>
            )}
            <LedgerBadges l={l} />
          </div>
          {balanceView !== "closing" && (
            <div className="text-right text-[12px] tabular-nums">
              <span className={`font-medium ${openClass}`}>₹{op.amt} {op.type}</span>
            </div>
          )}
          {balanceView !== "opening" && (
            <div className="text-right text-[12px] tabular-nums">
              <span className={`font-medium ${closeClass}`}>₹{cl.amt} {cl.type}</span>
            </div>
          )}
        </div>
      );
    }

    if (hideEmpty && node.ledgerCount === 0 && node.subgroupCount === 0 && !searchLower) return null;

    if (searchLower && !match) {
      const hasMatchDescendant = node.children.some((c) => {
        if (c.type === "ledger") return matchIds.has(c.id);
        return matchIds.has(c.id) || c.children.some((cc) => matchIds.has(cc.id));
      });
      if (!hasMatchDescendant) return null;
    }

    const childSubgroupCount = node.type === "root" ? node.subgroupCount : 0;
    const isRoot = node.type === "root";

    return (
      <div key={node.id}>
        <div
          onClick={() => toggle(node.id)}
          onContextMenu={(e) => openCtxMenu(e, node)}
          className={`${TREE_GRID} px-5 py-1.5 rounded-lg cursor-pointer transition-colors ${
            searchLower && match ? "bg-brand-50 dark:bg-blue-500/10" : "hover:bg-slate-50 dark:hover:bg-[#1a1a24]"
          }`}
          style={{ paddingLeft: `${indent + 12}px` }}
        >
          <div className="flex items-start gap-2 min-w-0">
            <svg className={`mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""} text-slate-400 dark:text-[#64748b]`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`truncate ${isRoot ? "text-[15px] font-semibold text-slate-900 dark:text-[#f1f5f9]" : "text-[14px] font-medium text-slate-700 dark:text-[#cbd5e1]"}`}>{node.name}</span>
                {node.type === "group" && (node.data as AccountGroup).is_system && (
                  <span title="System group (locked)"><svg className="h-3 w-3 shrink-0 text-slate-400 dark:text-[#64748b]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg></span>
                )}
                {isRoot && node.nature && (
                  <span className="shrink-0 rounded bg-slate-100 dark:bg-[#282832] px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:text-[#cbd5e1] uppercase">{node.nature}</span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400 dark:text-[#64748b]">{renderCount(childSubgroupCount, node.ledgerCount)}</div>
            </div>
          </div>
          {balanceView !== "closing" && (
            <div className="text-right text-[12px] tabular-nums">
              {(() => {
                const b = groupBalances[node.id];
                if (!b || b.open === 0) return <span className="text-slate-400 dark:text-[#64748b]">₹0.00 Dr</span>;
                const op = fmtBal(b.open);
                return <span className={`font-medium ${openClass}`}>₹{op.amt} {op.type}</span>;
              })()}
            </div>
          )}
          {balanceView !== "opening" && (
            <div className="text-right text-[12px] tabular-nums">
              {(() => {
                const b = groupBalances[node.id];
                if (!b || b.close === 0) return <span className="text-slate-400 dark:text-[#64748b]">₹0.00 Dr</span>;
                const cl = fmtBal(b.close);
                return <span className={`font-medium ${closeClass}`}>₹{cl.amt} {cl.type}</span>;
              })()}
            </div>
          )}
        </div>
        {isExpanded && hasChildren && (
          <div className="animate-in slide-in-from-top-1 duration-100">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
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
      .filter((l) => !categoryFilter || (categoryFilter === "bank" || categoryFilter === "tax" || categoryFilter === "party"
        ? ledgerTags.get(l.id)?.has(categoryFilter)
        : ledgerNature.get(l.id) === categoryFilter))
      .map((l) => ({ ledger: l, groupName: groupNameById.get(l.group_id) || "—" }));
    if (filterGroup) rows.sort((a, b) => (a.groupName === b.groupName ? 0 : a.groupName < b.groupName ? -1 : 1));
    else rows.sort((a, b) => a.ledger.name.localeCompare(b.ledger.name));
    return rows;
  }, [ledgers, groupNameById, filterGroup, categoryFilter, ledgerNature, ledgerTags]);

  const LIST_GRID = `grid grid-cols-[2.6fr_1.3fr_1fr_1fr_130px] items-center gap-2`;

  const ListView = () => (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f]">
      <div className={`${LIST_GRID} border-b-2 border-slate-200 dark:border-[#282832] bg-slate-50 dark:bg-[#0f0f16] px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] shadow-sm`}>
        <div>Ledger</div>
        <div>Group</div>
        {balanceView !== "closing" && <div className="text-right">Opening</div>}
        {balanceView !== "opening" && <div className="text-right">Closing</div>}
        <div className="text-right">Actions</div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-[#1a1a24]">
        {ledgerRows.length === 0 ? (
          <div className="px-4 py-10 text-center text-slate-500 dark:text-[#94a3b8]">No ledgers found.</div>
        ) : (
          ledgerRows.map(({ ledger: l, groupName }) => {
            const op = fmtBal(l.opening_balance_type === "Dr" ? l.opening_balance : -l.opening_balance);
            const cl = fmtBal(l.closing_balance_type === "Dr" ? l.closing_balance : -l.closing_balance);
            return (
              <div key={l.id} className="group hover:bg-slate-50 dark:hover:bg-[#1a1a24]">
                <div
                  className={LIST_GRID + " px-4 py-2 cursor-pointer"}
                  onClick={() => openLedgerDetail(l)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-slate-800 dark:text-[#f1f5f9] truncate">{l.name}</span>
                    {l.is_protected && (
                      <span title="System ledger"><svg className="h-3 w-3 shrink-0 text-slate-400 dark:text-[#64748b]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg></span>
                    )}
                    <LedgerBadges l={l} />
                    {!l.is_active && (
                      <span className="shrink-0 rounded-full bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">Inactive</span>
                    )}
                  </div>
                  <div className="text-slate-600 dark:text-[#cbd5e1] truncate">{groupName}</div>
                  {balanceView !== "closing" && (
                    <div className="text-right text-[12px] tabular-nums">
                      <span className={`font-medium ${openClass}`}>₹{op.amt} {op.type}</span>
                    </div>
                  )}
                  {balanceView !== "opening" && (
                    <div className="text-right text-[12px] tabular-nums">
                      <span className={`font-medium ${closeClass}`}>₹{cl.amt} {cl.type}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    {canEdit && (
                      <>
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
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="flex items-center gap-4 border-t border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#0f0f16] px-4 py-2 text-[11px] text-slate-500 dark:text-[#94a3b8]">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> <span className="font-semibold text-blue-600 dark:text-blue-400">Opening</span> balance</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> <span className="font-semibold text-orange-600 dark:text-orange-400">Closing</span> balance</span>
      </div>
    </div>
  );

  // Trial Balance mode — single continuous report table (PARTICULARS / DR / CR).
  const TB_GRID = "grid grid-cols-[1fr_180px_180px] items-center gap-2";
  const TrialBalanceView = () => {
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
    }).filter((s) => s.rows.length > 0 || !hideEmpty);
    const grand = sections.reduce(
      (acc, s) => ({ dr: acc.dr + s.totals.dr, cr: acc.cr + s.totals.cr }),
      { dr: 0, cr: 0 }
    );
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f]">
      <div className={`${TB_GRID} border-b-2 border-slate-200 dark:border-[#282832] bg-slate-50 dark:bg-[#0f0f16] px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] shadow-sm`}>
        <div>Particulars</div>
        <div className="text-right text-blue-600 dark:text-blue-400">Dr</div>
        <div className="text-right text-amber-600 dark:text-amber-400">Cr</div>
      </div>
        <div className="divide-y divide-slate-100 dark:divide-[#1a1a24]">
          {sections.map((s) => (
            <div key={s.label}>
              <div className={`${TB_GRID} px-4 py-2 bg-slate-50 dark:bg-[#1a1a24]`}>
                <div className="text-[13px] font-semibold text-slate-900 dark:text-[#f1f5f9]">{s.label}</div>
                <div />
                <div />
              </div>
              {s.rows.length === 0 ? (
                <div className={`${TB_GRID} px-4 py-2 text-[12px] italic text-slate-400 dark:text-[#475569]`}>
                  <div className="pl-4">No ledgers</div><div /><div />
                </div>
              ) : s.rows.map(({ l, bal }) => (
                <div key={l.id} className={`${TB_GRID} group px-4 py-2 hover:bg-slate-50 dark:hover:bg-[#1a1a24]`}>
                  <div className="flex items-center gap-2 min-w-0 pl-4">
                    <button className="truncate text-left text-slate-700 dark:text-[#cbd5e1] hover:text-blue-600 dark:hover:text-blue-400" onClick={() => openLedgerDetail(l)}>{l.name}</button>
                    <LedgerBadges l={l} />
                  </div>
                  <div className="text-right text-[12px] tabular-nums">{bal.type === "Dr" ? <span className="font-medium text-blue-600 dark:text-blue-400">₹{l.closing_balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span> : <span className="text-slate-300 dark:text-[#282832]">—</span>}</div>
                  <div className="text-right text-[12px] tabular-nums">{bal.type === "Cr" ? <span className="font-medium text-amber-600 dark:text-amber-400">₹{l.closing_balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span> : <span className="text-slate-300 dark:text-[#282832]">—</span>}</div>
                </div>
              ))}
              <div className={`${TB_GRID} px-4 py-2 text-[12px] font-semibold tabular-nums border-t border-slate-200 dark:border-[#1a1a24]`}>
                <div className="text-slate-500 dark:text-[#94a3b8]">{s.label} Total</div>
                <div className="text-right text-blue-600 dark:text-blue-400">₹{s.totals.dr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                <div className="text-right text-amber-600 dark:text-amber-400">₹{s.totals.cr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
              </div>
            </div>
          ))}
          <div className={`${TB_GRID} px-4 py-3 text-sm font-semibold tabular-nums border-t-2 border-slate-300 dark:border-[#282832] bg-brand-50 dark:bg-blue-500/10`}>
            <div className="text-slate-900 dark:text-[#f1f5f9]">Grand Total</div>
            <div className="text-right text-blue-600 dark:text-blue-400">₹{grand.dr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
            <div className="text-right text-amber-600 dark:text-amber-400">₹{grand.cr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
          </div>
        </div>
        <div className="flex items-center gap-4 border-t border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#0f0f16] px-4 py-2 text-[11px] text-slate-500 dark:text-[#94a3b8]">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> <span className="font-semibold text-blue-600 dark:text-blue-400">Dr</span> = Debit</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> <span className="font-semibold text-amber-600 dark:text-amber-400">Cr</span> = Credit</span>
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
          {/* Balance view: Opening | Closing | Both */}
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-[#282832] overflow-hidden">
            {(["opening", "closing", "both"] as const).map((v) => (
              <button
                key={v}
                onClick={() => { setBalanceView(v); try { localStorage.setItem("zledger.coa.balanceView", v); } catch {} }}
                className={`h-8 px-2.5 text-xs font-medium capitalize transition-colors ${
                  balanceView === v
                    ? "bg-brand-600 dark:bg-blue-500 text-white"
                    : "text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => setHideEmpty(!hideEmpty)}
            className={`h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
              hideEmpty
                ? "border-brand-600 dark:border-blue-500/50 bg-brand-50 dark:bg-blue-500/10 text-brand-700 dark:text-blue-400"
                : "border-slate-200 dark:border-[#282832] text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
            }`}
          >
            {hideEmpty ? "Showing non-empty" : "Hide empty"}
          </button>
          <button
            onClick={() => (isFullyExpanded ? collapseAll() : expandAll())}
            className="h-8 rounded-lg border border-slate-200 dark:border-[#282832] px-2.5 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors"
          >
            {isFullyExpanded ? "Collapse All" : "Expand All"}
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
                {v === "tree" ? "Tree" : v === "list" ? "List" : "Trial Balance"}
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
      <div className="flex flex-wrap items-center gap-2 mt-3 mb-5">
        {[
          { v: "", label: "All" },
          { v: "asset", label: "Assets" },
          { v: "liability", label: "Liabilities" },
          { v: "capital", label: "Capital" },
          { v: "income", label: "Income" },
          { v: "expense", label: "Expenses" },
          { v: "tax", label: "Tax" },
          { v: "bank", label: "Bank" },
          { v: "party", label: "Party" },
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

      {/* Tree / List / Trial Balance — each view owns its header */}
      {loading ? (
        <CoaSkeleton />
      ) : view === "tb" ? (
        <TrialBalanceView />
      ) : view === "list" ? (
        <ListView />
      ) : (
        <>
          <TreeView />
          {searchLower && tree.length > 0 && tree.every((n) => !isMatch(n.id) && n.children.every((c) => !isMatch(c.id))) && (
            <div className="mt-4 p-8 text-center">
              <p className="text-sm font-medium text-slate-600 dark:text-[#cbd5e1]">No results for "{search}"</p>
              <p className="mt-1 text-xs text-slate-400 dark:text-[#64748b]">Try a different search term.</p>
            </div>
          )}
        </>
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
