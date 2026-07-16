import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import { useRole } from "../hooks/useRole";
import SortableTable, { type SortableColumn } from "../components/SortableTable";
import PageHeader from "../components/PageHeader";
import Select from "../components/Select";

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

export default function BatchBrowsePage() {
  const toast = useToastStore();
  const { canEdit } = useRole();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [expiring, setExpiring] = useState<ExpiringBatch[]>([]);
  const [report, setReport] = useState<BatchReport | null>(null);
  const [tab, setTab] = useState<"browse" | "expiring" | "report">("browse");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

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
    if (!window.confirm(`Delete batch "${batchNum}"?`)) return;
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
    { id: "status", header: "Status", cell: ({ row: { original: r } }) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        r.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
        r.status === "expired" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
        "bg-slate-100 text-slate-500 dark:bg-[#16161f] dark:text-[#94a3b8]"
      }`}>{r.status}</span>
    )},
  ];

  if (canEdit) {
    cols.push({ id: "_actions", header: "", cell: ({ row: { original: r } }) => (
      <button onClick={() => handleDelete(r.id, r.batch_number)}
        className="text-slate-400 hover:text-red-500 dark:text-[#64748b] dark:hover:text-red-400" title="Delete">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
      </button>
    )});
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Batches" />

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-[#16161f]">
        {(["browse", "expiring", "report"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === t ? "bg-white text-slate-900 shadow dark:bg-[#1a1a24] dark:text-[#f1f5f9]" : "text-slate-500 hover:text-slate-700 dark:text-[#94a3b8]"
            }`}>
            {t === "browse" ? "Browse" : t === "expiring" ? "Expiry Alerts" : "Report"}
          </button>
        ))}
      </div>

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
          </div>
          <SortableTable columns={cols} data={filteredBatches} tableKey="batch-browse" emptyMessage="No batches found." />
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
    </div>
  );
}
