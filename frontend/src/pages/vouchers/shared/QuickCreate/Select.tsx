import { useState } from "react";
import type { EntityKey } from "./configs";
import QuickCreateModal from "./Modal";

interface QuickCreateSelectProps {
  entityKey: EntityKey;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
  className?: string;
  /** Called with the newly created item so the parent can update its list */
  onItemCreated?: (item: any) => void;
}

export default function QuickCreateSelect({
  entityKey,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  onItemCreated,
}: QuickCreateSelectProps) {
  const [showModal, setShowModal] = useState(false);

  const handleCreated = (item: any) => {
    if (onItemCreated) {
      onItemCreated(item);
    }
    onChange(item.id);
    setShowModal(false);
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={className || "block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          title={`Create new ${entityKey.replace("_", " ")}`}
          className="flex-shrink-0 rounded-md border border-dashed border-slate-300 px-1.5 py-1.5 text-sm font-bold text-slate-400 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50"
        >
          +
        </button>
      </div>
      {showModal && (
        <QuickCreateModal
          entityKey={entityKey}
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
