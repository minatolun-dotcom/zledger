import { useEffect, useRef, useState } from "react";
import type { Ledger } from "../types";
import MasterSelector from "../../../components/master/MasterSelector";

export interface AccountingLine {
  ledger_id: string;
  amount: number;
}

interface AccountingLinesTableProps {
  lines: AccountingLine[];
  onChange: (lines: AccountingLine[]) => void;
  ledgers: Ledger[];
  /** Which side this table represents: "credit" for sales/credit_note, "debit" for purchase/debit_note */
  side: "debit" | "credit";
  onQuickCreate?: (entityKey: string, item: unknown) => void;
}

export default function AccountingLinesTable({
  lines,
  onChange,
  ledgers,
  side,
  onQuickCreate,
}: AccountingLinesTableProps) {
  const [highlightedRow, setHighlightedRow] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const addLine = () => {
    onChange([...lines, { ledger_id: "", amount: 0 }]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    onChange(lines.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: keyof AccountingLine, value: string | number) => {
    const updated = lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l));
    onChange(updated);
  };

  const total = lines.reduce((sum, l) => sum + (l.amount || 0), 0);

  // Auto-add empty line if all lines are filled
  useEffect(() => {
    const last = lines[lines.length - 1];
    if (last && last.ledger_id && last.amount > 0) {
      onChange([...lines, { ledger_id: "", amount: 0 }]);
    }
  }, [lines, onChange]);

  return (
    <div ref={tableRef} className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[40px_1fr_140px_40px] gap-0 bg-slate-100 dark:bg-[#1e1e28] border-b border-slate-200 dark:border-[#282832]">
        <div className="px-2 py-2 text-xs font-semibold text-slate-500 dark:text-[#94a3b8] text-center">#</div>
        <div className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-[#cbd5e1]">
          Ledger
          <span className="ml-1 text-[10px] font-normal text-slate-400 dark:text-[#64748b]">
            ({side === "credit" ? "Cr" : "Dr"})
          </span>
        </div>
        <div className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] text-right">
          Amount
        </div>
        <div className="px-2 py-2" />
      </div>

      {/* Rows */}
      {lines.map((line, idx) => (
        <div
          key={idx}
          className={`grid grid-cols-[40px_1fr_140px_40px] gap-0 border-b border-slate-100 dark:border-[#1e1e28] items-center ${
            highlightedRow === idx ? "bg-blue-50 dark:bg-blue-950/20" : "hover:bg-slate-50 dark:hover:bg-[#1a1a24]"
          }`}
        >
          {/* Row number */}
          <div className="px-2 py-1.5 text-xs text-slate-400 dark:text-[#64748b] text-center font-medium">
            {idx + 1}
          </div>

          {/* Ledger selector */}
          <div className="px-2 py-1">
            <MasterSelector
              entityKey="ledger"
              value={line.ledger_id}
              onChange={(id: string) => updateLine(idx, "ledger_id", id)}
              options={ledgers.map((l) => ({ value: l.id, label: l.name }))}
              placeholder="Select ledger..."
              onItemCreated={() => onQuickCreate?.("ledger", {})}
            />
          </div>

          {/* Amount */}
          <div className="px-2 py-1">
            <input
              type="number"
              min={0}
              step={0.01}
              value={line.amount || ""}
              onChange={(e) => updateLine(idx, "amount", parseFloat(e.target.value) || 0)}
              onFocus={() => setHighlightedRow(idx)}
              onBlur={() => setHighlightedRow(null)}
              placeholder="0.00"
              className="w-full px-2 py-1.5 text-sm text-right rounded-lg border border-slate-300 dark:border-[#3a3a45] bg-white dark:bg-[#0f0f16] text-slate-800 dark:text-[#f1f5f9] focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20"
              data-field={`amount_${idx}`}
            />
          </div>

          {/* Delete */}
          <div className="px-2 py-1 flex justify-center">
            <button
              type="button"
              onClick={() => removeLine(idx)}
              className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 dark:text-[#64748b] dark:hover:text-red-400 rounded transition-colors"
              title="Remove line"
            >
              ×
            </button>
          </div>
        </div>
      ))}

      {/* Total row */}
      <div className="grid grid-cols-[40px_1fr_140px_40px] gap-0 bg-slate-50 dark:bg-[#1a1a24] border-t-2 border-slate-200 dark:border-[#282832]">
        <div className="px-2 py-2" />
        <div className="px-3 py-2 text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase">
          Total ({lines.filter((l) => l.ledger_id).length} lines)
        </div>
        <div className="px-3 py-2 text-sm font-bold text-slate-800 dark:text-[#f1f5f9] text-right">
          ₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </div>
        <div className="px-2 py-2" />
      </div>

      {/* Add line button */}
      <button
        type="button"
        onClick={addLine}
        className="w-full px-3 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors flex items-center gap-1"
      >
        <span className="text-base leading-none">+</span> Add Line
        <span className="text-[10px] font-normal text-slate-400 dark:text-[#64748b] ml-1">(Ctrl+Enter)</span>
      </button>
    </div>
  );
}
