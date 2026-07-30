import { useMemo, useEffect } from "react";
import type { Ledger, LedgerGroupType } from "../types";
import { getLedgerGroupType, ledgerGroupTypeLabel } from "../types";
import MasterSelector from "../../../components/master/MasterSelector";
import { LEDGER_GROUP_COLORS } from "./ledgerUtils";

interface LedgerSelectorProps {
  /** Selected ledger ID */
  value: string;
  /** Called when ledger changes */
  onChange: (ledgerId: string) => void;
  /** All available ledgers */
  ledgers: Ledger[];
  /** Map of group_id -> system_code */
  groupCodeMap: Map<string, string>;
  /** Optional filter: only show ledgers matching these group types */
  allowedGroups?: LedgerGroupType[];
  /** Label text */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Hint shown below */
  hint?: string;
  /** Whether this field is required */
  required?: boolean;
  /** Called when the selected ledger type is detected */
  onTypeDetect?: (type: LedgerGroupType | null) => void;
  onQuickCreate?: (entityKey: string, item: unknown) => void;
  createdFrom?: string;
}

export default function LedgerSelector({
  value,
  onChange,
  ledgers,
  groupCodeMap,
  allowedGroups,
  label = "Ledger",
  placeholder = "Select ledger...",
  hint,
  required = false,
  onTypeDetect,
  onQuickCreate,
  createdFrom,
}: LedgerSelectorProps) {
  const ledgersWithType = useMemo(() => {
    return ledgers.map((l) => ({
      ...l,
      groupType: getLedgerGroupType(groupCodeMap.get(l.group_id) ?? null),
    }));
  }, [ledgers, groupCodeMap]);

  const filteredLedgers = useMemo(() => {
    if (!allowedGroups || allowedGroups.length === 0) return ledgersWithType;
    const allowed = new Set(allowedGroups);
    return ledgersWithType.filter((l) => allowed.has(l.groupType));
  }, [ledgersWithType, allowedGroups]);

  const options = useMemo(() => {
    return filteredLedgers.map((l) => ({
      value: l.id,
      label: `${l.name} (${ledgerGroupTypeLabel(l.groupType)})`,
    }));
  }, [filteredLedgers]);

  const selectedLedger = useMemo(
    () => ledgersWithType.find((l) => l.id === value) ?? null,
    [ledgersWithType, value],
  );

  const groupType = selectedLedger?.groupType ?? null;

  useEffect(() => {
    onTypeDetect?.(groupType);
  }, [groupType, onTypeDetect]);

  const colorClass = groupType ? LEDGER_GROUP_COLORS[groupType] : "";

  return (
    <div>
      {label && (
        <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <MasterSelector
          entityKey="ledger"
          value={value}
          onChange={onChange}
          options={options}
          placeholder={placeholder}
          className="w-full text-sm font-medium text-slate-800 dark:text-[#f1f5f9]"
          createdFrom={createdFrom}
          onItemCreated={
            onQuickCreate
              ? (item: unknown) => onQuickCreate("ledger", item)
              : undefined
          }
        />
        {groupType && (
          <div className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 z-10">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${colorClass} bg-slate-100 dark:bg-[#282832]`}
            >
              {ledgerGroupTypeLabel(groupType)}
            </span>
          </div>
        )}
      </div>
      {hint && (
        <p className="mt-1 text-xs text-slate-500 dark:text-[#64748b]">
          {hint}
        </p>
      )}
    </div>
  );
}
