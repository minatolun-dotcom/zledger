import StatusBadge from "../components/StatusBadge";
import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import { useRole } from "../hooks/useRole";
import Tabs from "../components/Tabs";
import { PAGE_TAB_DEFS } from "../config/pageTabs";
import SortableTable, { type SortableColumn } from "../components/SortableTable";
import { showConfirm } from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import MasterSelector from "../components/master/MasterSelector";
import DateInput from "../components/DateInput";
import { useStockItems } from "../hooks/useMasterData";

import Select from "../components/Select";
import TabContent from "../components/TabContent";

interface Batch {
  id: string;
  stock_item_id: string;
  item_name: string | null;
  batch_number: string;
  manufacturing_date: string | null;
  expiry_date: string | null;
  quantity: number;
  status: string;
  created_at: string;
}

interface ExpiringBatch {
  id: string;
  item_name: string | null;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  days_left: number;
  status: string;
}

interface BatchReport {
  total_batches: number;
  active_batches: number;
  total_quantity: number;
  by_item: Array<{ item_name: string; batch_count: number; total_qty: number; active: number }>;
}

interface BatchTraceEntry {
  id: string;
  entry_type: string;
  quantity: number;
  rate: number;
  reference: string | null;
  created_at: string | null;
}

interface BatchTraceResult {
  batch_id: string;
  stock_item_id: string;
  item_name: string | null;
  batch_number: string;
  manufacturing_date: string | null;
  expiry_date: string | null;
  current_quantity: number;
  status: string;
  ledger: BatchTraceEntry[];
}

const BATCH_FORM_EMPTY = {
  stock_item_id: "",
  batch_number: "",
  manufacturing_date: "",
  expiry_date: "",
  quantity: 0,
};

