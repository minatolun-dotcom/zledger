import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api, getCompanyId } from "../api/client";
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
import Modal from "../components/Modal";
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
const VIEW_KEY = "zledger.coa.view";
const BALANCE_VIEW_KEY = "zledger.coa.balanceView";

/** COA UI prefs are per-company: the key embeds the company id (group/ledger
 *  ids differ per company, so a foreign expanded-set/view must never leak
 *  across companies). The first read after upgrade migrates the legacy
 *  unscoped value into the active company's key. */
function coaKey(base: string): string {
  const cid = getCompanyId();
  return cid ? `${base}.${cid}` : base;
}
function readCoaPref(base: string): string | null {
  const key = coaKey(base);
  let v = localStorage.getItem(key);
  if (v === null) {
    const legacy = localStorage.getItem(base);
    if (legacy !== null) {
      try { localStorage.setItem(key, legacy); } catch { /* ignore */ }
      v = legacy;
    }
  }
  return v;
}
function writeCoaPref(base: string, value: string) {
  try { localStorage.setItem(coaKey(base), value); } catch { /* ignore */ }
}

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
      const v = readCoaPref(BALANCE_VIEW_KEY);
      return v === "opening" || v === "closing" || v === "both" ? v : "both";
    } catch { return "both"; }
  });
  const [hideEmpty, setHideEmpty] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const saved = readCoaPref(EXPANDED_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null);
  const [filterGroup, setFilterGroup] = useState("");
  const [ledgerDetail, setLedgerDetail] = useState<{ id: string; name: string } | null>(null);
  const [ledgerTx, setLedgerTx] = useState<LedgerTransactionData | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const navigate = useNavigate();
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
      const v = readCoaPref(VIEW_KEY);
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
    writeCoaPref(EXPANDED_KEY, JSON.stringify([...expanded]));
  }, [expanded]);

  useEffect(() => {
    writeCoaPref(VIEW_KEY, view);
  }, [view]);


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
    // Build a tree node for a group (recursive, so arbitrarily deep
    // subgroup nesting is preserved: primary -> sub -> sub -> ledgers).
    const buildNode = (pg: AccountGroup, isRoot = false): TreeNode => {
      const children: TreeNode[] = [];
      const sgList = childGroups(pg.id);
      let totalChildLedgers = 0;
      let totalChildGroups = 0;
      for (const sg of sgList) {
        const node = buildNode(sg, false);
        totalChildLedgers += node.ledgerCount;
        totalChildGroups += 1 + node.subgroupCount;
        children.push(node);
      }
      const directLedgers = groupLedgers(pg.id);
      for (const l of directLedgers) {
        children.push({
          type: "ledger" as const,
          id: l.id,
          name: l.name,
          children: [],
          ledgerCount: 0,
          subgroupCount: 0,
          data: l,
        });
      }
      totalChildLedgers += directLedgers.length;
      return {
        type: isRoot ? "root" as const : "group" as const,
        id: pg.id,
        name: pg.name,
        nature: pg.nature,
        children,
        ledgerCount: totalChildLedgers,
        subgroupCount: totalChildGroups,
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

    const roots: TreeNode[] = otherPrimaries.map((pg) => buildNode(pg, true));
    if (currentLiabilities) {
      const node = buildNode(currentLiabilities, true);
      // Append capital primaries as children so equities sit under
      // Current Liabilities in the tree.
      node.children = [...node.children, ...capitalPrimaries.map((pg) => buildNode(pg, false))];
      node.subgroupCount += capitalPrimaries.reduce((acc, cp) => acc + 1 + buildNode(cp, false).subgroupCount, 0);
      node.ledgerCount += capitalPrimaries.reduce((acc, cp) => acc + buildNode(cp, false).ledgerCount, 0);
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

  // ledger id -> quick-filter tags (bank / tax / party) for the chip filters.
  // Derived from the ledger's full ancestor-group chain (name keywords) plus
  // explicit ledger fields (bank_name / gstin), so it works even when demo
  // ledgers have no bank_name/gstin set.
  const ledgerTags = useMemo(() => {
    const byId = new Map(groups.map((g) => [g.id, g]));
    const ancestorNames = (gid: string): string[] => {
      const names: string[] = [];
      let cur = byId.get(gid);
      while (cur) {
        names.push(cur.name.toLowerCase());
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      }
      return names;
    };
    const map = new Map<string, Set<string>>();
    for (const l of ledgers) {
      const tags = new Set<string>();
      const names = ancestorNames(l.group_id);
      const joined = names.join(" ");
      if (l.bank_name || joined.includes("bank")) tags.add("bank");
      if (
        l.gstin ||
        /gst|tax|tds|tcs|duties|reverse charge/.test(joined)
      ) tags.add("tax");
      if (/receivable|payable|party|sundry|loans & advances/.test(joined)) tags.add("party");
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
      const isNature = ["assets", "liabilities", "capital", "income", "expenses"].includes(categoryFilter);
      if (isNature) {
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
      } else {
        // tax / bank / party — driven by ledgerTags
        const byId = new Map(groups.map((g) => [g.id, g]));
        for (const l of ledgers) {
          if (ledgerTags.get(l.id)?.has(categoryFilter)) {
            ids.add(l.id);
            // walk the full ancestor chain so root groups are included
            // (and thus auto-expanded by the effect below).
            let cur = byId.get(l.group_id);
            while (cur) {
              ids.add(cur.id);
              cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
            }
          }
        }
      }
    }
    return ids;
  }, [searchLower, groups, ledgers, ledgerNature, ledgerTags, categoryFilter]);

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

  // Tree grid: Name | Opening Balance | Closing Balance | Actions.
  // NOTE: must be STATIC literal class strings so Tailwind's content scanner emits them.
  const TREE_GRID =
    balanceView === "both"
      ? "grid grid-cols-[1fr_180px_180px] items-center gap-2"
      : "grid grid-cols-[1fr_200px] items-center gap-2";

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
        {balanceView !== "closing" && <div className="text-right">Opening Balance</div>}
        {balanceView !== "opening" && <div className="text-right">Closing Balance</div>}

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
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> <span className="font-semibold text-blue-600 dark:text-blue-400">Opening Balance</span></span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> <span className="font-semibold text-orange-600 dark:text-orange-400">Closing Balance</span></span>
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
      if ((searchLower || categoryFilter) && !match) return null;
      const op = fmtBal(l.opening_balance_type === "Dr" ? l.opening_balance : -l.opening_balance);
      const cl = fmtBal(l.closing_balance_type === "Dr" ? l.closing_balance : -l.closing_balance);
      return (
        <div
          key={node.id}
          onContextMenu={(e) => openCtxMenu(e, node)}
          className={`${TREE_GRID} px-5 py-1.5 rounded-lg cursor-pointer transition-colors ${
            (searchLower || categoryFilter) && match ? "bg-brand-50 dark:bg-blue-500/10" : "hover:bg-slate-50 dark:hover:bg-[#1a1a24]"
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

    if ((searchLower || categoryFilter) && !match) {
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
            (searchLower || categoryFilter) && match ? "bg-brand-50 dark:bg-blue-500/10" : "hover:bg-slate-50 dark:hover:bg-[#1a1a24]"
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

  const stats = useMemo(() => {
    const groupByNature: Record<string, number> = {};
    for (const g of groups) {
      const n = g.nature || "other";
      groupByNature[n] = (groupByNature[n] || 0) + 1;
    }

    const ledgerByNature: Record<string, number> = {};
    const balanceByNature: Record<string, number> = {}; // positive=Dr, negative=Cr
    const ledgerByNatureAndTag: Record<string, { bank: number; party: number; other: number }> = {};
    const balanceByNatureAndTag: Record<string, { bank: number; party: number; other: number }> = {};

    for (const l of ledgers) {
      const n = ledgerNature.get(l.id) || "other";
      const tags = ledgerTags.get(l.id) || new Set();

      ledgerByNature[n] = (ledgerByNature[n] || 0) + 1;

      const signed = l.closing_balance_type === "Dr" ? l.closing_balance : -l.closing_balance;
      balanceByNature[n] = (balanceByNature[n] || 0) + signed;

      const tag = tags.has("bank") ? "bank" : tags.has("party") ? "party" : "other";
      if (!ledgerByNatureAndTag[n]) ledgerByNatureAndTag[n] = { bank: 0, party: 0, other: 0 };
      if (!balanceByNatureAndTag[n]) balanceByNatureAndTag[n] = { bank: 0, party: 0, other: 0 };
      ledgerByNatureAndTag[n][tag]++;
      balanceByNatureAndTag[n][tag] += signed;
    }

    return { totalGroups: groups.length, totalLedgers: ledgers.length, groupByNature, ledgerByNature, balanceByNature, ledgerByNatureAndTag, balanceByNatureAndTag };
  }, [groups, ledgers, ledgerNature, ledgerTags]);
  const LIST_GRID = `grid grid-cols-[2.6fr_1.3fr_1fr_1fr] items-center gap-2`;

  const ListView = () => (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f]">
      <div className={`${LIST_GRID} border-b-2 border-slate-200 dark:border-[#282832] bg-slate-50 dark:bg-[#0f0f16] px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] shadow-sm`}>
        <div>Ledger</div>
        <div>Group</div>
        {balanceView !== "closing" && <div className="text-right">Opening Balance</div>}
        {balanceView !== "opening" && <div className="text-right">Closing Balance</div>}
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
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCtxMenu({ x: e.clientX, y: e.clientY, node: { id: l.id.toString(), name: l.name, type: "ledger", children: [], ledgerCount: 0, subgroupCount: 0, data: l } as TreeNode });
                  }}
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
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="flex items-center gap-4 border-t border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#0f0f16] px-4 py-2 text-[11px] text-slate-500 dark:text-[#94a3b8]">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> <span className="font-semibold text-blue-600 dark:text-blue-400">Opening Balance</span></span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> <span className="font-semibold text-orange-600 dark:text-orange-400">Closing Balance</span></span>
      </div>
    </div>
  );

  // Trial Balance mode — single continuous report table (PARTICULARS / DR / CR).
  const TB_GRID = "grid grid-cols-[1fr_180px_180px] items-center gap-2";
  const TrialBalanceView = () => {
    const order: { nature: string; label: string }[] = [
      { nature: "assets", label: "Assets" },
      { nature: "liabilities", label: "Liabilities" },
      { nature: "capital", label: "Capital & Reserves" },
      { nature: "income", label: "Income" },
      { nature: "expenses", label: "Expenses" },
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
          {/* Balance view: Opening | Closing | Both */}
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-[#282832] overflow-hidden">
            {(["opening", "closing", "both"] as const).map((v) => (
              <button
                key={v}
                onClick={() => { setBalanceView(v); writeCoaPref(BALANCE_VIEW_KEY, v); }}
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
                onClick={() => { setView(v); writeCoaPref(VIEW_KEY, v); }}
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

      <div className="flex gap-5 items-start">
      <div className="flex-1 min-w-0">
      {/* Category filter chips */}
      <div className="flex flex-wrap items-center gap-2 mt-3 mb-5">
        {[
          { v: "", label: "All" },
          { v: "assets", label: "Assets" },
          { v: "liabilities", label: "Liabilities" },
          { v: "capital", label: "Capital" },
          { v: "income", label: "Income" },
          { v: "expenses", label: "Expenses" },
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
              ...(canEdit ? [{ label: "Create Voucher", onClick: () => navigate("/vouchers?action=new") }] : []),
              ...(canEdit ? [{ label: "Edit", onClick: () => setFormState({ type: "ledger", mode: "edit", data: ctxMenu.node.data }) }] : []),
              ...(canEdit && !(ctxMenu.node.data as Ledger).is_protected ? [{
                label: (ctxMenu.node.data as Ledger).is_active ? "Disable" : "Enable",
                onClick: () => toggleLedgerActive(ctxMenu.node.data as Ledger),
              }] : []),
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
      </div>
      {/* Sidebar */}
      <div className="w-[300px] shrink-0 hidden lg:block self-start sticky top-4 mt-[60px] space-y-4">
        {/* Account Summary */}
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 text-xs">
          <div className="text-sm font-bold text-slate-800 dark:text-[#f1f5f9] mb-3">Account Summary</div>
          <div className="grid grid-cols-[1fr_48px_48px] gap-x-2 gap-y-1">
            {/* Header */}
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#94a3b8]">Item</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#94a3b8] text-right">Grps</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#94a3b8] text-right">Leds</div>

            {[
              { nature: "assets", label: "Assets", dot: "bg-green-500" },
              { nature: "liabilities", label: "Liabilities", dot: "bg-blue-500" },
              { nature: "income", label: "Income", dot: "bg-emerald-500" },
              { nature: "expenses", label: "Expenses", dot: "bg-red-500" },
              { nature: "capital", label: "Capital & Reserves", dot: "bg-purple-500" },
            ].map(({ nature, label, dot }) => {
              const tags = stats.ledgerByNatureAndTag[nature];
              const hasSub = tags && (tags.bank > 0 || tags.party > 0);
              return (
                <div key={nature} className="contents">
                  {/* Main nature row — clickable */}
                  <div
                    className="flex items-center gap-1.5 col-span-3 grid grid-cols-subgrid cursor-pointer rounded px-1 -mx-1 hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors"
                    onClick={() => setCategoryFilter(categoryFilter === nature ? "" : nature)}
                  >
                    <span className="flex items-center gap-1.5 py-0.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                      <span className={`truncate ${categoryFilter === nature ? "font-semibold text-brand-700 dark:text-blue-400" : "text-slate-700 dark:text-[#f1f5f9]"}`}>{label}</span>
                    </span>
                    <span className="text-right text-slate-600 dark:text-[#cbd5e1] tabular-nums">{stats.groupByNature[nature] || 0}</span>
                    <span className="text-right text-slate-600 dark:text-[#cbd5e1] tabular-nums">{stats.ledgerByNature[nature] || 0}</span>
                  </div>

                  {/* Sub-rows: bank, party */}
                  {hasSub && (
                    <>
                      {tags!.bank > 0 && (
                        <div className="col-span-3 grid grid-cols-subgrid pl-5 text-xs text-slate-500 dark:text-[#94a3b8]">
                          <span className="truncate">Bank Accounts</span>
                          <span className="text-right tabular-nums">—</span>
                          <span className="text-right tabular-nums">{tags!.bank}</span>
                        </div>
                      )}
                      {tags!.party > 0 && (
                        <div className="col-span-3 grid grid-cols-subgrid pl-5 text-xs text-slate-500 dark:text-[#94a3b8]">
                          <span className="truncate">Party ({nature === "income" ? "Payables" : "Receivables"})</span>
                          <span className="text-right tabular-nums">—</span>
                          <span className="text-right tabular-nums">{tags!.party}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
          <div className="text-sm font-bold text-slate-800 dark:text-[#f1f5f9]">Quick Actions</div>
          <div className="flex flex-col gap-2">
            {canEdit && (
              <>
                <button
                  onClick={() => setFormState({ type: "group", mode: "create" })}
                  className="w-full h-8 rounded-lg bg-brand-600 dark:bg-blue-500 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600 transition-colors"
                >
                  New Group
                </button>
                <button
                  onClick={() => setFormState({ type: "group", mode: "create", groupType: "sub" })}
                  className="w-full h-8 rounded-lg border border-brand-600 dark:border-blue-500 text-sm font-medium text-brand-600 dark:text-blue-400 hover:bg-brand-50 dark:hover:bg-blue-500/10 transition-colors"
                >
                  New Subgroup
                </button>
                <button
                  onClick={() => setFormState({ type: "ledger", mode: "create" })}
                  className="w-full h-8 rounded-lg border border-brand-600 dark:border-blue-500 text-sm font-medium text-brand-600 dark:text-blue-400 hover:bg-brand-50 dark:hover:bg-blue-500/10 transition-colors"
                >
                  New Ledger
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      </div>

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
          <Modal open onClose={() => { setLedgerDetail(null); }} maxWidth="sm" panelClassName="px-6 py-4">
            <p className="text-sm text-slate-600 dark:text-[#cbd5e1]">
              {ledgerLoading ? "Loading ledger…" : "Could not load ledger."}
            </p>
          </Modal>
        )
      )}
    </div>
  );
}
