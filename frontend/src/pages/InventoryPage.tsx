import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import Modal from "../components/Modal";

import { todayIso } from "../utils/dateUtils";
import DateInput from "../components/DateInput";
import { toDisplayDate } from "../utils/dateUtils";
import Select from "../components/Select";
import MasterSelector from "../components/master/MasterSelector";
import Tabs from "../components/Tabs";
import { PAGE_TAB_DEFS } from "../config/pageTabs";
import Pagination from "../components/Pagination";
import SortableTable, { type SortableColumn } from "../components/SortableTable";
import { useRole } from "../hooks/useRole";
import { useToastStore } from "../store/toast";
import { showConfirm } from "../components/ConfirmDialog";
import TabContent from "../components/TabContent";
import { InventorySkeleton } from "./skeletons";
import { useStockGroups, useStockItems, useUnits, useHsnSac, type StockGroup, type InventoryStockItem as StockItem } from "../hooks/useMasterData";

interface StockEntry {
  id: string; stock_item_id: string; entry_type: string; quantity: number;
  rate: number; total_amount: number; entry_date: string;
  reference: string | null; narration: string | null; voucher_id: string | null;
}

interface StockBalanceLine {
  stock_item_id: string; stock_item_name: string; quantity: number;
  avg_rate: number; total_value: number; valuation_method: string;
}

interface StockMovementLine {
  stock_item_name: string; inward: number; outward: number;
}

interface StockAgingLine {
  stock_item_name: string; quantity: number; days_old: number;
}

type Tab = "groups" | "items" | "entries" | "balance" | "movement" | "aging" | "bom";
const GRP_FORM_EMPTY = { name: "", description: "" };
const ITEM_FORM_EMPTY = { name: "", stock_group_id: "", sku: "", hsn_sac_code: "", unit_of_measure: "Nos", opening_qty: 0, opening_rate: 0, valuation_method: "weighted_avg", gst_rate: 0, item_type: "goods" };
const ENTRY_FORM_EMPTY = { stock_item_id: "", entry_type: "inward", quantity: 0, rate: 0, entry_date: todayIso(), reference: "", narration: "" };

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const LOW_STOCK_THRESHOLD = 10;

