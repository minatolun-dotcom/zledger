import type { ReactNode } from "react";
import type { Party, VoucherTypeConfig } from "../types";
import DateInput from "../../../components/DateInput";
import MasterSelector from "../../../components/master/MasterSelector";

interface VoucherHeaderProps {
  config: VoucherTypeConfig;
  date: string;
  onDateChange: (v: string) => void;
  narration: string;
  onNarrationChange: (v: string) => void;
  reference: string;
  onReferenceChange: (v: string) => void;
  partyId: string;
  onPartyChange: (v: string) => void;
  parties: Party[];
  /** Cash/Bank counter ledger */
  counterLedgerId?: string;
  onCounterLedgerChange?: (id: string) => void;
  counterLedgers?: { value: string; label: string }[];
  counterLedgerPlaceholder?: string;
  counterLedgerHint?: string;
  error?: string;
  onQuickCreate?: (entityKey: string, item: any) => void;
  createdFrom?: string;
  /** Voucher number (shown when editing) */
  voucherNumber?: string;
  /** Suggested voucher number for new vouchers */
  suggestedVoucherNumber?: string;
  /** Called when user changes the suggested voucher number */
  onVoucherNumberChange?: (v: string) => void;
  /** Slot for the TransactionFlow diagram, rendered right of narration */
  flowSlot?: ReactNode;
}

export default function VoucherHeader({
  config,
  date,
  onDateChange,
  narration,
  onNarrationChange,
  reference,
  onReferenceChange,
  partyId,
  onPartyChange,
  parties,
  counterLedgerId,
  onCounterLedgerChange,
  counterLedgers,
  counterLedgerPlaceholder = "Select account...",
  counterLedgerHint,
  error,
  onQuickCreate,
  createdFrom,
  flowSlot,
}: VoucherHeaderProps) {
  const showCounterLedger = config.showParty && onCounterLedgerChange && counterLedgers;

  return (
    <div className="space-y-4">
      {/* Title Row: voucher type + description on left, date + invoice on right */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900 dark:text-[#f1f5f9] leading-tight">
            {config.label}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-[#64748b]">{config.description}</p>
        </div>
        <div className="flex items-end gap-3 shrink-0">
          {config.showReference && (
            <div data-field="reference" className="dark:focus:border-blue-500 dark:focus:ring-blue-500/20">
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
                {config.referenceLabel}
              </label>
              <input
                value={reference}
                onChange={(e) => onReferenceChange(e.target.value)}
                placeholder={config.referenceLabel}
                className="block w-full rounded-lg border border-slate-300 dark:border-[#3a3a45] px-3 py-2 text-sm bg-white dark:bg-[#1a1a24] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
              Date <span className="text-red-500">*</span>
            </label>
            <div data-field="date" className="dark:focus:border-blue-500 dark:focus:ring-blue-500/20">
              <DateInput
                value={date}
                onChange={onDateChange}
                className="block w-full rounded-lg border border-slate-300 dark:border-[#3a3a45] px-3 py-2 text-sm bg-white dark:bg-[#1a1a24] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Party + Cash/Bank — side by side */}
      {config.showParty && (
        <div className={`grid ${showCounterLedger ? "grid-cols-2 gap-4" : ""} items-end`}>
          <div data-field="party" className="dark:focus:border-blue-500 dark:focus:ring-blue-500/20">
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
              Party / Account <span className="text-red-500">*</span>
            </label>
            <MasterSelector
              entityKey="party"
              value={partyId}
              onChange={onPartyChange}
              options={parties.map((p) => ({ value: p.id, label: p.gstin ? `${p.name} (${p.gstin})` : p.name }))}
              placeholder="Select party or account..."
              className="block w-full rounded-lg border border-slate-300 dark:border-[#3a3a45] px-3 py-2 text-sm font-medium text-slate-800 dark:text-[#f1f5f9] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
              createdFrom={createdFrom}
              onItemCreated={onQuickCreate ? (item) => onQuickCreate("party", item) : undefined}
            />
          </div>
          {showCounterLedger && (
            <div data-field="counter_ledger" className="dark:focus:border-blue-500 dark:focus:ring-blue-500/20">
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
                Cash/Bank Account <span className="text-red-500">*</span>
              </label>
              <MasterSelector
                entityKey="ledger"
                value={counterLedgerId || ""}
                onChange={onCounterLedgerChange}
                options={counterLedgers || []}
                placeholder={counterLedgerPlaceholder}
                className="block w-full rounded-lg border border-slate-300 dark:border-[#3a3a45] px-3 py-2 text-sm font-medium text-slate-800 dark:text-[#f1f5f9] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
                createdFrom={createdFrom}
                onItemCreated={onQuickCreate ? (item) => onQuickCreate("ledger", item) : undefined}
              />
              {counterLedgerHint && (
                <span className="mt-1 block text-xs text-amber-600">{counterLedgerHint}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Row 3: Narration + TransactionFlow side by side */}
      <div className="grid grid-cols-[3fr_2fr] gap-4 items-start dark:focus:border-blue-500 dark:focus:ring-blue-500/20" data-field="narration">
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
            Narration
          </label>
          <textarea
            value={narration}
            onChange={(e) => onNarrationChange(e.target.value)}
            placeholder="Remarks or description"
            rows={4}
            className="block w-full rounded-lg border border-slate-300 dark:border-[#3a3a45] px-3 py-2 text-sm bg-white dark:bg-[#1a1a24] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 resize-none transition-all"
          />
        </div>
        {flowSlot && (
          <div className="min-h-0 pt-5">
            {flowSlot}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>
      )}
    </div>
  );
}
