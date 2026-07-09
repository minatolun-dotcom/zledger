import { useState } from "react";
import type { Party, VoucherTypeConfig } from "../types";
import DateInput from "../../../components/DateInput";
import Select from "../../../components/Select";
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
  /** Voucher number (shown when editing) */
  voucherNumber?: string;
  /** Suggested voucher number for new vouchers */
  suggestedVoucherNumber?: string;
  /** Called when user changes the suggested voucher number */
  onVoucherNumberChange?: (v: string) => void;
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
  voucherNumber,
  suggestedVoucherNumber,
  onVoucherNumberChange,
}: VoucherHeaderProps) {
  const [showDocType, setShowDocType] = useState(documentType !== "regular");
  const isNonRegular = documentType !== "regular";
  const showCounterLedger = config.showParty && onCounterLedgerChange && counterLedgers;

  const docTypeOptions = [
    { value: "regular", label: "Regular" },
    { value: "export", label: "Export" },
    { value: "sez", label: "SEZ" },
    { value: "deemed_export", label: "Deemed Export" },
  ];

  const isEditing = voucherNumber !== undefined && voucherNumber !== "";
  const displayNumber = isEditing ? voucherNumber : suggestedVoucherNumber || "";

  return (
    <div className="space-y-4">
      {/* Row 1: Voucher No., Date, Reference, Doc Type */}
      <div className="flex items-end gap-3 flex-wrap">
        {isEditing && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
              Voucher No.
            </label>
            <input
              value={displayNumber}
              readOnly={isEditing}
              disabled={isEditing}
              onChange={onVoucherNumberChange ? (e) => onVoucherNumberChange(e.target.value) : undefined}
              placeholder="Auto-generated"
              className={`block w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm ${
                isEditing
                  ? "bg-slate-50 dark:bg-[#16161f] text-slate-500 dark:text-[#64748b] cursor-not-allowed"
                  : "bg-white dark:bg-[#0f0f16] text-slate-800 dark:text-[#f1f5f9] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20"
              } transition-all`}
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
            Date <span className="text-red-500">*</span>
          </label>
          <DateInput
            value={date}
            onChange={onDateChange}
            className="block w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm bg-white dark:bg-[#0f0f16] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
          />
        </div>
        {config.showReference && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
              {config.referenceLabel}
            </label>
            <input
              value={reference}
              onChange={(e) => onReferenceChange(e.target.value)}
              placeholder={config.referenceLabel}
              className="block w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm bg-white dark:bg-[#0f0f16] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
            />
          </div>
        )}
        {/* Document Type — hidden when Regular, unobtrusive toggle */}
        {config.showDocumentType && (
          <div className="pb-0.5">
            {isNonRegular || showDocType ? (
              <div className="flex items-end gap-1.5">
                <div>
                  <Select
                    value={documentType}
                    onChange={(v) => {
                      onDocumentTypeChange(v);
                      if (v === "regular") setShowDocType(false);
                    }}
                    options={docTypeOptions}
                    label="Doc Type"
                    className="mt-0"
                  />
                </div>
                {isNonRegular && (
                  <button
                    type="button"
                    onClick={() => {
                      onDocumentTypeChange("regular");
                      setShowDocType(false);
                    }}
                    className="mb-0.5 rounded bg-slate-100 dark:bg-[#282832] px-1.5 py-0.5 text-[10px] text-slate-500 dark:text-[#cbd5e1] hover:bg-slate-200 dark:hover:bg-[#333340] hover:text-slate-700 dark:hover:text-[#e2e8f0]"
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
                className="mt-5 text-[11px] text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#e2e8f0]"
              >
                Regular ▾
              </button>
            )}
          </div>
        )}
      </div>

      {/* Row 2: Party + Cash/Bank — side by side */}
      {config.showParty && (
        <div className={`grid ${showCounterLedger ? "grid-cols-2 gap-4" : ""} items-end`}>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
              Party / Account <span className="text-red-500">*</span>
            </label>
            <QuickCreateSelect
              entityKey="party"
              value={partyId}
              onChange={onPartyChange}
              options={parties.map((p) => ({ value: p.id, label: p.gstin ? `${p.name} (${p.gstin})` : p.name }))}
              placeholder="Select party or account..."
              className="block w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm font-medium text-slate-800 dark:text-[#f1f5f9] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
              onItemCreated={onQuickCreate ? (item) => onQuickCreate("party", item) : undefined}
            />
          </div>
          {showCounterLedger && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
                Cash/Bank Account <span className="text-red-500">*</span>
              </label>
              <QuickCreateSelect
                entityKey="ledger"
                value={counterLedgerId || ""}
                onChange={onCounterLedgerChange}
                options={counterLedgers || []}
                placeholder={counterLedgerPlaceholder}
                className="block w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm font-medium text-slate-800 dark:text-[#f1f5f9] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
                onItemCreated={onQuickCreate ? (item) => onQuickCreate("ledger", item) : undefined}
              />
              {counterLedgerHint && (
                <span className="mt-1 block text-xs text-amber-600">{counterLedgerHint}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Row 3: Narration — compact width, taller */}
      <div className="max-w-lg">
        <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
          Narration
        </label>
        <textarea
          value={narration}
          onChange={(e) => onNarrationChange(e.target.value)}
          placeholder="Remarks or description"
          rows={2}
          className="block w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm bg-white dark:bg-[#0f0f16] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 resize-none transition-all"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">{error}</div>
      )}
    </div>
  );
}
