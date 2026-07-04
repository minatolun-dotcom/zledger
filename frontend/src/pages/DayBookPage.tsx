import { useEffect, useState, useCallback, useMemo } from "react";

import { api } from "../api/client";
import { toDisplayDate } from "../utils/dateUtils";
import DateInput from "../components/DateInput";
import SortableTable from "../components/SortableTable";
import type { SortableColumn } from "../components/SortableTable";
import type { Voucher, Ledger, Party, StockItem } from "./vouchers/types";
import ItemVoucherForm from "./vouchers/forms/ItemVoucherForm";
import AmountVoucherForm from "./vouchers/forms/AmountVoucherForm";
import JournalForm from "./vouchers/forms/JournalForm";
import { showConfirm } from "../components/ConfirmDialog";
import PdfPreviewModal from "../components/PdfPreviewModal";
import { ListSkeleton } from "./skeletons";

// ── Types ──────────────────────────────────────────────────────────────────

interface DayBookEntry {
  id: string;
  voucher_date: string;
  voucher_number: string;
  voucher_type: string;
  party_name: string | null;
  narration: string | null;
  debit: number;
  credit: number;
  status: string;
  created_by_name: string | null;
}

interface DayBookGroup {
  date: string;
  entries: DayBookEntry[];
  day_total_debit: number;
  day_total_credit: number;
}

interface DayBookSummary {
  total_vouchers: number;
  total_debit: number;
  total_credit: number;
  is_balanced: boolean;
}

interface DayBookResponse {
  entries: DayBookEntry[];
  groups: DayBookGroup[] | null;
  summary: DayBookSummary;
  total: number;
  page: number;
  page_size: number;
}

interface FilterOption {
  id: string;
  name: string;
}

interface FilterOptions {
  parties: FilterOption[];
  ledgers: FilterOption[];
  users: FilterOption[];
  voucher_types: { id: string; label: string }[];
  statuses: { id: string; label: string }[];
}

const VOUCHER_TYPE_COLORS: Record<string, string> = {
  Sales: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  Purchase: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  Payment: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  Receipt: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  Contra: "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400",
  Journal: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400",
  "Credit Note": "bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400",
  "Debit Note": "bg-pink-50 text-pink-700 dark:bg-pink-500/10 dark:text-pink-400",
};



