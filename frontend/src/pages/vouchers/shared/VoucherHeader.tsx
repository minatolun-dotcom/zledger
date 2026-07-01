import { useState } from "react";
import type { Party, VoucherTypeConfig } from "../types";
import DateInput from "../../../components/DateInput";
import Select from "../../../components/Select";
import QuickCreateSelect from "./QuickCreate/Select";

interface CurrencyOption { code: string; symbol: string }

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
  /** Multi-currency */
  currency?: string;
  onCurrencyChange?: (v: string) => void;
  exchangeRate?: number;
  onExchangeRateChange?: (v: number) => void;
  currencies?: CurrencyOption[];
  baseCurrency?: string;
  currencySymbol?: string;
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
  currency,
  onCurrencyChange,
  exchangeRate,
  onExchangeRateChange,
  currencies = [],
  baseCurrency = "INR",
  currencySymbol = "₹",
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

  const isForex = currency && currency !== baseCurrency;
  const forexOptions = [
    { value: "", label: `${baseCurrency} (${currencySymbol})` },
    ...currencies.map((c) => ({ value: c.code, label: `${c.code} (${c.symbol})` })),
  ];

  return (
    <div className="space-y-3">
      {/* Row 1: Date, Reference, Currency — compact tight row */}
      <div className="grid grid-cols-[160px_12rem_140px_auto] items-end gap-2">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-[#94a3b8]">
            Date <span className="text-red-500">*</span>
          </label>
          <DateInput
            value={date}
            onChange={onDateChange}
            className="mt-0.5 block w-full rounded border border-slate-300 dark:border-[#252530] px-2 py-1 text-sm focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20"
          />
        </div>
        {config.showReference && (
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-[#94a3b8]">
              {config.referenceLabel}
            </label>
            <input
              value={reference}
              onChange={(e) => onReferenceChange(e.target.value)}
              placeholder={config.referenceLabel}
              className="mt-0.5 block w-full rounded border border-slate-300 dark:border-[#252530] px-2 py-1 text-sm focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20"
            />
          </div>
        )}
        {onCurrencyChange && currencies.length > 0 && (
          <div>
            <Select
              value={currency || ""}
              onChange={(v) => onCurrencyChange(v)}
              options={forexOptions}
              label="Currency"
              className="mt-0.5"
            />
          </div>
        )}
        {isForex && onExchangeRateChange && (
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-[#94a3b8]">
              Exchange Rate
            </label>
            <input
              type="number"
              step="0.0001"
              min="0"
              value={exchangeRate || ""}
              onChange={(e) => onExchangeRateChange(parseFloat(e.target.value) || 0)}
              placeholder={`1 ${currency} = ? ${baseCurrency}`}
              className="mt-0.5 block w-full rounded border border-slate-300 dark:border-[#252530] px-2 py-1 text-sm focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20"
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
                    className="mt-0.5"
                  />
                </div>
                {isNonRegular && (
                  <button
                    type="button"
                    onClick={() => {
                      onDocumentTypeChange("regular");
                      setShowDocType(false);
                    }}
                    className="mb-0.5 rounded bg-slate-100 dark:bg-[#252530] px-1.5 py-0.5 text-[10px] text-slate-500 dark:text-[#94a3b8] hover:bg-slate-200 dark:hover:bg-[#333340] hover:text-slate-700 dark:hover:text-[#e2e8f0]"
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
        <div className={`grid ${showCounterLedger ? "grid-cols-2 gap-3" : ""} items-end`}>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-[#94a3b8]">
              Party / Account <span className="text-red-500">*</span>
            </label>
            <QuickCreateSelect
              entityKey="party"
              value={partyId}
              onChange={onPartyChange}
              options={parties.map((p) => ({ value: p.id, label: p.gstin ? `${p.name} (${p.gstin})` : p.name }))}
              placeholder="Select party or account..."
              className="mt-0.5 block w-full rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1.5 text-sm font-medium text-slate-800 dark:text-[#f1f5f9] focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20"
              onItemCreated={onQuickCreate ? (item) => onQuickCreate("party", item) : undefined}
            />
          </div>
          {showCounterLedger && (
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-[#94a3b8]">
                Cash/Bank Account <span className="text-red-500">*</span>
              </label>
              <QuickCreateSelect
                entityKey="ledger"
                value={counterLedgerId || ""}
                onChange={onCounterLedgerChange}
                options={counterLedgers || []}
                placeholder={counterLedgerPlaceholder}
                className="mt-0.5 block w-full rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1.5 text-sm font-medium text-slate-800 dark:text-[#f1f5f9] focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20"
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
        <label className="block text-[11px] font-medium text-slate-500 dark:text-[#94a3b8]">
          Narration
        </label>
        <textarea
          value={narration}
          onChange={(e) => onNarrationChange(e.target.value)}
          placeholder="Remarks or description"
          rows={2}
          className="mt-0.5 block w-full rounded border border-slate-300 dark:border-[#252530] px-2 py-1 text-sm focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20 resize-none"
        />
      </div>

      {error && (
        <div className="rounded bg-red-50 dark:bg-red-500/10 px-2.5 py-1.5 text-xs text-red-700 dark:text-red-400">{error}</div>
      )}
    </div>
  );
}
