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

const MONEY_FLOW_DIRECTION: Record<string, boolean> = {
  sales: true,
  purchase: false,
  credit_note: false,
  debit_note: true,
  payment: false,
  receipt: true,
};

function Node({ label, sublabel, icon, color }: { label: string; sublabel?: string; icon: string; color: string }) {
  const colorMap: Record<string, { bg: string; text: string; border: string; iconBg: string }> = {
    blue:   { bg: "bg-blue-50 dark:bg-blue-500/10",   text: "text-blue-700 dark:text-blue-400",   border: "border-blue-200 dark:border-blue-500/30", iconBg: "bg-blue-100 dark:bg-blue-500/20" },
    green:  { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-500/30", iconBg: "bg-emerald-100 dark:bg-emerald-500/20" },
    amber:  { bg: "bg-amber-50 dark:bg-amber-500/10",  text: "text-amber-700 dark:text-amber-400",  border: "border-amber-200 dark:border-amber-500/30", iconBg: "bg-amber-100 dark:bg-amber-500/20" },
    slate:  { bg: "bg-slate-100 dark:bg-[#1a1a24]",    text: "text-slate-700 dark:text-[#94a3b8]",  border: "border-slate-200 dark:border-[#282832]", iconBg: "bg-slate-200 dark:bg-[#282832]" },
  };
  const c = colorMap[color] || colorMap.slate;
  return (
    <span className={`inline-flex items-center gap-2 rounded-lg border ${c.border} ${c.bg} px-3 py-1.5 max-w-[200px]`}>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${c.iconBg} text-xs`}>{icon}</span>
      <span className="min-w-0">
        <span className={`text-xs font-semibold ${c.text} truncate block`}>{label}</span>
        {sublabel && <span className="text-[10px] text-slate-400 dark:text-[#64748b]">{sublabel}</span>}
      </span>
    </span>
  );
}

function Arrow({ down }: { down?: boolean }) {
  if (down) {
    return (
      <svg className="h-5 w-4 shrink-0 text-slate-300 dark:text-[#475569]" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 18m0 0l7.5-7.5M12 18V3" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-5 shrink-0 text-slate-300 dark:text-[#475569]" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

function AmountPill({ amount, direction }: { amount: number; direction?: "in" | "out" }) {
  if (amount <= 0) return null;
  const color = direction === "in"
    ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30"
    : direction === "out"
    ? "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/30"
    : "bg-slate-100 dark:bg-[#282832] text-slate-700 dark:text-[#cbd5e1] border-slate-200 dark:border-[#333340]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold tabular-nums ${color}`}>
      {direction === "in" ? "↗" : direction === "out" ? "↘" : ""} ₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
    </span>
  );
}

