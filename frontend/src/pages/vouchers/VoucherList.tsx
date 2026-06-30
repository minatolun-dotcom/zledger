import { useState, useMemo } from "react";
import type { Voucher } from "./types";
import { VOUCHER_TYPES } from "./types";
import { toDisplayDate } from "../../utils/dateUtils";

interface VoucherListProps {
  vouchers: Voucher[];
  loading: boolean;
  filterType: string;
  onFilterChange: (type: string) => void;
  onClick: (id: string) => void;
}

export default function VoucherList({
  vouchers,
  loading,
  filterType,
  onFilterChange,
  onClick,
}: VoucherListProps) {
  const [search, setSearch] = useState("");

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
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800"
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
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800"
              }`}
            >
              {t.shortLabel}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search voucher # or narration..."
            className="rounded border border-slate-300 px-2.5 py-1 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 w-52"
          />
        </div>
      </div>

      {/* Voucher table */}
      {loading ? (
        <p className="py-4 text-sm text-slate-500">Loading vouchers...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2.5 py-1.5">#</th>
                <th className="px-2.5 py-1.5">Date</th>
                <th className="px-2.5 py-1.5">Type</th>
                <th className="px-2.5 py-1.5">Narration</th>
                <th className="px-2.5 py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => onClick(v.id)}
                >
                  <td className="px-2.5 py-1.5 font-medium text-slate-900">
                    {v.voucher_number}
                  </td>
                  <td className="px-2.5 py-1.5 text-slate-600">{toDisplayDate(v.voucher_date)}</td>
                  <td className="px-2.5 py-1.5">
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                      {VOUCHER_TYPES.find((t) => t.id === v.voucher_type)?.shortLabel || v.voucher_type}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate px-2.5 py-1.5 text-slate-600">
                    {v.narration ?? "—"}
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-medium text-slate-900 tabular-nums">
                    ₹{v.grand_total.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-slate-400">
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
