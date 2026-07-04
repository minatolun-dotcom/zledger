import { useMemo } from "react";
import type { Ledger, StockItem, VoucherLine } from "../types";
import QuickCreateSelect from "./QuickCreate/Select";
import Select from "../../../components/Select";

interface ItemLineTableProps {
  lines: VoucherLine[];
  onLinesChange: (lines: VoucherLine[]) => void;
  stockItems: StockItem[];
  ledgers: Ledger[];
  autoLedgerGroup: string;
  showGst: boolean;
  onQuickCreate?: (entityKey: string, item: any) => void;
}

export default function ItemLineTable({
  lines,
  onLinesChange,
  stockItems,
  ledgers,
  autoLedgerGroup,
  showGst,
  onQuickCreate,
}: ItemLineTableProps) {
  const currencySymbol = "₹";
  const linesCalc = useMemo(() => {
    return lines.map((line) => {
      if (line.stock_item_id && line.quantity && line.rate) {
        const item = stockItems.find((s) => s.id === line.stock_item_id);
        const gross = line.quantity * line.rate;
        const discountAmt =
          line.discount_pct > 0
            ? (gross * line.discount_pct) / 100
            : line.discount_amount;
        const inclusiveTotal = gross - discountAmt;
        const gstRate = line.gst_rate ?? item?.gst_rate ?? 0;

        let lineTotal: number;
        let cgst: number;
        let sgst: number;

        if (line.is_rate_inclusive && gstRate > 0) {
          // Back-calculate taxable from inclusive amount
          lineTotal = Number((inclusiveTotal / (1 + gstRate / 100)).toFixed(2));
          const taxableForGst = lineTotal;
          cgst = showGst ? Number((taxableForGst * (gstRate / 2) / 100).toFixed(2)) : 0;
          sgst = showGst ? Number((taxableForGst * (gstRate / 2) / 100).toFixed(2)) : 0;
        } else {
          lineTotal = inclusiveTotal;
          cgst = gstRate > 0 && showGst ? (lineTotal * (gstRate / 2)) / 100 : 0;
          sgst = gstRate > 0 && showGst ? (lineTotal * (gstRate / 2)) / 100 : 0;
        }

        return { ...line, discount_amount: discountAmt, line_total: lineTotal, cgst, sgst };
      }
      return { ...line, line_total: null, cgst: 0, sgst: 0 };
    });
  }, [lines, stockItems, showGst]);

  const updateLine = (i: number, field: keyof VoucherLine, val: string | number | null | boolean) => {
    const updated = lines.map((l, idx) => {
      if (idx !== i) return l;
      const next = { ...l, [field]: val };
      if (field === "stock_item_id" && val) {
        const ledger = ledgers.find((lg) =>
          lg.name.toLowerCase().includes(autoLedgerGroup.toLowerCase())
        );
        if (ledger) next.ledger_id = ledger.id;
        const item = stockItems.find((s) => s.id === val);
        if (item) {
          if (item.opening_rate > 0) next.rate = item.opening_rate;
          next.gst_rate = item.gst_rate;
        }
      }
      if (field === "discount_pct" && typeof val === "number") {
        if (l.quantity && l.rate) next.discount_amount = (l.quantity * l.rate * val) / 100;
      }
      return next;
    });
    onLinesChange(updated);
  };

  const addLine = () =>
    onLinesChange([
      ...lines,
      { ledger_id: "", stock_item_id: null, quantity: null, rate: null, discount_pct: 0, discount_amount: 0, debit: 0, credit: 0, line_total: null, gst_rate: null, is_rate_inclusive: false },
    ]);

  const removeLine = (i: number) => {
    if (lines.length <= 1) return;
    onLinesChange(lines.filter((_, idx) => idx !== i));
  };

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-[#1e1e28]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-[#1a1a24] dark:to-[#1e1e2a] text-left text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] border-b border-slate-200 dark:border-[#1e1e28]">
              <th className="w-48 px-3 py-2 border-r border-slate-200 dark:border-[#1e1e28]">Item / Service</th>
              <th className="w-20 px-3 py-2 text-right border-r border-slate-200 dark:border-[#1e1e28]">Qty</th>
              <th className="w-24 px-3 py-2 text-right border-r border-slate-200 dark:border-[#1e1e28]">Rate</th>
              <th className="w-10 px-2 py-2 text-center border-r border-slate-200 dark:border-[#1e1e28]" title="Rate inclusive of tax">Incl.</th>
              <th className="w-16 px-3 py-2 text-right border-r border-slate-200 dark:border-[#1e1e28]">Disc %</th>
              <th className="w-28 px-3 py-2 text-right border-r border-slate-200 dark:border-[#1e1e28]">Amount</th>
              {showGst && <th className="w-16 px-3 py-2 text-right border-r border-slate-200 dark:border-[#1e1e28]">GST</th>}
              <th className="w-6 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {linesCalc.map((line, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-[#1e1e28]/50 hover:bg-slate-50/50 dark:hover:bg-[#1a1a24]/50 transition-colors">
                <td className="px-2 py-1.5 border-r border-slate-100 dark:border-[#1e1e28]/30">
                  <QuickCreateSelect
                    entityKey="stock_item"
                    value={line.stock_item_id || ""}
                    onChange={(v) => updateLine(i, "stock_item_id", v || null)}
                    options={stockItems.map((s) => ({ value: s.id, label: s.name }))}
                    placeholder="Select..."
                    className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:outline-none focus:ring-0"
                    onItemCreated={onQuickCreate ? (item) => onQuickCreate("stock_item", item) : undefined}
                  />
                </td>
                <td className="px-2 py-1.5 border-r border-slate-100 dark:border-[#1e1e28]/30">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={line.quantity ?? ""}
                    onChange={(e) => updateLine(i, "quantity", e.target.value ? Number(e.target.value) : null)}
                    className="w-full rounded border border-slate-200 dark:border-[#252530] bg-white dark:bg-[#18181f] px-1.5 py-1 text-right text-sm tabular-nums focus:border-brand-500 dark:focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-violet-500/20"
                  />
                </td>
                <td className="px-2 py-1.5 border-r border-slate-100 dark:border-[#1e1e28]/30">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.rate ?? ""}
                    onChange={(e) => updateLine(i, "rate", e.target.value ? Number(e.target.value) : null)}
                    className="w-full rounded border border-slate-200 dark:border-[#252530] bg-white dark:bg-[#18181f] px-1.5 py-1 text-right text-sm tabular-nums focus:border-brand-500 dark:focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-violet-500/20"
                  />
                </td>
                <td className="px-2 py-1.5 text-center border-r border-slate-100 dark:border-[#1e1e28]/30">
                  <input
                    type="checkbox"
                    checked={line.is_rate_inclusive}
                    onChange={(e) => updateLine(i, "is_rate_inclusive", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 dark:border-[#252530] text-brand-600 focus:ring-brand-500 dark:focus:ring-violet-500/20"
                    title="Rate is inclusive of GST"
                  />
                </td>
                <td className="px-2 py-1.5 border-r border-slate-100 dark:border-[#1e1e28]/30">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={line.discount_pct || ""}
                    onChange={(e) => updateLine(i, "discount_pct", Number(e.target.value) || 0)}
                    className="w-full rounded border border-slate-200 dark:border-[#252530] bg-white dark:bg-[#18181f] px-1.5 py-1 text-right text-sm tabular-nums focus:border-brand-500 dark:focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-violet-500/20"
                  />
                </td>
                <td className="px-3 py-1.5 text-right text-sm font-semibold tabular-nums border-r border-slate-100 dark:border-[#1e1e28]/30">
                  {line.line_total !== null ? `${currencySymbol}${line.line_total.toLocaleString("en-IN")}` : "—"}
                </td>
                {showGst && (
                  <td className="px-2 py-1.5 border-r border-slate-100 dark:border-[#1e1e28]/30">
                    <Select
                      value={line.gst_rate != null ? String(line.gst_rate) : ""}
                      onChange={(v) => updateLine(i, "gst_rate", v !== "" ? Number(v) : null)}
                      options={[
                        { value: "", label: "Auto" },
                        { value: "0", label: "0%" },
                        { value: "0.25", label: "0.25%" },
                        { value: "3", label: "3%" },
                        { value: "5", label: "5%" },
                        { value: "12", label: "12%" },
                        { value: "18", label: "18%" },
                        { value: "28", label: "28%" },
                      ]}
                      className="w-full"
                    />
                  </td>
                )}
                <td className="px-2 py-1.5 text-center">
                  {linesCalc.length > 1 && (
                    <button type="button" onClick={() => removeLine(i)} className="text-red-300 hover:text-red-500 text-sm leading-none transition-colors">&times;</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addLine}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 dark:border-[#252530] px-3 py-1.5 text-xs font-semibold text-slate-500 dark:text-[#94a3b8] hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
      >
        <span className="text-sm leading-none">+</span>
        Add Item
      </button>
    </div>
  );
}