export default function InventoryPage() {
  const { canEdit } = useRole();
  const toast = useToastStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("groups");
  const [entriesData, setEntriesData] = useState<{ items: StockEntry[]; total: number }>({ items: [], total: 0 });
  const [entriesQuery, setEntriesQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [entriesPage, setEntriesPage] = useState(1);
  const [entriesPageSize, setEntriesPageSize] = useState(25);
  
  // State for new report tabs
  const [stockBalanceData, setStockBalanceData] = useState<any>(null);
  const [stockMovementData, setStockMovementData] = useState<any>(null);
  const [stockAgingData, setStockAgingData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Modal state for all three entity types
  const [selectedGroup, setSelectedGroup] = useState<StockGroup | null>(null);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<StockEntry | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const itemNameRef = useRef<HTMLInputElement>(null);
  const grpNameRef = useRef<HTMLInputElement>(null);

  // Auto-focus first field when modals open
  useEffect(() => {
    if (selectedItem) setTimeout(() => itemNameRef.current?.focus(), 50);
  }, [selectedItem]);
  useEffect(() => {
    if (selectedGroup) setTimeout(() => grpNameRef.current?.focus(), 50);
  }, [selectedGroup]);

  // Form state (populated when modal opens)
  const [grpForm, setGrpForm] = useState(GRP_FORM_EMPTY);
  const [itemForm, setItemForm] = useState(ITEM_FORM_EMPTY);
  const [entryForm, setEntryForm] = useState(ENTRY_FORM_EMPTY);

  // Use React Query for master data
  const { data: groups = [] } = useStockGroups();
  const { data: items = [] } = useStockItems();
  const { data: units = [] } = useUnits();
  const { data: hsnSacList = [] } = useHsnSac();

  // Server-side paged fetch: the API exposes search/limit/offset and returns
  // { items, total, limit, offset } — we only pull the current page window.
  const loadEntries = useCallback((page: number, pageSize: number, q: string) => {
    const params = new URLSearchParams({ limit: String(pageSize), offset: String((page - 1) * pageSize) });
    if (q.trim()) params.set("search", q.trim());
    api.get<{ items: StockEntry[]; total: number }>(`/inventory/entries?${params}`)
      .then((res) => {
        const items = Array.isArray(res) ? res : (res.items ?? []);
        const total = Array.isArray(res) ? res.length : (res.total ?? 0);
        setEntriesData({ items, total });
        setLoading(false);
        // A mutation (bulk delete / entry delete) can shrink the total below
        // the current window start — clamp back to the last valid page.
        if (total > 0 && (page - 1) * pageSize >= total) {
          setEntriesPage(Math.max(1, Math.ceil(total / pageSize)));
        }
      })
      .catch((err) => { setLoading(false); toast.error(err?.message || "Failed to load entries"); });
  }, [toast]);

  // Debounced refetch on mount, search input, page, or page-size change.
  useEffect(() => {
    const t = setTimeout(() => { loadEntries(entriesPage, entriesPageSize, entriesQuery); }, entriesQuery ? 250 : 0);
    return () => clearTimeout(t);
  }, [entriesPage, entriesPageSize, entriesQuery, loadEntries]);

  // Refresh the current window after a mutation (bulk delete / modal save).
  const refreshEntries = useCallback(() => {
    loadEntries(entriesPage, entriesPageSize, entriesQuery);
  }, [loadEntries, entriesPage, entriesPageSize, entriesQuery]);

  // Fetch report data when Balance, Movement, or Aging tabs are selected
  useEffect(() => {
    if (tab === "balance" || tab === "movement" || tab === "aging") {
      setReportLoading(true);
      const endpoint = tab === "balance" ? "/reports/stock-summary" : tab === "movement" ? "/reports/stock-movement" : "/reports/stock-ageing";
      api.get<any>(endpoint)
        .then((data) => {
          if (tab === "balance") setStockBalanceData(data);
          else if (tab === "movement") setStockMovementData(data);
          else if (tab === "aging") setStockAgingData(data);
        })
        .catch((err) => toast.error(err?.message || "Failed to load report"))
        .finally(() => setReportLoading(false));
    }
  }, [tab, toast]);

  // Auto-open from command palette (?tab=groups|items|entries&action=new)
  useEffect(() => {
    const paramTab = searchParams.get("tab") as Tab | null;
    const action = searchParams.get("action");
    if (!paramTab && !action) return;
    setSearchParams({}, { replace: true });
    if (paramTab) setTab(paramTab);
    // Delay form open to let tab state settle
    setTimeout(() => {
      if (!action || !canEdit) return;
      if (paramTab === "groups" || (!paramTab && tab === "groups")) handleGroupNew();
      else if (paramTab === "items" || (!paramTab && tab === "items")) handleItemNew();
      else if (paramTab === "entries" || (!paramTab && tab === "entries")) handleEntryNew();
    }, 100);
  }, [searchParams]);

  // Helper to invalidate master data cache after mutations
  const invalidateMasterData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["stockGroups"] });
    queryClient.invalidateQueries({ queryKey: ["stockItems"] });
    queryClient.invalidateQueries({ queryKey: ["units"] });
    queryClient.invalidateQueries({ queryKey: ["hsnSac"] });
  }, [queryClient]);

  // ── Bulk delete handlers ──
  const toggleItemSelect = (id: string) => {
    setSelectedItems((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const toggleEntrySelect = (id: string) => {
    setSelectedEntries((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const toggleAllItems = (ids: string[]) => { setSelectedItems(new Set(ids)); };
  const toggleAllEntries = (ids: string[]) => { setSelectedEntries(new Set(ids)); };

  const bulkDeleteItems = async () => {
    if (selectedItems.size === 0) return;
    if (!await showConfirm(`Delete ${selectedItems.size} item(s)?`, { danger: true, confirmLabel: "Delete" })) return;
    try {
      const result = await api.post<{ processed: number; errors: string[] }>("/inventory/items/bulk-delete", { ids: Array.from(selectedItems) });
      if (result.errors?.length) toast.error(result.errors.join("; "));
      else toast.success(`Deleted ${result.processed} item(s)`);
      setSelectedItems(new Set());
      invalidateMasterData();
      refreshEntries();
    } catch (err: any) { toast.error(err?.message || "Failed to delete items"); }
  };

  const bulkDeleteEntries = async () => {
    if (selectedEntries.size === 0) return;
    if (!await showConfirm(`Delete ${selectedEntries.size} entry/entries)?`, { danger: true, confirmLabel: "Delete" })) return;
    try {
      const result = await api.post<{ processed: number; errors: string[] }>("/inventory/entries/bulk-delete", { ids: Array.from(selectedEntries) });
      if (result.errors?.length) toast.error(result.errors.join("; "));
      else toast.success(`Deleted ${result.processed} entry/entries)`);
      setSelectedEntries(new Set());
      invalidateMasterData();
      refreshEntries();
    } catch (err: any) { toast.error(err?.message || "Failed to delete entries"); }
  };

  // ── Derived data ──
  const groupItemCount = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach((i) => { if (i.stock_group_id) map[i.stock_group_id] = (map[i.stock_group_id] || 0) + 1; });
    return map;
  }, [items]);

  const groupStockValue = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach((i) => {
      if (i.stock_group_id) map[i.stock_group_id] = (map[i.stock_group_id] || 0) + i.opening_qty * i.opening_rate;
    });
    return map;
  }, [items]);

  const totalStockValue = useMemo(() => items.reduce((s, i) => s + i.opening_qty * i.opening_rate, 0), [items]);

  // Groups whose items are at/below the low-stock threshold — shown as an
  // amber badge on the Groups table Items column.
  const lowStockByGroup = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach((i) => {
      if (i.stock_group_id && i.opening_qty <= LOW_STOCK_THRESHOLD) map[i.stock_group_id] = (map[i.stock_group_id] || 0) + 1;
    });
    return map;
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.sku && i.sku.toLowerCase().includes(q)) || (i.hsn_sac_code && i.hsn_sac_code.toLowerCase().includes(q)));
  }, [items, searchQuery]);


  // Select option arrays
  const groupOpts = [{ value: "", label: "None" }, ...groups.map((g) => ({ value: g.id, label: g.name }))];
  const unitOpts = [{ value: "", label: "None" }, ...units.map((u) => ({ value: u.name, label: u.name }))];
  const hsnSacOpts = hsnSacList.map((h) => ({ value: h.code, label: `${h.code} — ${h.description}` }));
  const valuationOpts = [{ value: "weighted_avg", label: "Weighted Average" }, { value: "fifo", label: "FIFO" }];
  const itemTypeOpts = [{ value: "goods", label: "Goods" }, { value: "service", label: "Service" }];
  const gstOpts = [
    { value: "0", label: "None (0%)" }, { value: "0.25", label: "0.25%" }, { value: "3", label: "3%" },
    { value: "5", label: "5%" }, { value: "12", label: "12%" }, { value: "18", label: "18%" }, { value: "28", label: "28%" },
  ];
  const stockItemOpts = [{ value: "", label: "Select item" }, ...items.map((i) => ({ value: i.id, label: i.name }))];
  const entryTypeOpts = [{ value: "inward", label: "Inward" }, { value: "outward", label: "Outward" }];

  // ── Group Modal Handlers ──
  const handleGroupClick = useCallback((group: StockGroup) => {
    setGrpForm({ name: group.name, description: group.description ?? "" });
    setSelectedGroup(group);
  }, []);

  const handleGroupNew = useCallback(() => {
    setGrpForm(GRP_FORM_EMPTY);
    setSelectedGroup({ id: "", company_id: "", name: "", description: null, is_active: true });
  }, []);

  const handleGroupModalUpdate = async (id: string, payload: any) => {
    setIsSubmitting(true);
    try {
      await api.patch(`/inventory/groups/${id}`, payload);
      setSelectedGroup(null);
      invalidateMasterData();
      refreshEntries();
      toast.success("Stock group updated");
    } catch (err: any) { toast.error(err?.message || "Failed to update group"); }
    finally { setIsSubmitting(false); }
  };

  const handleGroupModalSubmit = async (payload: any) => {
    setIsSubmitting(true);
    try {
      await api.post("/inventory/groups", payload);
      setSelectedGroup(null);
      invalidateMasterData();
      refreshEntries();
      toast.success("Stock group created");
    } catch (err: any) { toast.error(err?.message || "Failed to create group"); }
    finally { setIsSubmitting(false); }
  };

  const handleGroupModalDelete = async () => {
    if (!selectedGroup?.id) return;
    if (!await showConfirm(`Delete group "${selectedGroup.name}"?`, { danger: true, confirmLabel: "Delete" })) return;
    try {
      await api.del(`/inventory/groups/${selectedGroup.id}`);
      setSelectedGroup(null);
      invalidateMasterData();
      refreshEntries();
      toast.success("Stock group deleted");
    } catch (err: any) { toast.error(err?.message || "Failed to delete group"); }
  };

  const handleGroupModalClose = () => { setSelectedGroup(null); };



  // ── Item Modal Handlers ──
  const handleItemClick = useCallback((item: StockItem) => {
    setItemForm({
      name: item.name, stock_group_id: item.stock_group_id ?? "", sku: item.sku ?? "",
      hsn_sac_code: item.hsn_sac_code ?? "", unit_of_measure: item.unit_of_measure,
      opening_qty: item.opening_qty, opening_rate: item.opening_rate,
      valuation_method: item.valuation_method, gst_rate: item.gst_rate,
      item_type: item.item_type ?? "goods",
    });
    setSelectedItem(item);
  }, []);

  const handleItemNew = useCallback(() => {
    setItemForm(ITEM_FORM_EMPTY);
    setSelectedItem({ id: "", stock_group_id: null, name: "", sku: null, hsn_sac_code: null, unit_of_measure: "Nos", opening_qty: 0, opening_rate: 0, valuation_method: "weighted_avg", gst_rate: 0, item_type: "goods", is_active: true, tracking_mode: "none" });
  }, []);

  const handleItemModalUpdate = async (id: string, payload: any) => {
    setIsSubmitting(true);
    try {
      await api.patch(`/inventory/items/${id}`, payload);
      setSelectedItem(null);
      invalidateMasterData();
      refreshEntries();
      toast.success("Stock item updated");
    } catch (err: any) { toast.error(err?.message || "Failed to update item"); }
    finally { setIsSubmitting(false); }
  };

  const handleItemModalSubmit = async (payload: any) => {
    setIsSubmitting(true);
    try {
      await api.post("/inventory/items", payload);
      setSelectedItem(null);
      invalidateMasterData();
      refreshEntries();
      toast.success("Stock item created");
    } catch (err: any) { toast.error(err?.message || "Failed to create item"); }
    finally { setIsSubmitting(false); }
  };

  const handleItemModalDuplicate = () => {
    if (!selectedItem) return;
    const dup = { ...selectedItem, id: "" as string, name: selectedItem.name + " (copy)" };
    setSelectedItem(dup);
    setItemForm({ name: dup.name, stock_group_id: dup.stock_group_id ?? "", sku: dup.sku ?? "", hsn_sac_code: dup.hsn_sac_code ?? "", unit_of_measure: dup.unit_of_measure, opening_qty: dup.opening_qty, opening_rate: dup.opening_rate, valuation_method: dup.valuation_method, gst_rate: dup.gst_rate, item_type: dup.item_type ?? "goods" });
  };

  const handleItemModalDelete = async () => {
    if (!selectedItem?.id) return;
    if (!await showConfirm(`Delete item "${selectedItem.name}"?`, { danger: true, confirmLabel: "Delete" })) return;
    try {
      await api.del(`/inventory/items/${selectedItem.id}`);
      setSelectedItem(null);
      invalidateMasterData();
      refreshEntries();
      toast.success("Stock item deleted");
    } catch (err: any) { toast.error(err?.message || "Failed to delete item"); }
  };

  const handleItemModalClose = () => { setSelectedItem(null); };



  // ── Entry Modal Handlers ──
  const handleEntryClick = useCallback((entry: StockEntry) => {
    setEntryForm({ stock_item_id: entry.stock_item_id, entry_type: entry.entry_type, quantity: entry.quantity, rate: entry.rate, entry_date: entry.entry_date, reference: entry.reference ?? "", narration: entry.narration ?? "" });
    setSelectedEntry(entry);
  }, []);

  const handleEntryNew = useCallback(() => {
    setEntryForm(ENTRY_FORM_EMPTY);
    setSelectedEntry({ id: "", stock_item_id: "", entry_type: "inward", quantity: 0, rate: 0, total_amount: 0, entry_date: todayIso(), reference: null, narration: null, voucher_id: null });
  }, []);

  const handleEntryModalUpdate = async (id: string, payload: any) => {
    setIsSubmitting(true);
    try {
      await api.patch(`/inventory/entries/${id}`, payload);
      setSelectedEntry(null);
      invalidateMasterData();
      refreshEntries();
      toast.success("Stock entry updated");
    } catch (err: any) { toast.error(err?.message || "Failed to update entry"); }
    finally { setIsSubmitting(false); }
  };

  const handleEntryModalSubmit = async (payload: any) => {
    setIsSubmitting(true);
    try {
      await api.post("/inventory/entries", payload);
      setSelectedEntry(null);
      invalidateMasterData();
      refreshEntries();
      toast.success("Stock entry created");
    } catch (err: any) { toast.error(err?.message || "Failed to create entry"); }
    finally { setIsSubmitting(false); }
  };

  const handleEntryModalDuplicate = () => {
    if (!selectedEntry) return;
    const dup = { ...selectedEntry, id: "" as string };
    setSelectedEntry(dup);
    setEntryForm({ stock_item_id: dup.stock_item_id, entry_type: dup.entry_type, quantity: dup.quantity, rate: dup.rate, entry_date: dup.entry_date, reference: dup.reference ?? "", narration: dup.narration ?? "" });
  };

  const handleEntryModalDelete = async () => {
    if (!selectedEntry?.id) return;
    if (!await showConfirm("Delete this stock entry?", { danger: true, confirmLabel: "Delete" })) return;
    try {
      await api.del(`/inventory/entries/${selectedEntry.id}`);
      setSelectedEntry(null);
      invalidateMasterData();
      refreshEntries();
      toast.success("Stock entry deleted");
    } catch (err: any) { toast.error(err?.message || "Failed to delete entry"); }
  };

  const handleEntryModalClose = () => { setSelectedEntry(null); };



  // ── SortableTable column definitions ──
  const itemColumns: SortableColumn<StockItem>[] = useMemo(() => [
    { id: "name", header: "Name", accessorKey: "name", size: 180, cell: ({ getValue }) => (
      <span className="truncate block max-w-[180px]" title={getValue() as string}>{getValue() as string}</span>
    ), className: "font-medium text-slate-900 dark:text-[#f1f5f9]" },
    { id: "item_type", header: "Type", accessorKey: "item_type", size: 80, cell: ({ getValue }) => {
      const v = getValue() as string;
      return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${v === "service" ? "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400" : "bg-slate-100 dark:bg-[#282832] text-slate-600 dark:text-[#cbd5e1]"}`}>{v}</span>;
    } },
    { id: "sku", header: "SKU", accessorKey: "sku", size: 100, cell: ({ getValue }) => (
      <span className="truncate block max-w-[100px]" title={getValue() as string ?? ""}>{getValue() ?? "—"}</span>
    ), className: "text-slate-600 dark:text-[#cbd5e1]" },
    { id: "group", header: "Group", accessorFn: (row) => groups.find((g) => g.id === row.stock_group_id)?.name ?? "—", size: 130, cell: ({ getValue }) => (
      <span className="truncate block max-w-[130px]" title={getValue() as string}>{getValue() as string}</span>
    ), className: "text-slate-600 dark:text-[#cbd5e1]" },
    { id: "hsn", header: "HSN/SAC", accessorKey: "hsn_sac_code", size: 100, cell: ({ getValue }) => (
      <span className="truncate block max-w-[100px]" title={getValue() as string ?? ""}>{getValue() ?? "—"}</span>
    ), className: "text-slate-600 dark:text-[#cbd5e1]" },
    { id: "uom", header: "UOM", accessorKey: "unit_of_measure", size: 70, className: "text-slate-600 dark:text-[#cbd5e1]" },
    { id: "opening_qty", header: "Qty", accessorKey: "opening_qty", size: 100, cell: ({ getValue }) => {
      const q = getValue() as number;
      const low = q <= LOW_STOCK_THRESHOLD;
      return (
        <span className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          <span className={`tabular-nums ${low ? "font-semibold text-amber-600 dark:text-amber-400" : ""}`}>{q.toLocaleString("en-IN")}</span>
          {low && (
            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" title={`At or below the ${LOW_STOCK_THRESHOLD}-unit low-stock threshold`}>low</span>
          )}
        </span>
      );
    }, className: "text-right" },
    { id: "opening_rate", header: "Rate", accessorKey: "opening_rate", size: 100, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">₹{(getValue() as number).toLocaleString("en-IN")}</span>, className: "text-right" },
    { id: "value", header: "Value", accessorFn: (row) => row.opening_qty * row.opening_rate, size: 110, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">₹{fmt(getValue() as number)}</span>, className: "text-right font-medium" },
    { id: "gst_rate", header: "GST%", accessorKey: "gst_rate", size: 70, cell: ({ getValue }) => `${getValue()}%`, className: "text-slate-600 dark:text-[#cbd5e1]" },
  ], [groups]);

  const entryColumns: SortableColumn<StockEntry>[] = useMemo(() => [
    { id: "entry_date", header: "Date", accessorKey: "entry_date", size: 110, cell: ({ getValue }) => toDisplayDate(getValue()), className: "text-slate-600 dark:text-[#cbd5e1] whitespace-nowrap" },
    { id: "item", header: "Item", accessorFn: (row) => items.find((i) => i.id === row.stock_item_id)?.name ?? "—", size: 160, cell: ({ getValue }) => (
      <span className="truncate block max-w-[160px]" title={getValue() as string}>{getValue() as string}</span>
    ), className: "font-medium text-slate-900 dark:text-[#f1f5f9]" },
    { id: "entry_type", header: "Type", accessorKey: "entry_type", size: 90, cell: ({ getValue }) => {
      const v = getValue() as string;
      return (
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${v === "inward" ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400"}`}>
          {v}
        </span>
      );
    }},
    { id: "quantity", header: "Qty", accessorKey: "quantity", size: 90, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{(getValue() as number).toLocaleString("en-IN")}</span>, className: "text-right" },
    { id: "rate", header: "Rate", accessorKey: "rate", size: 100, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">₹{(getValue() as number).toLocaleString("en-IN")}</span>, className: "text-right" },
    { id: "total_amount", header: "Amount", accessorKey: "total_amount", size: 120, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">₹{fmt(getValue() as number)}</span>, className: "text-right font-medium" },
    { id: "reference", header: "Reference", accessorKey: "reference", size: 130, cell: ({ getValue }) => (
      <span className="truncate block max-w-[130px]" title={getValue() as string ?? ""}>{getValue() ?? "—"}</span>
    ), className: "text-slate-600 dark:text-[#cbd5e1]" },
    { id: "narration", header: "Narration", accessorKey: "narration", size: 150, cell: ({ getValue }) => (
      <span className="truncate block max-w-[150px]" title={getValue() as string ?? ""}>{getValue() ?? "—"}</span>
    ), className: "text-slate-600 dark:text-[#cbd5e1]" },
  ], [items]);

  const inputCls = "w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm dark:bg-[#282832] dark:text-[#f1f5f9] focus:border-brand-600 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:focus:ring-blue-500/20";
  const lbl = "mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]";

  // ── SortableTable column definitions ──
  const groupColumns: SortableColumn<StockGroup>[] = useMemo(() => [
    { id: "name", header: "Group", accessorKey: "name", size: 220, cell: ({ getValue }) => (
      <span className="truncate block max-w-[220px] font-medium text-slate-900 dark:text-[#f1f5f9]" title={getValue() as string}>{getValue() as string}</span>
    ) },
    { id: "description", header: "Description", accessorKey: "description", size: 260, cell: ({ getValue }) => (
      <span className="truncate block max-w-[260px] text-slate-600 dark:text-[#cbd5e1]" title={getValue() as string ?? ""}>{getValue() ?? "—"}</span>
    ) },
    { id: "status", header: "Status", accessorFn: (row) => row.is_active ? "Active" : "Inactive", size: 100, cell: ({ getValue }) => {
      const v = getValue() as string;
      return (
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${v === "Active" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-[#282832] dark:text-[#64748b]"}`}>
          {v}
        </span>
      );
    } },
    { id: "items", header: "Items", accessorFn: (row) => groupItemCount[row.id] || 0, size: 110, cell: ({ getValue, row }) => {
      const n = getValue() as number;
      const low = lowStockByGroup[row.original.id] || 0;
      return (
        <span className="flex items-center justify-end gap-1.5">
          {n > 0 ? (
            <span className="inline-flex min-w-[28px] items-center justify-center whitespace-nowrap rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">{n.toLocaleString("en-IN")}</span>
          ) : (
            <span className="text-slate-300 dark:text-[#475569]">—</span>
          )}
          {low > 0 && (
            <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" title={`${low} item(s) at or below ${LOW_STOCK_THRESHOLD} units`}>
              {low} low
            </span>
          )}
        </span>
      );
    }, className: "text-right" },
    { id: "value", header: "Value", accessorFn: (row) => groupStockValue[row.id] || 0, size: 120, cell: ({ getValue }) => {
      const v = getValue() as number;
      return v > 0 ? (
        <span className="whitespace-nowrap font-medium tabular-nums text-emerald-700 dark:text-emerald-400">₹{fmt(v)}</span>
      ) : (
        <span className="text-slate-300 dark:text-[#475569]">—</span>
      );
    }, className: "text-right" },
  ], [groupItemCount, groupStockValue, lowStockByGroup]);

  const balanceColumns: SortableColumn<StockBalanceLine>[] = useMemo(() => [
    { id: "item", header: "Item", accessorKey: "stock_item_name", size: 260, cell: ({ getValue }) => (
      <span className="block max-w-[260px] truncate font-medium text-slate-900 dark:text-[#f1f5f9]" title={getValue() as string}>{getValue() as string}</span>
    ) },
    { id: "qty", header: "Quantity", accessorKey: "quantity", size: 110, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{(getValue() as number)?.toFixed(3)}</span>, className: "text-right" },
    { id: "rate", header: "Avg Rate (₹)", accessorKey: "avg_rate", size: 120, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">₹{fmt((getValue() as number) || 0)}</span>, className: "text-right" },
    { id: "value", header: "Total Value (₹)", accessorKey: "total_value", size: 150, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">₹{fmt((getValue() as number) || 0)}</span>, className: "text-right font-medium" },
    { id: "valuation", header: "Valuation", accessorKey: "valuation_method", size: 130, cell: ({ getValue }) => (
      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${getValue() === "weighted_avg" ? "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400" : "bg-slate-100 text-slate-600 dark:bg-[#282832] dark:text-[#cbd5e1]"}`}>
        {getValue() === "weighted_avg" ? "Weighted Avg" : "FIFO"}
      </span>
    ) },
  ], []);

  const movementColumns: SortableColumn<StockMovementLine>[] = useMemo(() => [
    { id: "item", header: "Item", accessorKey: "stock_item_name", size: 260, cell: ({ getValue }) => (
      <span className="block max-w-[260px] truncate font-medium text-slate-900 dark:text-[#f1f5f9]" title={getValue() as string}>{getValue() as string}</span>
    ) },
    { id: "inward", header: "Inward", accessorKey: "inward", size: 110, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums text-emerald-600 dark:text-emerald-400">{(getValue() as number)?.toFixed(3)}</span>, className: "text-right" },
    { id: "outward", header: "Outward", accessorKey: "outward", size: 110, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums text-rose-600 dark:text-rose-400">{(getValue() as number)?.toFixed(3)}</span>, className: "text-right" },
    { id: "net", header: "Net Movement", accessorFn: (row) => (row.inward ?? 0) - (row.outward ?? 0), size: 130, cell: ({ getValue }) => <span className="whitespace-nowrap font-medium tabular-nums">{(getValue() as number).toFixed(3)}</span>, className: "text-right" },
  ], []);

  const agingColumns: SortableColumn<StockAgingLine>[] = useMemo(() => [
    { id: "item", header: "Item", accessorKey: "stock_item_name", size: 260, cell: ({ getValue }) => (
      <span className="block max-w-[260px] truncate font-medium text-slate-900 dark:text-[#f1f5f9]" title={getValue() as string}>{getValue() as string}</span>
    ) },
    { id: "quantity", header: "Quantity", accessorKey: "quantity", size: 110, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{(getValue() as number)?.toFixed(3)}</span>, className: "text-right" },
    { id: "days", header: "Days Old", accessorKey: "days_old", size: 110, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{(getValue() as number)?.toFixed(0)}</span>, className: "text-right" },
    { id: "bucket", header: "Age Bucket", accessorFn: (row) => row.days_old < 30 ? "0-30 days" : row.days_old < 90 ? "30-90 days" : "90+ days", size: 140, cell: ({ getValue }) => {
      const b = getValue() as string;
      const cls = b === "0-30 days" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : b === "30-90 days" ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400";
      return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{b}</span>;
    } },
  ], []);

  const showStats = !loading && (tab === "groups" || tab === "items" || tab === "entries");

  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groups;
    const q = searchQuery.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q) || (g.description && g.description.toLowerCase().includes(q)));
  }, [groups, searchQuery]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Inventory</h1>
        {canEdit && (
          <button onClick={() => {
              if (tab === "groups") handleGroupNew();
              else if (tab === "items") handleItemNew();
              else handleEntryNew();
            }}
            className="btn-primary px-4 py-1.5 text-sm font-medium">
            {tab === "groups" ? "+ New Group" : tab === "items" ? "+ New Item" : "+ New Entry"}
          </button>
        )}
      </div>
      <Tabs
        tabs={PAGE_TAB_DEFS["/inventory"].tabs}
        active={tab}
        onChange={(t) => { setTab(t as Tab); setSearchQuery(""); setEntriesQuery(""); setEntriesPage(1); setSelectedItems(new Set()); setSelectedEntries(new Set()); }}
        className="mb-6"
      />

      {/* Two-column layout: page content left, summary-stats rail right */}
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
      {showStats && (
        <aside className="order-1 space-y-3 lg:order-2">
          <div className="group rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm transition-all duration-200 hover:shadow-md dark:border-[#1a1a24] dark:from-[#16161f] dark:to-[#1a1a25] dark:hover:border-[#282832]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Groups</p>
            <div className="mt-1 flex items-center gap-2">
              <div className="rounded-lg bg-blue-50 p-1.5 dark:bg-blue-500/10">
                <svg className="h-4 w-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
              </div>
              <span className="text-2xl font-bold text-slate-900 dark:text-[#f1f5f9]">{groups.length}</span>
            </div>
          </div>
          <div className="group rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm transition-all duration-200 hover:shadow-md dark:border-[#1a1a24] dark:from-[#16161f] dark:to-[#1a1a25] dark:hover:border-[#282832]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Items</p>
            <div className="mt-1 flex items-center gap-2">
              <div className="rounded-lg bg-violet-50 p-1.5 dark:bg-violet-500/10">
                <svg className="h-4 w-4 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
              </div>
              <span className="text-2xl font-bold text-slate-900 dark:text-[#f1f5f9]">{items.length}</span>
            </div>
          </div>
          <div className="group rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-emerald-50/40 p-4 shadow-sm transition-all duration-200 hover:shadow-md dark:border-[#1a1a24] dark:from-[#16161f] dark:to-emerald-900/10 dark:hover:border-[#282832]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Stock Value</p>
            <div className="mt-1 flex items-center gap-2">
              <div className="rounded-lg bg-emerald-50 p-1.5 dark:bg-emerald-500/10">
                <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">₹{fmt(totalStockValue)}</span>
            </div>
          </div>
          <div className="group rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm transition-all duration-200 hover:shadow-md dark:border-[#1a1a24] dark:from-[#16161f] dark:to-[#1a1a25] dark:hover:border-[#282832]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Entries</p>
            <div className="mt-1 flex items-center gap-2">
              <div className="rounded-lg bg-amber-50 p-1.5 dark:bg-amber-500/10">
                <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
              </div>
              <span className="text-2xl font-bold text-slate-900 dark:text-[#f1f5f9]">{entriesData.total}</span>
            </div>
          </div>
        </aside>
      )}

      <div className="order-2 min-w-0 lg:order-1">
      <TabContent activeKey={tab}>
      {loading ? (
        <InventorySkeleton />
      ) : tab === "groups" ? (
        /* ── Groups: SortableTable ── */
        <div className="mt-4">
          <div className="mb-3 flex items-center gap-2">
            <input
              type="text"
              placeholder="Search groups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full max-w-sm rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm dark:border-[#1a1a24] dark:bg-[#16161f] dark:text-[#f1f5f9] dark:placeholder-[#64748b]"
            />
          </div>
          <SortableTable
            data={filteredGroups}
            columns={groupColumns}
            tableKey="inventory-groups"
            onRowClick={handleGroupClick}
            emptyMessage={searchQuery ? "No matching groups." : "No stock groups yet."}
          />
        </div>
      ) : tab === "items" ? (
        /* ── Items: SortableTable ── */
        <div className="mt-4">
          <div className="mb-3 flex items-center gap-2">
            <input
              type="text"
              placeholder="Search by name, SKU, or HSN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full max-w-sm rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm dark:border-[#1a1a24] dark:bg-[#16161f] dark:text-[#f1f5f9] dark:placeholder-[#64748b]"
            />
            {selectedItems.size > 0 && (
              <button onClick={bulkDeleteItems} className="whitespace-nowrap rounded-lg bg-gradient-to-r from-red-500 to-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-md hover:from-red-600 hover:to-rose-700">
                Delete ({selectedItems.size})
              </button>
            )}
          </div>
          <SortableTable
            data={filteredItems}
            columns={itemColumns}
            tableKey="inventory-items"
            onRowClick={handleItemClick}
            emptyMessage="No stock items yet."
            selectable={canEdit}
            selected={selectedItems}
            onToggleSelect={toggleItemSelect}
            onToggleAll={toggleAllItems}
          />
        </div>
      ) : tab === "entries" ? (
        /* ── Entries: SortableTable ── */
        <div className="mt-4">
          <div className="mb-3 flex items-center gap-2">
            <input
              type="text"
              placeholder="Search by item, reference, or narration..."
              value={entriesQuery}
              onChange={(e) => { setEntriesQuery(e.target.value); setEntriesPage(1); }}
              className="w-full max-w-sm rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm dark:border-[#1a1a24] dark:bg-[#16161f] dark:text-[#f1f5f9] dark:placeholder-[#64748b]"
            />
            {selectedEntries.size > 0 && (
              <button onClick={bulkDeleteEntries} className="whitespace-nowrap rounded-lg bg-gradient-to-r from-red-500 to-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-md hover:from-red-600 hover:to-rose-700">
                Delete ({selectedEntries.size})
              </button>
            )}
          </div>
          <SortableTable
            data={entriesData.items}
            columns={entryColumns}
            tableKey="inventory-entries"
            onRowClick={handleEntryClick}
            emptyMessage={entriesQuery ? "No matching entries." : "No stock entries yet."}
            selectable={canEdit}
            selected={selectedEntries}
            onToggleSelect={toggleEntrySelect}
            onToggleAll={toggleAllEntries}
          />
          {entriesData.total > 0 && (
            <Pagination
              page={entriesPage}
              pageSize={entriesPageSize}
              total={entriesData.total}
              onPageChange={setEntriesPage}
              onPageSizeChange={(size) => { setEntriesPageSize(size); setEntriesPage(1); }}
              itemLabel="entries"
            />
          )}
        </div>
      ) : tab === "balance" ? (
        /* ── Stock Balance Report ── */
        <div className="mt-4">
          {reportLoading ? (
            <InventorySkeleton />
          ) : stockBalanceData ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-slate-600 dark:text-[#cbd5e1]">Current stock balances across all items</p>
                <div className="flex gap-2">
                  <button onClick={() => window.open("/reports/stock-summary/pdf", "_blank")} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Preview PDF</button>
                  <button onClick={() => { const a = document.createElement("a"); a.href = "/reports/stock-summary/xlsx"; a.download = "stock-summary.xlsx"; a.click(); }} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Download Excel</button>
                </div>
              </div>
              {stockBalanceData.lines?.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-[#64748b]">No stock items found.</p>
              ) : (
                <>
                <SortableTable
                  data={stockBalanceData.lines ?? []}
                  columns={balanceColumns}
                  tableKey="inventory-stock-balance"
                  emptyMessage="No stock items found."
                />
                {stockBalanceData.lines?.length > 0 && (
                  <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold dark:border-[#1a1a24] dark:bg-[#181822]">
                    <span className="text-slate-600 dark:text-[#cbd5e1]">Total</span>
                    <div className="flex items-center gap-10">
                      <span className="w-20 text-right tabular-nums text-slate-900 dark:text-[#f1f5f9]">{stockBalanceData.total_quantity?.toFixed(3)}</span>
                      <span className="w-24 text-right tabular-nums text-emerald-700 dark:text-emerald-400">₹{fmt(stockBalanceData.total_value || 0)}</span>
                    </div>
                  </div>
                )}
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : tab === "movement" ? (
        /* ── Stock Movement Report ── */
        <div className="mt-4">
          {reportLoading ? (
            <InventorySkeleton />
          ) : stockMovementData ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-slate-600 dark:text-[#cbd5e1]">Stock movement across all items</p>
                <div className="flex gap-2">
                  <button onClick={() => window.open("/reports/stock-movement/pdf", "_blank")} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Preview PDF</button>
                  <button onClick={() => { const a = document.createElement("a"); a.href = "/reports/stock-movement/xlsx"; a.download = "stock-movement.xlsx"; a.click(); }} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Download Excel</button>
                </div>
              </div>
              {stockMovementData.lines?.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-[#64748b]">No stock movements found.</p>
              ) : (
                <SortableTable
                  data={stockMovementData.lines ?? []}
                  columns={movementColumns}
                  tableKey="inventory-stock-movement"
                  emptyMessage="No stock movements found."
                />
              )}
            </div>
          ) : null}
        </div>
      ) : tab === "aging" ? (
        /* ── Stock Aging Report ── */
        <div className="mt-4">
          {reportLoading ? (
            <InventorySkeleton />
          ) : stockAgingData ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-slate-600 dark:text-[#cbd5e1]">Stock aging analysis</p>
                <div className="flex gap-2">
                  <button onClick={() => window.open("/reports/stock-ageing/pdf", "_blank")} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Preview PDF</button>
                  <button onClick={() => { const a = document.createElement("a"); a.href = "/reports/stock-ageing/xlsx"; a.download = "stock-aging.xlsx"; a.click(); }} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Download Excel</button>
                </div>
              </div>
              {stockAgingData.lines?.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-[#64748b]">No aging data found.</p>
              ) : (
                <SortableTable
                  data={stockAgingData.lines ?? []}
                  columns={agingColumns}
                  tableKey="inventory-stock-aging"
                  emptyMessage="No aging data found."
                />
              )}
            </div>
          ) : null}
        </div>
      ) : tab === "bom" ? (
        /* ── Bill of Materials ── */
        <div className="mt-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-6 text-center dark:border-blue-500/20 dark:bg-blue-500/5">
            <svg className="mx-auto h-12 w-12 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
            </svg>
            <h3 className="mt-4 text-lg font-semibold text-slate-800 dark:text-[#f1f5f9]">Bill of Materials (BOM)</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-[#cbd5e1]">
              Manage BOMs in the <strong>Manufacturing</strong> module.<br />
              Navigate to <strong>Inventory → Manufacturing → BOMs</strong> to create and manage bill of materials.
            </p>
            <button
              onClick={() => navigate("/manufacturing?tab=boms")}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-md hover:bg-blue-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
              Go to Manufacturing
            </button>
          </div>
        </div>
      ) : null}
      </TabContent>
      </div>
      </div>

      {/* ── Stock Group Modal ── */}
      {selectedGroup && (
        <Modal open onClose={handleGroupModalClose} maxWidth="lg" panelClassName="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">
                {selectedGroup.id ? `Edit Stock Group — ${selectedGroup.name}` : "New Stock Group"}
              </h3>
              <div className="flex items-center gap-2">
                {selectedGroup.id && canEdit && (
                  <button onClick={handleGroupModalDelete} className="rounded border border-red-200 dark:border-red-700 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">Delete</button>
                )}
                <button onClick={handleGroupModalClose} className="rounded border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Close</button>
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={lbl}>Name *</label><input ref={grpNameRef} type="text" value={grpForm.name} onChange={(e) => setGrpForm({ ...grpForm, name: e.target.value })} className={inputCls} /></div>
                <div><label className={lbl}>Description</label><input type="text" value={grpForm.description} onChange={(e) => setGrpForm({ ...grpForm, description: e.target.value })} className={inputCls} /></div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => {
                    if (!grpForm.name.trim()) { toast.error("Name is required"); return; }
                    if (selectedGroup.id) handleGroupModalUpdate(selectedGroup.id, grpForm);
                    else handleGroupModalSubmit(grpForm);
                  }}
                  disabled={isSubmitting}
                  className="btn-primary px-4 py-1.5 text-sm font-medium"
                >
                  {isSubmitting ? "Saving..." : selectedGroup.id ? "Update" : "Create"}
                </button>
                <button onClick={handleGroupModalClose} className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Cancel</button>
              </div>
            </div>
        </Modal>
      )}

      {/* ── Stock Item Modal ── */}
      {selectedItem && (
        <Modal open onClose={handleItemModalClose} maxWidth="4xl" panelClassName="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">
                {selectedItem.id ? `Edit Stock Item — ${selectedItem.name}` : "New Stock Item"}
              </h3>
              <div className="flex items-center gap-2">
                {selectedItem.id && canEdit ? (
                  <>
                    <button onClick={handleItemModalDuplicate} className="rounded border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Duplicate</button>
                    <button onClick={handleItemModalDelete} className="rounded border border-red-200 dark:border-red-700 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">Delete</button>
                  </>
                ) : selectedItem.id ? null : (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Creating new item</span>
                )}
                <button onClick={handleItemModalClose} className="rounded border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Close</button>
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div><label className={lbl}>Name *</label><input ref={itemNameRef} type="text" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} className={inputCls} /></div>
                <div>
                  <label className={lbl}>Item Type *</label>
                  <Select value={itemForm.item_type} onChange={(v) => setItemForm({ ...itemForm, item_type: v })} options={itemTypeOpts} />
                </div>
                <div>
                  <label className={lbl}>Stock Group</label>
                  <MasterSelector
                    entityKey="stock_group"
                    value={itemForm.stock_group_id}
                    onChange={(v) => setItemForm({ ...itemForm, stock_group_id: v })}
                    options={groupOpts}
                    placeholder="Select group..."
                    createdFrom="Stock Items"
                    onItemCreated={(item) => {
                      setItemForm((f) => ({ ...f, stock_group_id: item.id }));
                      invalidateMasterData();
                    }}
                  />
                </div>
                <div><label className={lbl}>SKU</label><input type="text" value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} className={inputCls} /></div>
                <div>
                  <label className={lbl}>HSN/SAC Code</label>
                  <MasterSelector
                    entityKey="hsn_sac"
                    value={itemForm.hsn_sac_code}
                    onChange={(v) => setItemForm({ ...itemForm, hsn_sac_code: v })}
                    options={hsnSacOpts}
                    placeholder="Search or create HSN/SAC..."
                    createdFrom="Stock Items"
                    onItemCreated={(item) => {
                      setItemForm((f) => ({ ...f, hsn_sac_code: item.code }));
                      queryClient.invalidateQueries({ queryKey: ["hsnSac"] });
                    }}
                  />
                </div>
                <div>
                  <label className={lbl}>Unit of Measure</label>
                  <MasterSelector
                    entityKey="unit"
                    value={itemForm.unit_of_measure}
                    onChange={(v) => setItemForm({ ...itemForm, unit_of_measure: v })}
                    options={unitOpts}
                    placeholder="Select unit..."
                    createdFrom="Stock Items"
                    onItemCreated={(item) => {
                      setItemForm((f) => ({ ...f, unit_of_measure: item.name }));
                      queryClient.invalidateQueries({ queryKey: ["units"] });
                    }}
                  />
                </div>
                <div>
                  <Select label="Valuation Method" value={itemForm.valuation_method} onChange={(v) => setItemForm({ ...itemForm, valuation_method: v })} options={valuationOpts} />
                </div>
                <div><label className={lbl}>Opening Qty</label><input type="number" step="0.001" value={itemForm.opening_qty} onChange={(e) => setItemForm({ ...itemForm, opening_qty: parseFloat(e.target.value) || 0 })} className={inputCls} /></div>
                <div><label className={lbl}>Opening Rate</label><input type="number" step="0.01" value={itemForm.opening_rate} onChange={(e) => setItemForm({ ...itemForm, opening_rate: parseFloat(e.target.value) || 0 })} className={inputCls} /></div>
                <div>
                  <Select label="GST Rate (%)" value={String(itemForm.gst_rate)} onChange={(v) => setItemForm({ ...itemForm, gst_rate: parseFloat(v) })} options={gstOpts} />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => {
                    if (!itemForm.name.trim()) { toast.error("Name is required"); return; }
                    const body = { ...itemForm, stock_group_id: itemForm.stock_group_id || null };
                    if (selectedItem.id) handleItemModalUpdate(selectedItem.id, body);
                    else handleItemModalSubmit(body);
                  }}
                  disabled={isSubmitting}
                  className="btn-primary px-4 py-1.5 text-sm font-medium"
                >
                  {isSubmitting ? "Saving..." : selectedItem.id ? "Update" : "Create"}
                </button>
                <button onClick={handleItemModalClose} className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Cancel</button>
              </div>
            </div>
        </Modal>
      )}

      {/* ── Stock Entry Modal ── */}
      {selectedEntry && (
        <Modal open onClose={handleEntryModalClose} maxWidth="4xl" panelClassName="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">
                {selectedEntry.id ? `Edit Stock Entry — ${toDisplayDate(selectedEntry.entry_date)}` : "New Stock Entry"}
              </h3>
              <div className="flex items-center gap-2">
                {selectedEntry.id && canEdit ? (
                  <>
                    <button onClick={handleEntryModalDuplicate} className="rounded border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Duplicate</button>
                    <button onClick={handleEntryModalDelete} className="rounded border border-red-200 dark:border-red-700 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">Delete</button>
                  </>
                ) : selectedEntry.id ? null : (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Creating new entry</span>
                )}
                <button onClick={handleEntryModalClose} className="rounded border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Close</button>
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <MasterSelector entityKey="stock_item" value={entryForm.stock_item_id} onChange={(v) => setEntryForm({ ...entryForm, stock_item_id: v })} options={stockItemOpts} placeholder="Select item" className="w-full" />
                </div>
                <div>
                  <Select label="Type *" value={entryForm.entry_type} onChange={(v) => setEntryForm({ ...entryForm, entry_type: v })} options={entryTypeOpts} />
                </div>
                <div><label className={lbl}>Date *</label>
                  <DateInput value={entryForm.entry_date} onChange={(v) => setEntryForm({ ...entryForm, entry_date: v })} className={inputCls} />
                </div>
                <div><label className={lbl}>Quantity *</label><input type="number" step="0.001" value={entryForm.quantity} onChange={(e) => setEntryForm({ ...entryForm, quantity: parseFloat(e.target.value) || 0 })} className={inputCls} /></div>
                <div><label className={lbl}>Rate *</label><input type="number" step="0.01" value={entryForm.rate} onChange={(e) => setEntryForm({ ...entryForm, rate: parseFloat(e.target.value) || 0 })} className={inputCls} /></div>
                <div><label className={lbl}>Reference</label><input type="text" value={entryForm.reference} onChange={(e) => setEntryForm({ ...entryForm, reference: e.target.value })} className={inputCls} placeholder="Invoice / GRN" /></div>
                <div className="col-span-3"><label className={lbl}>Narration</label><input type="text" value={entryForm.narration} onChange={(e) => setEntryForm({ ...entryForm, narration: e.target.value })} className={inputCls} /></div>
              </div>
              {entryForm.quantity > 0 && entryForm.rate > 0 && (
                <p className="mt-2 text-sm text-slate-500 dark:text-[#cbd5e1]">Total: <span className="font-semibold text-slate-800 dark:text-[#f1f5f9]">₹{(entryForm.quantity * entryForm.rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></p>
              )}
              <div className="mt-4 flex gap-2">
                <button onClick={() => {
                    if (!entryForm.stock_item_id || entryForm.quantity <= 0 || entryForm.rate < 0) {
                      toast.error("Item, quantity (>0), and rate (>=0) are required"); return;
                    }
                    if (selectedEntry.id) handleEntryModalUpdate(selectedEntry.id, entryForm);
                    else handleEntryModalSubmit(entryForm);
                  }}
                  disabled={isSubmitting}
                  className="btn-primary px-4 py-1.5 text-sm font-medium"
                >
                  {isSubmitting ? "Saving..." : selectedEntry.id ? "Update" : "Create"}
                </button>
                <button onClick={handleEntryModalClose} className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Cancel</button>
              </div>
            </div>
        </Modal>
      )}
    </div>
  );
}
