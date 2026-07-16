import { useState } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";


interface BatchTraceResult {
  batch_id: string;
  stock_item_id: string;
  item_name: string | null;
  batch_number: string;
  manufacturing_date: string | null;
  expiry_date: string | null;
  current_quantity: number;
  status: string;
  ledger: {
    id: string;
    entry_type: string;
    quantity: number;
    rate: number;
    reference: string | null;
    created_at: string | null;
  }[];
}

export default function BatchTracePage() {
  const toast = useToastStore();
  const [batchNumber, setBatchNumber] = useState("");
  const [results, setResults] = useState<BatchTraceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (!batchNumber.trim()) {
      toast.error("Please enter a batch number");
      return;
    }
    setIsSearching(true);
    try {
      const data = await api.get<BatchTraceResult[]>(`/manufacturing/batches/trace/${batchNumber.trim()}`);
      setResults(data);
      setHasSearched(true);
    } catch (err: any) {
      if (err?.status === 404) {
        setResults([]);
        setHasSearched(true);
      } else {
        toast.error(err?.message || "Failed to trace batch");
      }
    } finally {
      setIsSearching(false);
    }
  };

  const totalInward = results.reduce((sum, r) =>
    sum + r.ledger.filter((l) => l.entry_type === "inward").reduce((s, l) => s + l.quantity, 0), 0
  );
  const totalOutward = results.reduce((sum, r) =>
    sum + r.ledger.filter((l) => l.entry_type === "outward").reduce((s, l) => s + l.quantity, 0), 0
  );

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Batch Trace</h1>

      {/* Search */}
      <div className="flex items-end gap-4 max-w-3xl">
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Batch Number</label>
          <input
            type="text"
            value={batchNumber}
            onChange={(e) => setBatchNumber(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="e.g. PCB-M-2026-001"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-[#282832] dark:bg-[#16161f] dark:text-[#f1f5f9] dark:focus:border-blue-500/50 dark:focus:ring-blue-500/20"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={isSearching}
          className="btn-primary rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isSearching ? "Searching..." : "Trace"}
        </button>
      </div>

      {/* Summary */}
      {hasSearched && results.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-[#1a1a24] dark:bg-[#16161f] shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Items Found</p>
            <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">{results.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-[#1a1a24] dark:bg-[#16161f] shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Total Inward</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{totalInward.toLocaleString("en-IN")}</p>
          </div>
          <div className="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-[#1a1a24] dark:bg-[#16161f] shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Total Outward</p>
            <p className="text-lg font-bold text-red-600 dark:text-red-400">{totalOutward.toLocaleString("en-IN")}</p>
          </div>
          <div className="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-[#1a1a24] dark:bg-[#16161f] shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Current Qty</p>
            <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">{(totalInward - totalOutward).toLocaleString("en-IN")}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {hasSearched && results.length === 0 && (
        <div className="rounded-lg border border-slate-200/60 bg-white p-8 text-center dark:border-[#1a1a24] dark:bg-[#16161f]">
          <p className="text-slate-500 dark:text-[#64748b]">No batches found with number "{batchNumber}"</p>
        </div>
      )}

      {results.map((result) => (
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
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                  result.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" :
                  result.status === "exhausted" ? "bg-slate-100 text-slate-500 dark:bg-[#1a1a24] dark:text-[#94a3b8]" :
                  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                }`}>
                  {result.status}
                </span>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 dark:text-[#64748b]">Current Qty</p>
                <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">{result.current_quantity.toLocaleString("en-IN")}</p>
              </div>
            </div>
          </div>

          {/* Ledger */}
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
  );
}
