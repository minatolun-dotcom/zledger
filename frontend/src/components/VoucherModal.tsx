import { useRef } from "react";
import type { ReactNode } from "react";
import type { FinancialYear } from "../pages/vouchers/shared/fyValidation";
import ItemVoucherForm from "../pages/vouchers/forms/ItemVoucherForm";
import AmountVoucherForm from "../pages/vouchers/forms/AmountVoucherForm";
import JournalForm from "../pages/vouchers/forms/JournalForm";
import PdfPreviewModal from "./PdfPreviewModal";
import type { Voucher } from "../pages/vouchers/types";

const ITEM_TYPES = new Set(["sales", "purchase", "credit_note", "debit_note"]);
const AMOUNT_TYPES = new Set(["payment", "receipt", "contra"]);

export interface VoucherModalProps {
  voucher: Voucher | null;
  isSubmitting: boolean;
  ledgers: unknown[];
  parties: unknown[];
  stockItems: unknown[];
  accountGroups: unknown[];
  onSubmit: (payload: unknown) => Promise<void>;
  onUpdate?: (id: string, payload: unknown) => Promise<void>;
  onDuplicate?: () => void;
  onCreateSimilar?: () => void;
  onDelete?: () => void;
  onClose: () => void;
  /** Optional attachments panel (only the Vouchers page shows it). */
  attachments?: ReactNode;
  /** Render the Preview/Print PDF action buttons (omit for pages without PDF). */
  showPdfActions?: boolean;
  /** Opens the in-app PDF preview (sets previewUrl in the parent). */
  onPreviewPdf?: () => void;
  /** Triggers a browser download of the voucher PDF. */
  onPrintPdf?: () => void;
  previewUrl?: string | null;
  previewTitle?: string;
  onPreviewClose?: () => void;
  financialYears?: FinancialYear[];
  setActiveFy?: (id: string | null) => void;
}

/**
 * Shared voucher create/edit modal. Renders the correct form
 * (Item / Amount / Journal) based on the voucher type and exposes the
 * Duplicate / Delete / Close / PDF actions. The attachments panel is an
 * optional slot so consumers that don't support attachments can omit it.
 */
export default function VoucherModal({
  voucher,
  isSubmitting,
  ledgers,
  parties,
  stockItems,
  accountGroups,
  onSubmit,
  onUpdate,
  onDuplicate,
  onCreateSimilar,
  onDelete,
  onClose,
  attachments,
  showPdfActions = false,
  onPreviewPdf,
  onPrintPdf,
  previewUrl,
  previewTitle,
  onPreviewClose,
  financialYears,
  setActiveFy,
}: VoucherModalProps) {
  if (!voucher) return null;

  const formContainerRef = useRef<HTMLDivElement>(null);

  const sharedProps = {
    ledgers: ledgers as never,
    parties: parties as never,
    stockItems: stockItems as never,
    accountGroups: accountGroups as never,
    onSubmit,
    isSubmitting,
    error: "",
    setError: () => {},
    editingVoucher: voucher,
    onUpdate: voucher.id ? onUpdate : undefined,
    formScopeRef: formContainerRef,
    financialYears,
    setActiveFy,
  };

  const vt = voucher.voucher_type;
  const renderForm = () => {
    if (ITEM_TYPES.has(vt)) {
      return <ItemVoucherForm key={voucher.id || "new"} voucherType={vt} {...sharedProps} />;
    }
    if (AMOUNT_TYPES.has(vt)) {
      return <AmountVoucherForm key={voucher.id || "new"} voucherType={vt} {...sharedProps} />;
    }
    return <JournalForm key={voucher.id || "new"} {...sharedProps} />;
  };

  return (
    <div
      role="dialog"
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-4xl rounded-xl bg-white dark:bg-[#16161f] shadow-2xl">
        {/* Header — actions only (title is in VoucherHeader) */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] px-5 py-3">
          <div className="flex items-center gap-2">
            {voucher.id && (
              <span className="text-xs font-medium text-slate-500 dark:text-[#64748b]">
                {voucher.voucher_number}
              </span>
            )}
            {!voucher.id && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Pre-filled from original — edit and save as new
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {voucher.id && onDuplicate && (
              <button
                onClick={onDuplicate}
                className="rounded border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
              >
                Duplicate
              </button>
            )}
            {voucher.id && onCreateSimilar && (
              <button
                onClick={onCreateSimilar}
                className="rounded border border-brand-300 dark:border-blue-500/30 px-2.5 py-1 text-xs font-medium text-brand-700 dark:text-blue-400 hover:bg-brand-50 dark:hover:bg-blue-500/10"
              >
                Create Similar
              </button>
            )}
            {voucher.id && onDelete && (
              <button
                onClick={onDelete}
                className="rounded border border-red-200 dark:border-red-500/20 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                Delete
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
            >
              Close
            </button>
            {voucher.id && showPdfActions && (
              <>
                <button
                  onClick={onPreviewPdf}
                  className="rounded border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
                >
                  Preview PDF
                </button>
                <button
                  onClick={onPrintPdf}
                  className="rounded border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
                >
                  Print PDF
                </button>
              </>
            )}
          </div>
        </div>

        {/* Form */}
        <div ref={formContainerRef} className="p-5">{renderForm()}</div>

        {/* Attachments (optional slot) */}
        {attachments}
      </div>

      {previewUrl && previewTitle && onPreviewClose && (
        <PdfPreviewModal url={previewUrl} title={previewTitle} onClose={onPreviewClose} />
      )}
    </div>
  );
}
