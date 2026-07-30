import type { Ledger, LedgerGroupType } from "../types";
import { getLedgerGroupType } from "../types";

export interface LedgerWithType extends Ledger {
  groupType: LedgerGroupType;
}

export interface ClassifiedLedgers {
  all: LedgerWithType[];
  cashBank: LedgerWithType[];
  parties: LedgerWithType[];
  customers: LedgerWithType[];
  suppliers: LedgerWithType[];
  expenses: LedgerWithType[];
  incomes: LedgerWithType[];
  assets: LedgerWithType[];
  liabilities: LedgerWithType[];
}

export function classifyLedgers(
  ledgers: Ledger[],
  groupCodeMap: Map<string, string>,
): ClassifiedLedgers {
  const withType: LedgerWithType[] = ledgers.map((l) => ({
    ...l,
    groupType: getLedgerGroupType(groupCodeMap.get(l.group_id) ?? null),
  }));

  const cashBank = withType.filter(
    (l) => l.groupType === "cash" || l.groupType === "bank",
  );
  const parties = withType.filter(
    (l) => l.groupType === "sundry_debtors" || l.groupType === "sundry_creditors",
  );
  const customers = withType.filter((l) => l.groupType === "sundry_debtors");
  const suppliers = withType.filter((l) => l.groupType === "sundry_creditors");
  const expenses = withType.filter((l) => l.groupType === "expense");
  const incomes = withType.filter((l) => l.groupType === "income");
  const assets = withType.filter((l) => l.groupType === "asset");
  const liabilities = withType.filter((l) => l.groupType === "liability");

  return {
    all: withType,
    cashBank,
    parties,
    customers,
    suppliers,
    expenses,
    incomes,
    assets,
    liabilities,
  };
}

/**
 * Filter ledgers by allowed group types.
 * Pass empty array to return all ledgers.
 */
export function filterLedgersByGroupType(
  ledgers: LedgerWithType[],
  allowed: LedgerGroupType[],
): LedgerWithType[] {
  if (allowed.length === 0) return ledgers;
  const set = new Set(allowed);
  return ledgers.filter((l) => set.has(l.groupType));
}

export const LEDGER_GROUP_COLORS: Record<LedgerGroupType, string> = {
  cash: "text-lime-600 dark:text-lime-400",
  bank: "text-blue-600 dark:text-blue-400",
  sundry_debtors: "text-emerald-600 dark:text-emerald-400",
  sundry_creditors: "text-rose-600 dark:text-rose-400",
  income: "text-green-600 dark:text-green-400",
  expense: "text-orange-600 dark:text-orange-400",
  asset: "text-purple-600 dark:text-purple-400",
  liability: "text-yellow-600 dark:text-yellow-400",
  capital: "text-indigo-600 dark:text-indigo-400",
  tax: "text-red-600 dark:text-red-400",
  other: "text-slate-500 dark:text-slate-400",
};
