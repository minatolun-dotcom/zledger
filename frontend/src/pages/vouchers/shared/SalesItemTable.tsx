import { useRef, useCallback, useMemo } from "react";
import type { StockItem, Ledger } from "../types";
import type { HsnSac } from "../../../hooks/useMasterData";
import MasterSelector from "../../../components/master/MasterSelector";

// ── Types ───────────────────────────────────────────────────────────────────

export interface SalesItemLine {
  ledger_id: string;
  stock_item_id: string | null;
  quantity: number | null;
  rate: number | null;
  discount_pct: number;
  discount_amount: number;
  line_total: number;
  gst_rate: number | null;
  hsn_sac_id: string | null;
  is_rate_inclusive: boolean;
}

interface SalesItemTableProps {
  lines: SalesItemLine[];
  onChange: (lines: SalesItemLine[]) => void;
  stockItems: StockItem[];
  ledgers: Ledger[];
  hsnSacList: HsnSac[];
  onQuickCreate?: (entityKey: string, item: unknown) => void;
  createdFrom?: string;
}

// ── Column map ──────────────────────────────────────────────────────────────

const COLUMNS = [
  "item",
  "qty",
  "unit",
  "rate",
  "disc_pct",
  "disc_amt",
  "tax_incl",
  "amount",
] as const;

// Editable columns (zero-indexed): 0 (item), 1 (qty), 3 (rate), 4 (disc_pct),
// 5 (disc_amt), 6 (tax_incl)
const EDITABLE_COLS = new Set([0, 1, 3, 4, 5, 6]);

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function computeLine(
  qty: number | null,
  rate: number | null,
  discAmt: number,
  gstRate: number | null,
  isInclusive: boolean,
): { line_total: number; taxable: number; cgst: number; sgst: number; amount: number } {
  const q = qty || 0;
  const r = rate || 0;
  const gross = q * r;
  let taxable: number;
  if (isInclusive && gstRate) {
    taxable = gross / (1 + gstRate / 100);
  } else {
    taxable = gross;
  }
  const afterDiscount = Math.max(0, taxable - discAmt);
  const gst = gstRate ? afterDiscount * (gstRate / 100) : 0;
  const halfGst = gst / 2;
  const amount = afterDiscount + gst;
  return {
    line_total: gross,
    taxable: afterDiscount,
    cgst: halfGst,
    sgst: halfGst,
    amount,
  };
}

function emptyLine(): SalesItemLine {
  return {
    ledger_id: "",
    stock_item_id: null,
    quantity: null,
    rate: null,
    discount_pct: 0,
    discount_amount: 0,
    line_total: 0,
    gst_rate: null,
    hsn_sac_id: null,
    is_rate_inclusive: false,
  };
}


// ── Component ───────────────────────────────────────────────────────────────

