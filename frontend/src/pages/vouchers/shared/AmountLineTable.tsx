import type { Ledger } from "../types";
import QuickCreateSelect from "./QuickCreate/Select";

interface AmountLineTableProps {
  fromLedgerId: string;
  onFromLedgerChange: (id: string) => void;
  fromLabel: string;
  fromHint: string;
  toLedgerId: string;
  onToLedgerChange: (id: string) => void;
  toLabel: string;
  toHint: string;
  amount: number;
  onAmountChange: (amount: number) => void;
  ledgers: Ledger[];
  onQuickCreate?: (entityKey: string, item: any) => void;
}

export default function AmountLineTable({
  fromLedgerId,
  onFromLedgerChange,
  fromLabel,
  fromHint,
  toLedgerId,
  onToLedgerChange,
  toLabel,
  toHint,
  amount,
  onAmountChange,
  ledgers,
  onQuickCreate,
}: AmountLineTableProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        {/* From / Source */}
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {fromLabel} <span className="text-red-500">*</span>
          </label>
          <QuickCreateSelect
            entityKey="ledger"
            value={fromLedgerId}
            onChange={onFromLedgerChange}
            options={ledgers.map((l) => ({ value: l.id, label: l.name }))}
            placeholder={`Select ${fromHint}...`}
            onItemCreated={onQuickCreate ? (item) => onQuickCreate("ledger", item) : undefined}
          />
        </div>

        {/* Amount — centered, prominent */}
        <div className="flex flex-col items-center gap-0.5 pb-1">
          <svg className="h-4 w-6 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-slate-400 dark:text-slate-500">₹</span>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={amount || ""}
              onChange={(e) => onAmountChange(Number(e.target.value) || 0)}
              className="w-28 rounded border border-slate-300 dark:border-slate-600 pl-5 pr-2 py-1 text-center text-sm font-semibold tabular-nums focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-brand-400"
              placeholder="0.00"
            />
          </div>
        </div>

        {/* To / Destination */}
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {toLabel} <span className="text-red-500">*</span>
          </label>
          <QuickCreateSelect
            entityKey="ledger"
            value={toLedgerId}
            onChange={onToLedgerChange}
            options={ledgers.map((l) => ({ value: l.id, label: l.name }))}
            placeholder={`Select ${toHint}...`}
            onItemCreated={onQuickCreate ? (item) => onQuickCreate("ledger", item) : undefined}
          />
        </div>
      </div>

      {/* Transfer summary */}
      {amount > 0 && fromLedgerId && toLedgerId && (
        <div className="rounded bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1.5 text-[11px] text-slate-600 dark:text-slate-400 text-center">
          {ledgers.find((l) => l.id === fromLedgerId)?.name || "—"}
          <span className="mx-1 font-bold text-slate-400 dark:text-slate-500">→</span>
          <span className="rounded bg-brand-100 dark:bg-brand-900/30 px-1.5 py-0.5 font-semibold text-brand-700 dark:text-brand-400 tabular-nums">
            ₹{amount.toLocaleString("en-IN")}
          </span>
          <span className="mx-1 font-bold text-slate-400 dark:text-slate-500">→</span>
          {ledgers.find((l) => l.id === toLedgerId)?.name || "—"}
        </div>
      )}
    </div>
  );
}
