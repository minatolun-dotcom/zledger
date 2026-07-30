import type { Ledger, LedgerGroupType, Party, VoucherTypeConfig } from "../types";
import { getLedgerGroupType, ledgerGroupTypeLabel } from "../types";
import DateInput from "../../../components/DateInput";
import MasterSelector from "../../../components/master/MasterSelector";
import { LEDGER_GROUP_COLORS } from "./ledgerUtils";

/**
 * Describes a single ledger slot rendered in the header.
 * Replaces the hardcoded party + cash/bank dual-account pattern.
 */
export interface LedgerSlotInstance {
  key: string;
  label: string;
  placeholder: string;
  hint?: string;
  value: string;
  onChange: (id: string) => void;
  /** Called when the selected ledger's group type is detected */
  onTypeDetect?: (type: LedgerGroupType | null) => void;
  /** If set, filter the ledger list to these group types */
  allowedGroups?: LedgerGroupType[];
}

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
  /** Voucher number (shown when editing) */
  voucherNumber?: string;
  /** Suggested voucher number for new vouchers */
  suggestedVoucherNumber?: string;
  /** Called when user changes the suggested voucher number */
  onVoucherNumberChange?: (v: string) => void;

  // ── New ledger-driven props (replaces party+counterLedger when set) ──
  /** When provided, renders flexible LedgerSelector slots instead of the
   *  hardcoded Party + Cash/Bank dual-account section. */
  ledgerSlots?: LedgerSlotInstance[];
  /** Full ledger list — needed for the LedgerSelector to resolve names/group types */
  ledgers?: Ledger[];
  /** Map of group_id → system_code for ledger type detection */
  groupCodeMap?: Map<string, string>;
}

function formatLedgerOptionLabel(ledger: Ledger, groupLabel: string): string {
  return `${ledger.name} (${groupLabel})`;
}

export default function VoucherHeader(props: VoucherHeaderProps) {
  const {
    config, date, onDateChange, reference, onReferenceChange,
    partyId, onPartyChange, parties,
    counterLedgerId, onCounterLedgerChange, counterLedgers,
    counterLedgerPlaceholder = "Select account...", counterLedgerHint,
    error, onQuickCreate, createdFrom,
    voucherNumber, suggestedVoucherNumber, onVoucherNumberChange,
    ledgerSlots, ledgers, groupCodeMap,
  } = props;

  const showCounterLedger = config.showParty && onCounterLedgerChange && counterLedgers;
  const useLedgerSlots = ledgerSlots && ledgerSlots.length > 0 && ledgers && groupCodeMap;

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

      {/* ── Ledger-driven selector slots (new architecture) ──────── */}
      {useLedgerSlots && (
        <div className={`grid ${ledgerSlots.length > 1 ? "grid-cols-2 gap-4" : ""} items-end`}>
          {ledgerSlots.map((slot) => {
            const selectedLedger = slot.value
              ? ledgers!.find((l) => l.id === slot.value)
              : undefined;
            const groupType = selectedLedger && groupCodeMap
              ? getLedgerGroupType(groupCodeMap.get(selectedLedger.group_id) ?? null)
              : null;

            return (
              <div key={slot.key} data-field={slot.key}>
                <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
                  {slot.label} {slot.allowedGroups && slot.allowedGroups.length > 0 && (
                    <span className="text-[10px] font-normal text-slate-400 dark:text-[#64748b]">
                      ({slot.allowedGroups.map(ledgerGroupTypeLabel).join(", ")})
                    </span>
                  )}
                </label>
                <MasterSelector
                  entityKey="ledger"
                  value={slot.value}
                  onChange={(id: string) => {
                    slot.onChange(id);
                    if (slot.onTypeDetect && id && groupCodeMap) {
                      const l = ledgers!.find((ll) => ll.id === id);
                      if (l) {
                        slot.onTypeDetect(
                          getLedgerGroupType(groupCodeMap.get(l.group_id) ?? null),
                        );
                      }
                    }
                  }}
                  options={
                    ledgers!
                      .filter((l) => {
                        if (!slot.allowedGroups || slot.allowedGroups.length === 0) return true;
                        const gType = getLedgerGroupType(groupCodeMap!.get(l.group_id) ?? null);
                        return slot.allowedGroups!.includes(gType);
                      })
                      .map((l) => {
                        const gType = getLedgerGroupType(groupCodeMap!.get(l.group_id) ?? null);
                        return {
                          value: l.id,
                          label: formatLedgerOptionLabel(l, ledgerGroupTypeLabel(gType)),
                        };
                      })
                  }
                  placeholder={slot.placeholder}
                  className="w-full text-sm font-medium text-slate-800 dark:text-[#f1f5f9]"
                  createdFrom={createdFrom}
                  onItemCreated={onQuickCreate ? (item) => onQuickCreate("ledger", item) : undefined}
                />
                {groupType && (
                  <span className={`mt-1 inline-flex items-center gap-1 text-[11px] ${LEDGER_GROUP_COLORS[groupType]}`}>
                    <span className="w-1.5 h-1.5 rounded-full inline-block bg-current" />
                    {ledgerGroupTypeLabel(groupType)}
                  </span>
                )}
                {slot.hint && !slot.value && (
                  <span className="mt-1 block text-xs text-amber-600">{slot.hint}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Legacy party + cash/bank section (backward compat) ──── */}
      {!useLedgerSlots && config.showParty && (
        <div className={`grid ${showCounterLedger ? "grid-cols-2 gap-4" : ""} items-end`}>
          <div data-field="party">
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
              Party / Account <span className="text-red-500">*</span>
            </label>
            <MasterSelector
              entityKey="party"
              value={partyId}
              onChange={onPartyChange}
              options={parties.map((p) => ({ value: p.id, label: p.gstin ? `${p.name} (${p.gstin})` : p.name }))}
              placeholder="Select party or account..."
              className="w-full text-sm font-medium text-slate-800 dark:text-[#f1f5f9]"
              createdFrom={createdFrom}
              onItemCreated={onQuickCreate ? (item) => onQuickCreate("party", item) : undefined}
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
