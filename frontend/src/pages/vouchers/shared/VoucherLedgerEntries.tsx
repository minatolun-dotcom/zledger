import { useMemo, useCallback } from "react";
import type { LedgerEntry, Ledger, LedgerGroupType } from "../types";
import { getLedgerGroupType, ledgerGroupTypeLabel } from "../types";
import { LEDGER_GROUP_COLORS } from "./ledgerUtils";

interface VoucherLedgerEntriesProps {
  /** List of D/C entries */
  entries: LedgerEntry[];
  /** All ledgers for name resolution */
  ledgers: Ledger[];
  /** If true, entries are editable (journal-style) */
  editable?: boolean;
  /** Called when entries change (only when editable) */
  onEntriesChange?: (entries: LedgerEntry[]) => void;
  /** Map of group_id -> system_code */
  groupCodeMap?: Map<string, string>;
}

function formatCurrency(n: number): string {
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function resolveGroupTypeFromLedger(
  entry: LedgerEntry,
  ledgers: Ledger[],
  groupCodeMap?: Map<string, string>,
): LedgerGroupType {
  if (entry.group_type) return entry.group_type;
  if (!groupCodeMap) return "other";
  const ledger = ledgers.find((l) => l.id === entry.ledger_id);
  if (!ledger) return "other";
  const code = groupCodeMap.get(ledger.group_id);
  return getLedgerGroupType(code ?? null);
}

export default function VoucherLedgerEntries({
  entries,
  ledgers,
  editable = false,
  onEntriesChange,
  groupCodeMap,
}: VoucherLedgerEntriesProps) {
  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (let i = 0; i < entries.length; i++) {
      debit += entries[i].debit;
      credit += entries[i].credit;
    }
    return { totalDebit: debit, totalCredit: credit };
  }, [entries]);

  const isBalanced = Math.abs(totals.totalDebit - totals.totalCredit) < 0.001;
  const difference = Math.abs(totals.totalDebit - totals.totalCredit);

  const showGroupColumn = groupCodeMap !== undefined;

  const columnCount = 2 + (showGroupColumn ? 1 : 0) + (editable ? 1 : 0);

  const resolveLedgerName = useCallback(
    (ledgerId: string, entryName?: string): string => {
      if (entryName) return entryName;
      const ledger = ledgers.find((l) => l.id === ledgerId);
      return ledger?.name ?? ledgerId;
    },
    [ledgers],
  );

  const updateEntry = useCallback(
    (index: number, field: "debit" | "credit", value: number) => {
      if (!onEntriesChange) return;
      const updated = entries.map((entry, i) =>
        i === index ? { ...entry, [field]: value } : entry,
      );
      onEntriesChange(updated);
    },
    [entries, onEntriesChange],
  );

  const addEntry = useCallback(() => {
    if (!onEntriesChange) return;
    const newEntry: LedgerEntry = {
      ledger_id: "",
      debit: 0,
      credit: 0,
    };
    onEntriesChange([...entries, newEntry]);
  }, [entries, onEntriesChange]);

  const removeEntry = useCallback(
    (index: number) => {
      if (!onEntriesChange) return;
      if (entries.length <= 1) return;
      onEntriesChange(entries.filter((_, i) => i !== index));
    },
    [entries, onEntriesChange],
  );

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-[#12121a]">
              <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] text-left">
                Ledger Name
              </th>
              {showGroupColumn && (
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] text-left">
                  Group Type
                </th>
              )}
              <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] text-right">
                Debit
              </th>
              <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] text-right">
                Credit
              </th>
              {editable && (
                <th className="px-4 py-2.5 w-10"></th>
              )}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr className="border-t border-slate-200 dark:border-[#282832]">
                <td
                  colSpan={columnCount}
                  className="px-4 py-8 text-center text-sm text-slate-400 dark:text-[#64748b]"
                >
                  {editable
                    ? "No entries. Click \"Add Entry\" to start."
                    : "No entries to display."}
                </td>
              </tr>
            ) : (
              entries.map((entry, i) => {
                const name = resolveLedgerName(
                  entry.ledger_id,
                  entry.ledger_name,
                );
                const groupType = resolveGroupTypeFromLedger(
                  entry,
                  ledgers,
                  groupCodeMap,
                );
                const groupColor =
                  LEDGER_GROUP_COLORS[groupType] ??
                  "text-slate-500 dark:text-[#94a3b8]";

                return (
                  <tr
                    key={i}
                    className="border-t border-slate-200 dark:border-[#282832] hover:bg-slate-50 dark:hover:bg-[#282832]/40 transition-colors"
                  >
                    <td className="px-4 py-2 text-sm text-slate-700 dark:text-[#f1f5f9]">
                      {name}
                    </td>
                    {showGroupColumn && (
                      <td className="px-4 py-2 text-sm">
                        <span
                          className={`inline-flex items-center text-xs font-medium ${groupColor}`}
                        >
                          {ledgerGroupTypeLabel(groupType)}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-2 text-sm text-right tabular-nums text-slate-700 dark:text-[#f1f5f9]">
                      {editable ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={entry.debit || ""}
                          onChange={(e) =>
                            updateEntry(
                              i,
                              "debit",
                              Number(e.target.value) || 0,
                            )
                          }
                          className="w-32 rounded border border-slate-300 dark:border-[#3a3a48] bg-white dark:bg-[#16161f] px-2 py-1 text-right text-sm tabular-nums focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20"
                        />
                      ) : entry.debit > 0 ? (
                        formatCurrency(entry.debit)
                      ) : (
                        <span className="text-slate-400 dark:text-[#64748b]">
                          &mdash;
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-right tabular-nums text-slate-700 dark:text-[#f1f5f9]">
                      {editable ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={entry.credit || ""}
                          onChange={(e) =>
                            updateEntry(
                              i,
                              "credit",
                              Number(e.target.value) || 0,
                            )
                          }
                          className="w-32 rounded border border-slate-300 dark:border-[#3a3a48] bg-white dark:bg-[#16161f] px-2 py-1 text-right text-sm tabular-nums focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20"
                        />
                      ) : entry.credit > 0 ? (
                        formatCurrency(entry.credit)
                      ) : (
                        <span className="text-slate-400 dark:text-[#64748b]">
                          &mdash;
                        </span>
                      )}
                    </td>
                    {editable && (
                      <td className="px-2 py-2 text-center">
                        {entries.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeEntry(i)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            title="Remove entry"
                          >
                            &times;
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
            {/* Summary row */}
            <tr className="border-t-2 border-slate-200 dark:border-[#282832] bg-slate-50 dark:bg-[#12121a]">
              <td
                colSpan={1 + (showGroupColumn ? 1 : 0)}
                className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-[#f1f5f9]"
              >
                Total
              </td>
              <td className="px-4 py-3 text-sm text-right tabular-nums font-semibold text-slate-800 dark:text-[#f1f5f9]">
                {formatCurrency(totals.totalDebit)}
              </td>
              <td className="px-4 py-3 text-sm text-right tabular-nums font-semibold text-slate-800 dark:text-[#f1f5f9]">
                {formatCurrency(totals.totalCredit)}
              </td>
              {editable && <td className="px-4 py-3"></td>}
            </tr>
            {/* Balance indicator row */}
            {entries.length > 0 && (
              <tr className="border-t border-slate-200 dark:border-[#282832]">
                <td
                  colSpan={columnCount}
                  className="px-4 py-3"
                >
                  {isBalanced ? (
                    <span className="inline-flex items-center gap-1.5 text-green-600 dark:text-green-400 font-semibold text-sm">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      Balanced
                      <span className="text-green-500 dark:text-green-300">
                        &#10003;
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 font-semibold text-sm">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                      Unbalanced
                      <span className="text-red-500 dark:text-red-300">
                        &#10007;
                      </span>
                      <span className="font-normal text-slate-500 dark:text-[#94a3b8] ml-1">
                        Difference: {formatCurrency(difference)}
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="px-4 py-3 border-t border-slate-200 dark:border-[#282832]">
          <button
            type="button"
            onClick={addEntry}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 dark:border-[#282832] px-3 py-1.5 text-xs font-semibold text-slate-500 dark:text-[#cbd5e1] hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
          >
            <span className="text-sm leading-none">+</span>
            Add Entry
          </button>
        </div>
      )}
    </div>
  );
}
