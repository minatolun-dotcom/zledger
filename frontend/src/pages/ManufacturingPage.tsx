import { useState, useCallback, useEffect, useMemo } from "react";
import StatusBadge from "../components/StatusBadge";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

import Select from "../components/Select";
import MasterSelector from "../components/master/MasterSelector";
import DateInput from "../components/DateInput";
import Tabs from "../components/Tabs";
import { PAGE_TAB_DEFS } from "../config/pageTabs";
import TabContent from "../components/TabContent";
import SortableTable, { type SortableColumn } from "../components/SortableTable";
import TableKeyboardHint from "../components/TableKeyboardHint";
import { useRole } from "../hooks/useRole";
import Modal from "../components/Modal";
import { useToastStore } from "../store/toast";
import { showConfirm } from "../components/ConfirmDialog";
import ManufacturingWidgets from "./ManufacturingWidgets";
import WorkCentersTab from "../components/WorkCentersTab";
import RoutingsTab from "../components/RoutingsTab";
import SerialsPanel from "../components/SerialsPanel";
import {
  useBoms,
  useProductionOrders,
  useStockItems,
  useRoutings,
  useMaterialAvailability,
  useBomStockLevels,
  type Bom,
  type ProductionOrder,
  type Serial,
} from "../hooks/useMasterData";

type Tab = "boms" | "production" | "batches" | "workcenters" | "routings" | "reports";

interface Batch {
  id: string;
  company_id: string;
  stock_item_id: string;
  item_name: string | null;
  batch_number: string;
  manufacturing_date: string | null;
  expiry_date: string | null;
  quantity: number;
  status: string;
  created_at: string | null;
  updated_at: string | null;
}

interface BomLineForm {
  stock_item_id: string;
  quantity: number;
  rate: string;
  wastage_pct: number;
  sub_bom_id: string | null;
}

const BOM_FORM_EMPTY = {
  name: "",
  finished_item_id: "",
  output_qty: 1,
  routing_id: "",
  lines: [] as BomLineForm[],
};

const ORDER_FORM_EMPTY = {
  bom_id: "",
  order_date: new Date().toISOString().slice(0, 10),
  planned_qty: 1,
  narration: "",
  labor_cost: "0",
  overhead_cost: "0",
};


