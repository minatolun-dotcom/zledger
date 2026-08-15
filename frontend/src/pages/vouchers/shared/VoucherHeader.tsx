import type { Party, VoucherTypeConfig } from "../types";
import { partyOptionLabel } from "../types";
import DateInput from "../../../components/DateInput";
import MasterSelector from "../../../components/master/MasterSelector";

interface VoucherHeaderProps {
  config: VoucherTypeConfig;
  date: string;
  onDateChange: (v: string) => void;
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
  /** Pre-fill values for the New Party quick-create modal (e.g. party_type) */
  partyCreateDefaults?: Record<string, string | number>;
  /** Pre-fill values for the New Ledger counter-account quick-create modal (e.g. group_id) */
  counterLedgerCreateDefaults?: Record<string, string | number>;
  /** Voucher number (shown when editing) */
  voucherNumber?: string;
  /** Suggested voucher number for new vouchers */
  suggestedVoucherNumber?: string;
  /** Called when user changes the suggested voucher number */
  onVoucherNumberChange?: (v: string) => void;
}

export default function VoucherHeader(props: VoucherHeaderProps) {
  const {
    config, date, onDateChange, reference, onReferenceChange,
    partyId, onPartyChange, parties,
    counterLedgerId, onCounterLedgerChange, counterLedgers,
    counterLedgerPlaceholder = "Select account...", counterLedgerHint,
    error, onQuickCreate, createdFrom,
    voucherNumber, suggestedVoucherNumber, onVoucherNumberChange,
    partyCreateDefaults, counterLedgerCreateDefaults,
  } = props;

  const showCounterLedger = config.showParty && onCounterLedgerChange && counterLedgers;

  return (
    <div className="space-y-4">
      {/* ── Title Row ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          {voucherNumber ? (
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900 dark:text-[#f1f5f9] leading-tight">
                {config.label}
              </h3>
              <span className="text-xs text-slate-400 dark:text-[#64748b]">#{voucherNumber}</span>
            </div>
          ) : (
            <h3 className="text-base font-semibold text-slate-900 dark:text-[#f1f5f9] leading-tight">
              {config.label}
            </h3>
          )}
          <p className="mt-0.5 text-xs text-slate-500 dark:text-[#64748b]">{config.description}</p>
        </div>
        <div className="flex items-end gap-3 shrink-0">
          {config.showReference && (
            <div data-field="reference">
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
            <div data-field="date">
              <DateInput
                value={date}
                onChange={onDateChange}
                className="block w-full rounded-lg border border-slate-300 dark:border-[#3a3a45] px-3 py-2 text-sm bg-white dark:bg-[#1a1a24] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
              />
            </div>
          </div>
          {/* Voucher number override for new vouchers */}
          {suggestedVoucherNumber && onVoucherNumberChange && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
                Voucher #
              </label>
              <input
                value={suggestedVoucherNumber}
                onChange={(e) => onVoucherNumberChange(e.target.value)}
                placeholder="Auto"
                className="block w-28 rounded-lg border border-slate-300 dark:border-[#3a3a45] px-3 py-2 text-sm bg-white dark:bg-[#1a1a24] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Party + cash/bank section ──────────────────────────── */}
      {config.showParty && (
        <div className={`grid ${showCounterLedger ? "grid-cols-2 gap-4" : ""} items-end`}>
          <div data-field="party">
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
              Party / Account <span className="text-red-500">*</span>
            </label>
            <MasterSelector
              entityKey="party"
              value={partyId}
              onChange={onPartyChange}
              options={parties.map((p) => ({ value: p.id, label: partyOptionLabel(p) }))}
              placeholder="Select party or account..."
              className="w-full text-sm font-medium text-slate-800 dark:text-[#f1f5f9]"
              createdFrom={createdFrom}
              onItemCreated={onQuickCreate ? (item) => onQuickCreate("party", item) : undefined}
              createDefaults={partyCreateDefaults}
            />
          </div>
          {showCounterLedger && (
            <div data-field="counter_ledger">
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
                Cash/Bank Account <span className="text-red-500">*</span>
              </label>
              <MasterSelector
                entityKey="ledger"
                value={counterLedgerId || ""}
                onChange={onCounterLedgerChange}
                options={counterLedgers || []}
                placeholder={counterLedgerPlaceholder}
                className="w-full text-sm font-medium text-slate-800 dark:text-[#f1f5f9]"
                createdFrom={createdFrom}
                onItemCreated={onQuickCreate ? (item) => onQuickCreate("ledger", item) : undefined}
                createDefaults={counterLedgerCreateDefaults}
              />
              {counterLedgerHint && (
                <span className="mt-1 block text-xs text-amber-600">{counterLedgerHint}</span>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>
      )}
    </div>
  );
}
