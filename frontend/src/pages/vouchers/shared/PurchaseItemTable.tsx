import { useRef, useCallback, useMemo } from "react";
import type { StockItem, Ledger } from "../types";
import MasterSelector from "../../../components/master/MasterSelector";

// ── Types ───────────────────────────────────────────────────────────────────
export interface PurchaseItemLine {
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
  is_reverse_charge: boolean;
  cost_centre_id: string | null;
}

interface PurchaseItemTableProps {
  lines: PurchaseItemLine[];
  onChange: (lines: PurchaseItemLine[]) => void;
  stockItems: StockItem[];
  ledgers: Ledger[];
  onQuickCreate?: (entityKey: string, item: unknown) => void;
  createdFrom?: string;
  isInterState: boolean;
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

function emptyLine(): PurchaseItemLine {
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
    is_reverse_charge: false,
    cost_centre_id: null,
  };
}

// ── Component ───────────────────────────────────────────────────────────────

export default function PurchaseItemTable({
  lines,
  onChange,
  stockItems,
  onQuickCreate,
  createdFrom,
  ledgers,
}: PurchaseItemTableProps) {
  void ledgers;
  const focusedCell = useRef<{ row: number; col: number }>({ row: 0, col: 0 });
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());

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
        const select = el.querySelector<HTMLSelectElement>("select");
        const button = el.querySelector<HTMLButtonElement>("button[type='button']");
        if (input) {
          input.focus();
          // For number inputs, select all text for easy replacement
          if (input.type === "number" || input.type === "text") {
            input.select();
          }
        } else if (select) {
          select.focus();
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

      const maxRow = lines.length - 1;
      const maxCol = COLUMNS.length - 1;
      let nextRow = rowIdx;
      let nextCol = colIdx;

      switch (e.key) {
        case "Enter":
          e.preventDefault();
          // Move to next editable cell
          do {
            nextCol++;
            if (nextCol > maxCol) {
              nextCol = 0;
              nextRow++;
            }
          } while (nextRow <= maxRow && !EDITABLE_COLS.has(nextCol));

          // If we moved past the last row, add a new row
          if (nextRow > maxRow) {
            const updated = [...lines, emptyLine()];
            onChange(updated);
            setTimeout(() => focusCell(lines.length, 0), 0);
          } else {
            focusCell(nextRow, nextCol);
          }
          break;

        case "Tab":
          if (e.shiftKey) {
            e.preventDefault();
            // Move backward
            do {
              nextCol--;
              if (nextCol < 0) {
                nextCol = maxCol;
                nextRow--;
              }
            } while (nextRow >= 0 && !EDITABLE_COLS.has(nextCol));

            if (nextRow >= 0) {
              focusCell(nextRow, nextCol);
            }
          } else {
            e.preventDefault();
            // Move forward
            do {
              nextCol++;
              if (nextCol > maxCol) {
                nextCol = 0;
                nextRow++;
              }
            } while (nextRow <= maxRow && !EDITABLE_COLS.has(nextCol));

            if (nextRow > maxRow) {
              // Add new row when tabbing past the last cell
              const updated = [...lines, emptyLine()];
              onChange(updated);
              setTimeout(() => focusCell(lines.length, 0), 0);
            } else {
              focusCell(nextRow, nextCol);
            }
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (rowIdx > 0) {
            focusCell(rowIdx - 1, colIdx);
          }
          break;

        case "ArrowDown":
          e.preventDefault();
          if (rowIdx < maxRow) {
            focusCell(rowIdx + 1, colIdx);
          } else {
            // Add new row when arrow down from last row
            const updated = [...lines, emptyLine()];
            onChange(updated);
            setTimeout(() => focusCell(lines.length, colIdx), 0);
          }
          break;

        case "ArrowLeft":
          // Allow default behavior for text navigation within input
          break;

        case "ArrowRight":
          // Allow default behavior for text navigation within input
          break;

        case "Delete":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            // Delete current row
            if (lines.length > 1) {
              const updated = lines.filter((_, i) => i !== rowIdx);
              onChange(updated);
              const newRow = Math.min(rowIdx, updated.length - 1);
              setTimeout(() => focusCell(newRow, colIdx), 0);
            }
          }
          break;

        case "d":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            // Duplicate current row
            const duplicated = { ...lines[rowIdx] };
            const updated = [...lines];
            updated.splice(rowIdx + 1, 0, duplicated);
            onChange(updated);
            setTimeout(() => focusCell(rowIdx + 1, 0), 0);
          }
          break;
      }
    },
    [lines, onChange, focusCell],
  );

  // ── Update line ─────────────────────────────────────────────────────────

  const updateLine = useCallback(
    (idx: number, patch: Partial<PurchaseItemLine>) => {
      const updated = [...lines];
      updated[idx] = { ...updated[idx], ...patch };
      onChange(updated);
    },
    [lines, onChange],
  );

  // ── Cell refs ───────────────────────────────────────────────────────────

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
      <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] overflow-x-auto">
        <div className="min-w-[1200px]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-[#12121a] sticky top-0 z-10">
              <th className="px-1 py-2 w-5 shrink-0"></th>
              <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] whitespace-nowrap text-left min-w-[270px]">
                Item / Service
              </th>
              <th className="w-[70px] px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8]">
                Qty
              </th>
              <th className="w-[50px] px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8]">
                Unit
              </th>
              <th className="w-[90px] px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8]">
                Rate
              </th>
              <th className="w-[60px] px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8]">
                Disc %
              </th>
              <th className="w-[80px] px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8]">
                Disc Amt
              </th>
              <th className="w-[60px] px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8]">
                Tax Incl
              </th>
              <th className="w-[110px] px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8]">
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
                        onClick={() => {
                          const updated = lines.filter((_, i) => i !== rowIdx);
                          onChange(updated);
                        }}
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
                      step="1"
                      min="0"
                      value={line.quantity ?? ""}
                      onChange={(e) =>
                        updateLine(rowIdx, {
                          quantity: parseFloat(e.target.value) || null,
                        })
                      }
                      className="w-full text-right border-0 bg-transparent text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-0 p-1"
                      placeholder="0"
                    />
                  </td>

                  {/* Unit (read-only) */}
                  <td
                    ref={(el) => setCellRef(rowIdx, 2, el)}
                    data-cell={`${rowIdx}_2`}
                    className="px-2 py-1 text-center text-sm text-slate-500 dark:text-[#94a3b8] align-middle"
                  >
                    {line._unit || "—"}
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
                      step="0.01"
                      min="0"
                      value={line.rate ?? ""}
                      onChange={(e) =>
                        updateLine(rowIdx, {
                          rate: parseFloat(e.target.value) || null,
                        })
                      }
                      className="w-full text-right border-0 bg-transparent text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-0 p-1"
                      placeholder="0.00"
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
                      step="0.01"
                      min="0"
                      max="100"
                      value={line.discount_pct || ""}
                      onChange={(e) => {
                        const pct = parseFloat(e.target.value) || 0;
                        const gross =
                          (line.quantity || 0) * (line.rate || 0);
                        updateLine(rowIdx, {
                          discount_pct: pct,
                          discount_amount: (gross * pct) / 100,
                        });
                      }}
                      className="w-full text-right border-0 bg-transparent text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-0 p-1"
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
                      step="0.01"
                      min="0"
                      value={line.discount_amount || ""}
                      onChange={(e) => {
                        const amt = parseFloat(e.target.value) || 0;
                        const gross =
                          (line.quantity || 0) * (line.rate || 0);
                        updateLine(rowIdx, {
                          discount_amount: amt,
                          discount_pct:
                            gross > 0 ? (amt / gross) * 100 : 0,
                        });
                      }}
                      className="w-full text-right border-0 bg-transparent text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-0 p-1"
                      placeholder="0.00"
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

                  {/* Amount (read-only) */}
                  <td
                    ref={(el) => setCellRef(rowIdx, 7, el)}
                    data-cell={`${rowIdx}_7`}
                    className="px-2 py-1 text-right text-sm font-medium text-slate-900 dark:text-[#f1f5f9] align-middle"
                  >
                    {fmt(line._amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          const updated = [...lines, emptyLine()];
          onChange(updated);
          setTimeout(() => focusCell(lines.length, 0), 0);
        }}
        className="mt-2 text-xs text-brand-600 hover:text-brand-700 cursor-pointer font-medium inline-flex items-center gap-1"
      >
        <span className="text-sm leading-none">+</span>
        Add Item
      </button>
    </div>
  );
}
