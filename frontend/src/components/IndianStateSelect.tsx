import { INDIAN_STATES } from "./IndianStates";

interface IndianStateSelectProps {
  value: string;
  onChange: (stateCode: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
  required?: boolean;
  /** Hide the label (useful when label is provided elsewhere) */
  hideLabel?: boolean;
}

/**
 * Reusable Indian state dropdown for GST compliance.
 * Displays full state names; stores 2-digit GST state code internally.
 * Used across Company creation, Party master, and any form needing state selection.
 */
export default function IndianStateSelect({
  value,
  onChange,
  placeholder = "Select state...",
  className = "",
  label = "State",
  required = false,
  hideLabel = false,
}: IndianStateSelectProps) {
  return (
    <div>
      {!hideLabel && (
        <label className="block text-[11px] font-medium text-slate-500">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-0.5 block w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${className}`}
      >
        <option value="">{placeholder}</option>
        {INDIAN_STATES.map((s) => (
          <option key={s.code} value={s.code}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}
