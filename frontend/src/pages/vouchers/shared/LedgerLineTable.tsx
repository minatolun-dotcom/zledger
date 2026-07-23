import type { Ledger, VoucherLine } from "../types";
import MasterSelector from "../../../components/master/MasterSelector";

interface LedgerLineTableProps {
  lines: VoucherLine[];
  onLinesChange: (lines: VoucherLine[]) => void;
  ledgers: Ledger[];
  onQuickCreate?: (entityKey: string, item: any) => void;
  createdFrom?: string;
}

export default function LedgerLineTable({
  lines,
  onLinesChange,
  ledgers,
  onQuickCreate,
  createdFrom,
}: LedgerLineTableProps) {
  const currencySymbol = "₹";
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
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-[#1a1a24] dark:to-[#1e1e2a] text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#cbd5e1] border-b border-slate-200 dark:border-[#1a1a24]">
              <th className="px-3 py-2 border-r border-slate-200 dark:border-[#1a1a24]">Ledger</th>
              <th className="w-32 px-3 py-2 text-right border-r border-slate-200 dark:border-[#1a1a24]">Debit ({currencySymbol})</th>
              <th className="w-32 px-3 py-2 text-right border-r border-slate-200 dark:border-[#1a1a24]">Credit ({currencySymbol})</th>
              <th className="w-6 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-[#1a1a24]/50 hover:bg-slate-50/50 dark:hover:bg-[#1a1a24]/50 transition-colors">
                <td className="px-2 py-1.5 border-r border-slate-100 dark:border-[#1a1a24]/30">
                  <div data-field={`ledger_${i}`}>
                    <MasterSelector
                      entityKey="ledger"
                      value={line.ledger_id}
                      onChange={(v) => updateLine(i, "ledger_id", v)}
                      options={ledgers.map((l) => ({ value: l.id, label: l.name }))}
                      placeholder="Select ledger..."
                      className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:outline-none focus:ring-0"
                      createdFrom={createdFrom}
                      onItemCreated={onQuickCreate ? (item) => onQuickCreate("ledger", item) : undefined}
                    />
                  </div>
                </td>
                <td className="px-2 py-1.5 border-r border-slate-100 dark:border-[#1a1a24]/30">
                  <div data-field={`debit_${i}`}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.debit || ""}
                      onChange={(e) => updateLine(i, "debit", Number(e.target.value) || 0)}
                      className="w-full rounded border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] px-2 py-1 text-right text-sm tabular-nums focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
                    />
                  </div>
                </td>
                <td className="px-2 py-1.5 border-r border-slate-100 dark:border-[#1a1a24]/30">
                  <div data-field={`credit_${i}`}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.credit || ""}
                      onChange={(e) => updateLine(i, "credit", Number(e.target.value) || 0)}
                      className="w-full rounded border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] px-2 py-1 text-right text-sm tabular-nums focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
                    />
                  </div>
                </td>
                <td className="px-1 py-1.5 text-center">
                  {lines.length > 2 && (
                    <button type="button" onClick={() => removeLine(i)} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors" title="Remove line">&times;</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-[#333340] bg-gradient-to-r from-slate-50 to-slate-100 dark:from-[#1a1a24] dark:to-[#1e1e2a] text-sm font-bold">
              <td className="px-3 py-2 text-slate-700 dark:text-[#cbd5e1]">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{currencySymbol}{totalDebit.toLocaleString("en-IN")}</td>
              <td className="px-3 py-2 text-right tabular-nums">{currencySymbol}{totalCredit.toLocaleString("en-IN")}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={addLine}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 dark:border-[#282832] px-3 py-1.5 text-xs font-semibold text-slate-500 dark:text-[#cbd5e1] hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
        >
          <span className="text-sm leading-none">+</span>
          Add Line
        </button>
        <span className={`text-xs font-semibold ${balanced ? "text-emerald-600" : "text-red-600"}`}>
          {balanced ? "Balanced" : `Difference: ${currencySymbol}${Math.abs(totalDebit - totalCredit).toLocaleString("en-IN")}`}
        </span>
      </div>
    </div>
  );
}