export default function ManufacturingPage() {
  const { canEdit } = useRole();
  const toast = useToastStore();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("boms");
  const [selected, setSelected] = useState<Bom | null>(null);
  const [selectedOrder, setSelectedOrder] =
    useState<ProductionOrder | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bomForm, setBomForm] = useState(BOM_FORM_EMPTY);
  const [orderForm, setOrderForm] = useState(ORDER_FORM_EMPTY);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [detailBom, setDetailBom] = useState<Bom | null>(null);
  const [showCreateBom, setShowCreateBom] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmOrderData, setConfirmOrderData] = useState<ProductionOrder | null>(null);
  const [actualQuantities, setActualQuantities] = useState<Record<string, number>>({});
  const [initialRequired, setInitialRequired] = useState<Record<string, number>>({});
  const [touchedActuals, setTouchedActuals] = useState<Record<string, boolean>>({});
  const [batchAllocations, setBatchAllocations] = useState<Record<string, string>>({});
  const [serialSelections, setSerialSelections] = useState<Record<string, string[]>>({});
  const [producedQty, setProducedQty] = useState<number>(0);
  const [progressQty, setProgressQty] = useState(0);

  const { query: { data: boms = [] }, duplicate: duplicateBom } = useBoms();
  const { data: orders = [] } = useProductionOrders();
  const { data: items = [] } = useStockItems();
  const { data: routings = [] } = useRoutings();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["boms"] });
    queryClient.invalidateQueries({ queryKey: ["productionOrders"] });
  }, [queryClient]);


  // Auto-open from command palette (?tab=boms|production&action=new)
  useEffect(() => {
    const paramTab = searchParams.get("tab") as Tab | null;
    const action = searchParams.get("action");
    if (!paramTab && !action) return;
    setSearchParams({}, { replace: true });
    if (paramTab) setTab(paramTab);
    setTimeout(() => {
      if (!action || !canEdit) return;
      const t = paramTab || tab;
      if (t === "boms" && action === "new") openCreateBom();
      else if (t === "production" && action === "new") openCreateOrder();
    }, 100);
  }, [searchParams]);

  const itemName = (id: string) =>
    items.find((i) => i.id === id)?.name || "—";

  // ── BOM handlers ──

  const openCreateBom = () => {
    setBomForm({ ...BOM_FORM_EMPTY, lines: [{ stock_item_id: "", quantity: 1, rate: "", wastage_pct: 0, sub_bom_id: null }] });
    setSelected(null);
    setShowCreateBom(true);
  };

  const openEditBom = (bom: Bom) => {
    setBomForm({
      name: bom.name,
      finished_item_id: bom.finished_item_id,
      output_qty: bom.output_qty,
      routing_id: bom.routing_id || "",
      lines: bom.lines.map((l) => ({
        stock_item_id: l.stock_item_id,
        quantity: l.quantity,
        rate: l.rate?.toString() || "",
        wastage_pct: l.wastage_pct,
        sub_bom_id: l.sub_bom_id || null,
      })),
    });
    setSelected(bom);
  };

  const saveBom = async () => {
    if (!bomForm.name || !bomForm.finished_item_id || bomForm.lines.length === 0) {
      toast.error("Name, finished product, and at least one component are required");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        name: bomForm.name,
        finished_item_id: bomForm.finished_item_id,
        output_qty: bomForm.output_qty,
        routing_id: bomForm.routing_id || null,
        lines: bomForm.lines.map((l) => ({
          stock_item_id: l.stock_item_id,
          quantity: l.quantity,
          rate: l.rate ? parseFloat(l.rate) : null,
          wastage_pct: l.wastage_pct,
          sub_bom_id: l.sub_bom_id,
        })),
      };
      if (selected) {
        await api.patch(`/manufacturing/boms/${selected.id}`, payload);
        toast.success("BOM updated");
      } else {
        await api.post("/manufacturing/boms", payload);
        toast.success("BOM created");
      }
      setSelected(null);
      setShowCreateBom(false);
      invalidate();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save BOM");
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteBom = async (bom: Bom) => {
    if (
      !(await showConfirm(`Delete BOM "${bom.name}"?`, {
        danger: true,
        confirmLabel: "Delete",
      }))
    )
      return;
    try {
      await api.del(`/manufacturing/boms/${bom.id}`);
      toast.success("BOM deleted");
      setSelected(null);
      invalidate();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete BOM");
    }
  };

  // ── Production Order handlers ──

  const openCreateOrder = () => {
    setOrderForm(ORDER_FORM_EMPTY);
    setSelectedOrder(null);
    setShowCreateOrder(true);
  };

  const saveOrder = async () => {
    if (!orderForm.bom_id || !orderForm.order_date || orderForm.planned_qty <= 0) {
      toast.error("BOM, date, and quantity are required");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        bom_id: orderForm.bom_id,
        order_date: orderForm.order_date,
        planned_qty: orderForm.planned_qty,
        narration: orderForm.narration || null,
        labor_cost: parseFloat(orderForm.labor_cost) || 0,
        overhead_cost: parseFloat(orderForm.overhead_cost) || 0,
      };
      const created = await api.post<ProductionOrder>("/manufacturing/production-orders", payload);
      toast.success("Production order created");
      setShowCreateOrder(false);
      setSelectedOrder(created);
      invalidate();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create order");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmOrder = async (order: ProductionOrder) => {
    // Load BOM to get component lines for actual quantities
    try {
      const bomLines = await api.get<any[]>(`/manufacturing/boms/${order.bom_id}/availability?planned_qty=${order.planned_qty}`);
      const initial: Record<string, number> = {};
      for (const line of bomLines) {
        initial[line.stock_item_id] = line.required_qty;
      }
      setActualQuantities(initial);
      setInitialRequired(initial);
      setTouchedActuals({});
      const defaultProduced = order.planned_qty * (boms.find((b) => b.id === order.bom_id)?.output_qty ?? 1);
      setProducedQty(defaultProduced);
      setSerialSelections({});
      setConfirmOrderData(order);
      setShowConfirmModal(true);
    } catch {
      // Never confirm silently without actual quantities — batch-tracked items
      // must be allocated and wastage must be recorded.
      toast.error("Could not load material availability. Please try again.");
    }
  };

  // When the user changes the produced qty for partial completion, scale the
  // untouched actual material quantities proportionally so stock isn't
  // silently over-consumed. Manually-entered actuals are preserved.
  // Serial-tracked items are floored to whole units (the backend requires
  // whole-unit consumption for serials). Raising produced qty back to (or
  // above) the planned output restores the untouched actuals to their full
  // requirements so confirming at full production consumes full materials.
  const handleProducedQtyChange = (qty: number) => {
    setProducedQty(qty);
    const planned = confirmOrderData
      ? confirmOrderData.planned_qty * (boms.find((b) => b.id === confirmOrderData.bom_id)?.output_qty ?? 1)
      : 0;
    if (planned > 0 && qty >= 0) {
      if (qty >= planned) {
        // Back to full output — restore untouched actuals to requirements.
        const next: Record<string, number> = {};
        let changed = false;
        for (const [id, req] of Object.entries(initialRequired)) {
          next[id] = touchedActuals[id] ? (actualQuantities[id] ?? req) : req;
          if (next[id] !== (actualQuantities[id] ?? req)) changed = true;
        }
        if (changed) setActualQuantities(next);
        return;
      }
      const ratio = qty / planned;
      const next: Record<string, number> = {};
      let changed = false;
      for (const [id, req] of Object.entries(initialRequired)) {
        if (touchedActuals[id]) {
          next[id] = actualQuantities[id] ?? req;
          continue;
        }
        const raw = req * ratio;
        const item = items.find((i) => i.id === id);
        // Serial-tracked items must be consumed in whole units — floor them
        // so the scaled value is never rejected by the backend validator.
        const scaled = item?.tracking_mode === "serial"
          ? Math.floor(raw)
          : Math.round(raw * 1000) / 1000;
        next[id] = scaled;
        if (scaled !== (actualQuantities[id] ?? req)) changed = true;
      }
      if (changed) setActualQuantities(next);
      // Trim serial selections that now exceed the scaled actual quantity —
      // the backend validates serial count against actual consumption.
      const trimmed = { ...serialSelections };
      let serialsChanged = false;
      for (const [id, req] of Object.entries(initialRequired)) {
        const item = items.find((i) => i.id === id);
        const needed = item?.tracking_mode === "serial"
          ? Math.floor(req * ratio)
          : Math.round(req * ratio);
        const picked = trimmed[id] || [];
        if (picked.length > needed) {
          trimmed[id] = picked.slice(0, needed);
          serialsChanged = true;
        }
      }
      if (serialsChanged) setSerialSelections(trimmed);
    }
  };

  const handleActualQtyChange = (id: string, qty: number) => {
    setTouchedActuals((prev) => ({ ...prev, [id]: true }));
    setActualQuantities((prev) => ({ ...prev, [id]: qty }));
  };

  const submitConfirmOrder = async () => {
    if (!confirmOrderData) return;
    try {
      const actualPayload = Object.entries(actualQuantities).map(([stock_item_id, actual_qty]) => ({
        stock_item_id,
        actual_qty,
      }));
      const batchPayload = Object.entries(batchAllocations)
        .filter(([, batchId]) => batchId)
        .map(([stock_item_id, batch_id]) => ({
          stock_item_id,
          batch_id,
          quantity: actualQuantities[stock_item_id] || 0,
        }));
      const serialPayload = Object.entries(serialSelections)
        .filter(([, nums]) => nums.length > 0)
        .map(([stock_item_id, serial_numbers]) => ({ stock_item_id, serial_numbers }));
      await api.post(`/manufacturing/production-orders/${confirmOrderData.id}/confirm`, {
        actual_quantities: actualPayload,
        batch_allocations: batchPayload,
        serial_allocations: serialPayload,
        produced_qty: producedQty,
      });
      toast.success("Production completed — stock entries and journal created");
      setShowConfirmModal(false);
      setConfirmOrderData(null);
      setSelectedOrder(null);
      setBatchAllocations({});
      setSerialSelections({});
      setProducedQty(0);
      invalidate();
    } catch (err: any) {
      toast.error(err?.message || "Failed to confirm production");
    }
  };

  const cancelOrder = async (order: ProductionOrder) => {
    if (
      !(await showConfirm(`Cancel production order ${order.order_number}?`, {
        danger: true,
        confirmLabel: "Cancel Order",
      }))
    )
      return;
    try {
      await api.post(`/manufacturing/production-orders/${order.id}/cancel`);
      toast.success("Order cancelled");
      setSelectedOrder(null);
      invalidate();
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel order");
    }
  };

  const recordProgress = async (order: ProductionOrder, qty: number) => {
    try {
      await api.patch(`/manufacturing/production-orders/${order.id}`, { produced_qty: qty });
      toast.success("Progress recorded");
      setSelectedOrder(null);
      invalidate();
    } catch (err: any) {
      toast.error(err?.message || "Failed to record progress");
    }
  };

  const startOrder = async (order: ProductionOrder) => {
    try {
      await api.post(`/manufacturing/production-orders/${order.id}/start`);
      toast.success("Order started — production in progress");
      setSelectedOrder(null);
      invalidate();
    } catch (err: any) {
      toast.error(err?.message || "Failed to start order");
    }
  };

  // ── BOM table columns ──

  const bomCols: SortableColumn<Bom>[] = [
    { id: "name", header: "Name", accessorKey: "name", size: 180, cell: ({ getValue }) => (
      <span className="truncate block max-w-[180px]" title={getValue() as string}>{getValue() as string}</span>
    ), className: "font-medium text-slate-900 dark:text-[#f1f5f9]" },
    { id: "finished_item_id", header: "Finished Product", accessorFn: (row) => itemName(row.finished_item_id), size: 160, cell: ({ getValue }) => (
      <span className="truncate block max-w-[160px]" title={getValue() as string}>{getValue() as string}</span>
    ), className: "text-slate-600 dark:text-[#cbd5e1]" },
    { id: "output_qty", header: "Output Qty", accessorKey: "output_qty", size: 100, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{(getValue() as number).toLocaleString("en-IN")}</span>, className: "text-right" },
    { id: "lines", header: "Components", accessorFn: (row) => row.lines.length, size: 240, cell: ({ getValue, row }) => {
      const count = getValue() as number;
      const names = row.original.lines.map((l) => l.item_name || "").filter(Boolean).join(", ");
      return (
        <div className="flex items-center gap-2" title={names}>
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-medium text-slate-600 dark:bg-[#1a1a24] dark:text-[#cbd5e1]">
            {count}
          </span>
          <span className="truncate text-xs text-slate-500 dark:text-[#94a3b8]">
            {names}
          </span>
        </div>
      );
    }, className: "" },
  ];

  // ── Production order columns ──

  const orderCols: SortableColumn<ProductionOrder>[] = [
    { id: "order_number", header: "Order #", accessorKey: "order_number", size: 140, className: "font-medium text-slate-900 dark:text-[#f1f5f9] whitespace-nowrap" },
    { id: "order_date", header: "Date", accessorKey: "order_date", size: 110, className: "whitespace-nowrap" },
    { id: "bom_id", header: "BOM", accessorFn: (row) => boms.find((b) => b.id === row.bom_id)?.name || "—", size: 160, cell: ({ getValue }) => (
      <span className="truncate block max-w-[160px]" title={getValue() as string}>{getValue() as string}</span>
    ), className: "text-slate-600 dark:text-[#cbd5e1]" },
    { id: "planned_qty", header: "Planned", accessorKey: "planned_qty", size: 100, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{(getValue() as number).toLocaleString("en-IN")}</span>, className: "text-right" },
    { id: "produced_qty", header: "Produced", accessorKey: "produced_qty", size: 100, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{(getValue() as number).toLocaleString("en-IN")}</span>, className: "text-right" },
    { id: "status", header: "Status", accessorKey: "status", size: 100, cell: ({ getValue }) => (
                      <StatusBadge status={getValue() as string} />
    ) },
  ];

  const filteredBoms = boms.filter(
    (b) =>
      !searchQuery ||
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      itemName(b.finished_item_id)
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
  );

  const filteredOrders = orders.filter(
    (o) =>
      !searchQuery ||
      o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.status.includes(searchQuery.toLowerCase())
  );

  const manuStats = useMemo(() => {
    const totalBoms = boms.length;
    const activeBoms = boms.filter((b) => b.is_active).length;
    const totalComponentLines = boms.reduce((s, b) => s + b.lines.length, 0);
    const usedItems = new Set(boms.flatMap((b) => b.lines.map((l) => l.stock_item_id)));
    const orderStats = { draft: 0, inProgress: 0, completed: 0, cancelled: 0 };
    for (const o of orders) {
      if (o.status === "draft") orderStats.draft++;
      else if (o.status === "in_progress" || o.status === "in-progress") orderStats.inProgress++;
      else if (o.status === "completed") orderStats.completed++;
      else if (o.status === "cancelled") orderStats.cancelled++;
    }
    return { totalBoms, activeBoms, totalComponentLines, uniqueItems: usedItems.size, orderStats };
  }, [boms, orders]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9] mb-6">Manufacturing</h1>
      {/* Dashboard Widgets */}
      <ManufacturingWidgets showViewAll={false} />
      <div className="flex gap-5 items-start">
        <div className="flex-1 min-w-0">
      <Tabs
        tabs={PAGE_TAB_DEFS["/manufacturing"].tabs}
        active={tab}
        onChange={(t) => { setTab(t as Tab); setSearchQuery(""); }}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3 mt-3">
        <input
          type="text"
          placeholder={tab === "boms" ? "Search BOMs..." : "Search orders..."}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-[#282832] dark:bg-[#16161f] dark:text-[#f1f5f9]"
        />
        {canEdit && tab === "boms" && (
          <label className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1]">
            Import CSV
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const formData = new FormData();
                formData.append("file", file);
                try {
                  const result = await api.post<Bom[]>("/manufacturing/boms/import", formData);
                  toast.success(`Imported ${result.length} BOM(s)`);
                  queryClient.invalidateQueries({ queryKey: ["boms"] });
                } catch (err: any) {
                  toast.error(err?.message || "Import failed");
                }
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      <TabContent activeKey={tab}>
      {tab === "boms" ? (
        <>
          <TableKeyboardHint className="mb-3" />
          <SortableTable
            columns={bomCols}
            data={filteredBoms}
            tableKey="manufacturing-boms"
            keyboardNav
            onRowClick={(b: Bom) => setDetailBom(b)}
            emptyMessage="No BOMs yet. Create one to define a product assembly."
          />
        </>
      ) : tab === "production" ? (
        <>
          <TableKeyboardHint className="mb-3" />
          <SortableTable
            columns={orderCols}
            data={filteredOrders}
            tableKey="manufacturing-orders"
            keyboardNav
            onRowClick={(o: ProductionOrder) => { setSelectedOrder(o); setProgressQty(o.produced_qty); }}
            emptyMessage="No production orders yet."
          />
        </>
      ) : tab === "batches" ? (
        <div className="space-y-6">
          {/* Batch management now lives on the dedicated /batches page — keep
              serial tracking here (it's tied to production-order confirmation). */}
          <div className="rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/80 p-6 shadow-sm dark:border-[#1a1a24] dark:from-[#16161f] dark:to-[#1a1a25]">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">Batch Management</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-[#94a3b8]">
              Create batches, track expiry alerts, trace a batch number, and view
              the batch report on the dedicated Batch Tracking page.
            </p>
            <button
              onClick={() => navigate("/batches")}
              className="btn-primary mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
              Open Batch Tracking
            </button>
          </div>
          <div className="border-t border-slate-200 dark:border-[#1a1a24] pt-6">
            <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Serial Tracking</h3>
            <SerialsPanel canEdit={canEdit} />
          </div>
        </div>
      ) : tab === "workcenters" ? (
        <WorkCentersTab canEdit={canEdit} />
      ) : tab === "routings" ? (
        <RoutingsTab canEdit={canEdit} />
      ) : (
        /* Reports tab */
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* BOM Cost Analysis Card */}
            <div className="card-gradient rounded-xl border border-slate-200/60 p-6 dark:border-[#1a1a24]/60">
              <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">
                BOM Cost Analysis
              </h3>
              <p className="mb-4 text-sm text-slate-500 dark:text-[#94a3b8]">
                Material cost breakdown per BOM with cost per unit analysis.
              </p>
              <div className="flex gap-2">
                <a
                  href={`/api/manufacturing/reports/bom-analysis/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1]"
                >
                  Download PDF
                </a>
                <a
                  href={`/api/manufacturing/reports/bom-analysis/xlsx`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1]"
                >
                  Download Excel
                </a>
              </div>
            </div>

            {/* Production Cost Card */}
            <div className="card-gradient rounded-xl border border-slate-200/60 p-6 dark:border-[#1a1a24]/60">
              <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">
                Production Cost Report
              </h3>
              <p className="mb-4 text-sm text-slate-500 dark:text-[#94a3b8]">
                Per-order material cost breakdown with cost per unit metrics.
              </p>
              <div className="flex gap-2">
                <a
                  href={`/api/manufacturing/reports/production-cost/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1]"
                >
                  Download PDF
                </a>
                <a
                  href={`/api/manufacturing/reports/production-cost/xlsx`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1]"
                >
                  Download Excel
                </a>
              </div>
            </div>

            {/* Wastage Report Card */}
            <WastageReportCard />
          </div>
        </div>
      )}
      </TabContent>
        </div>{/* /content flex-1 */}

        {/* Sidebar */}
        <div className="w-[300px] shrink-0 hidden lg:block self-start sticky top-4 mt-[104px] space-y-4">
          {tab === "boms" ? (
            <>
              {/* BOM Summary */}
              <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
                <h3 className="text-sm font-bold text-slate-800 dark:text-[#f1f5f9]">BOM Summary</h3>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-[#94a3b8]">Total BOMs</span>
                  <span className="font-semibold text-slate-800 dark:text-[#f1f5f9]">{manuStats.totalBoms}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-[#94a3b8]">Active</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{manuStats.activeBoms}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-[#94a3b8]">Component Lines</span>
                  <span className="font-semibold text-slate-800 dark:text-[#f1f5f9]">{manuStats.totalComponentLines}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-[#94a3b8]">Unique Items</span>
                  <span className="font-semibold text-slate-800 dark:text-[#f1f5f9]">{manuStats.uniqueItems}</span>
                </div>
              </div>
              {/* Quick Actions - BOMs */}
              {canEdit && (
                <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-[#f1f5f9]">Quick Actions</h3>
                  <button onClick={openCreateBom}
                    className="w-full rounded-lg bg-brand-600 dark:bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600 cursor-pointer">
                    + New BOM
                  </button>
                  <label className="block w-full cursor-pointer rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm font-medium text-center text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#1a1a24]">
                    Import CSV
                    <input type="file" accept=".csv" className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const formData = new FormData();
                        formData.append("file", file);
                        try {
                          const result = await api.post<Bom[]>("/manufacturing/boms/import", formData);
                          toast.success(`Imported ${result.length} BOM(s)`);
                          queryClient.invalidateQueries({ queryKey: ["boms"] });
                        } catch (err: any) {
                          toast.error(err?.message || "Import failed");
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              )}
            </>
          ) : tab === "production" ? (
            <>
              {/* Order Summary */}
              <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
                <h3 className="text-sm font-bold text-slate-800 dark:text-[#f1f5f9]">Order Summary</h3>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-[#94a3b8]">Draft</span>
                  <span className="font-semibold text-slate-500 dark:text-[#cbd5e1]">{manuStats.orderStats.draft}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-[#94a3b8]">In Progress</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">{manuStats.orderStats.inProgress}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-[#94a3b8]">Completed</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{manuStats.orderStats.completed}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-[#94a3b8]">Cancelled</span>
                  <span className="font-semibold text-red-500 dark:text-red-400">{manuStats.orderStats.cancelled}</span>
                </div>
              </div>
              {/* Quick Actions - Orders */}
              {canEdit && (
                <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-[#f1f5f9]">Quick Actions</h3>
                  <button onClick={openCreateOrder}
                    className="w-full rounded-lg bg-brand-600 dark:bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600 cursor-pointer">
                    + New Order
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Manufacturing Overview */}
              <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
                <h3 className="text-sm font-bold text-slate-800 dark:text-[#f1f5f9]">Manufacturing</h3>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-[#94a3b8]">BOMs</span>
                  <span className="font-semibold text-slate-800 dark:text-[#f1f5f9]">{manuStats.totalBoms}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-[#94a3b8]">Orders</span>
                  <span className="font-semibold text-slate-800 dark:text-[#f1f5f9]">{manuStats.orderStats.draft + manuStats.orderStats.inProgress + manuStats.orderStats.completed + manuStats.orderStats.cancelled}</span>
                </div>
              </div>
              {canEdit && (
                <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-[#f1f5f9]">Quick Actions</h3>
                  <button onClick={openCreateBom}
                    className="w-full rounded-lg bg-brand-600 dark:bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600 cursor-pointer">
                    + New BOM
                  </button>
                  <button onClick={openCreateOrder}
                    className="w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#1a1a24] cursor-pointer">
                    + New Order
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>{/* /flex container */}

      {/* BOM Detail Panel */}
      {detailBom && (
        <Modal open onClose={() => setDetailBom(null)} maxWidth="2xl" scrollable panelClassName="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">
                {detailBom.name}
              </h2>
              <button
                onClick={() => setDetailBom(null)}
                className="text-slate-400 hover:text-slate-600 dark:text-[#64748b] dark:hover:text-[#94a3b8]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-slate-500 dark:text-[#94a3b8]">Finished Product</span>
                  <p className="font-medium text-slate-900 dark:text-[#f1f5f9]">
                    {itemName(detailBom.finished_item_id)}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-slate-500 dark:text-[#94a3b8]">Output Qty</span>
                  <p className="font-medium text-slate-900 dark:text-[#f1f5f9]">
                    {detailBom.output_qty.toLocaleString("en-IN")}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-slate-500 dark:text-[#94a3b8]">Status</span>
                  <p>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      detailBom.is_active
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-500 dark:bg-[#1a1a24] dark:text-[#94a3b8]"
                    }`}>
                      {detailBom.is_active ? "Active" : "Inactive"}
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-sm text-slate-500 dark:text-[#94a3b8]">Components</span>
                  <p className="font-medium text-slate-900 dark:text-[#f1f5f9]">
                    {detailBom.lines.length}
                  </p>
                </div>
              </div>

              {/* Components Table */}
              <BomStockLevelsSection bomId={detailBom.id} lines={detailBom.lines} />

              {/* Version History */}
              <BomVersionHistory bomId={detailBom.id} currentVersion={detailBom.version} />

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={() => window.open(`/api/manufacturing/boms/${detailBom.id}/pdf`, "_blank")}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1]"
                >
                  Export PDF
                </button>
                {canEdit && (
                  <>
                    <button
                      onClick={async () => {
                        const newBom = await duplicateBom(detailBom.id);
                        setDetailBom(null);
                        toast.success(`Created: ${newBom.name}`);
                      }}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1]"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => { setDetailBom(null); deleteBom(detailBom); }}
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-400"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => { setDetailBom(null); openEditBom(detailBom); }}
                      className="btn-primary rounded-lg px-4 py-2 text-sm font-medium text-white"
                    >
                      Edit
                    </button>
                  </>
                )}
              </div>
            </div>
        </Modal>
      )}

      {/* BOM Modal */}
      {(selected !== null || showCreateBom) && (
        <Modal
          open
          onClose={() => { setSelected(null); setShowCreateBom(false); setBomForm({ ...BOM_FORM_EMPTY, lines: [] }); }}
          maxWidth="2xl"
          scrollable
          panelClassName="p-6"
        >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">
                {selected ? "Edit BOM" : "New BOM"}
              </h2>
              <button
                onClick={() => { setSelected(null); setShowCreateBom(false); }}
                className="text-slate-400 hover:text-slate-600 dark:text-[#64748b] dark:hover:text-[#94a3b8]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
                    Name
                  </label>
                  <input
                    type="text"
                    value={bomForm.name}
                    onChange={(e) =>
                      setBomForm({ ...bomForm, name: e.target.value })
                    }
                    autoFocus
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
                    Finished Product
                  </label>
                  <MasterSelector
                    entityKey="stock_item"
                    value={bomForm.finished_item_id}
                    onChange={(v: string) =>
                      setBomForm({ ...bomForm, finished_item_id: v })
                    }
                    options={items.map((i) => ({
                      value: i.id,
                      label: i.name,
                    }))}
                    placeholder="Select item"
                    className="w-full"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
                  Output Qty
                </label>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={bomForm.output_qty}
                  onChange={(e) =>
                    setBomForm({
                      ...bomForm,
                      output_qty: parseFloat(e.target.value) || 1,
                    })
                  }
                  className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
                  Routing (for labor estimation)
                </label>
                <Select
                  value={bomForm.routing_id}
                  onChange={(v: string) => setBomForm({ ...bomForm, routing_id: v })}
                  options={[{ value: "", label: "No routing" }, ...routings.map((r) => ({ value: r.id, label: r.name }))]}
                  className="w-full"
                  placeholder="No routing"
                />
              </div>

              {/* Component Lines */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
                    Components
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setBomForm({
                        ...bomForm,
                        lines: [
                          ...bomForm.lines,
                          { stock_item_id: "", quantity: 1, rate: "", wastage_pct: 0, sub_bom_id: null },
                        ],
                      })
                    }
                    className="text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    + Add Component
                  </button>
                </div>
                <div className="space-y-2">
                  {bomForm.lines.map((line, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-[#282832] dark:bg-[#1a1a24]/50"
                    >
                      <div className="flex-1">
                        <MasterSelector
                          entityKey="stock_item"
                          value={line.stock_item_id}
                          onChange={(v: string) => {
                            const lines = [...bomForm.lines];
                            lines[idx] = { ...lines[idx], stock_item_id: v };
                            setBomForm({ ...bomForm, lines });
                          }}
                          options={items.map((i) => ({
                            value: i.id,
                            label: i.name,
                          }))}
                          placeholder="Select material"
                          className="w-full"
                        />
                      </div>
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={line.quantity}
                        onChange={(e) => {
                          const lines = [...bomForm.lines];
                          lines[idx] = {
                            ...lines[idx],
                            quantity: parseFloat(e.target.value) || 0,
                          };
                          setBomForm({ ...bomForm, lines });
                        }}
                        className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                        title="Qty"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.rate}
                        onChange={(e) => {
                          const lines = [...bomForm.lines];
                          lines[idx] = { ...lines[idx], rate: e.target.value };
                          setBomForm({ ...bomForm, lines });
                        }}
                        className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                        title="Rate (optional)"
                        placeholder="Rate"
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={line.wastage_pct}
                        onChange={(e) => {
                          const lines = [...bomForm.lines];
                          lines[idx] = {
                            ...lines[idx],
                            wastage_pct: parseFloat(e.target.value) || 0,
                          };
                          setBomForm({ ...bomForm, lines });
                        }}
                        className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                        title="Wastage %"
                      />
                      <Select
                        value={line.sub_bom_id || ""}
                        onChange={(v) => {
                          const lines = [...bomForm.lines];
                          lines[idx] = { ...lines[idx], sub_bom_id: v || null };
                          setBomForm({ ...bomForm, lines });
                        }}
                        options={[{ value: "", label: "Raw Material" }, ...boms.filter(b => b.id !== selected?.id).map((b) => ({ value: b.id, label: `Sub: ${b.name}` }))]}
                        className="w-32"
                        placeholder="Raw Material"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const lines = bomForm.lines.filter((_, i) => i !== idx);
                          setBomForm({ ...bomForm, lines });
                        }}
                        className="text-red-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={() => { setSelected(null); setShowCreateBom(false); }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1]"
                >
                  Cancel
                </button>
                {selected && canEdit && (
                  <button
                    onClick={() => deleteBom(selected)}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-400"
                  >
                    Delete
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={saveBom}
                    disabled={isSubmitting}
                    className="btn-primary rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {isSubmitting ? "Saving..." : selected ? "Update" : "Create"}
                  </button>
                )}
              </div>
            </div>
        </Modal>
      )}

      {/* Production Order Modal */}
      {selectedOrder && (
        <Modal open onClose={() => setSelectedOrder(null)} maxWidth="lg" scrollable panelClassName="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">
                Production Order {selectedOrder.order_number}
              </h2>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-slate-600 dark:text-[#64748b] dark:hover:text-[#94a3b8]"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-[#94a3b8]">BOM</span>
                <span className="font-medium text-slate-900 dark:text-[#f1f5f9]">
                  {boms.find((b) => b.id === selectedOrder.bom_id)?.name ||
                    "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-[#94a3b8]">Date</span>
                <span className="text-slate-900 dark:text-[#f1f5f9]">
                  {selectedOrder.order_date}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-[#94a3b8]">Planned Qty</span>
                <span className="text-slate-900 dark:text-[#f1f5f9]">
                  {selectedOrder.planned_qty}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-[#94a3b8]">Produced Qty</span>
                <span className="text-slate-900 dark:text-[#f1f5f9]">
                  {selectedOrder.produced_qty}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-[#94a3b8]">Status</span>
                <StatusBadge status={selectedOrder.status} />
              </div>
              {selectedOrder.narration && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Narration</span>
                  <span className="text-slate-900 dark:text-[#f1f5f9]">
                    {selectedOrder.narration}
                  </span>
                </div>
              )}
              {(selectedOrder.material_cost > 0 || selectedOrder.labor_cost > 0 || selectedOrder.overhead_cost > 0) && (
                <>
                  <div className="flex justify-between border-t border-slate-100 pt-2 dark:border-[#1a1a24]">
                    <span className="text-slate-500 dark:text-[#94a3b8]">Material Cost</span>
                    <span className="font-medium text-slate-900 dark:text-[#f1f5f9]">
                      ₹{selectedOrder.material_cost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-[#94a3b8]">Labor Cost</span>
                    <span className="text-slate-900 dark:text-[#f1f5f9]">
                      ₹{selectedOrder.labor_cost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-[#94a3b8]">Overhead Cost</span>
                    <span className="text-slate-900 dark:text-[#f1f5f9]">
                      ₹{selectedOrder.overhead_cost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Material Availability Check */}
            {selectedOrder.status === "draft" && (
              <MaterialAvailabilitySection
                bomId={selectedOrder.bom_id}
                plannedQty={selectedOrder.planned_qty}
              />
            )}

            {canEdit && selectedOrder.status === "in_progress" && (
              <div className="mt-4 flex items-end justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-[#282832] dark:bg-[#1a1a24]/50">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">
                    Record Progress (produced so far)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={progressQty}
                    onChange={(e) => setProgressQty(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-36 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                  />
                </div>
                <button
                  onClick={() => recordProgress(selectedOrder, progressQty)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1]"
                >
                  Save Progress
                </button>
              </div>
            )}

            {canEdit && (selectedOrder.status === "draft" || selectedOrder.status === "in_progress") && (
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => cancelOrder(selectedOrder)}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-400"
                >
                  Cancel Order
                </button>
                {selectedOrder.status === "draft" && (
                  <button
                    onClick={() => startOrder(selectedOrder)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1]"
                  >
                    Start
                  </button>
                )}
                <ConfirmProductionButton
                  order={selectedOrder}
                  onConfirm={() => confirmOrder(selectedOrder)}
                />
              </div>
            )}
        </Modal>
      )}

      {/* Create Order Modal */}
      {showCreateOrder && !selectedOrder && (
        <Modal
          open
          onClose={() => { setOrderForm({ ...ORDER_FORM_EMPTY, bom_id: "" }); setShowCreateOrder(false); }}
          maxWidth="lg"
          panelClassName="p-6"
        >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">
                New Production Order
              </h2>
              <button
                onClick={() => { setOrderForm({ ...ORDER_FORM_EMPTY, bom_id: "" }); setShowCreateOrder(false); }}
                className="text-slate-400 hover:text-slate-600 dark:text-[#64748b] dark:hover:text-[#94a3b8]"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
                  BOM
                </label>
                <Select
                  value={orderForm.bom_id}
                  onChange={(v: string) =>
                    setOrderForm({ ...orderForm, bom_id: v })
                  }
                  options={boms
                    .filter((b) => b.is_active)
                    .map((b) => ({ value: b.id, label: b.name }))}
                  placeholder="Select BOM"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
                    Date
                  </label>
                  <DateInput
                    value={orderForm.order_date}
                    onChange={(v) =>
                      setOrderForm({ ...orderForm, order_date: v })
                    }
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
                    Planned Qty
                  </label>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={orderForm.planned_qty}
                    onChange={(e) =>
                      setOrderForm({
                        ...orderForm,
                        planned_qty: parseFloat(e.target.value) || 1,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
                    Labor Cost
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={orderForm.labor_cost}
                    onChange={(e) =>
                      setOrderForm({ ...orderForm, labor_cost: e.target.value })
                    }
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                  />
                  {orderForm.bom_id && (() => {
                    const bom = boms.find((b) => b.id === orderForm.bom_id);
                    return bom?.routing_id ? (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const est = await api.get<{ estimated_labor_cost: number; routing_name: string }>(
                              `/manufacturing/boms/${bom.id}/labor-estimate?planned_qty=${orderForm.planned_qty}`
                            );
                            if (est?.estimated_labor_cost != null) {
                              setOrderForm({ ...orderForm, labor_cost: String(est.estimated_labor_cost) });
                              toast.success(`Labor estimate ₹${est.estimated_labor_cost.toLocaleString("en-IN")} applied from ${est.routing_name}`);
                            }
                          } catch {
                            toast.error("Failed to estimate labor from routing");
                          }
                        }}
                        className="mt-1 text-xs font-medium text-blue-500 hover:underline dark:text-blue-400"
                      >
                        Estimate from routing
                      </button>
                    ) : null;
                  })()}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
                    Overhead Cost
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={orderForm.overhead_cost}
                    onChange={(e) =>
                      setOrderForm({ ...orderForm, overhead_cost: e.target.value })
                    }
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
                  Narration
                </label>
                <textarea
                  value={orderForm.narration}
                  onChange={(e) =>
                    setOrderForm({ ...orderForm, narration: e.target.value })
                  }
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                />
              </div>

              {/* Material Availability */}
              {orderForm.bom_id && orderForm.planned_qty > 0 && (
                <MaterialAvailabilitySection
                  bomId={orderForm.bom_id}
                  plannedQty={orderForm.planned_qty}
                />
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => { setOrderForm({ ...ORDER_FORM_EMPTY, bom_id: "" }); setShowCreateOrder(false); }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1]"
                >
                  Cancel
                </button>
                <button
                  onClick={saveOrder}
                  disabled={isSubmitting}
                  className="btn-primary rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Create Order"}
                </button>
              </div>
            </div>
        </Modal>
      )}

      {showConfirmModal && confirmOrderData && (
        <WastageConfirmModal
          order={confirmOrderData}
          actualQuantities={actualQuantities}
          onActualQtyChange={handleActualQtyChange}
          batchAllocations={batchAllocations}
          onBatchChange={(id: string, batchId: string) => setBatchAllocations((prev: Record<string, string>) => ({ ...prev, [id]: batchId }))}
          serialSelections={serialSelections}
          onSerialToggle={(id: string, serialNumber: string) =>
            setSerialSelections((prev) => {
              const current = prev[id] || [];
              return {
                ...prev,
                [id]: current.includes(serialNumber)
                  ? current.filter((s) => s !== serialNumber)
                  : [...current, serialNumber],
              };
            })
          }
          producedQty={producedQty}
          onProducedQtyChange={handleProducedQtyChange}
          plannedOutput={confirmOrderData ? confirmOrderData.planned_qty * (boms.find((b) => b.id === confirmOrderData.bom_id)?.output_qty ?? 1) : 0}
          onConfirm={submitConfirmOrder}
          onCancel={() => { setShowConfirmModal(false); setConfirmOrderData(null); setSerialSelections({}); }}
        />
      )}
    </div>
  );
}

function BomStockLevelsSection({ bomId, lines }: { bomId: string; lines: Bom["lines"] }) {
  const { data: stockLevels = [], isLoading } = useBomStockLevels(bomId);

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
        Components {isLoading && <span className="text-xs text-slate-400">(loading stock...)</span>}
      </h3>
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-[#16161f]">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-[#94a3b8]">Item</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-[#94a3b8]">Type</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-[#94a3b8]">Qty/Unit</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-[#94a3b8]">Rate</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-[#94a3b8]">Wastage</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-[#94a3b8]">In Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-[#1a1a24]">
            {lines.map((line) => {
              const stock = stockLevels.find((s) => s.stock_item_id === line.stock_item_id);
              const currentStock = stock?.current_stock ?? 0;
              const hasEnough = currentStock >= line.quantity;
              const isSubAssembly = !!line.sub_bom_id;
              return (
                <tr key={line.id}>
                  <td className="px-3 py-2 text-slate-900 dark:text-[#f1f5f9]">
                    {line.item_name || "—"}
                  </td>
                  <td className="px-3 py-2">
                    {isSubAssembly ? (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        Sub-Assembly
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-[#1a1a24] dark:text-[#94a3b8]">
                        Raw Material
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600 dark:text-[#94a3b8]">
                    {line.quantity.toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600 dark:text-[#94a3b8]">
                    {line.rate ? `₹${line.rate.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600 dark:text-[#94a3b8]">
                    {line.wastage_pct > 0 ? `${line.wastage_pct}%` : "—"}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${hasEnough ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {currentStock.toLocaleString("en-IN")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WastageReportCard() {
  const [showReport, setShowReport] = useState(false);
  const { data: wastageData = [], isLoading } = useQuery({
    queryKey: ["wastageReport"],
    queryFn: () => api.get<any[]>("/manufacturing/reports/wastage"),
    enabled: showReport,
  });

  return (
    <div className="card-gradient rounded-xl border border-slate-200/60 p-6 dark:border-[#1a1a24]/60">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">
          Wastage Report
        </h3>
        {showReport && wastageData.length > 0 && (
          <div className="flex gap-2">
            <a href="/api/manufacturing/reports/wastage/pdf" target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1]">
              PDF
            </a>
            <a href="/api/manufacturing/reports/wastage/xlsx" target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1]">
              Excel
            </a>
          </div>
        )}
      </div>
      <p className="mb-4 text-sm text-slate-500 dark:text-[#94a3b8]">
        Actual vs planned material consumption with wastage percentages.
      </p>
      {!showReport ? (
        <button
          onClick={() => setShowReport(true)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1]"
        >
          View Report
        </button>
      ) : isLoading ? (
        <span className="text-sm text-slate-500 dark:text-[#94a3b8]">Loading...</span>
      ) : wastageData.length === 0 ? (
        <span className="text-sm text-slate-500">No wastage data yet. Complete production orders with actual quantities to see data.</span>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-[#16161f]">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-[#94a3b8]">Component</th>
                <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-[#94a3b8]">Planned</th>
                <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-[#94a3b8]">Actual</th>
                <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-[#94a3b8]">Wastage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#1a1a24]">
              {wastageData.map((item: any) => (
                <tr key={item.stock_item_id}>
                  <td className="px-3 py-2 text-slate-900 dark:text-[#f1f5f9]">{item.item_name}</td>
                  <td className="px-3 py-2 text-right text-slate-600 dark:text-[#94a3b8]">{item.total_planned_qty}</td>
                  <td className="px-3 py-2 text-right text-slate-600 dark:text-[#94a3b8]">{item.total_actual_qty}</td>
                  <td className={`px-3 py-2 text-right font-medium ${item.wastage_pct > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {item.wastage_pct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BomVersionHistory({ bomId, currentVersion }: { bomId: string; currentVersion: number }) {
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToastStore();

  const fetchVersions = async () => {
    if (showHistory) { setShowHistory(false); return; }
    setLoading(true);
    try {
      const data = await api.get<any[]>(`/manufacturing/boms/${bomId}/versions`);
      setVersions(data);
      setShowHistory(true);
    } catch {
      toast.error("Failed to load version history");
    }
    setLoading(false);
  };

  const restoreVersion = async (versionId: string, version: number) => {
    if (!(await showConfirm(`Restore BOM to version ${version}? This will create a new version.`, { confirmLabel: "Restore" }))) return;
    try {
      await api.post(`/manufacturing/boms/${bomId}/restore/${versionId}`);
      toast.success(`Restored to version ${version}`);
      setShowHistory(false);
      queryClient.invalidateQueries({ queryKey: ["boms"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to restore version");
    }
  };

  return (
    <div>
      <button onClick={fetchVersions} disabled={loading}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1]">
        {loading ? "Loading..." : "Version History"}
      </button>
      {showHistory && (
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm">
          {versions.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">No previous versions</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-[#16161f]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-[#94a3b8]">Version</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-[#94a3b8]">Name</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-[#94a3b8]">Date</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-[#94a3b8]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[#1a1a24]">
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td className="px-3 py-2 text-slate-900 dark:text-[#f1f5f9]">v{v.version}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-[#94a3b8]">{v.name}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-[#94a3b8]">{new Date(v.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right">
                      {v.version !== currentVersion && (
                        <button onClick={() => restoreVersion(v.id, v.version)}
                          className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                          Restore
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function MaterialAvailabilitySection({ bomId, plannedQty }: { bomId: string; plannedQty: number }) {
  const { data: availability = [], isLoading } = useMaterialAvailability(bomId, plannedQty);
  const allSufficient = availability.length > 0 && availability.every((m) => m.sufficient);

  if (isLoading) {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-[#1a1a24] dark:bg-[#16161f]/50">
        <span className="text-xs text-slate-500">Checking material availability...</span>
      </div>
    );
  }

  if (availability.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-[#1a1a24] dark:bg-[#16161f]/50">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
          Material Availability
        </span>
        <span className={`text-xs font-medium ${allSufficient ? "text-emerald-600" : "text-amber-600"}`}>
          {allSufficient ? "All materials available" : "Insufficient stock"}
        </span>
      </div>
      <div className="space-y-1.5">
        {availability.map((m) => (
          <div key={m.stock_item_id} className="flex items-center justify-between text-xs">
            <span className="text-slate-600 dark:text-[#94a3b8]">{m.item_name}</span>
            <div className="flex items-center gap-2">
              <span className={m.sufficient ? "text-slate-500" : "font-medium text-amber-600"}>
                Need {m.required_qty.toLocaleString("en-IN")} / Have {m.available_qty.toLocaleString("en-IN")}
              </span>
              {m.sufficient ? (
                <span className="text-emerald-500">✓</span>
              ) : (
                <span className="text-amber-500">✗</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfirmProductionButton({ order, onConfirm }: { order: ProductionOrder; onConfirm: () => void }) {
  const { data: availability = [] } = useMaterialAvailability(order.bom_id, order.planned_qty);
  const allSufficient = availability.length > 0 && availability.every((m) => m.sufficient);
  const isDisabled = !allSufficient;

  return (
    <button
      onClick={onConfirm}
      disabled={isDisabled}
      title={isDisabled ? "Insufficient materials in stock" : ""}
      className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
        isDisabled
          ? "cursor-not-allowed bg-slate-400 dark:bg-[#282832]"
          : "btn-primary"
      }`}
    >
      Confirm Production
    </button>
  );
}

function WastageConfirmModal({
  order,
  actualQuantities,
  onActualQtyChange,
  batchAllocations,
  onBatchChange,
  serialSelections,
  onSerialToggle,
  producedQty,
  onProducedQtyChange,
  onConfirm,
  onCancel,
  plannedOutput,
}: {
  order: ProductionOrder;
  actualQuantities: Record<string, number>;
  onActualQtyChange: (stockItemId: string, qty: number) => void;
  batchAllocations: Record<string, string>;
  onBatchChange: (stockItemId: string, batchId: string) => void;
  serialSelections: Record<string, string[]>;
  onSerialToggle: (stockItemId: string, serialNumber: string) => void;
  producedQty: number;
  onProducedQtyChange: (qty: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
  plannedOutput: number;
}) {
  const { data: availability = [] } = useMaterialAvailability(order.bom_id, order.planned_qty);
  const { data: items = [] } = useStockItems();

  // Get available batches / serials for each item
  const [itemBatches, setItemBatches] = useState<Record<string, Batch[]>>({});
  const [itemSerials, setItemSerials] = useState<Record<string, Serial[]>>({});

  useEffect(() => {
    const fetchAllocations = async () => {
      const newBatches: Record<string, Batch[]> = {};
      const newSerials: Record<string, Serial[]> = {};
      for (const m of availability) {
        const item = items.find((i) => i.id === m.stock_item_id);
        if (item?.tracking_mode === "batch") {
          try {
            const batches = await api.get<Batch[]>(`/manufacturing/batches?stock_item_id=${m.stock_item_id}&status=active`);
            newBatches[m.stock_item_id] = batches;
          } catch {
            newBatches[m.stock_item_id] = [];
          }
        } else if (item?.tracking_mode === "serial") {
          try {
            const serials = await api.get<Serial[]>(`/manufacturing/serials?stock_item_id=${m.stock_item_id}&status=in_stock`);
            newSerials[m.stock_item_id] = serials;
          } catch {
            newSerials[m.stock_item_id] = [];
          }
        }
      }
      setItemBatches(newBatches);
      setItemSerials(newSerials);
    };
    fetchAllocations();
  }, [availability, items]);

  return (
    <Modal open onClose={onCancel} maxWidth="3xl" panelClassName="p-6">
        <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Confirm Production</h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-[#94a3b8]">
          Enter actual quantities consumed for wastage tracking. Allocate batches for batch-tracked and serials for serial-tracked items.
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-[#282832] dark:bg-[#1a1a24]/50">
          <span className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Produced Qty</span>
          <input
            type="number"
            min="0"
            step="0.001"
            value={producedQty}
            onChange={(e) => onProducedQtyChange(parseFloat(e.target.value) || 0)}
            className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-[#282832] dark:bg-[#1a1a24] dark:text-white"
          />
          <span className="text-xs text-slate-500 dark:text-[#94a3b8]">
            Planned output: {plannedOutput.toLocaleString("en-IN")} — reduce for partial completion
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-[#1a1a24]">
              <th className="pb-2 text-left font-medium text-slate-600 dark:text-[#94a3b8]">Component</th>
              <th className="pb-2 text-right font-medium text-slate-600 dark:text-[#94a3b8]">Planned</th>
              <th className="pb-2 text-right font-medium text-slate-600 dark:text-[#94a3b8]">Actual</th>
              <th className="pb-2 text-left font-medium text-slate-600 dark:text-[#94a3b8]">Batch / Serial</th>
            </tr>
          </thead>
          <tbody>
            {availability.map((m) => {
              const item = items.find((i) => i.id === m.stock_item_id);
              const isSerial = item?.tracking_mode === "serial";
              const batches = itemBatches[m.stock_item_id] || [];
              const serials = itemSerials[m.stock_item_id] || [];
              const selectedSerials = serialSelections[m.stock_item_id] || [];
              // Backend validates serial count against the ACTUAL consumption
              // (whole units), so the counter must track the actual qty — not
              // the planned qty (which is inflated by wastage %).
              const actualQty = actualQuantities[m.stock_item_id] ?? m.required_qty;
              const serialsRequired = Math.round(actualQty);
              return (
                <tr key={m.stock_item_id} className="border-b border-slate-100 dark:border-[#1a1a24]/50">
                  <td className="py-2 text-slate-700 dark:text-[#cbd5e1]">
                    {m.item_name}
                    {isSerial && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">serial</span>
                    )}
                  </td>
                  <td className="py-2 text-right text-slate-500">{m.required_qty.toLocaleString("en-IN")}</td>
                  <td className="py-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={actualQuantities[m.stock_item_id] ?? m.required_qty}
                      onChange={(e) => onActualQtyChange(m.stock_item_id, parseFloat(e.target.value) || 0)}
                      className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm dark:border-[#282832] dark:bg-[#1a1a24] dark:text-white"
                    />
                  </td>
                  <td className="py-2">
                    {isSerial ? (
                      serials.length > 0 ? (
                        <div className="flex max-w-[260px] flex-wrap gap-1">
                          {serials.slice(0, 40).map((s) => {
                            const selected = selectedSerials.includes(s.serial_number);
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => onSerialToggle(m.stock_item_id, s.serial_number)}
                                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                  selected
                                    ? "border-brand-600 bg-brand-600 text-white dark:border-blue-600 dark:bg-blue-600"
                                    : "border-slate-300 bg-white text-slate-600 hover:border-brand-400 dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#cbd5e1]"
                                }`}
                              >
                                {s.serial_number}
                              </button>
                            );
                          })}
                          <span className={`text-[11px] ${selectedSerials.length >= serialsRequired ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}`}>
                            {selectedSerials.length}/{serialsRequired} selected
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-amber-500">No serials in stock — create them in the Batches tab</span>
                      )
                    ) : batches.length > 0 ? (
                      <Select
                        value={batchAllocations[m.stock_item_id] || ""}
                        onChange={(v) => onBatchChange(m.stock_item_id, v)}
                        options={[{ value: "", label: "Select batch" }, ...batches.map((b) => ({ value: b.id, label: `${b.batch_number} (${b.quantity})` }))]}
                        className="w-full"
                        placeholder="Select batch"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:bg-[#282832]">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium text-white">
            Confirm Production
          </button>
        </div>
    </Modal>
  );
}

