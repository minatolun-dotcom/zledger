import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";

// ── Sort icon component ────────────────────────────────────────────────
function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
  if (!direction) {
    return (
      <svg className="h-3.5 w-3.5 text-slate-300 dark:text-[#475569]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
      </svg>
    );
  }
  return (
    <svg className={`h-3.5 w-3.5 ${direction === "asc" ? "text-brand-600 dark:text-blue-400" : "text-brand-600 dark:text-blue-400"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      {direction === "asc" ? <path d="M7 14l5-5 5 5" /> : <path d="M7 10l5 5 5-5" />}
    </svg>
  );
}

// ── Main SortableTable component ───────────────────────────────────────
export interface SortableColumn<T> {
  id: string;
  header: string;
  accessorKey?: keyof T;
  accessorFn?: (row: T) => any;
  cell?: (info: { getValue: () => any; row: { original: T } }) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
  minSize?: number;
  maxSize?: number;
  size?: number;
}

interface SortableTableProps<T> {
  data: T[];
  columns: SortableColumn<T>[];
  className?: string;
  tableKey?: string;
  initialSorting?: SortingState;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  emptyMessage?: string;
  enableColumnResizing?: boolean;
  selectable?: boolean;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: (ids: string[]) => void;
}

export default function SortableTable<T>({
  data,
  columns: columnDefs,
  className = "",
  tableKey,
  initialSorting = [],
  onRowClick,
  rowClassName,
  emptyMessage = "No data",
  enableColumnResizing = false,
  selectable = false,
  selected = new Set(),
  onToggleSelect,
  onToggleAll,
}: SortableTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const resizingRef = useRef<{ id: string; startX: number; startSize: number } | null>(null);

  const storageKey = tableKey ? `sortable-col-sizes-${tableKey}` : null;

  const [columnSizing, setColumnSizing] = useState<Record<string, number>>(() => {
    if (!storageKey) return {};
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(columnSizing));
  }, [columnSizing, storageKey]);

  const columns = useMemo<ColumnDef<T, any>[]>(
    () => {
      const base: ColumnDef<T, any>[] = [];
      if (selectable && onToggleSelect) {
        base.push({
          id: "_select",
          header: (info: any) => {
            if (!onToggleAll) return null;
            const rows = info.table.getRowModel().rows;
            const allIds = rows.map((r: any) => {
              const orig = r.original as any;
              return orig.id ?? orig.user_id;
            });
            const allSelected = allIds.length > 0 && allIds.every((id: string) => selected.has(id));
            return (
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onToggleAll(allSelected ? [] : allIds)}
                className="h-4 w-4 rounded border-slate-300 dark:border-[#282832] text-brand-600 focus:ring-brand-500 dark:bg-[#282832]"
              />
            );
          },
          size: 40,
          minSize: 40,
          maxSize: 40,
          enableSorting: false,
          cell: (info: any) => {
            const row = info.row.original as any;
            const rowId = row.id ?? row.user_id;
            return (
              <input
                type="checkbox"
                checked={selected.has(rowId)}
                onChange={(e) => { e.stopPropagation(); onToggleSelect(rowId); }}
                onClick={(e) => e.stopPropagation()}
                className="h-4 w-4 rounded border-slate-300 dark:border-[#282832] text-brand-600 focus:ring-brand-500 dark:bg-[#282832]"
              />
            );
          },
        });
      }
      base.push(...columnDefs.map((col) => ({
        id: col.id,
        accessorKey: col.accessorKey as string,
        accessorFn: col.accessorFn,
        header: () => col.header,
        cell: col.cell
          ? (info: any) => col.cell!({ getValue: info.getValue, row: info.row as any })
          : (info: any) => {
              const val = info.getValue();
              return val != null ? String(val) : "—";
            },
        enableSorting: col.sortable !== false,
        size: col.size,
        minSize: col.minSize ?? 60,
        maxSize: col.maxSize ?? 500,
        meta: { className: col.className, headerClassName: col.headerClassName },
      })));
      return base;
    },
    [columnDefs, selectable, selected, onToggleSelect, onToggleAll]
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, ...(enableColumnResizing ? { columnSizing } : {}) },
    onSortingChange: setSorting,
    ...(enableColumnResizing ? { onColumnSizingChange: setColumnSizing } : {}),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing,
    columnResizeMode: enableColumnResizing ? "onChange" : undefined,
  });

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, columnId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const col = table.getColumn(columnId);
      if (!col) return;
      resizingRef.current = { id: columnId, startX: e.clientX, startSize: col.getSize() };

      const onMouseMove = (ev: MouseEvent) => {
        if (!resizingRef.current) return;
        const delta = ev.clientX - resizingRef.current.startX;
        const newSize = Math.max(60, resizingRef.current.startSize + delta);
        setColumnSizing((prev) => ({ ...prev, [resizingRef.current!.id]: newSize }));
      };

      const onMouseUp = () => {
        resizingRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [table]
  );

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;

  return (
    <div className={`rounded-lg border border-slate-200 bg-white shadow-sm dark:border-[#1a1a24] dark:bg-[#12121a] ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            {headerGroups.map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-[#181822] dark:to-[#1c1c28] text-left text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-[#cbd5e1] border-b-2 border-slate-200 dark:border-[#282832]"
              >
                {headerGroup.headers.map((header) => {
                  const col = columnDefs.find((c) => c.id === header.id);
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  const isResizing = header.column.getIsResizing();

                  return (
                    <th
                      key={header.id}
                      className={`relative px-3 py-2.5 border-r border-slate-200 dark:border-[#1a1a24] last:border-r-0 ${
                        canSort ? "cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-[#282832] transition-colors" : ""
                      } ${col?.headerClassName ?? ""}`}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                        {canSort && <SortIcon direction={sortDir} />}
                      </div>
                      {enableColumnResizing && header.column.getCanResize() && (
                        <div
                          onMouseDown={(e) => handleResizeStart(e, header.id)}
                          onTouchStart={(e) => {
                            const touch = e.touches[0];
                            handleResizeStart({ clientX: touch.clientX, preventDefault: () => e.preventDefault(), stopPropagation: () => e.stopPropagation() } as any, header.id);
                          }}
                          className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none ${
                            isResizing
                              ? "bg-brand-500 dark:bg-blue-500"
                              : "bg-slate-200 dark:bg-[#333340] hover:bg-brand-400 dark:hover:bg-blue-400"
                          }`}
                          style={{ zIndex: 10 }}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-slate-400 dark:text-[#64748b]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={`border-t border-slate-100 dark:border-[#1a1a24] hover:bg-slate-50/80 dark:hover:bg-[#1a1a24]/80 transition-colors ${
                    onRowClick ? "cursor-pointer" : ""
                  } ${rowClassName?.(row.original) ?? ""}`}
                >
                  {row.getVisibleCells().map((cell) => {
                    const col = columnDefs.find((c) => c.id === cell.column.id);
                    return (
                      <td
                        key={cell.id}
                        className={`px-3 py-2.5 border-r border-slate-100 dark:border-[#1a1a24]/50 last:border-r-0 overflow-hidden ${col?.className ?? ""}`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
