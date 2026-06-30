import { INDIAN_STATES } from "./IndianStates";
import Select from "./Select";

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
  const stateOptions = [
    { value: "", label: placeholder },
    ...INDIAN_STATES.map((s) => ({ value: s.code, label: s.name })),
  ];

  return (
    <div>
      <Select
        value={value}
        onChange={(v) => onChange(v)}
        options={stateOptions}
        label={!hideLabel ? label : undefined}
        required={required}
        className={className}
      />
    </div>
  );
}
