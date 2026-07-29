import type { Ledger } from "../types";
import MasterSelector from "../../../components/master/MasterSelector";

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
  fromLedgers?: Ledger[];
  toLedgers?: Ledger[];
  onQuickCreate?: (entityKey: string, item: any) => void;
  createdFrom?: string;
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
  fromLedgers,
  toLedgers,
  onQuickCreate,
  createdFrom,
}: AmountLineTableProps) {
  const currencySymbol = "₹";
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4">
      <h4 className="mb-3 text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
        {fromLabel} / {toLabel}
      </h4>
      <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        {/* From / Source */}
        <div data-field="from_ledger">
          <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
            {fromLabel} <span className="text-red-500">*</span>
          </label>
          <MasterSelector
            entityKey="ledger"
            value={fromLedgerId}
            onChange={onFromLedgerChange}
            options={(fromLedgers || ledgers).map((l) => ({ value: l.id, label: l.name }))}
            placeholder={`Select ${fromHint}...`}
            className="block w-full rounded-lg border border-slate-300 dark:bg-[#1a1a24] dark:border-[#3a3a45] px-3 py-2 text-sm font-medium text-slate-800 dark:text-[#f1f5f9] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
            createdFrom={createdFrom}
            onItemCreated={onQuickCreate ? (item) => onQuickCreate("ledger", item) : undefined}
          />
        </div>

        {/* Amount — centered, prominent */}
        <div className="flex flex-col items-center gap-1 pb-1">
          <svg className="h-5 w-8 text-slate-300 dark:text-[#475569]" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 dark:text-[#64748b]">{currencySymbol}</span>
            <div data-field="amount">
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={amount || ""}
                onChange={(e) => onAmountChange(Number(e.target.value) || 0)}
                className="w-32 rounded-lg border border-slate-300 dark:bg-[#1a1a24] dark:border-[#3a3a45] pl-7 pr-3 py-2 text-center text-sm font-semibold tabular-nums focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        {/* To / Destination */}
        <div data-field="to_ledger">
          <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
            {toLabel} <span className="text-red-500">*</span>
          </label>
          <MasterSelector
            entityKey="ledger"
            value={toLedgerId}
            onChange={onToLedgerChange}
            options={(toLedgers || ledgers).map((l) => ({ value: l.id, label: l.name }))}
            placeholder={`Select ${toHint}...`}
            className="block w-full rounded-lg border border-slate-300 dark:bg-[#1a1a24] dark:border-[#3a3a45] px-3 py-2 text-sm font-medium text-slate-800 dark:text-[#f1f5f9] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
            createdFrom={createdFrom}
            onItemCreated={onQuickCreate ? (item) => onQuickCreate("ledger", item) : undefined}
          />
        </div>
      </div>

      {/* Transfer summary */}
      {amount > 0 && fromLedgerId && toLedgerId && (
        <div className="rounded-lg bg-gradient-to-r from-slate-50 to-slate-100 dark:from-[#1a1a24] dark:to-[#22222f] px-3 py-2 text-xs text-slate-600 dark:text-[#cbd5e1] text-center border border-slate-200 dark:border-[#1a1a24]">
          {ledgers.find((l) => l.id === fromLedgerId)?.name || "—"}
          <span className="mx-2 font-bold text-slate-400 dark:text-[#64748b]">→</span>
          <span className="rounded-md bg-brand-100 dark:bg-blue-500/10 px-2 py-0.5 font-bold text-brand-700 dark:text-blue-400 tabular-nums">
            {currencySymbol}{amount.toLocaleString("en-IN")}
          </span>
          <span className="mx-2 font-bold text-slate-400 dark:text-[#64748b]">→</span>
          {ledgers.find((l) => l.id === toLedgerId)?.name || "—"}
        </div>
      )}
      </div>
    </div>
  );
}
