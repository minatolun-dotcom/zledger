import type { Ledger, VoucherLine } from "../types";
import QuickCreateSelect from "./QuickCreate/Select";

interface LedgerLineTableProps {
  lines: VoucherLine[];
  onLinesChange: (lines: VoucherLine[]) => void;
  ledgers: Ledger[];
  onQuickCreate?: (entityKey: string, item: any) => void;
}

export default function LedgerLineTable({
  lines,
  onLinesChange,
  ledgers,
  onQuickCreate,
}: LedgerLineTableProps) {
  const updateLine = (i: number, field: keyof VoucherLine, val: string | number) => {
    onLinesChange(
      lines.map((l, idx) => (idx === i ? { ...l, [field]: val } : l))
    );
  };

  const addLine = () =>
    onLinesChange([
      ...lines,
      { ledger_id: "", stock_item_id: null, quantity: null, rate: null, discount_pct: 0, discount_amount: 0, debit: 0, credit: 0, line_total: null, gst_rate: null, is_rate_inclusive: false },
    ]);

  const removeLine = (i: number) => {
    if (lines.length <= 2) return;
    onLinesChange(lines.filter((_, idx) => idx !== i));
  };

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  return (
    <div>
      <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="px-2 py-1.5">Ledger</th>
              <th className="w-32 px-2 py-1.5 text-right">Debit (₹)</th>
              <th className="w-32 px-2 py-1.5 text-right">Credit (₹)</th>
              <th className="w-6 px-1 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-700/50">
                <td className="px-2 py-1">
                  <QuickCreateSelect
                    entityKey="ledger"
                    value={line.ledger_id}
                    onChange={(v) => updateLine(i, "ledger_id", v)}
                    options={ledgers.map((l) => ({ value: l.id, label: l.name }))}
                    placeholder="Select ledger..."
                    className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:outline-none focus:ring-0"
                    onItemCreated={onQuickCreate ? (item) => onQuickCreate("ledger", item) : undefined}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.debit || ""}
                    onChange={(e) => updateLine(i, "debit", Number(e.target.value) || 0)}
                    className="w-full rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-1.5 py-0.5 text-right text-sm tabular-nums focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-brand-400"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.credit || ""}
                    onChange={(e) => updateLine(i, "credit", Number(e.target.value) || 0)}
                    className="w-full rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-1.5 py-0.5 text-right text-sm tabular-nums focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-brand-400"
                  />
                </td>
                <td className="px-1 py-1 text-center">
                  {lines.length > 2 && (
                    <button type="button" onClick={() => removeLine(i)} className="text-red-300 hover:text-red-500 text-xs leading-none">&times;</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 text-sm font-semibold">
              <td className="px-2 py-1.5 text-slate-600 dark:text-slate-400">Total</td>
              <td className="px-2 py-1.5 text-right tabular-nums">₹{totalDebit.toLocaleString("en-IN")}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">₹{totalCredit.toLocaleString("en-IN")}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <button
          type="button"
          onClick={addLine}
          className="rounded border border-dashed border-slate-300 dark:border-slate-600 px-2.5 py-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20"
        >
          + Add Line
        </button>
        <span className={`text-[11px] font-medium ${balanced ? "text-emerald-600" : "text-red-600"}`}>
          {balanced ? "Balanced" : `Difference: ₹${Math.abs(totalDebit - totalCredit).toLocaleString("en-IN")}`}
        </span>
      </div>
    </div>
  );
}
