import Select from "../../../components/Select";

interface VoucherFooterProps {
  subtotal: number;
  discountTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  grandTotal: number;
  showItemTotals: boolean;
  roundOffTo: number | null;
  onRoundOffChange: (val: number | null) => void;
  onSave: () => void;
  isSubmitting: boolean;
  error?: string;
  isEditing?: boolean;
  onSaveAsTemplate?: () => void;
}

const ROUND_OFF_MODES = [
  { value: "", label: "None", mode: null },
  { value: "0", label: "Auto", mode: 0 },
  { value: "1", label: "Round Up", mode: 1 },
  { value: "2", label: "Round Down", mode: 2 },
];

const MODE_VALUES = [null, 0, 1, 2];

function roundOffToMode(val: number | null): number | null {
  if (val === null) return null;
  if (MODE_VALUES.includes(val)) return val;
  return 0; // backward compat: old 0.5/1 → Auto
}

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

export default function VoucherFooter({
  subtotal,
  discountTotal,
  cgstTotal,
  sgstTotal,
  igstTotal,
  grandTotal,
  showItemTotals,
  roundOffTo,
  onRoundOffChange,
  onSave,
  isSubmitting,
  error,
  isEditing,
  onSaveAsTemplate,
}: VoucherFooterProps) {
  const currencySymbol = "₹";
  const roundOffOptions = ROUND_OFF_MODES.map((opt) => ({ value: opt.value, label: opt.label }));

  return (
    <div className="mt-4">
      {/* Totals row */}
      {showItemTotals && (
        <div className="border border-[#282832] rounded-lg">
          <div className="border-t border-slate-200 dark:border-[#1a1a24] bg-gradient-to-r from-slate-50 to-slate-100 dark:from-[#1a1a24] dark:to-[#1e1e2a] px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 text-xs text-slate-500 dark:text-[#cbd5e1]">
              <span>Subtotal: <strong className="text-slate-700 dark:text-[#cbd5e1] tabular-nums">{currencySymbol}{fmt(subtotal)}</strong></span>
              {discountTotal > 0 && (
                <span>Discount: <strong className="text-red-600 tabular-nums">-{currencySymbol}{fmt(discountTotal)}</strong></span>
              )}
              {igstTotal > 0 && (
                <span>IGST: <strong className="text-slate-700 dark:text-[#cbd5e1] tabular-nums">{currencySymbol}{fmt(igstTotal)}</strong></span>
              )}
              {cgstTotal > 0 && (
                <span>CGST: <strong className="text-slate-700 dark:text-[#cbd5e1] tabular-nums">{currencySymbol}{fmt(cgstTotal)}</strong></span>
              )}
              {sgstTotal > 0 && (
                <span>SGST: <strong className="text-slate-700 dark:text-[#cbd5e1] tabular-nums">{currencySymbol}{fmt(sgstTotal)}</strong></span>
              )}
            </div>
            <div className="border-l-2 border-slate-300 dark:border-[#333340] pl-5 text-2xl font-bold text-slate-900 dark:text-[#f1f5f9] tabular-nums min-w-[160px] text-right">
              {currencySymbol}{fmt(grandTotal)}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Actions bar */}
      <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] px-5 py-3">
        {error && <span className="mr-auto text-xs text-red-600 dark:text-red-400">{error}</span>}

        {showItemTotals && (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#cbd5e1]">
            <span>Round off to</span>
            <Select
              value={String(roundOffToMode(roundOffTo) ?? "")}
              onChange={(v) => onRoundOffChange(v ? Number(v) : null)}
              options={roundOffOptions}
              className="w-28"
            />
          </div>
        )}

        {onSaveAsTemplate && (
          <button
            type="button"
            onClick={onSaveAsTemplate}
            disabled={isSubmitting}
            className="rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#16161f] px-4 py-2 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1a1a24] disabled:opacity-50 transition-all"
          >
            Save as Template
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={isSubmitting}
          className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 dark:from-blue-500 dark:to-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-md hover:shadow-lg hover:from-brand-700 hover:to-brand-800 dark:hover:from-blue-600 dark:hover:to-blue-700 disabled:opacity-50 transition-all"
        >
          {isSubmitting ? (isEditing ? "Updating..." : "Saving...") : isEditing ? "Update" : "Save"}
        </button>
      </div>
    </div>
  );
}
