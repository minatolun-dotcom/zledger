import { useEffect, useState, useCallback, useMemo } from "react";

import { api } from "../api/client";
import PageHeader from "../components/PageHeader";
import { useToastStore } from "../store/toast";
import { toDisplayDate } from "../utils/dateUtils";
import DateInput from "../components/DateInput";
import SortableTable from "../components/SortableTable";
import type { SortableColumn } from "../components/SortableTable";
import type { Voucher } from "./vouchers/types";
import { showConfirm } from "../components/ConfirmDialog";
import { useRole } from "../hooks/useRole";
import { ListSkeleton } from "./skeletons";
import { useMasterData } from "../hooks/useMasterData";
import VoucherModal from "../components/VoucherModal";
import Pagination from "../components/Pagination";
import Select from "../components/Select";

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
  Contra: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">Total Vouchers</p>
        <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-[#f1f5f9] tabular-nums">{summary.total_vouchers}</p>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">Total Debit</p>
        <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-400 tabular-nums">₹{fmt(summary.total_debit)}</p>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">Total Credit</p>
        <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">₹{fmt(summary.total_credit)}</p>
      </div>
      <div className={`rounded-lg border p-4 shadow-sm ${
        balanced ? "border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-500/10" : "border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-500/10"
      }`}>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">Balance Check</p>
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
  selectedCount,
  onBulkCancel,
  onBulkDelete,
  onClearSelection,
  canEdit,
}: {
  filters: Record<string, string>;
  filterOptions: FilterOptions | null;
  onFilterChange: (key: string, value: string) => void;
  onSearch: (value: string) => void;
  onExport: (format: string) => void;
  selectedCount: number;
  onBulkCancel: () => void;
  onBulkDelete: () => void;
  onClearSelection: () => void;
  canEdit: boolean;
}) {
  const [searchInput, setSearchInput] = useState("");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">From</label>
          <DateInput
            value={filters.start_date || ""}
            onChange={(v) => onFilterChange("start_date", v)}
            className="rounded-lg border border-slate-300 dark:border-[#282832] dark:bg-[#16161f] dark:text-[#f1f5f9] px-2.5 py-1.5 text-xs focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">To</label>
          <DateInput
            value={filters.end_date || ""}
            onChange={(v) => onFilterChange("end_date", v)}
            className="rounded-lg border border-slate-300 dark:border-[#282832] dark:bg-[#16161f] dark:text-[#f1f5f9] px-2.5 py-1.5 text-xs focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20"
          />
        </div>

        <Select
          value={filters.voucher_type || ""}
          onChange={(v) => onFilterChange("voucher_type", v)}
          placeholder="All Types"
          options={(filterOptions?.voucher_types || []).map((t) => ({ value: t.id, label: t.label }))}
        />

        <Select
          value={filters.party_id || ""}
          onChange={(v) => onFilterChange("party_id", v)}
          placeholder="All Parties"
          options={(filterOptions?.parties || []).map((p) => ({ value: p.id, label: p.name }))}
        />

        <Select
          value={filters.ledger_id || ""}
          onChange={(v) => onFilterChange("ledger_id", v)}
          placeholder="All Ledgers"
          options={(filterOptions?.ledgers || []).map((l) => ({ value: l.id, label: l.name }))}
        />

        <Select
          value={filters.created_by || ""}
          onChange={(v) => onFilterChange("created_by", v)}
          placeholder="All Users"
          options={(filterOptions?.users || []).map((u) => ({ value: u.id, label: u.name }))}
        />
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
              className="w-72 rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-xs focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20"
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
          {canEdit && selectedCount > 0 && (
            <>
              <button onClick={onBulkCancel}
                className="rounded border border-amber-300 dark:border-amber-500/30 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors">
                Cancel ({selectedCount})
              </button>
              <button onClick={onBulkDelete}
                className="rounded border border-red-300 dark:border-red-500/30 px-2.5 py-1 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                Delete ({selectedCount})
              </button>
              <button onClick={onClearSelection}
                className="rounded border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors">
                Clear
              </button>
            </>
          )}
          <span className="text-xs text-slate-500 dark:text-[#cbd5e1]">Export:</span>
          <button
            onClick={() => onExport("csv")}
            className="rounded-lg border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
          >
            CSV
          </button>
          <button
            onClick={() => onExport("xlsx")}
            className="rounded-lg border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
          >
            Excel
          </button>
          <button
            onClick={() => onExport("pdf")}
            className="rounded-lg border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
          >
            PDF
          </button>
          <button
            onClick={() => onExport("print")}
            className="rounded-lg border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
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
  selected,
  onToggleSelect,
  canEdit,
}: {
  entries: DayBookEntry[];
  groups: DayBookGroup[] | null;
  groupByDate: boolean;
  loading: boolean;
  onRowClick: (id: string) => void;
  onToggleGroup: () => void;
  selected: Set<string>;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  canEdit: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] p-12 text-center">
        <ListSkeleton title="Day Book" cols={5} />
      </div>
    );
  }

  if ((!groups || groups.length === 0) && entries.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] p-12 text-center">
        <svg className="mx-auto h-10 w-10 text-slate-300 dark:text-[#475569]" fill="none" viewBox="0 0 24 24" strokeWidth="1" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
        </svg>
        <p className="mt-3 text-sm font-medium text-slate-500 dark:text-[#cbd5e1]">No entries found</p>
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
                : "border border-slate-300 dark:border-[#282832] text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
            }`}
          >
            Flat View
          </button>
          <button
            onClick={onToggleGroup}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              groupByDate
                ? "bg-brand-600 text-white"
                : "border border-slate-300 dark:border-[#282832] text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
            }`}
          >
            Grouped by Date
          </button>
        </div>
      </div>

      {groupByDate && groups ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24]">
          <table className="w-full text-sm" role="table" aria-label="Day Book entries">
            <thead>
              <tr className="border-b-2 border-slate-300 dark:border-[#282832] bg-slate-50 dark:bg-[#16161f]/80 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">
                {canEdit && <th className="sticky top-0 z-10 bg-slate-50 dark:bg-[#16161f]/80 px-3 py-2.5 w-10"></th>}
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-[#16161f]/80 px-3 py-2.5">Date</th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-[#16161f]/80 px-3 py-2.5">Voucher #</th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-[#16161f]/80 px-3 py-2.5">Type</th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-[#16161f]/80 px-3 py-2.5">Party</th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-[#16161f]/80 px-3 py-2.5">Narration</th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-[#16161f]/80 px-3 py-2.5 text-right">Debit</th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-[#16161f]/80 px-3 py-2.5 text-right">Credit</th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-[#16161f]/80 px-3 py-2.5">Created By</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <DateGroup key={g.date} group={g} onRowClick={onRowClick} selected={selected} onToggleSelect={onToggleSelect} canEdit={canEdit} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <DayBookSortableTable
          entries={entries}
          onRowClick={onRowClick}
          selected={selected}
          onToggleSelect={onToggleSelect}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}

