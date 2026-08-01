import { useMemo } from "react";
import type { Ledger } from "../types";

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
          icon: voucherType === "sales" ? "📤" : "↩️",
          action: voucherType === "sales" ? "Selling to" : "Credit note for",
          party: partyName || "Customer",
          color: "text-green-600 dark:text-green-400",
          bgColor: "bg-green-50/50 dark:bg-green-900/10",
          borderColor: "border-green-500 dark:border-green-400",
        };
      
      case "purchase":
      case "debit_note":
        return {
          icon: voucherType === "purchase" ? "📥" : "↪️",
          action: voucherType === "purchase" ? "Buying from" : "Debit note for",
          party: partyName || "Supplier",
          color: "text-blue-600 dark:text-blue-400",
          bgColor: "bg-blue-50/50 dark:bg-blue-900/10",
          borderColor: "border-blue-500 dark:border-blue-400",
        };
      
      case "payment":
        return {
          icon: "💸",
          action: "Paying to",
          party: toLedger?.name || toLabel || "Party",
          detail: fromLedger ? `From ${fromLedger.name}` : fromLabel,
          color: "text-red-600 dark:text-red-400",
          bgColor: "bg-red-50/50 dark:bg-red-900/10",
          borderColor: "border-red-500 dark:border-red-400",
        };

      case "receipt":
        return {
          icon: "💰",
          action: "Receiving from",
          party: fromLedger?.name || fromLabel || "Party",
          detail: toLedger ? `To ${toLedger.name}` : toLabel,
          color: "text-green-600 dark:text-green-400",
          bgColor: "bg-green-50/50 dark:bg-green-900/10",
          borderColor: "border-green-500 dark:border-green-400",
        };

      case "contra":
        return {
          icon: "🔄",
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
          icon: "📋",
          action: "Journal Entry",
          party: "Manual adjustment",
          color: "text-slate-600 dark:text-slate-400",
          bgColor: "bg-slate-50/50 dark:bg-slate-900/10",
          borderColor: "border-slate-500 dark:border-slate-400",
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
        <div className="text-2xl flex-shrink-0">{flow.icon}</div>
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

