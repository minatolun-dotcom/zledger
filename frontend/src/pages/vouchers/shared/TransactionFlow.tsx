import { useMemo } from "react";
import type { Ledger } from "../types";

/** Heroicons-style outline icon paths (strokeWidth 1.5, matching NavIcon). */
const FLOW_ICONS: Record<string, string> = {
  "arrow-up-right": "M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25",
  "arrow-down-left": "M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25",
  "arrow-uturn-left": "M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3",
  "arrow-uturn-right": "M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3",
  banknotes:
    "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v-.75A.75.75 0 014.5 3h1.5a.75.75 0 01.75.75v.75M3.75 4.5h16.5M3.75 4.5v12.75M21 4.5v12.75M12 4.5v12.75M4.5 15.75h15m-12.75 3h10.5",
  "arrows-right-left": "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
  clipboard:
    "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z",
};

function FlowIcon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  return (
    <svg className={`${className} shrink-0`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d={FLOW_ICONS[name] ?? FLOW_ICONS.clipboard} />
    </svg>
  );
}

export interface FlowData {
  voucherType: string;
  partyName?: string;
  fromLedgerId?: string;
  toLedgerId?: string;
  amount?: number;
  debitLines?: { ledger_id: string; amount: number }[];
  creditLines?: { ledger_id: string; amount: number }[];
}

interface TransactionFlowProps extends FlowData {
  ledgers?: Ledger[];
  fromLabel?: string;
  toLabel?: string;
  vertical?: boolean;
}


export default function TransactionFlow({
  voucherType,
  fromLabel,
  toLabel,
  fromLedgerId,
  toLedgerId,
  partyName,
  amount = 0,
  ledgers = [],
}: TransactionFlowProps) {
  const fromLedger = useMemo(() => ledgers.find((l) => l.id === fromLedgerId), [ledgers, fromLedgerId]);
  const toLedger = useMemo(() => ledgers.find((l) => l.id === toLedgerId), [ledgers, toLedgerId]);

  // Generate simple, human-friendly description based on voucher type
  const getFlowDescription = () => {
    switch (voucherType) {
      case "sales":
      case "credit_note":
        return {
          icon: voucherType === "sales" ? "arrow-up-right" : "arrow-uturn-left",
          action: voucherType === "sales" ? "Selling to" : "Credit note for",
          party: partyName || "Customer",
          color: "text-green-600 dark:text-green-400",
          bgColor: "bg-green-50/50 dark:bg-green-900/10",
          borderColor: "border-green-500 dark:border-green-400",
        };
      
      case "purchase":
      case "debit_note":
        return {
          icon: voucherType === "purchase" ? "arrow-down-left" : "arrow-uturn-right",
          action: voucherType === "purchase" ? "Buying from" : "Debit note for",
          party: partyName || "Supplier",
          color: "text-blue-600 dark:text-blue-400",
          bgColor: "bg-blue-50/50 dark:bg-blue-900/10",
          borderColor: "border-blue-500 dark:border-blue-400",
        };
      
      case "payment":
        return {
          icon: "banknotes",
          action: "Paying to",
          party: toLedger?.name || toLabel || "Party",
          detail: fromLedger ? `From ${fromLedger.name}` : fromLabel,
          color: "text-red-600 dark:text-red-400",
          bgColor: "bg-red-50/50 dark:bg-red-900/10",
          borderColor: "border-red-500 dark:border-red-400",
        };

      case "receipt":
        return {
          icon: "banknotes",
          action: "Receiving from",
          party: fromLedger?.name || fromLabel || "Party",
          detail: toLedger ? `To ${toLedger.name}` : toLabel,
          color: "text-green-600 dark:text-green-400",
          bgColor: "bg-green-50/50 dark:bg-green-900/10",
          borderColor: "border-green-500 dark:border-green-400",
        };

      case "contra":
        return {
          icon: "arrows-right-left",
          action: "Transferring",
          party: null,
          detail:
            fromLedger && toLedger
              ? `${fromLedger.name} → ${toLedger.name}`
              : undefined,
          color: "text-purple-600 dark:text-purple-400",
          bgColor: "bg-purple-50/50 dark:bg-purple-900/10",
          borderColor: "border-purple-500 dark:border-purple-400",
        };
      
      case "journal":
        return {
          icon: "clipboard",
          action: "Journal Entry",
          party: "Manual adjustment",
          color: "text-slate-600 dark:text-[#94a3b8]",
          bgColor: "bg-slate-50/50 dark:bg-[#1a1a24]/60",
          borderColor: "border-slate-500 dark:border-[#64748b]",
        };
      
      default:
        return null;
    }
  };

  const flow = getFlowDescription();
  if (!flow) return null;

  // Simple full-width card with icon, action, and party
  return (
    <div className={`w-full p-3 rounded-lg border-l-4 ${flow.bgColor} ${flow.borderColor}`}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 ${flow.color}`}>
          <FlowIcon name={flow.icon} />
        </div>
        <div className="flex-1 min-w-0">
          {/* Main action */}
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${flow.color}`}>
            {flow.action}
          </div>

          {/* Party name (main line) */}
          {flow.party && (
            <div className="text-sm font-semibold text-slate-800 dark:text-[#f1f5f9] truncate mt-0.5">
              {flow.party}
            </div>
          )}

          {/* Detail sub-line (From/To for payment, receipt, contra) */}
          {flow.detail && (
            <div className="text-xs text-slate-500 dark:text-[#94a3b8] mt-0.5 truncate">
              {flow.detail}
            </div>
          )}

          {/* Amount */}
          {amount > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-[#282832] flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#64748b]">Amount</span>
              <span className="font-mono font-bold text-slate-900 dark:text-[#f1f5f9] tabular-nums">
                ₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

