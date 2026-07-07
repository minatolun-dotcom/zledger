import { useState, useMemo, useEffect } from "react";
import type { Voucher } from "./types";
import { VOUCHER_TYPES, getVoucherColor } from "./types";
import { toDisplayDate } from "../../utils/dateUtils";
import { VouchersSkeleton } from "../skeletons";
import SortableTable from "../../components/SortableTable";
import type { SortableColumn } from "../../components/SortableTable";

interface VoucherListProps {
  vouchers: Voucher[];
  loading: boolean;
  filterType: string;
  onFilterChange: (type: string) => void;
  onClick: (id: string) => void;
  onBulkCancel?: (ids: string[]) => void;
  onBulkDelete?: (ids: string[]) => void;
  // Pagination props (optional for backward compatibility)
  page?: number;
  total?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  search?: string;
  onSearchChange?: (search: string) => void;
}

export default function VoucherList({
  vouchers,
  loading,
  filterType,
  onFilterChange,
  onClick,
  onBulkCancel,
  onBulkDelete,
  page = 1,
  total = 0,
  pageSize = 50,
  onPageChange,
  onPageSizeChange,
  search = "",
  onSearchChange,
}: VoucherListProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const hasBulk = !!onBulkCancel || !!onBulkDelete;

  // Client-side filtering when server pagination is not used (e.g., dashboard)
  const filtered = useMemo(() => {
    if (onPageChange) return vouchers; // server handles filtering with pagination
    let result = vouchers;
    if (filterType && filterType !== "all") {
      result = result.filter((v) => v.voucher_type === filterType);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((v) =>
        (v.voucher_number && v.voucher_number.toLowerCase().includes(q)) ||
        (v.narration && v.narration.toLowerCase().includes(q)) ||
        (v.party_name && v.party_name.toLowerCase().includes(q))
      );
    }
    return result;
  }, [vouchers, filterType, search, onPageChange]);

  const totalPages = Math.ceil(total / pageSize);
  const hasPagination = onPageChange && total > 0;

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  // Clear selection when vouchers data changes (after bulk actions refresh the list)
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(vouchers.map((v) => v.id));
      const next = new Set<string>();
      prev.forEach((id) => { if (validIds.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [vouchers]);

  const columns: SortableColumn<Voucher>[] = useMemo(() => {
    const cols: SortableColumn<Voucher>[] = [];

    if (hasBulk) {
      cols.push({
        id: "select",
        header: "",
        size: 40,
        sortable: false,
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={selected.has(row.original.id)}
            onChange={() => {}}
            onClick={(e) => toggleSelect(row.original.id, e as React.MouseEvent)}
            className="rounded border-slate-300 dark:border-[#282832] text-brand-500 focus:ring-brand-500 dark:focus:ring-blue-500/20"
          />
        ),
        headerClassName: "text-center",
      });
    }

    cols.push(
      {
        id: "voucher_number",
        header: "#",
        accessorKey: "voucher_number",
        size: 120,
        cell: ({ getValue }) => (
          <span className="truncate block">{getValue() ?? "—"}</span>
        ),
        className: "font-medium text-slate-900 dark:text-[#f1f5f9] whitespace-nowrap",
      },
      {
        id: "voucher_date",
        header: "Date",
        accessorKey: "voucher_date",
        size: 110,
        cell: ({ getValue }) => toDisplayDate(getValue()),
        className: "text-slate-600 dark:text-[#94a3b8] whitespace-nowrap",
      },
      {
        id: "voucher_type",
        header: "Type",
        accessorKey: "voucher_type",
        size: 90,
        cell: ({ getValue }) => {
          const type = getValue();
          const c = getVoucherColor(type);
          return (
            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${c.bg} ${c.text}`}>
              {VOUCHER_TYPES.find((t) => t.id === type)?.shortLabel || type}
            </span>
          );
        },
      },
      {
        id: "party_name",
        header: "Party",
        accessorKey: "party_name",
        size: 140,
        cell: ({ getValue }) => (
          <span className="max-w-[140px] truncate block">{getValue() ?? "—"}</span>
        ),
        className: "text-slate-600 dark:text-[#94a3b8]",
      },
      {
        id: "narration",
        header: "Narration",
        accessorKey: "narration",
        size: 200,
        cell: ({ row }) => {
          const v = row.original;
          if (v.cancelled_at) {
            return (
              <span className="inline-flex items-center gap-1 text-red-500 dark:text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                Cancelled
              </span>
            );
          }
          return <span className="truncate block w-full text-slate-500 dark:text-[#64748b]">{v.narration ?? "—"}</span>;
        },
        className: "text-slate-600 dark:text-[#94a3b8]",
      },
      {
        id: "grand_total",
        header: "Amount",
        accessorKey: "grand_total",
        size: 100,
        cell: ({ getValue }) => (
          <span className="text-right block tabular-nums">
            ₹{Number(getValue()).toLocaleString("en-IN")}
          </span>
        ),
        className: "text-right font-medium text-slate-900 dark:text-[#f1f5f9] whitespace-nowrap",
        headerClassName: "text-right",
      }
    );

    return cols;
  }, [hasBulk, selected]);

  return (
    <div>
      {/* Filter row */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex gap-1.5">
          <button
            onClick={() => onFilterChange("all")}
            className={`rounded-md px-3.5 py-2 text-sm font-semibold transition-all ${
              filterType === "all"
                ? "bg-brand-500 text-white shadow-sm ring-2 ring-brand-500/20"
                : "bg-slate-100 dark:bg-[#282832] text-slate-600 dark:text-[#94a3b8] hover:bg-slate-200 dark:hover:bg-[#333340] hover:text-slate-800 dark:hover:text-[#f1f5f9]"
            }`}
          >
            All
          </button>
          {VOUCHER_TYPES.map((t) => {
            const c = getVoucherColor(t.id);
            return (
              <button
                key={t.id}
                onClick={() => onFilterChange(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition-all ${
                  filterType === t.id
                    ? `${c.tabActive} ring-2 ring-blue-500/20`
                    : `bg-slate-100 dark:bg-[#282832] text-slate-600 dark:text-[#94a3b8] ${c.tab}`
                }`}
              >
                <span className="text-base leading-none">{t.icon}</span>
                {t.shortLabel}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {hasBulk && selected.size > 0 && (
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
              <button
                onClick={clearSelection}
                className="rounded border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors"
              >
                Clear
              </button>
            </>
          )}
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Search by voucher #, date, party, ledger, narration, or amount..."
            className="rounded border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20 w-52"
          />
        </div>
      </div>

      {/* Voucher table */}
      {loading ? (
        <VouchersSkeleton />
      ) : (
        <>
          <SortableTable
            data={filtered}
            columns={columns}
            tableKey="vouchers"
            initialSorting={[{ id: "voucher_date", desc: true }]}
            onRowClick={(v) => onClick(v.id)}
            rowClassName={(v) => selected.has(v.id) ? "bg-brand-50 dark:bg-brand-500/10" : ""}
            emptyMessage={search ? "No vouchers match your search." : "No vouchers yet."}
          />
          {/* Pagination controls */}
          {hasPagination && (
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-[#94a3b8]">
              <div className="flex items-center gap-2">
                <span>Showing</span>
                <select
                  value={pageSize}
                  onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
                  className="rounded border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#16161f] px-1.5 py-0.5 text-xs"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
                <span>of {total.toLocaleString()} vouchers</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onPageChange(1)}
                  disabled={page === 1}
                  className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-[#282832] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ««
                </button>
                <button
                  onClick={() => onPageChange(page - 1)}
                  disabled={page === 1}
                  className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-[#282832] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  «
                </button>
                <span className="px-2 py-1 font-medium text-slate-900 dark:text-[#f1f5f9]">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => onPageChange(page + 1)}
                  disabled={page >= totalPages}
                  className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-[#282832] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  »
                </button>
                <button
                  onClick={() => onPageChange(totalPages)}
                  disabled={page >= totalPages}
                  className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-[#282832] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  »»
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