function getLedgerColor(ledger: Ledger | undefined): "blue" | "green" | "amber" | "slate" {
  if (!ledger) return "slate";
  const name = (ledger.name || "").toLowerCase();
  if (name.includes("bank") || name.includes("cash")) return "blue";
  if (name.includes("sales") || name.includes("revenue") || name.includes("income")) return "green";
  if (name.includes("purchase") || name.includes("expense") || name.includes("salary")) return "amber";
  return "slate";
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
  debitLines = [],
  creditLines = [],
  vertical = false,
}: TransactionFlowProps) {
  const isAmountType = ["payment", "receipt", "contra"].includes(voucherType);
  const isItemType = ["sales", "purchase", "credit_note", "debit_note"].includes(voucherType);
  const isJournal = voucherType === "journal";
  const moneyFlowsIn = MONEY_FLOW_DIRECTION[voucherType] ?? true;

  const fromLedger = useMemo(() => ledgers.find((l) => l.id === fromLedgerId), [ledgers, fromLedgerId]);
  const toLedger = useMemo(() => ledgers.find((l) => l.id === toLedgerId), [ledgers, toLedgerId]);

  const showAmount = amount > 0 && (isAmountType || isItemType);

  const layoutClass = vertical ? "flex flex-col items-center gap-1 py-1" : "flex items-center justify-center gap-2 flex-wrap py-1";
  const arrowDir = vertical ? true : undefined;

  // Item voucher with Dr/Cr entries: Show accounting impact in user-friendly format
  if (isItemType && (debitLines.length > 0 || creditLines.length > 0)) {
    return (
      <div className="space-y-3 text-xs">
        {/* Header */}
        <div className="text-[10px] font-semibold text-slate-500 dark:text-[#94a3b8] uppercase tracking-wide">
          Transaction Impact
        </div>
        
        {/* Debit entries - Money Coming In / Asset Increase */}
        {debitLines.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
              <span>↗</span>
              <span>Receiving / Increase</span>
            </div>
            {debitLines.map((line, i) => {
              const ledger = ledgers.find(l => l.id === line.ledger_id);
              return (
                <div key={`dr-${i}`} className="flex items-center justify-between gap-2 py-1 pl-4 bg-green-50/50 dark:bg-green-900/10 rounded border-l-2 border-green-500 dark:border-green-400">
                  <span className="text-slate-700 dark:text-[#cbd5e1] font-medium truncate flex-1">
                    {ledger?.name || "Customer Account"}
                  </span>
                  <span className="font-mono text-green-700 dark:text-green-400 font-semibold tabular-nums text-sm">
                    +₹{line.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        
        {/* Credit entries - Money Going Out / Income/Liability Increase */}
        {creditLines.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1">
              <span>↙</span>
              <span>Giving / Earning</span>
            </div>
            {creditLines.map((line, i) => {
              const ledger = ledgers.find(l => l.id === line.ledger_id);
              return (
                <div key={`cr-${i}`} className="flex items-center justify-between gap-2 py-1 pl-4 bg-blue-50/50 dark:bg-blue-900/10 rounded border-l-2 border-blue-500 dark:border-blue-400">
                  <span className="text-slate-700 dark:text-[#cbd5e1] font-medium truncate flex-1">
                    {ledger?.name || "Sales Account"}
                  </span>
                  <span className="font-mono text-blue-700 dark:text-blue-400 font-semibold tabular-nums text-sm">
                    ₹{line.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        
        {/* Balance indicator */}
        <div className="pt-2 border-t border-slate-200 dark:border-[#282832]">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500 dark:text-[#94a3b8]">
              {voucherType === "sales" || voucherType === "credit_note" 
                ? "Customer owes you" 
                : voucherType === "purchase" || voucherType === "debit_note"
                ? "You owe supplier"
                : "Transaction balanced"}
            </span>
            {amount > 0 && (
              <span className="font-mono font-semibold text-slate-700 dark:text-[#cbd5e1]">
                ₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  // Item voucher: Fallback to simple Party ↔ Bank display
  if (isItemType && partyName && fromLedger) {
    const leftLabel = moneyFlowsIn ? partyName : fromLedger.name;
    const leftSub = moneyFlowsIn ? (voucherType === "purchase" || voucherType === "debit_note" ? "Supplier" : "Customer") : "Bank/Cash";
    const leftIcon = moneyFlowsIn ? "👤" : "🏦";
    const rightLabel = moneyFlowsIn ? fromLedger.name : partyName;
    const rightSub = moneyFlowsIn ? "Bank/Cash" : (voucherType === "purchase" || voucherType === "debit_note" ? "Supplier" : "Customer");
    const rightIcon = moneyFlowsIn ? "🏦" : "👤";
    return (
      <div className={layoutClass}>
        <Node label={leftLabel} sublabel={leftSub} icon={leftIcon} color={moneyFlowsIn ? "green" : "blue"} />
        <Arrow down={arrowDir} />
        {showAmount && <AmountPill amount={amount} direction={moneyFlowsIn ? "in" : "out"} />}
        {showAmount && <Arrow down={arrowDir} />}
        <Node label={rightLabel} sublabel={rightSub} icon={rightIcon} color={moneyFlowsIn ? "blue" : "green"} />
      </div>
    );
  }

  // Amount voucher: From → To
  if (isAmountType && fromLedger && toLedger) {
    const dir = moneyFlowsIn ? "in" : "out";
    const fromIcon = VOUCHER_ICONS[voucherType] || "📤";
    const toIcon = VOUCHER_ICONS[voucherType] || "📥";
    return (
      <div className={layoutClass}>
        <Node label={fromLedger.name} sublabel={fromLabel} icon={fromIcon} color={getLedgerColor(fromLedger)} />
        <Arrow down={arrowDir} />
        {showAmount && <AmountPill amount={amount} direction={dir} />}
        {showAmount && <Arrow down={arrowDir} />}
        <Node label={toLedger.name} sublabel={toLabel} icon={toIcon} color={getLedgerColor(toLedger)} />
      </div>
    );
  }

  // Journal: Debit ↔ Credit
  if (isJournal && debitLines.length > 0 && creditLines.length > 0) {
    const debitLedger = ledgers.find((l) => l.id === debitLines[0].ledger_id);
    const creditLedger = ledgers.find((l) => l.id === creditLines[0].ledger_id);
    return (
      <div className={layoutClass}>
        <Node label={debitLedger?.name || "Debit"} sublabel="Dr" icon="📋" color="amber" />
        <Arrow down={arrowDir} />
        {showAmount && <AmountPill amount={amount} />}
        {showAmount && <Arrow down={arrowDir} />}
        <Node label={creditLedger?.name || "Credit"} sublabel="Cr" icon="📋" color="blue" />
      </div>
    );
  }

  return null;
}

const VOUCHER_ICONS: Record<string, string> = {
  sales: "📤", purchase: "📥", payment: "💸", receipt: "💰", contra: "🔄",
};
