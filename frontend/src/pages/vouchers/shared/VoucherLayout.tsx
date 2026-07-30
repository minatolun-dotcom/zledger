import type { VoucherTypeConfig } from "../types";
import DateInput from "../../../components/DateInput";
import Button from "../../../components/Button";
import VoucherTemplateModal, { showTemplateModal } from "../../../components/VoucherTemplateModal";

interface VoucherLayoutProps {
  /** Voucher type config for title/description */
  config: VoucherTypeConfig;
  /** Voucher date */
  date: string;
  /** Called when date changes */
  onDateChange: (date: string) => void;
  /** Reference number */
  reference?: string;
  /** Called when reference changes */
  onReferenceChange?: (ref: string) => void;
  /** Main body content (the voucher-specific form) */
  children: React.ReactNode;
  /** Narration text */
  narration?: string;
  /** Called when narration changes */
  onNarrationChange?: (text: string) => void;
  /** Save/submit handler */
  onSave: () => void;
  /** Reset handler */
  onReset?: () => void;
  /** Whether currently submitting */
  isSubmitting?: boolean;
  /** Error message to display */
  error?: string;
  /** Whether this is an edit (vs create) */
  isEditing?: boolean;
  /** Voucher number (for edit display) */
  voucherNumber?: string;
  /** Suggested voucher number for new */
  suggestedVoucherNumber?: string;
  /** Callback for custom voucher number */
  onVoucherNumberChange?: (v: string) => void;
  /** Save as template handler (called back by VoucherTemplateModal with name/frequency) */
  onSaveAsTemplate?: (name: string, frequency: string) => Promise<void>;
  /** Footer extras (ledger summary, tax summary) */
  footerExtra?: React.ReactNode;
}

export default function VoucherLayout({
  config,
  date,
  onDateChange,
  reference,
  onReferenceChange,
  children,
  narration,
  onNarrationChange,
  onSave,
  onReset,
  isSubmitting = false,
  error,
  isEditing = false,
  voucherNumber,
  suggestedVoucherNumber,
  onVoucherNumberChange,
  onSaveAsTemplate,
  footerExtra,
}: VoucherLayoutProps) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-5 space-y-5">
      {/* ── Header: Title + Reference + Date ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-[#f1f5f9] leading-tight">
                {config.label}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-[#64748b]">{config.description}</p>
            </div>
            {/* Voucher number badge */}
            {(voucherNumber || suggestedVoucherNumber) && (
              <span className="shrink-0 rounded-md bg-slate-100 dark:bg-[#282832] px-2.5 py-1 text-xs font-mono font-semibold text-slate-700 dark:text-[#cbd5e1]">
                {voucherNumber || suggestedVoucherNumber}
              </span>
            )}
          </div>
          {suggestedVoucherNumber && onVoucherNumberChange && !voucherNumber && (
            <div className="mt-2" data-field="voucher_number">
              <input
                value={suggestedVoucherNumber}
                onChange={(e) => onVoucherNumberChange(e.target.value)}
                placeholder="Voucher number"
                className="block w-full max-w-[220px] rounded-lg border border-slate-300 dark:border-[#3a3a45] px-3 py-1.5 text-xs bg-white dark:bg-[#1a1a24] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
              />
            </div>
          )}
        </div>
        <div className="flex items-end gap-3 shrink-0">
          {config.showReference && onReferenceChange && (
            <div data-field="reference" className="dark:focus:border-blue-500 dark:focus:ring-blue-500/20">
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
                {config.referenceLabel}
              </label>
              <input
                value={reference ?? ""}
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

      {/* ── Main body (voucher-specific form) ── */}
      {children}

      {/* ── Footer extra (ledger summary, tax summary) ── */}
      {footerExtra && <div>{footerExtra}</div>}

      {/* ── Narration ── */}
      {onNarrationChange && (
        <div data-field="narration">
          <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
            Narration
          </label>
          <textarea
            value={narration ?? ""}
            onChange={(e) => onNarrationChange(e.target.value)}
            placeholder="Remarks or description"
            rows={3}
            className="block w-full rounded-lg border border-slate-300 dark:border-[#3a3a45] px-3 py-2 text-sm bg-white dark:bg-[#1a1a24] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 resize-none transition-all"
          />
        </div>
      )}

      {/* ── Error display ── */}
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>
      )}

      {/* ── Action buttons ── */}
      <div className="flex items-center gap-3 pt-1">
        <Button
          variant="primary"
          onClick={onSave}
          disabled={isSubmitting}
          className="w-full sm:w-auto px-5 py-2 text-sm"
        >
          {isSubmitting ? "Saving..." : isEditing ? "Update" : "Save"}
        </Button>
        {onReset && (
          <Button
            variant="secondary"
            onClick={onReset}
            disabled={isSubmitting}
            className="px-5 py-2 text-sm"
          >
            Reset
          </Button>
        )}
        {onSaveAsTemplate && (
          <Button
            variant="secondary"
            onClick={() => showTemplateModal(config.id, onSaveAsTemplate)}
            disabled={isSubmitting}
            className="px-5 py-2 text-sm"
          >
            Save as Template
          </Button>
        )}
      </div>

      {/* ── Template modal (renders portal) ── */}
      <VoucherTemplateModal />
    </div>
  );
}
