import { useState, useMemo } from "react";
import type { Voucher } from "./types";
import { VOUCHER_TYPES } from "./types";
import { toDisplayDate } from "../../utils/dateUtils";
import { VouchersSkeleton } from "../skeletons";

interface VoucherListProps {
  vouchers: Voucher[];
  loading: boolean;
  filterType: string;
  onFilterChange: (type: string) => void;
  onClick: (id: string) => void;
  onBulkCancel?: (ids: string[]) => void;
  onBulkDelete?: (ids: string[]) => void;
}

export default function VoucherList({
  vouchers,
  loading,
  filterType,
  onFilterChange,
  onClick,
  onBulkCancel,
  onBulkDelete,
}: VoucherListProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  const filtered = useMemo(() => {
    let result = filterType === "all"
      ? vouchers
      : vouchers.filter((v) => v.voucher_type === filterType);

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (v) =>
          v.voucher_number.toLowerCase().includes(q) ||
          (v.narration && v.narration.toLowerCase().includes(q))
      );
    }

    return result.sort(
      (a, b) => new Date(b.voucher_date).getTime() - new Date(a.voucher_date).getTime()
    );
  }, [vouchers, filterType, search]);

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((v) => v.id)));
    }
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    setSelected(new Set());
  };

  return (
    <div>
      {/* Filter row */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex gap-1">
          <button
            onClick={() => onFilterChange("all")}
            className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
              filterType === "all"
                ? "bg-brand-500 text-white shadow-sm"
                : "bg-slate-100 dark:bg-[#252530] text-slate-600 dark:text-[#94a3b8] hover:bg-slate-200 dark:hover:bg-[#333340] hover:text-slate-800 dark:hover:text-[#f1f5f9]"
            }`}
          >
            All
          </button>
          {VOUCHER_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => onFilterChange(t.id)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                filterType === t.id
                  ? "bg-brand-500 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-[#252530] text-slate-600 dark:text-[#94a3b8] hover:bg-slate-200 dark:hover:bg-[#333340] hover:text-slate-800 dark:hover:text-[#f1f5f9]"
              }`}
            >
              {t.shortLabel}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {bulkMode ? (
            <>
              {selected.size > 0 && (
                <>
                  {onBulkCancel && (
                    <button
                      onClick={() => onBulkCancel(Array.from(selected))}
                      className="rounded border border-amber-300 dark:border-amber-500/30 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                    >
                      Cancel ({selected.size})
                    </button>
                  )}
                  {onBulkDelete && (
                    <button
                      onClick={() => onBulkDelete(Array.from(selected))}
                      className="rounded border border-red-300 dark:border-red-500/30 px-2.5 py-1 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    >
                      Delete ({selected.size})
                    </button>
                  )}
                </>
              )}
              <button
                onClick={exitBulkMode}
                className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530] transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setBulkMode(true)}
              className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530] transition-colors"
            >
              Select
            </button>
          )}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search voucher # or narration..."
            className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20 w-52"
          />
        </div>
      </div>

      {/* Voucher table */}
      {loading ? (
        <VouchersSkeleton />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-[#1e1e28]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1e1e28] bg-slate-50 dark:bg-[#18181f]/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-[#94a3b8]">
                {bulkMode && (
                  <th className="px-2.5 py-1.5 w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 dark:border-[#252530] text-brand-500 focus:ring-brand-500 dark:focus:ring-violet-500/20"
                    />
                  </th>
                )}
                <th className="px-2.5 py-1.5 w-[70px]">#</th>
                <th className="px-2.5 py-1.5 w-[110px]">Date</th>
                <th className="px-2.5 py-1.5 w-[90px]">Type</th>
                <th className="px-2.5 py-1.5">Narration</th>
                <th className="px-2.5 py-1.5 text-right w-[100px]">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr
                  key={v.id}
                  className={`border-b border-slate-100 dark:border-[#1e1e28]/50 hover:bg-slate-50 dark:hover:bg-[#1e1e28] cursor-pointer transition-colors ${
                    selected.has(v.id) ? "bg-brand-50 dark:bg-brand-500/10" : ""
                  }`}
                  onClick={() => bulkMode ? toggleSelect(v.id, { stopPropagation: () => {} } as React.MouseEvent) : onClick(v.id)}
                >
                  {bulkMode && (
                    <td className="px-2.5 py-1.5">
                      <input
                        type="checkbox"
                        checked={selected.has(v.id)}
                        onChange={() => {}}
                        onClick={(e) => toggleSelect(v.id, e)}
                        className="rounded border-slate-300 dark:border-[#252530] text-brand-500 focus:ring-brand-500 dark:focus:ring-violet-500/20"
                      />
                    </td>
                  )}
                  <td className="px-2.5 py-1.5 font-medium text-slate-900 dark:text-[#f1f5f9] whitespace-nowrap">
                    {v.voucher_number}
                  </td>
                  <td className="px-2.5 py-1.5 text-slate-600 dark:text-[#94a3b8] whitespace-nowrap">{toDisplayDate(v.voucher_date)}</td>
                  <td className="px-2.5 py-1.5">
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 dark:bg-[#252530] px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:text-[#94a3b8]">
                      {VOUCHER_TYPES.find((t) => t.id === v.voucher_type)?.shortLabel || v.voucher_type}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate px-2.5 py-1.5 text-slate-600 dark:text-[#94a3b8]">
                    {v.narration ?? "—"}
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-medium text-slate-900 dark:text-[#f1f5f9] tabular-nums">
                    ₹{v.grand_total.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={bulkMode ? 6 : 5} className="py-8 text-center text-xs text-slate-400 dark:text-[#64748b]">
                    {search ? "No vouchers match your search." : "No vouchers yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
