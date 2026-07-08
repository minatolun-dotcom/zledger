import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import Select from "../components/Select";
import SortableTable, { type SortableColumn } from "../components/SortableTable";
import { useRole } from "../hooks/useRole";
import { useToastStore } from "../store/toast";
import { showConfirm } from "../components/ConfirmDialog";
import {
  useBoms,
  useProductionOrders,
  useStockItems,
  useMaterialAvailability,
  useBomStockLevels,
  type Bom,
  type ProductionOrder,
} from "../hooks/useMasterData";

type Tab = "boms" | "production" | "reports";

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
  lines: [] as BomLineForm[],
};

const ORDER_FORM_EMPTY = {
  bom_id: "",
  order_date: new Date().toISOString().slice(0, 10),
  planned_qty: 1,
  narration: "",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  completed:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  cancelled:
    "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export default function ManufacturingPage() {
  const { canEdit } = useRole();
  const toast = useToastStore();
  const queryClient = useQueryClient();
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

  const { query: { data: boms = [] }, duplicate: duplicateBom } = useBoms();
  const { data: orders = [] } = useProductionOrders();
  const { data: items = [] } = useStockItems();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["boms"] });
    queryClient.invalidateQueries({ queryKey: ["productionOrders"] });
  }, [queryClient]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedOrder) { setSelectedOrder(null); return; }
        if (detailBom) { setDetailBom(null); return; }
        if (selected) { setSelected(null); return; }
        if (showCreateBom) { setShowCreateBom(false); setBomForm({ ...BOM_FORM_EMPTY, lines: [] }); return; }
        if (showCreateOrder) { setShowCreateOrder(false); setOrderForm({ ...ORDER_FORM_EMPTY, bom_id: "" }); return; }
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [selectedOrder, detailBom, selected, showCreateBom, showCreateOrder]);

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
        lines: bomForm.lines.map((l) => ({
          stock_item_id: l.stock_item_id,
          quantity: l.quantity,
          rate: l.rate ? parseFloat(l.rate) : null,
          wastage_pct: l.wastage_pct,
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
      const created = await api.post<ProductionOrder>("/manufacturing/production-orders", orderForm);
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
      setConfirmOrderData(order);
      setShowConfirmModal(true);
    } catch {
      // If availability fails, just confirm without actual quantities
      if (
        !(await showConfirm(
          `Confirm production of ${order.planned_qty} units? This will consume raw materials and create stock entries.`,
          { confirmLabel: "Confirm Production" }
        ))
      )
        return;
      try {
        await api.post(`/manufacturing/production-orders/${order.id}/confirm`);
        toast.success("Production completed — stock entries and journal created");
        setSelectedOrder(null);
        invalidate();
      } catch (err: any) {
        toast.error(err?.message || "Failed to confirm production");
      }
    }
  };

  const submitConfirmOrder = async () => {
    if (!confirmOrderData) return;
    try {
      const payload = Object.entries(actualQuantities).map(([stock_item_id, actual_qty]) => ({
        stock_item_id,
        actual_qty,
      }));
      await api.post(`/manufacturing/production-orders/${confirmOrderData.id}/confirm`, payload);
      toast.success("Production completed — stock entries and journal created");
      setShowConfirmModal(false);
      setConfirmOrderData(null);
      setSelectedOrder(null);
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

  // ── BOM table columns ──

  const bomCols: SortableColumn<Bom>[] = [
    { id: "name", header: "Name", accessorKey: "name", size: 180, className: "font-medium text-slate-900 dark:text-[#f1f5f9]" },
    { id: "finished_item_id", header: "Finished Product", accessorFn: (row) => itemName(row.finished_item_id), size: 160, className: "text-slate-600 dark:text-[#cbd5e1]" },
    { id: "output_qty", header: "Output Qty", accessorKey: "output_qty", size: 100, cell: ({ getValue }) => (getValue() as number).toLocaleString("en-IN"), className: "text-right" },
    { id: "lines", header: "Components", accessorFn: (row) => row.lines.length, size: 240, cell: ({ getValue, row }) => {
      const count = getValue() as number;
      const names = row.original.lines.map((l) => l.item_name || "").filter(Boolean).join(", ");
      return (
        <div className="flex items-center gap-2" title={names}>
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {count}
          </span>
          <span className="truncate text-xs text-slate-500 dark:text-slate-400">
            {names}
          </span>
        </div>
      );
    }, className: "" },
    { id: "is_active", header: "Status", accessorKey: "is_active", size: 90, cell: ({ getValue }) => (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        getValue() ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
      }`}>
        {getValue() ? "Active" : "Inactive"}
      </span>
    ) },
  ];

  // ── Production order columns ──

  const orderCols: SortableColumn<ProductionOrder>[] = [
    { id: "order_number", header: "Order #", accessorKey: "order_number", size: 140, className: "font-medium text-slate-900 dark:text-[#f1f5f9]" },
    { id: "order_date", header: "Date", accessorKey: "order_date", size: 110 },
    { id: "bom_id", header: "BOM", accessorFn: (row) => boms.find((b) => b.id === row.bom_id)?.name || "—", size: 160, className: "text-slate-600 dark:text-[#cbd5e1]" },
    { id: "planned_qty", header: "Planned", accessorKey: "planned_qty", size: 90, cell: ({ getValue }) => (getValue() as number).toLocaleString("en-IN"), className: "text-right" },
    { id: "produced_qty", header: "Produced", accessorKey: "produced_qty", size: 90, cell: ({ getValue }) => (getValue() as number).toLocaleString("en-IN"), className: "text-right" },
    { id: "status", header: "Status", accessorKey: "status", size: 100, cell: ({ getValue }) => (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        STATUS_COLORS[getValue() as string] || ""
      }`}>
        {getValue() as string}
      </span>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/60 pb-3 dark:border-slate-700/60">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Manufacturing
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {(["boms", "production", "reports"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setSearchQuery(""); }}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === t
                ? "bg-white text-slate-900 shadow dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
            }`}
          >
            {t === "boms" ? "Bills of Materials" : t === "production" ? "Production Orders" : "Reports"}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder={tab === "boms" ? "Search BOMs..." : "Search orders..."}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        {canEdit && tab === "boms" && (
          <label className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
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
        {canEdit && (
          <button
            onClick={tab === "boms" ? openCreateBom : openCreateOrder}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-medium text-white"
          >
            + New {tab === "boms" ? "BOM" : "Order"}
          </button>
        )}
      </div>

      {/* Table */}
      {tab === "boms" ? (
        <SortableTable
          columns={bomCols}
          data={filteredBoms}
          tableKey="manufacturing-boms"
          onRowClick={(b: Bom) => setDetailBom(b)}
          emptyMessage="No BOMs yet. Create one to define a product assembly."
        />
      ) : tab === "production" ? (
        <SortableTable
          columns={orderCols}
          data={filteredOrders}
          tableKey="manufacturing-orders"
          onRowClick={(o: ProductionOrder) => setSelectedOrder(o)}
          emptyMessage="No production orders yet."
        />
      ) : (
        /* Reports tab */
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* BOM Cost Analysis Card */}
            <div className="card-gradient rounded-xl border border-slate-200/60 p-6 dark:border-slate-700/60">
              <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                BOM Cost Analysis
              </h3>
              <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                Material cost breakdown per BOM with cost per unit analysis.
              </p>
              <div className="flex gap-2">
                <a
                  href={`/api/manufacturing/reports/bom-analysis/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
                >
                  Download PDF
                </a>
                <a
                  href={`/api/manufacturing/reports/bom-analysis/xlsx`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
                >
                  Download Excel
                </a>
              </div>
            </div>

            {/* Production Cost Card */}
            <div className="card-gradient rounded-xl border border-slate-200/60 p-6 dark:border-slate-700/60">
              <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                Production Cost Report
              </h3>
              <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                Per-order material cost breakdown with cost per unit metrics.
              </p>
              <div className="flex gap-2">
                <a
                  href={`/api/manufacturing/reports/production-cost/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
                >
                  Download PDF
                </a>
                <a
                  href={`/api/manufacturing/reports/production-cost/xlsx`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
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

      {/* BOM Detail Panel */}
      {detailBom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => e.target === e.currentTarget && setDetailBom(null)}
        >
          <div className="mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {detailBom.name}
              </h2>
              <button
                onClick={() => setDetailBom(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-slate-500">Finished Product</span>
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {itemName(detailBom.finished_item_id)}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-slate-500">Output Qty</span>
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {detailBom.output_qty.toLocaleString("en-IN")}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-slate-500">Status</span>
                  <p>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      detailBom.is_active
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                    }`}>
                      {detailBom.is_active ? "Active" : "Inactive"}
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-sm text-slate-500">Components</span>
                  <p className="font-medium text-slate-900 dark:text-slate-100">
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
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
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
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => { setDetailBom(null); deleteBom(detailBom); }}
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
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
          </div>
        </div>
      )}

      {/* BOM Modal */}
      {(selected !== null || showCreateBom) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => e.target === e.currentTarget && (setSelected(null), setShowCreateBom(false))}
        >
          <div className="mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {selected ? "Edit BOM" : "New BOM"}
              </h2>
              <button
                onClick={() => { setSelected(null); setShowCreateBom(false); }}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Name
                  </label>
                  <input
                    type="text"
                    value={bomForm.name}
                    onChange={(e) =>
                      setBomForm({ ...bomForm, name: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Finished Product
                  </label>
                  <Select
                    value={bomForm.finished_item_id}
                    onChange={(v: string) =>
                      setBomForm({ ...bomForm, finished_item_id: v })
                    }
                    options={items.map((i) => ({
                      value: i.id,
                      label: i.name,
                    }))}
                    placeholder="Select item"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
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
                  className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />
              </div>

              {/* Component Lines */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
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
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-600 dark:bg-slate-700/50"
                    >
                      <div className="flex-1">
                        <Select
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
                        className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
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
                        className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
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
                        className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                        title="Wastage %"
                      />
                      <select
                        value={line.sub_bom_id || ""}
                        onChange={(e) => {
                          const lines = [...bomForm.lines];
                          lines[idx] = {
                            ...lines[idx],
                            sub_bom_id: e.target.value || null,
                          };
                          setBomForm({ ...bomForm, lines });
                        }}
                        className="w-32 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                        title="Sub-assembly BOM (optional)"
                      >
                        <option value="">Raw Material</option>
                        {boms.filter(b => b.id !== selected?.id).map((b) => (
                          <option key={b.id} value={b.id}>Sub: {b.name}</option>
                        ))}
                      </select>
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
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
                {selected && canEdit && (
                  <button
                    onClick={() => deleteBom(selected)}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
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
          </div>
        </div>
      )}

      {/* Production Order Modal */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) =>
            e.target === e.currentTarget && setSelectedOrder(null)
          }
        >
          <div className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Production Order {selectedOrder.order_number}
              </h2>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">BOM</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {boms.find((b) => b.id === selectedOrder.bom_id)?.name ||
                    "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date</span>
                <span className="text-slate-900 dark:text-slate-100">
                  {selectedOrder.order_date}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Planned Qty</span>
                <span className="text-slate-900 dark:text-slate-100">
                  {selectedOrder.planned_qty}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Produced Qty</span>
                <span className="text-slate-900 dark:text-slate-100">
                  {selectedOrder.produced_qty}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                    STATUS_COLORS[selectedOrder.status] || ""
                  }`}
                >
                  {selectedOrder.status}
                </span>
              </div>
              {selectedOrder.narration && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Narration</span>
                  <span className="text-slate-900 dark:text-slate-100">
                    {selectedOrder.narration}
                  </span>
                </div>
              )}
            </div>

            {/* Material Availability Check */}
            {selectedOrder.status === "draft" && (
              <MaterialAvailabilitySection
                bomId={selectedOrder.bom_id}
                plannedQty={selectedOrder.planned_qty}
              />
            )}

            {canEdit && selectedOrder.status === "draft" && (
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => cancelOrder(selectedOrder)}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                >
                  Cancel Order
                </button>
                <ConfirmProductionButton
                  order={selectedOrder}
                  onConfirm={() => confirmOrder(selectedOrder)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Order Modal */}
      {showCreateOrder && !selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setOrderForm({ ...ORDER_FORM_EMPTY, bom_id: "" });
              setShowCreateOrder(false);
            }
          }}
        >
          <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                New Production Order
              </h2>
              <button
                onClick={() => { setOrderForm({ ...ORDER_FORM_EMPTY, bom_id: "" }); setShowCreateOrder(false); }}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Date
                  </label>
                  <input
                    type="date"
                    value={orderForm.order_date}
                    onChange={(e) =>
                      setOrderForm({ ...orderForm, order_date: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
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
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Narration
                </label>
                <textarea
                  value={orderForm.narration}
                  onChange={(e) =>
                    setOrderForm({ ...orderForm, narration: e.target.value })
                  }
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
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
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
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
          </div>
        </div>
      )}

      {showConfirmModal && confirmOrderData && (
        <WastageConfirmModal
          order={confirmOrderData}
          actualQuantities={actualQuantities}
          onActualQtyChange={(id: string, qty: number) => setActualQuantities((prev: Record<string, number>) => ({ ...prev, [id]: qty }))}
          onConfirm={submitConfirmOrder}
          onCancel={() => { setShowConfirmModal(false); setConfirmOrderData(null); }}
        />
      )}
    </div>
  );
}

function BomStockLevelsSection({ bomId, lines }: { bomId: string; lines: Bom["lines"] }) {
  const { data: stockLevels = [], isLoading } = useBomStockLevels(bomId);

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
        Components {isLoading && <span className="text-xs text-slate-400">(loading stock...)</span>}
      </h3>
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Item</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Type</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Qty/Unit</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Rate</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Wastage</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">In Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {lines.map((line) => {
              const stock = stockLevels.find((s) => s.stock_item_id === line.stock_item_id);
              const currentStock = stock?.current_stock ?? 0;
              const hasEnough = currentStock >= line.quantity;
              const isSubAssembly = !!line.sub_bom_id;
              return (
                <tr key={line.id}>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                    {line.item_name || "—"}
                  </td>
                  <td className="px-3 py-2">
                    {isSubAssembly ? (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        Sub-Assembly
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                        Raw Material
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">
                    {line.quantity.toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">
                    {line.rate ? `₹${line.rate.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">
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
    <div className="card-gradient rounded-xl border border-slate-200/60 p-6 dark:border-slate-700/60">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Wastage Report
        </h3>
        {showReport && wastageData.length > 0 && (
          <div className="flex gap-2">
            <a href="/api/manufacturing/reports/wastage/pdf" target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
              PDF
            </a>
            <a href="/api/manufacturing/reports/wastage/xlsx" target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
              Excel
            </a>
          </div>
        )}
      </div>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Actual vs planned material consumption with wastage percentages.
      </p>
      {!showReport ? (
        <button
          onClick={() => setShowReport(true)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
        >
          View Report
        </button>
      ) : isLoading ? (
        <span className="text-sm text-slate-500">Loading...</span>
      ) : wastageData.length === 0 ? (
        <span className="text-sm text-slate-500">No wastage data yet. Complete production orders with actual quantities to see data.</span>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Component</th>
                <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Planned</th>
                <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Actual</th>
                <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Wastage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {wastageData.map((item: any) => (
                <tr key={item.stock_item_id}>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{item.item_name}</td>
                  <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">{item.total_planned_qty}</td>
                  <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">{item.total_actual_qty}</td>
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
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
        {loading ? "Loading..." : "Version History"}
      </button>
      {showHistory && (
        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          {versions.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">No previous versions</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Version</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Name</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Date</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td className="px-3 py-2 text-slate-900 dark:text-slate-100">v{v.version}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{v.name}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{new Date(v.created_at).toLocaleDateString()}</td>
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
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
        <span className="text-xs text-slate-500">Checking material availability...</span>
      </div>
    );
  }

  if (availability.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Material Availability
        </span>
        <span className={`text-xs font-medium ${allSufficient ? "text-emerald-600" : "text-amber-600"}`}>
          {allSufficient ? "All materials available" : "Insufficient stock"}
        </span>
      </div>
      <div className="space-y-1.5">
        {availability.map((m) => (
          <div key={m.stock_item_id} className="flex items-center justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-400">{m.item_name}</span>
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
          ? "cursor-not-allowed bg-slate-400 dark:bg-slate-600"
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
  onConfirm,
  onCancel,
}: {
  order: ProductionOrder;
  actualQuantities: Record<string, number>;
  onActualQtyChange: (stockItemId: string, qty: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { data: availability = [] } = useMaterialAvailability(order.bom_id, order.planned_qty);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Confirm Production</h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Enter actual quantities consumed for wastage tracking
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="pb-2 text-left font-medium text-slate-600 dark:text-slate-400">Component</th>
              <th className="pb-2 text-right font-medium text-slate-600 dark:text-slate-400">Planned</th>
              <th className="pb-2 text-right font-medium text-slate-600 dark:text-slate-400">Actual</th>
            </tr>
          </thead>
          <tbody>
            {availability.map((m) => (
              <tr key={m.stock_item_id} className="border-b border-slate-100 dark:border-slate-700/50">
                <td className="py-2 text-slate-700 dark:text-slate-300">{m.item_name}</td>
                <td className="py-2 text-right text-slate-500">{m.required_qty.toLocaleString("en-IN")}</td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={actualQuantities[m.stock_item_id] ?? m.required_qty}
                    onChange={(e) => onActualQtyChange(m.stock_item_id, parseFloat(e.target.value) || 0)}
                    className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium text-white">
            Confirm Production
          </button>
        </div>
      </div>
    </div>
  );
}