export default function BatchBrowsePage() {
  const toast = useToastStore();
  const { canEdit } = useRole();
  const { data: items = [] } = useStockItems();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [expiring, setExpiring] = useState<ExpiringBatch[]>([]);
  const [report, setReport] = useState<BatchReport | null>(null);
  const [tab, setTab] = useState<"browse" | "expiring" | "report" | "trace">("browse");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(BATCH_FORM_EMPTY);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!form.stock_item_id || !form.batch_number) {
      toast.error("Stock item and batch number are required");
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post("/manufacturing/batches", {
        stock_item_id: form.stock_item_id,
        batch_number: form.batch_number,
        manufacturing_date: form.manufacturing_date || null,
        expiry_date: form.expiry_date || null,
        quantity: form.quantity,
      });
      toast.success("Batch created");
      setShowCreate(false);
      setForm(BATCH_FORM_EMPTY);
      fetchBatches();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create batch");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Batch Trace (inline tab)
  const [traceNumber, setTraceNumber] = useState("");
  const [traceResults, setTraceResults] = useState<BatchTraceResult[]>([]);
  const [isTracing, setIsTracing] = useState(false);
  const [hasTraced, setHasTraced] = useState(false);

  const handleTrace = async () => {
    if (!traceNumber.trim()) {
      toast.error("Please enter a batch number");
      return;
    }
    setIsTracing(true);
    try {
      const data = await api.get<BatchTraceResult[]>(`/manufacturing/batches/trace/${traceNumber.trim()}`);
      setTraceResults(data);
      setHasTraced(true);
    } catch (err: any) {
      if (err?.status === 404) {
        setTraceResults([]);
        setHasTraced(true);
      } else {
        toast.error(err?.message || "Failed to trace batch");
      }
    } finally {
      setIsTracing(false);
    }
  };

  const traceInward = traceResults.reduce(
    (sum, r) => sum + r.ledger.filter((l) => l.entry_type === "inward").reduce((s, l) => s + l.quantity, 0),
    0
  );
  const traceOutward = traceResults.reduce(
    (sum, r) => sum + r.ledger.filter((l) => l.entry_type === "outward").reduce((s, l) => s + l.quantity, 0),
    0
  );

  const fetchBatches = async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      const url = `/manufacturing/batches${params.toString() ? "?" + params.toString() : ""}`;
      const res = await api.get<Batch[]>(url);
      setBatches(res);
    } catch {
      toast.error("Failed to load batches");
    }
  };

  const fetchExpiring = async () => {
    try {
      const res = await api.get<ExpiringBatch[]>("/manufacturing/batches/expiring?days=90");
      setExpiring(res);
    } catch {
      toast.error("Failed to load expiry alerts");
    }
  };

  const fetchReport = async () => {
    try {
      const res = await api.get<BatchReport>("/manufacturing/batches/report");
      setReport(res);
    } catch {
      toast.error("Failed to load batch report");
    }
  };

  useEffect(() => { fetchBatches(); }, [filterStatus]);
  useEffect(() => { if (tab === "expiring") fetchExpiring(); }, [tab]);
  useEffect(() => { if (tab === "report") fetchReport(); }, [tab]);

  const filteredBatches = batches.filter((b) =>
    !filterSearch || b.batch_number.toLowerCase().includes(filterSearch.toLowerCase()) ||
    (b.item_name && b.item_name.toLowerCase().includes(filterSearch.toLowerCase()))
  );

  const handleDelete = async (id: string, batchNum: string) => {
    if (!await showConfirm(`Delete batch "${batchNum}"?`, { danger: true, confirmLabel: "Delete" })) return;
    try {
      await api.del(`/manufacturing/batches/${id}`);
      toast.success("Batch deleted");
      fetchBatches();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete");
    }
  };

  const cols: SortableColumn<Batch>[] = [
    { id: "batch_number", header: "Batch Number", accessorKey: "batch_number" },
    { id: "item_name", header: "Item", accessorFn: (r) => r.item_name || "—" },
    { id: "quantity", header: "Qty", accessorFn: (r) => r.quantity.toFixed(1) },
    { id: "manufacturing_date", header: "Mfg Date", accessorFn: (r) => r.manufacturing_date || "—" },
    { id: "expiry_date", header: "Expiry", cell: ({ row: { original: r } }) => {
      if (!r.expiry_date) return <span className="text-slate-400">—</span>;
      const daysLeft = Math.ceil((new Date(r.expiry_date).getTime() - Date.now()) / 86400000);
      return (
        <span className={daysLeft <= 0 ? "text-red-500 font-medium" : daysLeft <= 30 ? "text-amber-500" : "text-slate-600 dark:text-[#94a3b8]"}>
          {r.expiry_date} {daysLeft <= 30 && `(${daysLeft}d)`}
        </span>
      );
    }},
    { id: "status", header: "Status", cell: ({ row: { original: r } }) => <StatusBadge status={r.status} /> },
  ];


  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9] mb-6">Batches</h1>

      {/* Tabs */}
      <Tabs
        tabs={PAGE_TAB_DEFS["/batches"].tabs}
        active={tab}
        onChange={(t) => setTab(t as "browse" | "expiring" | "report" | "trace")}
      />

      <TabContent activeKey={tab}>
      {/* Browse Tab */}
      {tab === "browse" && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <input type="text" placeholder="Search batches..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#282832] dark:bg-[#16161f] dark:text-[#f1f5f9]" />
            <Select value={filterStatus} onChange={setFilterStatus}
              options={[
                { value: "", label: "All Status" },
                { value: "active", label: "Active" },
                { value: "expired", label: "Expired" },
                { value: "consumed", label: "Consumed" },
              ]}
            />
            {canEdit && (
              <button
                onClick={() => { setForm(BATCH_FORM_EMPTY); setShowCreate(true); }}
                className="btn-primary whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium text-white"
              >
                + New Batch
              </button>
            )}
          </div>
          <SortableTable columns={cols} data={filteredBatches} tableKey="batch-browse" emptyMessage="No batches found."
            keyboardNav
            actions={canEdit ? (r) => [{ icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>, label: "Delete", danger: true, onClick: () => handleDelete(r.id, r.batch_number) }] : undefined}
          />
        </div>
      )}

      {/* Expiry Alerts Tab */}
      {tab === "expiring" && (
        <div className="space-y-3">
          {expiring.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-[#282832] dark:bg-[#16161f]">
              <p className="text-sm text-slate-500 dark:text-[#94a3b8]">No batches expiring within 90 days.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {expiring.map((b) => (
                <div key={b.id} className={`flex items-center justify-between rounded-lg border p-3 ${
                  b.status === "expired" ? "border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-900/10" :
                  b.days_left <= 30 ? "border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-900/10" :
                  "border-slate-200 bg-white dark:border-[#282832] dark:bg-[#16161f]"
                }`}>
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">{b.batch_number}</p>
                    <p className="text-xs text-slate-500 dark:text-[#94a3b8]">{b.item_name} — {b.quantity} units</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${b.status === "expired" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                      {b.status === "expired" ? "Expired" : `${b.days_left} days left`}
                    </p>
                    <p className="text-xs text-slate-400">{b.expiry_date}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Batch Trace Tab */}
      {tab === "trace" && (
        <div className="space-y-6">
          <div className="flex items-end gap-4 max-w-3xl">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Batch Number</label>
              <input
                type="text"
                value={traceNumber}
                onChange={(e) => setTraceNumber(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTrace()}
                placeholder="e.g. PCB-M-2026-001"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-[#282832] dark:bg-[#16161f] dark:text-[#f1f5f9] dark:focus:border-blue-500/50 dark:focus:ring-blue-500/20"
              />
            </div>
            <button
              onClick={handleTrace}
              disabled={isTracing}
              className="btn-primary rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isTracing ? "Tracing..." : "Trace"}
            </button>
          </div>

          {hasTraced && traceResults.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-[#1a1a24] dark:bg-[#16161f] shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Items Found</p>
                <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">{traceResults.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-[#1a1a24] dark:bg-[#16161f] shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Total Inward</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{traceInward.toLocaleString("en-IN")}</p>
              </div>
              <div className="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-[#1a1a24] dark:bg-[#16161f] shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Total Outward</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400">{traceOutward.toLocaleString("en-IN")}</p>
              </div>
              <div className="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-[#1a1a24] dark:bg-[#16161f] shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Current Qty</p>
                <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">{(traceInward - traceOutward).toLocaleString("en-IN")}</p>
              </div>
            </div>
          )}

          {hasTraced && traceResults.length === 0 && (
            <div className="rounded-lg border border-slate-200/60 bg-white p-8 text-center dark:border-[#1a1a24] dark:bg-[#16161f]">
              <p className="text-slate-500 dark:text-[#64748b]">No batches found with number "{traceNumber}"</p>
            </div>
          )}

          {traceResults.map((result) => (
            <div key={result.batch_id} className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm dark:border-[#1a1a24] dark:bg-[#16161f]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">{result.batch_number}</h3>
                  <p className="text-sm text-slate-500 dark:text-[#64748b]">{result.item_name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-slate-400 dark:text-[#64748b]">Mfg Date</p>
                    <p className="text-sm text-slate-700 dark:text-[#cbd5e1]">{result.manufacturing_date || "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400 dark:text-[#64748b]">Expiry</p>
                    <p className="text-sm text-slate-700 dark:text-[#cbd5e1]">{result.expiry_date || "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400 dark:text-[#64748b]">Status</p>
                    <StatusBadge status={result.status} />
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400 dark:text-[#64748b]">Current Qty</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">{result.current_quantity.toLocaleString("en-IN")}</p>
                  </div>
                </div>
              </div>

              {result.ledger.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-[#1a1a24]">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-[#16161f]">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-[#94a3b8]">Date</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-[#94a3b8]">Type</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-[#94a3b8]">Qty</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-[#94a3b8]">Rate</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-[#94a3b8]">Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {result.ledger.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-3 py-2 text-slate-700 dark:text-[#cbd5e1]">
                            {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              entry.entry_type === "inward" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                            }`}>
                              {entry.entry_type}
                            </span>
                          </td>
                          <td className={`px-3 py-2 text-right font-medium ${entry.entry_type === "inward" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                            {entry.entry_type === "inward" ? "+" : "-"}{entry.quantity.toLocaleString("en-IN")}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-600 dark:text-[#94a3b8]">
                            ₹{entry.rate.toLocaleString("en-IN")}
                          </td>
                          <td className="px-3 py-2 text-slate-600 dark:text-[#94a3b8]">
                            {entry.reference || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Report Tab */}
      {tab === "report" && report && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#282832] dark:bg-[#16161f]">
              <p className="text-xs text-slate-500 dark:text-[#94a3b8]">Total Batches</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-[#f1f5f9]">{report.total_batches}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#282832] dark:bg-[#16161f]">
              <p className="text-xs text-slate-500 dark:text-[#94a3b8]">Active Batches</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{report.active_batches}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#282832] dark:bg-[#16161f]">
              <p className="text-xs text-slate-500 dark:text-[#94a3b8]">Total Quantity</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{report.total_quantity.toFixed(1)}</p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#282832] dark:bg-[#16161f]">
            <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">By Item</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#282832]">
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Item</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Batches</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Active</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Total Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {report.by_item.map((row) => (
                    <tr key={row.item_name} className="border-b border-slate-100 dark:border-[#1a1a24]">
                      <td className="px-3 py-2 text-slate-700 dark:text-[#cbd5e1]">{row.item_name}</td>
                      <td className="px-3 py-2 text-right text-slate-600 dark:text-[#94a3b8]">{row.batch_count}</td>
                      <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">{row.active}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-700 dark:text-[#cbd5e1]">{row.total_qty.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {/* Create Batch Modal */}
      {showCreate && (
        <Modal open onClose={() => setShowCreate(false)} maxWidth="lg" panelClassName="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">New Batch</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Stock Item</label>
                <MasterSelector
                  entityKey="stock_item"
                  value={form.stock_item_id}
                  onChange={(v: string) => setForm({ ...form, stock_item_id: v })}
                  options={items.filter((i) => i.tracking_mode !== "none").map((i) => ({ value: i.id, label: i.name }))}
                  placeholder="Select item (must have batch tracking enabled)"
                  className="w-full"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Batch Number</label>
                  <input
                    type="text"
                    value={form.batch_number}
                    onChange={(e) => setForm({ ...form, batch_number: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                    placeholder="e.g. LOT-2026-001"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Quantity</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Manufacturing Date</label>
                  <DateInput
                    value={form.manufacturing_date}
                    onChange={(v) => setForm({ ...form, manufacturing_date: v })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Expiry Date</label>
                  <DateInput
                    value={form.expiry_date}
                    onChange={(v) => setForm({ ...form, expiry_date: v })}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button onClick={() => setShowCreate(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1]">
                  Cancel
                </button>
                <button onClick={handleCreate} disabled={isSubmitting} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {isSubmitting ? "Creating..." : "Create Batch"}
                </button>
              </div>
            </div>
        </Modal>
      )}
      </TabContent>
    </div>
  );
}
