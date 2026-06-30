import { useState } from "react";
import type { Party, VoucherTypeConfig } from "../types";
import DateInput from "../../../components/DateInput";
import QuickCreateSelect from "./QuickCreate/Select";

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
  documentType: string;
  onDocumentTypeChange: (v: string) => void;
  parties: Party[];
  /** Cash/Bank counter ledger */
  counterLedgerId?: string;
  onCounterLedgerChange?: (id: string) => void;
  counterLedgers?: { value: string; label: string }[];
  counterLedgerPlaceholder?: string;
  counterLedgerHint?: string;
  error?: string;
  onQuickCreate?: (entityKey: string, item: any) => void;
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
  documentType,
  onDocumentTypeChange,
  parties,
  counterLedgerId,
  onCounterLedgerChange,
  counterLedgers,
  counterLedgerPlaceholder = "Select account...",
  counterLedgerHint,
  error,
  onQuickCreate,
}: VoucherHeaderProps) {
  const [showDocType, setShowDocType] = useState(documentType !== "regular");
  const isNonRegular = documentType !== "regular";
  const showCounterLedger = config.showParty && onCounterLedgerChange && counterLedgers;

  return (
    <div className="space-y-3">
      {/* Row 1: Date, Reference, Doc Type — compact tight row */}
      <div className="grid grid-cols-[160px_12rem_auto] items-end gap-2">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Date <span className="text-red-500">*</span>
          </label>
          <DateInput
            value={date}
            onChange={onDateChange}
            className="mt-0.5 block w-full rounded border border-slate-300 dark:border-slate-600 px-2 py-1 text-sm focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-brand-400"
          />
        </div>
        {config.showReference && (
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {config.referenceLabel}
            </label>
            <input
              value={reference}
              onChange={(e) => onReferenceChange(e.target.value)}
              placeholder={config.referenceLabel}
              className="mt-0.5 block w-full rounded border border-slate-300 dark:border-slate-600 px-2 py-1 text-sm focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-brand-400"
            />
          </div>
        )}
        {/* Document Type — hidden when Regular, unobtrusive toggle */}
        {config.showDocumentType && (
          <div className="pb-0.5">
            {isNonRegular || showDocType ? (
              <div className="flex items-end gap-1.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Doc Type
                  </label>
                  <select
                    value={documentType}
                    onChange={(e) => {
                      onDocumentTypeChange(e.target.value);
                      if (e.target.value === "regular") setShowDocType(false);
                    }}
                    className="mt-0.5 rounded border border-slate-300 dark:border-slate-600 px-2 py-1 text-xs text-slate-600 dark:text-slate-400 focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-brand-400"
                  >
                    <option value="regular">Regular</option>
                    <option value="export">Export</option>
                    <option value="sez">SEZ</option>
                    <option value="deemed_export">Deemed Export</option>
                  </select>
                </div>
                {isNonRegular && (
                  <button
                    type="button"
                    onClick={() => {
                      onDocumentTypeChange("regular");
                      setShowDocType(false);
                    }}
                    className="mb-0.5 rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-300"
                    title="Reset to Regular"
                  >
                    ×
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDocType(true)}
                className="mt-5 text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              >
                Regular ▾
              </button>
            )}
          </div>
        )}
      </div>

      {/* Row 2: Party + Cash/Bank — side by side */}
      {config.showParty && (
        <div className={`grid ${showCounterLedger ? "grid-cols-2 gap-3" : ""} items-end`}>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Party / Account <span className="text-red-500">*</span>
            </label>
            <QuickCreateSelect
              entityKey="party"
              value={partyId}
              onChange={onPartyChange}
              options={parties.map((p) => ({ value: p.id, label: p.gstin ? `${p.name} (${p.gstin})` : p.name }))}
              placeholder="Select party or account..."
              className="mt-0.5 block w-full rounded border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-sm font-medium text-slate-800 dark:text-slate-100 focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-brand-400"
              onItemCreated={onQuickCreate ? (item) => onQuickCreate("party", item) : undefined}
            />
          </div>
          {showCounterLedger && (
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Cash/Bank Account <span className="text-red-500">*</span>
              </label>
              <QuickCreateSelect
                entityKey="ledger"
                value={counterLedgerId || ""}
                onChange={onCounterLedgerChange}
                options={counterLedgers || []}
                placeholder={counterLedgerPlaceholder}
                className="mt-0.5 block w-full rounded border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-sm font-medium text-slate-800 dark:text-slate-100 focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-brand-400"
                onItemCreated={onQuickCreate ? (item) => onQuickCreate("ledger", item) : undefined}
              />
              {counterLedgerHint && (
                <span className="mt-0.5 block text-[11px] text-amber-600">{counterLedgerHint}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Row 3: Narration — compact width, taller */}
      <div className="max-w-lg">
        <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Narration
        </label>
        <textarea
          value={narration}
          onChange={(e) => onNarrationChange(e.target.value)}
          placeholder="Remarks or description"
          rows={2}
          className="mt-0.5 block w-full rounded border border-slate-300 dark:border-slate-600 px-2 py-1 text-sm focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-brand-400 resize-none"
        />
      </div>

      {error && (
        <div className="rounded bg-red-50 dark:bg-red-900/30 px-2.5 py-1.5 text-xs text-red-700 dark:text-red-400">{error}</div>
      )}
    </div>
  );
}