function DateGroup({
  group,
  onRowClick,
  selected,
  onToggleSelect,
  canEdit,
}: {
  group: DayBookGroup;
  onRowClick: (id: string) => void;
  selected: Set<string>;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  canEdit: boolean;
}) {
  return (
    <>
      <tr className="bg-slate-100/80 dark:bg-[#282832]">
        <td colSpan={canEdit ? 10 : 9} className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-[#cbd5e1]">
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
          selected={selected}
          onToggleSelect={onToggleSelect}
          canEdit={canEdit}
        />
      ))}
    </>
  );
}

function DayBookSortableTable({
  entries,
  onRowClick,
  selected,
  onToggleSelect,
  canEdit,
}: {
  entries: DayBookEntry[];
  onRowClick: (id: string) => void;
  selected: Set<string>;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  canEdit: boolean;
}) {
  const columns: SortableColumn<DayBookEntry>[] = useMemo(() => {
    const cols: SortableColumn<DayBookEntry>[] = [];

    if (canEdit) {
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
            onClick={(e) => onToggleSelect(row.original.id, e as React.MouseEvent)}
            className="rounded border-slate-300 dark:border-[#282832] text-brand-500 focus:ring-brand-500 dark:focus:ring-blue-500/20"
          />
        ),
        headerClassName: "text-center",
      });
    }

    cols.push(
      {
        id: "voucher_date",
        header: "Date",
        accessorKey: "voucher_date",
        size: 110,
        cell: ({ getValue }) => toDisplayDate(getValue()),
        className: "whitespace-nowrap text-slate-600 dark:text-[#cbd5e1] tabular-nums",
      },
      {
        id: "voucher_number",
        header: "Voucher No.",
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
          const color = VOUCHER_TYPE_COLORS[type] || "bg-slate-50 text-slate-700 dark:bg-[#16161f]/80 dark:text-[#cbd5e1]";
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
        className: "text-slate-600 dark:text-[#cbd5e1]",
      },
      {
        id: "narration",
        header: "Narration",
        accessorKey: "narration",
        size: 200,
        cell: ({ getValue }) => (
          <span className="max-w-[200px] truncate block">{getValue() || "—"}</span>
        ),
        className: "text-slate-500 dark:text-[#cbd5e1]",
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
        className: "text-xs text-slate-500 dark:text-[#cbd5e1]",
      },
    );

    return cols;
  }, [canEdit, selected]);

  return (
    <SortableTable
      data={entries}
      columns={columns}
      tableKey="daybook"
      initialSorting={[{ id: "voucher_date", desc: false }]}
      onRowClick={(entry) => onRowClick(entry.id)}
      rowClassName={(entry) => selected.has(entry.id) ? "bg-brand-50 dark:bg-brand-500/10" : ""}
      emptyMessage="No entries found"
      ariaLabel="Day Book entries"
    />
  );
}

