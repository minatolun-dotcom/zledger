import { useRef, useCallback, useMemo, useState } from "react";
import type { StockItem, Ledger } from "../types";
import MasterSelector from "../../../components/master/MasterSelector";
import { useVoucherKeyboard } from "../hooks/useVoucherKeyboard";

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
  // Computed fields
  taxable?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  amount?: number;
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

// Editable columns: item(0), qty(1), rate(3), disc_pct(4), disc_amt(5), tax_incl(6)
const EDITABLE_COLS = new Set([0, 1, 3, 4, 5, 6]);

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(n: number | null): string {
  if (n === null || n === undefined) return "";
  return n.toString();
}

function computeLine(
  qty: number | null,
  rate: number | null,
  discAmt: number,
  gstRate: number | null,
  isInclusive: boolean
): { line_total: number; taxable: number; cgst: number; sgst: number; igst: number; amount: number } {
  const q = qty || 0;
  const r = rate || 0;
  const gross = q * r;
  const discount = discAmt || 0;
  const taxable = isInclusive && gstRate
    ? (gross - discount) / (1 + gstRate / 100)
    : gross - discount;
  const taxAmt = gstRate ? (taxable * gstRate) / 100 : 0;

  // We'll determine interstate outside and set in updateLine
  let cgst = 0, sgst = 0, igst = 0;
  return { line_total: gross, taxable, cgst, sgst, igst, amount: taxable + taxAmt };
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

function gstRateLabel(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "—";
  return `${rate}%`;
}

function getPurchaseLedgers(ledgers: Ledger[]) {
  return ledgers.filter(l => {
    const name = l.name.toLowerCase();
    return name.includes("purchase") || name.includes("import");
  });
}

// ── Component ───────────────────────────────────────────────────────────────

export default function PurchaseItemTable({
  lines,
  onChange,
  stockItems,
  ledgers,
  isInterState,
}: PurchaseItemTableProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const [highlighted, setHighlighted] = useState<number>(0);

  const purchaseLedgers = useMemo(() => getPurchaseLedgers(ledgers), [ledgers]);
  const defaultPurchaseLedgerId = purchaseLedgers[0]?.id || "";

  // Keyboard navigation
  const fieldOrder = ["item", "qty", "rate", "disc_pct", "disc_amt", "tax_incl"];
  useVoucherKeyboard({
    fieldOrder,
    onSave: () => {}, // handled by parent form
    scopeRef: tableRef,
  });

  // Update line with computed values
  const updateLine = useCallback((idx: number, patch: Partial<PurchaseItemLine>) => {
    const newLines = [...lines];
    const line = { ...newLines[idx], ...patch };
    
    // Recompute line values
    const computed = computeLine(
      line.quantity,
      line.rate,
      line.discount_amount,
      line.gst_rate,
      line.is_rate_inclusive
    );
    
    line.line_total = computed.line_total;
    line.taxable = computed.taxable;
    line.cgst = isInterState ? 0 : computed.cgst;
    line.sgst = isInterState ? 0 : computed.sgst;
    line.igst = isInterState ? computed.igst : 0;
    line.amount = computed.amount;

    newLines[idx] = line;
    onChange(newLines);
  }, [lines, onChange, isInterState]);

  // Add new line
  const addLine = useCallback(() => {
    const newLines = [...lines, { ...emptyLine(), ledger_id: defaultPurchaseLedgerId }];
    onChange(newLines);
    setHighlighted(newLines.length - 1);
  }, [lines, onChange, defaultPurchaseLedgerId]);

  // Remove line
  const removeLine = useCallback((idx: number) => {
    if (lines.length <= 1) return; // Keep at least one line
    const newLines = lines.filter((_, i) => i !== idx);
    onChange(newLines);
    setHighlighted(Math.min(highlighted, newLines.length - 1));
  }, [lines, onChange, highlighted]);

  // Duplicate line
  const duplicateLine = useCallback((idx: number) => {
    const newLines = [...lines];
    const duplicated = { ...lines[idx], line_total: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, amount: 0 };
    newLines.splice(idx + 1, 0, duplicated);
    onChange(newLines);
    setHighlighted(idx + 1);
  }, [lines, onChange]);

  // Totals
  const totals = useMemo(() => {
    let taxable = 0, cgst = 0, sgst = 0, igst = 0, amount = 0, discount = 0;
    lines.forEach(l => {
      if (!l.stock_item_id && l.ledger_id === "") return;
      taxable += l.taxable || 0;
      cgst += l.cgst || 0;
      sgst += l.sgst || 0;
      igst += l.igst || 0;
      amount += l.amount || 0;
      discount += l.discount_amount || 0;
    });
    return { taxable, cgst, sgst, igst, amount, discount, grandTotal: amount };
  }, [lines]);

  // Handle cell double-click / Enter to edit
  const handleCellClick = (row: number, col: number) => {
    if (EDITABLE_COLS.has(col as any)) {
      setEditing({ row, col });
    }
  };

  // Handle keyboard within table
  const handleKeyDown = (e: React.KeyboardEvent, row: number, col: number) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      // Ctrl+Enter: add new row (Tally style)
      e.preventDefault();
      addLine();
      return;
    }

    const maxRow = lines.length - 1;
    const maxCol = COLUMNS.length - 1;
    let nextRow = row;
    let nextCol = col;

    switch (e.key) {
      case "Enter":
      case "Tab":
        if (!e.shiftKey) {
          // Find next editable column
          do {
            nextCol++;
            if (nextCol > maxCol) { nextCol = 0; nextRow++; }
          } while (nextRow <= maxRow && !EDITABLE_COLS.has(nextCol));
          
          if (nextRow > maxRow) {
            // Add new line at end
            addLine();
            e.preventDefault();
            return;
          }
        } else {
          // Shift+Tab / Shift+Enter: previous editable
          do {
            nextCol--;
            if (nextCol < 0) { nextCol = maxCol; nextRow--; }
          } while (nextRow >= 0 && !EDITABLE_COLS.has(nextCol));
          
          if (nextRow < 0) nextRow = 0;
        }
        e.preventDefault();
        setEditing({ row: nextRow, col: nextCol });
        setHighlighted(nextRow);
        break;
      case "ArrowDown":
        if (row < maxRow) {
          e.preventDefault();
          setHighlighted(row + 1);
        } else {
          addLine();
        }
        break;
      case "ArrowUp":
        if (row > 0) {
          e.preventDefault();
          setHighlighted(row - 1);
        }
        break;
      case "ArrowRight":
        // Find next editable column
        do { nextCol++; } while (nextCol <= maxCol && !EDITABLE_COLS.has(nextCol));
        if (nextCol <= maxCol) {
          e.preventDefault();
          setEditing({ row, col: nextCol });
        }
        break;
      case "ArrowLeft":
        // Find previous editable column
        do { nextCol--; } while (nextCol >= 0 && !EDITABLE_COLS.has(nextCol));
        if (nextCol >= 0) {
          e.preventDefault();
          setEditing({ row, col: nextCol });
        }
        break;
      case "Delete":
        if (e.ctrlKey || e.metaKey) {
          removeLine(row);
        }
        break;
      case "d":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          duplicateLine(row);
        }
        break;
      case "Escape":
        setEditing(null);
        break;
    }
  };

  // Render cell content
  const renderCell = (line: PurchaseItemLine, col: string, rowIdx: number) => {
    const isEdit = editing?.row === rowIdx && editing?.col === COLUMNS.indexOf(col as any);
    switch (col) {
      case "item": {
        const item = line.stock_item_id ? stockItems.find(s => s.id === line.stock_item_id) : null;
        const ledger = line.ledger_id ? purchaseLedgers.find(l => l.id === line.ledger_id) : null;
        
        if (isEdit) {
          return (
            <MasterSelector
              entityKey="stock_item"
              value={line.stock_item_id || ""}
              options={[
                ...stockItems.map(s => ({ value: s.id, label: s.name })),
                { value: "__service__", label: "Service (no stock)" }
              ]}
              onChange={(id) => {
                if (id === "__service__") {
                  updateLine(rowIdx, { stock_item_id: null, quantity: null, rate: 0 });
                } else {
                  const s = stockItems.find(x => x.id === id);
                  if (s) {
                    updateLine(rowIdx, {
                      stock_item_id: id,
                      quantity: 1,
                      rate: s.opening_rate || 0,
                      gst_rate: s.gst_rate || null,
                      hsn_sac_id: null, // resolved server-side via stock_item.hsn_sac_code
                    });
                  }
                }
              }}
              placeholder="Select item/service"
              data-field="item"
            />
          );
        }
        return (
          <td data-field="item" onDoubleClick={() => handleCellClick(rowIdx, 0)}>
            {item?.name || (line.stock_item_id === null && line.ledger_id ? "Service" : "—")}
            {ledger && <span className="ml-1 text-xs text-slate-500">[{ledger.name}]</span>}
          </td>
        );
      }

      case "qty": {
        const item = line.stock_item_id ? stockItems.find(s => s.id === line.stock_item_id) : null;
        if (isEdit) {
          return (
            <input
              type="number"
              step={item?.unit_of_measure?.includes("KG") || item?.unit_of_measure?.includes("MTR") ? "0.001" : "1"}
              value={line.quantity ?? ""}
              onChange={(e) => updateLine(rowIdx, { quantity: parseFloat(e.target.value) || null })}
              onBlur={() => setEditing(null)}
              onKeyDown={(e) => handleKeyDown(e, rowIdx, 1)}
              className="w-full text-right text-sm border-none bg-transparent focus:outline-none focus:ring-1 focus:ring-brand-500 rounded px-1"
              data-field="qty"
              autoFocus
            />
          );
        }
        return (
          <td className="text-right" onDoubleClick={() => handleCellClick(rowIdx, 1)}>
            {fmtInt(line.quantity)} {item?.unit_of_measure || ""}
          </td>
        );
      }

      case "unit":
        return <td className="text-center text-slate-500">
          {line.stock_item_id ? stockItems.find(s => s.id === line.stock_item_id)?.unit_of_measure || "—" : "—"}
        </td>;

      case "rate": {
        if (isEdit) {
          return (
            <input
              type="number"
              step="0.01"
              value={line.rate ?? ""}
              onChange={(e) => updateLine(rowIdx, { rate: parseFloat(e.target.value) || null })}
              onBlur={() => setEditing(null)}
              onKeyDown={(e) => handleKeyDown(e, rowIdx, 3)}
              className="w-full text-right text-sm border-none bg-transparent focus:outline-none focus:ring-1 focus:ring-brand-500 rounded px-1"
              data-field="rate"
              autoFocus
            />
          );
        }
        return (
          <td className="text-right" onDoubleClick={() => handleCellClick(rowIdx, 3)}>
            {fmt(line.rate)}
          </td>
        );
      }

      case "disc_pct": {
        if (isEdit) {
          return (
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={line.discount_pct ?? ""}
              onChange={(e) => {
                const pct = parseFloat(e.target.value) || 0;
                const gross = (line.quantity || 0) * (line.rate || 0);
                updateLine(rowIdx, { discount_pct: pct, discount_amount: gross * pct / 100 });
              }}
              onBlur={() => setEditing(null)}
              onKeyDown={(e) => handleKeyDown(e, rowIdx, 4)}
              className="w-full text-right text-sm border-none bg-transparent focus:outline-none focus:ring-1 focus:ring-brand-500 rounded px-1"
              data-field="disc_pct"
              autoFocus
            />
          );
        }
        return (
          <td className="text-right" onDoubleClick={() => handleCellClick(rowIdx, 4)}>
            {line.discount_pct > 0 ? `${line.discount_pct}%` : "—"}
          </td>
        );
      }

      case "disc_amt": {
        if (isEdit) {
          return (
            <input
              type="number"
              step="0.01"
              min="0"
              value={line.discount_amount ?? ""}
              onChange={(e) => {
                const amt = parseFloat(e.target.value) || 0;
                const gross = (line.quantity || 0) * (line.rate || 0);
                updateLine(rowIdx, { discount_amount: amt, discount_pct: gross > 0 ? (amt / gross) * 100 : 0 });
              }}
              onBlur={() => setEditing(null)}
              onKeyDown={(e) => handleKeyDown(e, rowIdx, 5)}
              className="w-full text-right text-sm border-none bg-transparent focus:outline-none focus:ring-1 focus:ring-brand-500 rounded px-1"
              data-field="disc_amt"
              autoFocus
            />
          );
        }
        return (
          <td className="text-right" onDoubleClick={() => handleCellClick(rowIdx, 5)}>
            {fmt(line.discount_amount)}
          </td>
        );
      }

      case "tax_incl": {
        if (isEdit) {
          return (
            <select
              value={line.is_rate_inclusive ? "1" : "0"}
              onChange={(e) => updateLine(rowIdx, { is_rate_inclusive: e.target.value === "1" })}
              onBlur={() => setEditing(null)}
              onKeyDown={(e) => handleKeyDown(e, rowIdx, 6)}
              className="w-full text-sm border-none bg-transparent focus:outline-none focus:ring-1 focus:ring-brand-500 rounded px-1"
              data-field="tax_incl"
              autoFocus
            >
              <option value="0">Exclusive</option>
              <option value="1">Inclusive</option>
            </select>
          );
        }
        return (
          <td className="text-center" onDoubleClick={() => handleCellClick(rowIdx, 6)}>
            {line.is_rate_inclusive ? "Incl" : "Excl"}
          </td>
        );
      }

      case "taxable":
        return <td className="text-right text-slate-600 dark:text-slate-400">{fmt(line.taxable)}</td>;

      case "gst_pct":
        return <td className="text-center text-slate-600 dark:text-slate-400">{gstRateLabel(line.gst_rate)}</td>;

      case "cgst":
        return <td className="text-right text-slate-600 dark:text-slate-400">{isInterState ? "—" : fmt(line.cgst)}</td>;

      case "sgst":
        return <td className="text-right text-slate-600 dark:text-slate-400">{isInterState ? "—" : fmt(line.sgst)}</td>;

      case "igst":
        return <td className="text-right text-slate-600 dark:text-slate-400">{isInterState ? fmt(line.igst) : "—"}</td>;

      case "amount":
        return <td className="text-right font-medium">{fmt(line.amount)}</td>;

      default:
        return <td>{line[col as keyof PurchaseItemLine] as string}</td>;
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f]" ref={tableRef}>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-[#1a1a24] border-b border-slate-200 dark:border-[#282832] sticky top-0">
          <tr>
            <th className="w-60 px-2 py-1.5 text-left font-semibold text-slate-700 dark:text-[#cbd5e1]">Item / Service</th>
            <th className="w-24 px-2 py-1.5 text-right font-semibold text-slate-700 dark:text-[#cbd5e1]">Qty</th>
            <th className="w-20 px-2 py-1.5 text-center font-semibold text-slate-700 dark:text-[#cbd5e1]">Unit</th>
            <th className="w-28 px-2 py-1.5 text-right font-semibold text-slate-700 dark:text-[#cbd5e1]">Rate</th>
            <th className="w-24 px-2 py-1.5 text-right font-semibold text-slate-700 dark:text-[#cbd5e1]">Disc %</th>
            <th className="w-28 px-2 py-1.5 text-right font-semibold text-slate-700 dark:text-[#cbd5e1]">Disc Amt</th>
            <th className="w-24 px-2 py-1.5 text-center font-semibold text-slate-700 dark:text-[#cbd5e1]">Tax Incl</th>
            <th className="w-32 px-2 py-1.5 text-right font-semibold text-slate-700 dark:text-[#cbd5e1]">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, rowIdx) => (
            <tr
              key={rowIdx}
              className={`border-b border-slate-100 dark:border-[#1a1a24] transition-colors ${
                rowIdx === highlighted ? "bg-brand-50 dark:bg-brand-900/20" : ""
              }`}
              onClick={() => setHighlighted(rowIdx)}
            >
              {COLUMNS.map((col) => (
                <td key={col} className="px-2 py-1.5 align-middle">
                  {renderCell(line, col, rowIdx)}
                </td>
              ))}
            </tr>
          ))}
          {/* Add line row */}
          <tr className="border-t-2 border-slate-200 dark:border-[#282832] bg-slate-50 dark:bg-[#1a1a24]">
            <td colSpan={COLUMNS.length} className="px-2 py-2 text-center">
              <button
                onClick={addLine}
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
                data-field="item"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add Item (Ctrl+Enter)
              </button>
            </td>
          </tr>
        </tbody>
        {/* Totals row */}
        <tfoot className="bg-slate-50 dark:bg-[#1a1a24] border-t border-slate-200 dark:border-[#282832]">
          <tr>
            <td colSpan={7} className="px-2 py-1.5 text-right font-semibold text-slate-700 dark:text-[#cbd5e1]">Totals</td>
            <td className="px-2 py-1.5 text-right font-semibold text-slate-700 dark:text-[#cbd5e1]">{fmt(totals.taxable)}</td>
            <td className="px-2 py-1.5 text-center font-semibold text-slate-700 dark:text-[#cbd5e1]">—</td>
            <td className="px-2 py-1.5 text-right font-semibold text-slate-700 dark:text-[#cbd5e1]">{fmt(totals.cgst)}</td>
            <td className="px-2 py-1.5 text-right font-semibold text-slate-700 dark:text-[#cbd5e1]">{fmt(totals.sgst)}</td>
            <td className="px-2 py-1.5 text-right font-semibold text-slate-700 dark:text-[#cbd5e1]">{fmt(totals.igst)}</td>
            <td className="px-2 py-1.5 text-right font-bold text-brand-600 dark:text-brand-400">{fmt(totals.amount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}