export default function SalesItemTable({
  lines,
  onChange,
  stockItems,
  onQuickCreate,
  createdFrom,
  ledgers,
  hsnSacList,
}: SalesItemTableProps) {
  void ledgers;
  void hsnSacList;
  const focusedCell = useRef<{ row: number; col: number }>({ row: 0, col: 0 });
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const tableRef = useRef<HTMLDivElement>(null);

  // ── Derived display data ────────────────────────────────────────────────

  const displayLines = useMemo(() => {
    return lines.map((line) => {
      const item = line.stock_item_id
        ? stockItems.find((s) => s.id === line.stock_item_id)
        : undefined;
      const { taxable, cgst, sgst, amount } = computeLine(
        line.quantity,
        line.rate,
        line.discount_amount,
        line.gst_rate,
        line.is_rate_inclusive,
      );
      return {
        ...line,
        _itemName: item?.name ?? "",
        _unit: item?.unit_of_measure ?? null,
        _gstRate: line.gst_rate ?? item?.gst_rate ?? null,
        _hsnCode: item?.hsn_sac_code ?? null,
        _taxable: taxable,
        _cgst: cgst,
        _sgst: sgst,
        _amount: amount,
      };
    });
  }, [lines, stockItems]);

  // ── Focus management ────────────────────────────────────────────────────

  const focusCell = useCallback((row: number, col: number) => {
    focusedCell.current = { row, col };
    const key = `${row}_${col}`;
    const el = cellRefs.current.get(key);
    if (el) {
      // First focus the cell itself
      el.focus();
      // Then find and focus the input/button inside with a small delay to ensure DOM is ready
      setTimeout(() => {
        const input = el.querySelector<HTMLInputElement>("input");
        const button = el.querySelector<HTMLButtonElement>("button[type='button']");
        if (input) {
          input.focus();
          // For number inputs, select all text for easy replacement
          if (input.type === "number" || input.type === "text") {
            input.select();
          }
        } else if (button && !el.hasAttribute("data-cell-skip-focus")) {
          button.focus();
        }
      }, 10);
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        // Ctrl+Enter: add new row (Tally style)
        e.preventDefault();
        const updated = [...lines, emptyLine()];
        onChange(updated);
        setTimeout(() => focusCell(lines.length, 0), 0);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        let nextCol = colIdx + 1;
        let nextRow = rowIdx;
        // Skip non-editable columns
        while (nextCol < COLUMNS.length && !EDITABLE_COLS.has(nextCol)) {
          nextCol++;
        }
        if (nextCol >= COLUMNS.length) {
          nextCol = 0;
          nextRow = rowIdx + 1;
          // Skip non-editable columns in new row too
          while (nextCol < COLUMNS.length && !EDITABLE_COLS.has(nextCol)) {
            nextCol++;
          }
        }
        if (nextRow >= lines.length) {
          const updated = [...lines, emptyLine()];
          onChange(updated);
          // Focus on next row after state update — the change will re-render
          setTimeout(() => focusCell(nextRow, nextCol), 0);
        } else {
          focusCell(nextRow, nextCol);
        }
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        let prevCol = colIdx - 1;
        let prevRow = rowIdx;
        while (prevCol >= 0 && !EDITABLE_COLS.has(prevCol)) {
          prevCol--;
        }
        if (prevCol < 0) {
          prevCol = COLUMNS.length - 1;
          prevRow = rowIdx - 1;
          while (prevCol >= 0 && !EDITABLE_COLS.has(prevCol)) {
            prevCol--;
          }
        }
        if (prevRow >= 0) {
          focusCell(prevRow, prevCol);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "+") {
        // Ctrl+Plus: add new row
        e.preventDefault();
        const updated = [...lines, emptyLine()];
        onChange(updated);
        setTimeout(
          () => focusCell(lines.length, 0),
          0,
        );
      } else if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        // Ctrl+D: duplicate current row
        e.preventDefault();
        const updated = [...lines];
        updated.splice(rowIdx + 1, 0, { ...lines[rowIdx] });
        onChange(updated);
        setTimeout(() => focusCell(rowIdx + 1, colIdx), 0);
      }
    },
    [lines, onChange, focusCell],
  );

  // ── Line mutations ──────────────────────────────────────────────────────

  const updateLine = useCallback(
    (i: number, patch: Partial<SalesItemLine>) => {
      const updated = lines.map((l, idx) => {
        if (idx !== i) return l;
        let next = { ...l, ...patch };

        // Auto-populate on stock item selection
        if (patch.stock_item_id !== undefined && next.stock_item_id) {
          const item = stockItems.find((s) => s.id === next.stock_item_id);
          if (item) {
            next = {
              ...next,
              rate: item.opening_rate || null,
              gst_rate: item.gst_rate || null,
            };
          }
        }

        // When discount_pct changes, update discount_amount
        if (patch.discount_pct !== undefined) {
          const q = next.quantity || 0;
          const r = next.rate || 0;
          next.discount_amount = (q * r * next.discount_pct) / 100;
        }

        // When discount_amount changes, update discount_pct
        if (patch.discount_amount !== undefined) {
          const q = next.quantity || 0;
          const r = next.rate || 0;
          const gross = q * r;
          next.discount_pct = gross > 0 ? (next.discount_amount / gross) * 100 : 0;
        }

        // Recalculate line_total
        const { line_total } = computeLine(
          next.quantity,
          next.rate,
          next.discount_amount,
          next.gst_rate,
          next.is_rate_inclusive,
        );
        next.line_total = line_total;

        return next;
      });
      onChange(updated);
    },
    [lines, onChange, stockItems],
  );

  const addLine = useCallback(() => {
    onChange([...lines, emptyLine()]);
  }, [lines, onChange]);

  const removeLine = useCallback(
    (i: number) => {
      if (lines.length <= 1) return;
      const updated = lines.filter((_, idx) => idx !== i);
      onChange(updated);
    },
    [lines, onChange],
  );

  const setCellRef = useCallback(
    (row: number, col: number, el: HTMLTableCellElement | null) => {
      const key = `${row}_${col}`;
      if (el) {
        cellRefs.current.set(key, el);
      } else {
        cellRefs.current.delete(key);
      }
    },
    [],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div>
      <div
        ref={tableRef}
        className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-[#12121a] sticky top-0 z-10">
              <th className="px-1 py-2 w-5 shrink-0"></th>
              <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] whitespace-nowrap text-left min-w-[200px]">
                Item / Service
              </th>
              <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] whitespace-nowrap text-right min-w-[80px]">
                Qty
              </th>
              <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] whitespace-nowrap text-left min-w-[60px]">
                Unit
              </th>
              <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] whitespace-nowrap text-right min-w-[100px]">
                Rate
              </th>
              <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] whitespace-nowrap text-right min-w-[80px]">
                Disc %
              </th>
              <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] whitespace-nowrap text-right min-w-[100px]">
                Disc Amt
              </th>
              <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] whitespace-nowrap text-center min-w-[80px]">
                Tax Incl
              </th>
              <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] whitespace-nowrap text-right min-w-[120px]">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {displayLines.map((line, rowIdx) => {
              const stockItemOptions = stockItems.map((s) => ({
                value: s.id,
                label: s.hsn_sac_code
                  ? `${s.name} (${s.hsn_sac_code})`
                  : s.name,
              }));

              return (
                <tr
                  key={rowIdx}
                  className="border-t border-slate-200 dark:border-[#1a1a24]"
                >
                  {/* Delete button */}
                  <td className="px-1 py-1 w-5 shrink-0 align-middle">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(rowIdx)}
                        className="text-red-400 hover:text-red-600 text-lg leading-none p-0 w-6 h-6 flex items-center justify-center"
                        title="Remove line"
                        tabIndex={-1}
                      >
                        &times;
                      </button>
                    )}
                  </td>

                  {/* Item / Service */}
                  <td
                    ref={(el) => setCellRef(rowIdx, 0, el)}
                    data-cell={`${rowIdx}_0`}
                    className={`px-2 py-1 text-sm align-middle ${
                      focusedCell.current.row === rowIdx &&
                      focusedCell.current.col === 0
                        ? "bg-slate-100 dark:bg-[#1e1e28]"
                        : ""
                    }`}
                    tabIndex={EDITABLE_COLS.has(0) ? 0 : undefined}
                    onKeyDown={(e) => handleKeyDown(e, rowIdx, 0)}
                    onFocus={() => {
                      focusedCell.current = { row: rowIdx, col: 0 };
                    }}
                  >
                    <MasterSelector
                      entityKey="stock_item"
                      value={line.stock_item_id || ""}
                      onChange={(v) =>
                        updateLine(rowIdx, {
                          stock_item_id: v || null,
                        })
                      }
                      options={stockItemOptions}
                      placeholder="Search items..."
                      className="w-full border-0 bg-transparent text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-0 p-1"
                      createdFrom={createdFrom}
                      onItemCreated={
                        onQuickCreate
                          ? (item) => onQuickCreate("stockItems", item)
                          : undefined
                      }
                    />
                  </td>

                  {/* Qty */}
                  <td
                    ref={(el) => setCellRef(rowIdx, 1, el)}
                    data-cell={`${rowIdx}_1`}
                    className={`px-2 py-1 text-sm align-middle ${
                      focusedCell.current.row === rowIdx &&
                      focusedCell.current.col === 1
                        ? "bg-slate-100 dark:bg-[#1e1e28]"
                        : ""
                    }`}
                    tabIndex={EDITABLE_COLS.has(1) ? 0 : undefined}
                    onKeyDown={(e) => handleKeyDown(e, rowIdx, 1)}
                    onFocus={() => {
                      focusedCell.current = { row: rowIdx, col: 1 };
                    }}
                  >
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.quantity ?? ""}
                      onChange={(e) =>
                        updateLine(rowIdx, {
                          quantity: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                      className="w-full border-0 bg-transparent text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-0 p-1 h-7 text-right min-w-[60px]"
                      placeholder="0"
                    />
                  </td>

                  {/* Unit (display-only) */}
                  <td
                    ref={(el) => setCellRef(rowIdx, 2, el)}
                    data-cell={`${rowIdx}_2`}
                    className="px-2 py-1 text-sm align-middle text-slate-600 dark:text-[#cbd5e1]"
                  >
                    <span className="block px-1 py-1 h-7 leading-5">
                      {line._unit || "\u2014"}
                    </span>
                  </td>

                  {/* Rate */}
                  <td
                    ref={(el) => setCellRef(rowIdx, 3, el)}
                    data-cell={`${rowIdx}_3`}
                    className={`px-2 py-1 text-sm align-middle ${
                      focusedCell.current.row === rowIdx &&
                      focusedCell.current.col === 3
                        ? "bg-slate-100 dark:bg-[#1e1e28]"
                        : ""
                    }`}
                    tabIndex={EDITABLE_COLS.has(3) ? 0 : undefined}
                    onKeyDown={(e) => handleKeyDown(e, rowIdx, 3)}
                    onFocus={() => {
                      focusedCell.current = { row: rowIdx, col: 3 };
                    }}
                  >
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.rate ?? ""}
                      onChange={(e) =>
                        updateLine(rowIdx, {
                          rate: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                      className="w-full border-0 bg-transparent text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-0 p-1 h-7 text-right min-w-[60px]"
                      placeholder="0"
                    />
                  </td>

                  {/* Disc % */}
                  <td
                    ref={(el) => setCellRef(rowIdx, 4, el)}
                    data-cell={`${rowIdx}_4`}
                    className={`px-2 py-1 text-sm align-middle ${
                      focusedCell.current.row === rowIdx &&
                      focusedCell.current.col === 4
                        ? "bg-slate-100 dark:bg-[#1e1e28]"
                        : ""
                    }`}
                    tabIndex={EDITABLE_COLS.has(4) ? 0 : undefined}
                    onKeyDown={(e) => handleKeyDown(e, rowIdx, 4)}
                    onFocus={() => {
                      focusedCell.current = { row: rowIdx, col: 4 };
                    }}
                  >
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      value={line.discount_pct || ""}
                      onChange={(e) =>
                        updateLine(rowIdx, {
                          discount_pct: Number(e.target.value) || 0,
                        })
                      }
                      className="w-full border-0 bg-transparent text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-0 p-1 h-7 text-right min-w-[60px]"
                      placeholder="0"
                    />
                  </td>

                  {/* Disc Amt */}
                  <td
                    ref={(el) => setCellRef(rowIdx, 5, el)}
                    data-cell={`${rowIdx}_5`}
                    className={`px-2 py-1 text-sm align-middle ${
                      focusedCell.current.row === rowIdx &&
                      focusedCell.current.col === 5
                        ? "bg-slate-100 dark:bg-[#1e1e28]"
                        : ""
                    }`}
                    tabIndex={EDITABLE_COLS.has(5) ? 0 : undefined}
                    onKeyDown={(e) => handleKeyDown(e, rowIdx, 5)}
                    onFocus={() => {
                      focusedCell.current = { row: rowIdx, col: 5 };
                    }}
                  >
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.discount_amount || ""}
                      onChange={(e) =>
                        updateLine(rowIdx, {
                          discount_amount: Number(e.target.value) || 0,
                        })
                      }
                      className="w-full border-0 bg-transparent text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-0 p-1 h-7 text-right min-w-[60px]"
                      placeholder="0"
                    />
                  </td>

                  {/* Tax Incl (checkbox) */}
                  <td
                    ref={(el) => setCellRef(rowIdx, 6, el)}
                    data-cell={`${rowIdx}_6`}
                    className={`px-2 py-1 text-sm align-middle text-center ${
                      focusedCell.current.row === rowIdx &&
                      focusedCell.current.col === 6
                        ? "bg-slate-100 dark:bg-[#1e1e28]"
                        : ""
                    }`}
                    tabIndex={EDITABLE_COLS.has(6) ? 0 : undefined}
                    onKeyDown={(e) => handleKeyDown(e, rowIdx, 6)}
                    onFocus={() => {
                      focusedCell.current = { row: rowIdx, col: 6 };
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={line.is_rate_inclusive}
                      onChange={(e) =>
                        updateLine(rowIdx, {
                          is_rate_inclusive: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 dark:border-[#64748b] text-brand-600"
                    />
                  </td>

                  {/* Amount (display-only) */}
                  <td
                    ref={(el) => setCellRef(rowIdx, 7, el)}
                    data-cell={`${rowIdx}_7`}
                    className="px-2 py-1 text-sm align-middle text-right font-medium text-slate-800 dark:text-[#f1f5f9] tabular-nums"
                  >
                    <span className="block px-1 py-1 h-7 leading-5">
                      {line._amount >= 0 ? fmt(line._amount) : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addLine}
        className="mt-2 text-xs text-brand-600 hover:text-brand-700 cursor-pointer font-medium inline-flex items-center gap-1"
      >
        <span className="text-sm leading-none">+</span>
        Add Item
      </button>
    </div>
  );
}