function EntryRow({
  entry,
  onRowClick,
  selected,
  onToggleSelect,
  canEdit,
}: {
  entry: DayBookEntry;
  onRowClick: (id: string) => void;
  selected: Set<string>;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  canEdit: boolean;
}) {
  const typeColor = VOUCHER_TYPE_COLORS[entry.voucher_type] || "bg-slate-50 text-slate-700 dark:bg-[#16161f]/80 dark:text-[#cbd5e1]";

  return (
    <tr
      className={`border-b border-slate-100 dark:border-[#1a1a24]/50 hover:bg-slate-50 dark:hover:bg-[#282832] cursor-pointer ${selected.has(entry.id) ? "bg-brand-50 dark:bg-brand-500/10" : ""}`}
      onClick={() => onRowClick(entry.id)}
    >
      {canEdit && (
        <td className="px-3 py-2.5 w-10">
          <input
            type="checkbox"
            checked={selected.has(entry.id)}
            onChange={() => {}}
            onClick={(e) => onToggleSelect(entry.id, e)}
            className="rounded border-slate-300 dark:border-[#282832] text-brand-500 focus:ring-brand-500 dark:focus:ring-blue-500/20"
          />
        </td>
      )}
      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-[#cbd5e1] tabular-nums">
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
      <td className="max-w-[150px] truncate px-3 py-2.5 text-slate-600 dark:text-[#cbd5e1]">
        {entry.party_name || "—"}
      </td>
      <td className="max-w-[200px] truncate px-3 py-2.5 text-slate-500 dark:text-[#cbd5e1]">
        {entry.narration || "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-red-700 dark:text-red-400 tabular-nums">
        {entry.debit > 0 ? `₹${fmt(entry.debit)}` : ""}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
        {entry.credit > 0 ? `₹${fmt(entry.credit)}` : ""}
      </td>
      <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-[#cbd5e1]">
        {entry.created_by_name || "—"}
      </td>
    </tr>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function DayBookPage() {
  const { canEdit } = useRole();
  const toast = useToastStore();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DayBookResponse | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");

  const { ledgers, parties, stockItems, accountGroups } = useMasterData();

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [groupByDate, setGroupByDate] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const sortBy = "voucher_date";
  const sortOrder = "asc";

  const fetchData = useCallback(async () => {
    setLoading(true);
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
      toast.error(err?.message || "Failed to load day book");
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

  const handleBulkCancel = async () => {
    if (selected.size === 0) return;
    if (!await showConfirm(`Cancel ${selected.size} voucher(s)?`, { danger: true, confirmLabel: "Cancel Vouchers" })) return;
    const ids = Array.from(selected);
    clearSelection();
    try {
      const result = await api.post<{ processed: number; errors: string[] }>("/vouchers/bulk-cancel", { voucher_ids: ids, reason: "Bulk cancellation from Day Book" });
      if (result.errors?.length) toast.error(`Completed with errors: ${result.errors.join(", ")}`);
      await fetchData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel vouchers");
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!await showConfirm(`Delete ${selected.size} voucher(s)? This cannot be undone.`, { danger: true, confirmLabel: "Delete Vouchers" })) return;
    const ids = Array.from(selected);
    clearSelection();
    try {
      const result = await api.post<{ processed: number; errors: string[] }>("/vouchers/bulk-delete", { voucher_ids: ids });
      if (result.errors?.length) toast.error(`Completed with errors: ${result.errors.join(", ")}`);
      await fetchData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete vouchers");
    }
  };

  const handleRowClick = async (id: string) => {
    try {
      const v = await api.get<Voucher>(`/vouchers/${id}`);
      setSelectedVoucher(v);
    } catch {
      toast.error("Failed to load voucher");
    }
  };

  const handleModalUpdate = async (id: string, payload: any) => {
    setIsSubmitting(true);
    try {
      const v = await api.patch<Voucher>(`/vouchers/${id}`, payload);
      setSelectedVoucher(v);
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalSubmit = async (payload: any) => {
    setIsSubmitting(true);
    try {
      await api.post<Voucher>("/vouchers", payload);
      setSelectedVoucher(null);
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalDuplicate = () => {
    if (!selectedVoucher) return;
    const dup = { ...selectedVoucher, id: undefined as any, voucher_number: "" };
    setSelectedVoucher(dup);
  };

  const handleModalDelete = async () => {
    if (!selectedVoucher?.id) return;
    if (!await showConfirm("Delete this voucher?", { danger: true, confirmLabel: "Delete" })) return;
    try {
      await api.del(`/vouchers/${selectedVoucher.id}`);
      setSelectedVoucher(null);
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete voucher");
    }
  };

  const handleModalClose = () => {
    setSelectedVoucher(null);
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
      toast.error(err?.message || `Failed to export ${format}`);
    }
  };

  return (
    <div>
      <PageHeader title="Day Book" subtitle="Chronological record of all transactions" />

      {/* Summary Cards */}
      {data && !loading && (
        <div className="mt-4">
          <SummaryCards summary={data.summary} />
        </div>
      )}

      {/* Filters */}
      <div className="mt-4 rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4">
        <FilterBar
          filters={filters}
          filterOptions={filterOptions}
          onFilterChange={handleFilterChange}
          onSearch={handleSearch}
          onExport={handleExport}
          selectedCount={selected.size}
          onBulkCancel={handleBulkCancel}
          onBulkDelete={handleBulkDelete}
          onClearSelection={clearSelection}
          canEdit={canEdit}
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
          selected={selected}
          onToggleSelect={toggleSelect}
          canEdit={canEdit}
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
          itemLabel="entries"
        />
      )}

      {/* Voucher Modal */}
      <VoucherModal
        voucher={selectedVoucher}
        isSubmitting={isSubmitting}
        ledgers={ledgers}
        parties={parties}
        stockItems={stockItems}
        accountGroups={accountGroups}
        onSubmit={handleModalSubmit}
        onUpdate={handleModalUpdate}
        onDuplicate={handleModalDuplicate}
        onDelete={handleModalDelete}
        onClose={handleModalClose}
        showPdfActions
        onPreviewPdf={() => {
          if (selectedVoucher?.id) {
            setPreviewUrl(`/vouchers/${selectedVoucher.id}/pdf`);
            setPreviewTitle(`${selectedVoucher.voucher_type} ${selectedVoucher.voucher_number}`);
          }
        }}
        onPrintPdf={() => {
          if (!selectedVoucher?.id) return;
          const blob = api.download(`/vouchers/${selectedVoucher.id}/pdf`);
          blob.then((b) => {
            const url = URL.createObjectURL(b);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${selectedVoucher.voucher_type}-${selectedVoucher.voucher_number}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          });
        }}
        previewUrl={previewUrl}
        previewTitle={previewTitle}
        onPreviewClose={() => { setPreviewUrl(null); setPreviewTitle(""); }}
      />
    </div>
  );
}
