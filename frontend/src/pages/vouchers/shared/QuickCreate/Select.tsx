import { useState } from "react";
import type { EntityKey } from "./configs";
import QuickCreateModal from "./Modal";
import SearchableSelect from "../../../../components/SearchableSelect";

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
      <div className="flex items-center gap-1.5">
        <SearchableSelect
          value={value}
          onChange={(v) => onChange(v)}
          options={options}
          placeholder={placeholder}
          disabled={disabled}
          searchable={true}
          className={className || "block w-full rounded-md border border-slate-300 dark:border-[#252530] px-2.5 py-1.5 text-sm focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20"}
        />
        <button
          type="button"
          onClick={() => setShowModal(true)}
          title={`Create new ${entityKey.replace("_", " ")}`}
          className="flex-shrink-0 rounded-full border-2 border-brand-300 dark:border-blue-500/30 bg-brand-50/50 dark:bg-blue-500/5 px-2 py-2 text-base font-bold text-brand-600 dark:text-blue-400 hover:border-brand-400 dark:hover:border-blue-400/40 hover:bg-brand-100 dark:hover:bg-blue-500/10 transition-all"
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