const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function downloadFile(path: string, filename: string) {
  const blob = await api.download(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Summary Cards ──────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: DayBookSummary }) {
  const balanced = Math.abs(summary.total_debit - summary.total_credit) < 0.01;
  return (
    <div className="grid grid-cols-4 gap-4">
      <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#94a3b8]">Total Vouchers</p>
        <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-[#f1f5f9] tabular-nums">{summary.total_vouchers}</p>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#94a3b8]">Total Debit</p>
        <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-400 tabular-nums">₹{fmt(summary.total_debit)}</p>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#94a3b8]">Total Credit</p>
        <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">₹{fmt(summary.total_credit)}</p>
      </div>
      <div className={`rounded-lg border p-4 shadow-sm ${
        balanced ? "border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-500/10" : "border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-500/10"
      }`}>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#94a3b8]">Balance Check</p>
        <p className={`mt-1 text-lg font-bold tabular-nums ${
          balanced ? "text-emerald-800 dark:text-emerald-300" : "text-red-800 dark:text-red-300"
        }`}>
          {balanced ? "✓ Balanced" : `⚠ Diff: ₹${fmt(Math.abs(summary.total_debit - summary.total_credit))}`}
        </p>
      </div>
    </div>
  );
}

// ── Filter Bar ─────────────────────────────────────────────────────────────

function FilterBar({
  filters,
  filterOptions,
  onFilterChange,
  onSearch,
  onExport,
}: {
  filters: Record<string, string>;
  filterOptions: FilterOptions | null;
  onFilterChange: (key: string, value: string) => void;
  onSearch: (value: string) => void;
  onExport: (format: string) => void;
}) {
  const [searchInput, setSearchInput] = useState("");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500 dark:text-[#94a3b8]">From</label>
          <DateInput
            value={filters.start_date || ""}
            onChange={(v) => onFilterChange("start_date", v)}
            className="rounded-lg border border-slate-300 dark:border-[#252530] px-2.5 py-1.5 text-xs focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500 dark:text-[#94a3b8]">To</label>
          <DateInput
            value={filters.end_date || ""}
            onChange={(v) => onFilterChange("end_date", v)}
            className="rounded-lg border border-slate-300 dark:border-[#252530] px-2.5 py-1.5 text-xs focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20"
          />
        </div>

        <select
          value={filters.voucher_type || ""}
          onChange={(e) => onFilterChange("voucher_type", e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-[#252530] px-2.5 py-1.5 text-xs focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20"
        >
          <option value="">All Types</option>
          {filterOptions?.voucher_types.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>

        <select
          value={filters.party_id || ""}
          onChange={(e) => onFilterChange("party_id", e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-[#252530] px-2.5 py-1.5 text-xs focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20"
        >
          <option value="">All Parties</option>
          {filterOptions?.parties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select
          value={filters.ledger_id || ""}
          onChange={(e) => onFilterChange("ledger_id", e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-[#252530] px-2.5 py-1.5 text-xs focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20"
        >
          <option value="">All Ledgers</option>
          {filterOptions?.ledgers.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>

        <select
          value={filters.created_by || ""}
          onChange={(e) => onFilterChange("created_by", e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-[#252530] px-2.5 py-1.5 text-xs focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20"
        >
          <option value="">All Users</option>
          {filterOptions?.users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSearch(searchInput); }}
              placeholder="Search voucher #, party, narration..."
              className="w-72 rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-xs focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20"
              aria-label="Search vouchers"
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(""); onSearch(""); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#e2e8f0]"
                aria-label="Clear search"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={() => onSearch(searchInput)}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            Search
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-[#94a3b8]">Export:</span>
          <button
            onClick={() => onExport("csv")}
            className="rounded-lg border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
          >
            CSV
          </button>
          <button
            onClick={() => onExport("xlsx")}
            className="rounded-lg border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
          >
            Excel
          </button>
          <button
            onClick={() => onExport("pdf")}
            className="rounded-lg border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
          >
            PDF
          </button>
          <button
            onClick={() => onExport("print")}
            className="rounded-lg border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Day Book Table ─────────────────────────────────────────────────────────

function DayBookTable({
  entries,
  groups,
  groupByDate,
  loading,
  onRowClick,
  onToggleGroup,
}: {
  entries: DayBookEntry[];
  groups: DayBookGroup[] | null;
  groupByDate: boolean;
  loading: boolean;
  onRowClick: (id: string) => void;
  onToggleGroup: () => void;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-[#1e1e28] p-12 text-center">
        <ListSkeleton title="Day Book" cols={5} />
      </div>
    );
  }

  if ((!groups || groups.length === 0) && entries.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-[#1e1e28] p-12 text-center">
        <svg className="mx-auto h-10 w-10 text-slate-300 dark:text-[#475569]" fill="none" viewBox="0 0 24 24" strokeWidth="1" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
        </svg>
        <p className="mt-3 text-sm font-medium text-slate-500 dark:text-[#94a3b8]">No entries found</p>
        <p className="mt-1 text-xs text-slate-400 dark:text-[#64748b]">Try adjusting your filters or date range.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleGroup}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              !groupByDate
                ? "bg-brand-600 text-white"
                : "border border-slate-300 dark:border-[#252530] text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
            }`}
          >
            Flat View
          </button>
          <button
            onClick={onToggleGroup}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              groupByDate
                ? "bg-brand-600 text-white"
                : "border border-slate-300 dark:border-[#252530] text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
            }`}
          >
            Grouped by Date
          </button>
        </div>
      </div>

      {groupByDate && groups ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1e1e28]">
          <table className="w-full text-sm" role="table" aria-label="Day Book entries">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1e1e28] bg-slate-50 dark:bg-[#18181f]/80 text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-[#18181f]/80 px-3 py-2.5">Date</th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-[#18181f]/80 px-3 py-2.5">Voucher #</th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-[#18181f]/80 px-3 py-2.5">Type</th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-[#18181f]/80 px-3 py-2.5">Party</th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-[#18181f]/80 px-3 py-2.5">Narration</th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-[#18181f]/80 px-3 py-2.5 text-right">Debit</th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-[#18181f]/80 px-3 py-2.5 text-right">Credit</th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-[#18181f]/80 px-3 py-2.5">Created By</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <DateGroup key={g.date} group={g} onRowClick={onRowClick} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <DayBookSortableTable entries={entries} onRowClick={onRowClick} />
      )}
    </div>
  );
}

function DateGroup({
  group,
  onRowClick,
}: {
  group: DayBookGroup;
  onRowClick: (id: string) => void;
}) {
  return (
    <>
      <tr className="bg-slate-100/80 dark:bg-[#1e1e28]">
        <td colSpan={9} className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-[#cbd5e1]">
          {toDisplayDate(group.date)}
          <span className="ml-2 font-normal text-slate-400 dark:text-[#64748b]">
            — {group.entries.length} voucher{group.entries.length !== 1 ? "s" : ""}
            , Dr: ₹{fmt(group.day_total_debit)} | Cr: ₹{fmt(group.day_total_credit)}
          </span>
        </td>
      </tr>
      {group.entries.map((e) => (
        <EntryRow
          key={e.id}
          entry={e}
          onRowClick={onRowClick}
        />
      ))}
    </>
  );
}

function DayBookSortableTable({
  entries,
  onRowClick,
}: {
  entries: DayBookEntry[];
  onRowClick: (id: string) => void;
}) {
  const columns: SortableColumn<DayBookEntry>[] = useMemo(
    () => [
      {
        id: "voucher_date",
        header: "Date",
        accessorKey: "voucher_date",
        size: 110,
        cell: ({ getValue }) => toDisplayDate(getValue()),
        className: "whitespace-nowrap text-slate-600 dark:text-[#94a3b8] tabular-nums",
      },
      {
        id: "voucher_number",
        header: "Voucher #",
        accessorKey: "voucher_number",
        size: 100,
        className: "whitespace-nowrap font-medium text-slate-900 dark:text-[#f1f5f9]",
      },
      {
        id: "voucher_type",
        header: "Type",
        accessorKey: "voucher_type",
        size: 110,
        cell: ({ getValue }) => {
          const type = getValue();
          const color = VOUCHER_TYPE_COLORS[type] || "bg-slate-50 text-slate-700 dark:bg-[#18181f]/80 dark:text-[#cbd5e1]";
          return (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
              {type}
            </span>
          );
        },
      },
      {
        id: "party_name",
        header: "Party",
        accessorKey: "party_name",
        size: 150,
        cell: ({ getValue }) => (
          <span className="max-w-[150px] truncate block">{getValue() || "—"}</span>
        ),
        className: "text-slate-600 dark:text-[#94a3b8]",
      },
      {
        id: "narration",
        header: "Narration",
        accessorKey: "narration",
        size: 200,
        cell: ({ getValue }) => (
          <span className="max-w-[200px] truncate block">{getValue() || "—"}</span>
        ),
        className: "text-slate-500 dark:text-[#94a3b8]",
      },
      {
        id: "debit",
        header: "Debit",
        accessorKey: "debit",
        size: 110,
        cell: ({ getValue }) => {
          const val = getValue();
          return val > 0 ? (
            <span className="text-right block tabular-nums text-red-700 dark:text-red-400">₹{fmt(val)}</span>
          ) : (
            <span className="text-right block">—</span>
          );
        },
        className: "text-right font-medium",
        headerClassName: "text-right",
      },
      {
        id: "credit",
        header: "Credit",
        accessorKey: "credit",
        size: 110,
        cell: ({ getValue }) => {
          const val = getValue();
          return val > 0 ? (
            <span className="text-right block tabular-nums text-emerald-700 dark:text-emerald-400">₹{fmt(val)}</span>
          ) : (
            <span className="text-right block">—</span>
          );
        },
        className: "text-right font-medium",
        headerClassName: "text-right",
      },
      {
        id: "created_by_name",
        header: "Created By",
        accessorKey: "created_by_name",
        size: 120,
        cell: ({ getValue }) => getValue() || "—",
        className: "text-xs text-slate-500 dark:text-[#94a3b8]",
      },
    ],
    []
  );

  return (
    <SortableTable
      data={entries}
      columns={columns}
      tableKey="daybook"
      initialSorting={[{ id: "voucher_date", desc: false }]}
      onRowClick={(entry) => onRowClick(entry.id)}
      emptyMessage="No entries found"
    />
  );
}

function EntryRow({
  entry,
  onRowClick,
}: {
  entry: DayBookEntry;
  onRowClick: (id: string) => void;
}) {
  const typeColor = VOUCHER_TYPE_COLORS[entry.voucher_type] || "bg-slate-50 text-slate-700 dark:bg-[#18181f]/80 dark:text-[#cbd5e1]";

  return (
    <tr className="border-b border-slate-100 dark:border-[#1e1e28]/50 hover:bg-slate-50 dark:hover:bg-[#252530] cursor-pointer" onClick={() => onRowClick(entry.id)}>
      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-[#94a3b8] tabular-nums">
        {toDisplayDate(entry.voucher_date)}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900 dark:text-[#f1f5f9]">
        {entry.voucher_number}
      </td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeColor}`}>
          {entry.voucher_type}
        </span>
      </td>
      <td className="max-w-[150px] truncate px-3 py-2.5 text-slate-600 dark:text-[#94a3b8]">
        {entry.party_name || "—"}
      </td>
      <td className="max-w-[200px] truncate px-3 py-2.5 text-slate-500 dark:text-[#94a3b8]">
        {entry.narration || "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-red-700 dark:text-red-400 tabular-nums">
        {entry.debit > 0 ? `₹${fmt(entry.debit)}` : ""}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
        {entry.credit > 0 ? `₹${fmt(entry.credit)}` : ""}
      </td>
      <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-[#94a3b8]">
        {entry.created_by_name || "—"}
      </td>
    </tr>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────────

function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 flex items-center justify-between">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#94a3b8]">
        <span>Rows per page:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded border border-slate-300 dark:border-[#252530] px-2 py-1 text-xs"
        >
          {[25, 50, 100, 200].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span>{start}–{end} of {total}</span>
      </div>
      <div className="flex items-center gap-1">
        <PageButton disabled={page <= 1} onClick={() => onPageChange(1)} label="<<" />
        <PageButton disabled={page <= 1} onClick={() => onPageChange(page - 1)} label="<" />
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          let p: number;
          if (totalPages <= 7) {
            p = i + 1;
          } else if (page <= 4) {
            p = i + 1;
          } else if (page >= totalPages - 3) {
            p = totalPages - 6 + i;
          } else {
            p = page - 3 + i;
          }
          return (
            <PageButton
              key={p}
              disabled={false}
              onClick={() => onPageChange(p)}
              label={String(p)}
              active={p === page}
            />
          );
        })}
        <PageButton disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} label=">" />
        <PageButton disabled={page >= totalPages} onClick={() => onPageChange(totalPages)} label=">>" />
      </div>
    </div>
  );
}

function PageButton({ disabled, onClick, label, active }: { disabled: boolean; onClick: () => void; label: string; active?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`min-w-[28px] rounded px-2 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-brand-600 text-white"
          : disabled
            ? "text-slate-300 dark:text-[#475569] cursor-not-allowed"
            : "text-slate-600 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#252530]"
      }`}
    >
      {label}
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

const ITEM_TYPES = new Set(["sales", "purchase", "credit_note", "debit_note"]);
const AMOUNT_TYPES = new Set(["payment", "receipt", "contra"]);

export default function DayBookPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<DayBookResponse | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [groupByDate, setGroupByDate] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const sortBy = "voucher_date";
  const sortOrder = "asc";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      params.set("sort_by", sortBy);
      params.set("sort_order", sortOrder);
      params.set("group_by_date", String(groupByDate));

      const res = await api.get<DayBookResponse>(`/reports/daybook?${params.toString()}`);
      setData(res);
    } catch (err: any) {
      setError(err?.detail || "Failed to load day book");
    } finally {
      setLoading(false);
    }
  }, [filters, search, page, pageSize, sortBy, sortOrder, groupByDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    api.get<FilterOptions>("/reports/daybook/filters")
      .then(setFilterOptions)
      .catch(() => {});
    Promise.all([
      api.get<Ledger[]>("/coa/ledgers"),
      api.get<Party[]>("/coa/parties"),
      api.get<StockItem[]>("/inventory/items"),
    ]).then(([l, p, s]) => {
      setLedgers(l);
      setParties(p);
      setStockItems(s);
    }).catch(() => {});
  }, []);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    setPage(1);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleToggleGroup = () => {
    setGroupByDate((prev) => !prev);
    setPage(1);
  };

  const handlePageChange = (p: number) => setPage(p);
  const handlePageSizeChange = (s: number) => {
    setPageSize(s);
    setPage(1);
  };

  const handleRowClick = async (id: string) => {
    try {
      const v = await api.get<Voucher>(`/vouchers/${id}`);
      setSelectedVoucher(v);
      setModalError("");
    } catch {
      setError("Failed to load voucher");
    }
  };

  const handleModalUpdate = async (id: string, payload: any) => {
    setIsSubmitting(true);
    setModalError("");
    try {
      const v = await api.patch<Voucher>(`/vouchers/${id}`, payload);
      setSelectedVoucher(v);
      fetchData();
    } catch (err: any) {
      setModalError(err?.detail || "Failed to update voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalSubmit = async (payload: any) => {
    setIsSubmitting(true);
    setModalError("");
    try {
      await api.post<Voucher>("/vouchers", payload);
      setSelectedVoucher(null);
      fetchData();
    } catch (err: any) {
      setModalError(err?.detail || "Failed to create voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalDuplicate = () => {
    if (!selectedVoucher) return;
    const dup = { ...selectedVoucher, id: undefined as any, voucher_number: "" };
    setSelectedVoucher(dup);
    setModalError("");
  };

  const handleModalDelete = async () => {
    if (!selectedVoucher?.id) return;
    if (!await showConfirm("Delete this voucher?", { danger: true, confirmLabel: "Delete" })) return;
    try {
      await api.del(`/vouchers/${selectedVoucher.id}`);
      setSelectedVoucher(null);
      fetchData();
    } catch (err: any) {
      setModalError(err?.detail || "Failed to delete voucher");
    }
  };

  const handleModalClose = () => {
    setSelectedVoucher(null);
    setModalError("");
  };

  useEffect(() => {
    if (!selectedVoucher) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleModalClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [selectedVoucher]);

  const handleExport = async (format: string) => {
    if (format === "print") {
      window.print();
      return;
    }
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    if (search) params.set("search", search);
    const ext = format === "xlsx" ? "xlsx" : format;
    try {
      await downloadFile(`/reports/daybook/${ext}?${params.toString()}`, `daybook.${ext}`);
    } catch (err: any) {
      setError(err?.detail || `Failed to export ${format}`);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Day Book</h2>
        <span className="text-xs text-slate-400 dark:text-[#64748b]">Chronological record of all transactions</span>
      </div>

      {/* Summary Cards */}
      {data && !loading && (
        <div className="mt-4">
          <SummaryCards summary={data.summary} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400" role="alert">
          {error}
          <button onClick={() => setError("")} className="ml-2 font-medium underline">Dismiss</button>
        </div>
      )}

      {/* Filters */}
      <div className="mt-4 rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
        <FilterBar
          filters={filters}
          filterOptions={filterOptions}
          onFilterChange={handleFilterChange}
          onSearch={handleSearch}
          onExport={handleExport}
        />
      </div>

      {/* Table */}
      <div className="mt-4">
        <DayBookTable
          entries={data?.entries || []}
          groups={data?.groups || null}
          groupByDate={groupByDate}
          loading={loading}
          onRowClick={handleRowClick}
          onToggleGroup={handleToggleGroup}
        />
      </div>

      {/* Pagination */}
      {data && !loading && (
        <Pagination
          page={data.page}
          pageSize={data.page_size}
          total={data.total}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}

      {/* Voucher Modal */}
      {selectedVoucher && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 pt-10 pb-10" onClick={(e) => { if (e.target === e.currentTarget) handleModalClose(); }}>
          <div className="relative w-full max-w-4xl rounded-xl bg-white dark:bg-[#18181f] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">
                {selectedVoucher.id
                  ? (selectedVoucher.voucher_type.charAt(0).toUpperCase() + selectedVoucher.voucher_type.slice(1).replace(/_/, " "))
                    + ' — ' + selectedVoucher.voucher_number
                  : 'Duplicate ' + (selectedVoucher.voucher_type.charAt(0).toUpperCase() + selectedVoucher.voucher_type.slice(1).replace(/_/, " "))
                }
              </h3>
              <div className="flex items-center gap-2">
                {selectedVoucher.id ? (
                  <>
                    <button onClick={handleModalDuplicate} className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Duplicate</button>
                    <button onClick={handleModalDelete} className="rounded border border-red-200 dark:border-red-700 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">Delete</button>
                  </>
                ) : (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Pre-filled from original — edit and save as new</span>
                )}
                <button onClick={handleModalClose} className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Close</button>
                {selectedVoucher.id && (
                  <>
                    <button onClick={() => { setPreviewUrl(`/vouchers/${selectedVoucher.id}/pdf`); setPreviewTitle(`${selectedVoucher.voucher_type} ${selectedVoucher.voucher_number}`); }} className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Preview PDF</button>
                    <button onClick={() => { const blob = api.download(`/vouchers/${selectedVoucher.id}/pdf`); blob.then(b => { const url = URL.createObjectURL(b); const a = document.createElement("a"); a.href = url; a.download = `${selectedVoucher.voucher_type}-${selectedVoucher.voucher_number}.pdf`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }); }} className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Print PDF</button>
                  </>
                )}
              </div>
            </div>

            {/* Form */}
            <div className="p-5">
              {(() => {
                const sharedProps = {
                  ledgers,
                  parties,
                  stockItems,
                  onSubmit: handleModalSubmit,
                  isSubmitting,
                  error: modalError,
                  setError: setModalError,
                  editingVoucher: selectedVoucher,
                  onUpdate: selectedVoucher?.id ? handleModalUpdate : undefined,
                };
                const vt = selectedVoucher.voucher_type;
                if (ITEM_TYPES.has(vt)) {
                  return <ItemVoucherForm key={selectedVoucher.id || "new"} voucherType={vt} {...sharedProps} />;
                }
                if (AMOUNT_TYPES.has(vt)) {
                  return <AmountVoucherForm key={selectedVoucher.id || "new"} voucherType={vt} {...sharedProps} />;
                }
                return <JournalForm key={selectedVoucher.id || "new"} {...sharedProps} />;
              })()}
            </div>
          </div>
        </div>
      )}

      {previewUrl && (
        <PdfPreviewModal
          url={previewUrl}
          title={previewTitle}
          onClose={() => { setPreviewUrl(null); setPreviewTitle(""); }}
        />
      )}
    </div>
  );
}
