interface PaymentDetailsPanelProps {
  /** The selected cash/bank ledger ID */
  ledgerId?: string;
  /** Ledger name for display */
  ledgerName?: string;
  /** Current payment mode */
  paymentMode?: string;
  /** Called when payment mode changes */
  onPaymentModeChange?: (mode: string) => void;
  /** Reference number (cheque/UTR) */
  referenceNumber?: string;
  /** Called when reference number changes */
  onReferenceChange?: (ref: string) => void;
}

const PAYMENT_MODES = [
  "Cash",
  "Cheque",
  "Bank Transfer",
  "UPI",
  "RTGS",
  "NEFT",
  "DD",
  "Card",
] as const;

export default function PaymentDetailsPanel({
  ledgerId,
  ledgerName,
  paymentMode,
  onPaymentModeChange,
  referenceNumber,
  onReferenceChange,
}: PaymentDetailsPanelProps) {
  if (!ledgerId) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4">
        <p className="text-sm text-slate-500 dark:text-slate-400 italic">
          Select a cash/bank account to see payment details
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3">
      {/* Header */}
      <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider">
        Payment Details
      </h3>

      {/* Ledger name row */}
      {ledgerName && (
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 text-slate-500 dark:text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
            />
          </svg>
          <span className="text-sm font-medium text-slate-800 dark:text-[#f1f5f9]">
            {ledgerName}
          </span>
        </div>
      )}

      {/* Payment mode */}
      <div>
        <label
          htmlFor="payment-mode"
          className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8] mb-1"
        >
          Payment Mode
        </label>
        <select
          id="payment-mode"
          value={paymentMode ?? ""}
          onChange={(e) => onPaymentModeChange?.(e.target.value)}
          className="w-full rounded-lg border border-slate-300 dark:border-[#3a3a45] px-3 py-2 text-sm bg-white dark:bg-[#1a1a24] text-slate-800 dark:text-[#f1f5f9]"
        >
          <option value="" disabled>
            Select mode
          </option>
          {PAYMENT_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </div>

      {/* Reference number */}
      <div>
        <label
          htmlFor="reference-number"
          className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8] mb-1"
        >
          Reference No. (Cheque/UTR)
        </label>
        <input
          id="reference-number"
          type="text"
          value={referenceNumber ?? ""}
          onChange={(e) => onReferenceChange?.(e.target.value)}
          placeholder="Enter cheque number or UTR"
          className="w-full rounded-lg border border-slate-300 dark:border-[#3a3a45] px-3 py-2 text-sm bg-white dark:bg-[#1a1a24] text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-slate-500"
        />
      </div>

      {/* Note */}
      <p className="text-xs text-slate-500 dark:text-slate-400 italic">
        Transaction will be recorded against this bank/cash account
      </p>
    </div>
  );
}
