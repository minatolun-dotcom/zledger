import { useMemo } from "react";
import type { Ledger } from "../types";

interface FlowNode {
  label: string;
  sublabel?: string;
  icon: string;
  color: "blue" | "green" | "amber" | "slate" | "red";
}

interface TransactionFlowProps {
  voucherType: string;
  fromLabel?: string;
  toLabel?: string;
  fromLedgerId?: string;
  toLedgerId?: string;
  partyName?: string;
  amount?: number;
  ledgers?: Ledger[];
  debitLines?: { ledger_id: string; amount: number }[];
  creditLines?: { ledger_id: string; amount: number }[];
}

const COLOR_CLASSES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  blue: {
    bg: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-200 dark:border-blue-500/30",
    text: "text-blue-700 dark:text-blue-400",
    icon: "bg-blue-100 dark:bg-blue-500/20",
  },
  green: {
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/30",
    text: "text-emerald-700 dark:text-emerald-400",
    icon: "bg-emerald-100 dark:bg-emerald-500/20",
  },
  amber: {
    bg: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-200 dark:border-amber-500/30",
    text: "text-amber-700 dark:text-amber-400",
    icon: "bg-amber-100 dark:bg-amber-500/20",
  },
  slate: {
    bg: "bg-slate-50 dark:bg-slate-500/10",
    border: "border-slate-200 dark:border-slate-500/30",
    text: "text-slate-700 dark:text-slate-400",
    icon: "bg-slate-100 dark:bg-slate-500/20",
  },
  red: {
    bg: "bg-red-50 dark:bg-red-500/10",
    border: "border-red-200 dark:border-red-500/30",
    text: "text-red-700 dark:text-red-400",
    icon: "bg-red-100 dark:bg-red-500/20",
  },
};

const VOUCHER_FLOW_ICONS: Record<string, string> = {
  sales: "📤",
  purchase: "📥",
  payment: "💸",
  receipt: "💰",
  contra: "🔄",
  journal: "📋",
  credit_note: "↩️",
  debit_note: "↪️",
};

// Money flow direction: true = money comes IN (Party → Bank), false = money goes OUT (Bank → Party)
const MONEY_FLOW_DIRECTION: Record<string, boolean> = {
  sales: true,        // Customer pays you → money IN
  purchase: false,    // You pay supplier → money OUT
  credit_note: false, // You refund customer → money OUT
  debit_note: true,   // Supplier refunds you → money IN
  payment: false,     // You pay → money OUT
  receipt: true,      // You receive → money IN
};

function FlowCard({ node }: { node: FlowNode }) {
  const colors = COLOR_CLASSES[node.color];
  return (
    <div className={`flex items-center gap-3 rounded-xl border ${colors.border} ${colors.bg} px-4 py-3 min-w-[160px]`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors.icon} text-lg`}>
        {node.icon}
      </div>
      <div className="min-w-0">
        <div className={`text-sm font-semibold ${colors.text} truncate`}>
          {node.label}
        </div>
        {node.sublabel && (
          <div className="text-xs text-slate-500 dark:text-[#64748b] truncate">
            {node.sublabel}
          </div>
        )}
      </div>
    </div>
  );
}

function FlowArrow({ direction = "right" }: { direction?: "right" | "left" | "both" }) {
  if (direction === "both") {
    return (
      <div className="flex flex-col items-center gap-1 px-2">
        <svg className="h-4 w-6 text-slate-300 dark:text-[#475569]" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
        <svg className="h-4 w-6 text-slate-300 dark:text-[#475569] rotate-180" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex items-center px-2">
      <svg
        className={`h-5 w-8 text-slate-300 dark:text-[#475569] ${direction === "left" ? "rotate-180" : ""}`}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth="2.5"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
      </svg>
    </div>
  );
}

function AmountBadge({ amount, flowDirection }: { amount: number; flowDirection?: "in" | "out" }) {
  if (amount <= 0) return null;
  const directionLabel = flowDirection === "in" ? "Money In" : flowDirection === "out" ? "Money Out" : "Amount";
  const directionColor = flowDirection === "in"
    ? "from-emerald-600 to-emerald-700 dark:from-emerald-700 dark:to-emerald-800"
    : flowDirection === "out"
    ? "from-rose-600 to-rose-700 dark:from-rose-700 dark:to-rose-800"
    : "from-slate-800 to-slate-900 dark:from-slate-700 dark:to-slate-800";
  return (
    <div className="flex flex-col items-center px-3">
      <div className={`rounded-lg bg-gradient-to-b ${directionColor} px-4 py-2 shadow-md`}>
        <div className="text-xs text-white/70 dark:text-white/60 font-medium">{directionLabel}</div>
        <div className="text-lg font-bold text-white tabular-nums">
          ₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </div>
      </div>
    </div>
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
}: TransactionFlowProps) {
  const isAmountType = ["payment", "receipt", "contra"].includes(voucherType);
  const isItemType = ["sales", "purchase", "credit_note", "debit_note"].includes(voucherType);
  const isJournal = voucherType === "journal";

  // Money flow direction for item vouchers
  const moneyFlowsIn = MONEY_FLOW_DIRECTION[voucherType] ?? true;

  const fromLedger = useMemo(() => ledgers.find((l) => l.id === fromLedgerId), [ledgers, fromLedgerId]);
  const toLedger = useMemo(() => ledgers.find((l) => l.id === toLedgerId), [ledgers, toLedgerId]);

  // For item vouchers: Party node and Bank node
  const partyNode: FlowNode | null = useMemo(() => {
    if (isItemType && partyName) {
      const isSupplier = voucherType === "purchase" || voucherType === "debit_note";
      return {
        label: partyName,
        sublabel: isSupplier ? "Supplier" : "Customer",
        icon: "👤",
        color: "green",
      };
    }
    return null;
  }, [isItemType, partyName, voucherType]);

  const bankNode: FlowNode | null = useMemo(() => {
    if (isItemType && fromLedger) {
      return {
        label: fromLedger.name,
        sublabel: "Bank/Cash Account",
        icon: "🏦",
        color: "blue",
      };
    }
    return null;
  }, [isItemType, fromLedger]);

  // For amount vouchers
  const fromNode: FlowNode | null = useMemo(() => {
    if (isAmountType && fromLedger) {
      return {
        label: fromLedger.name,
        sublabel: fromLabel,
        icon: VOUCHER_FLOW_ICONS[voucherType] || "📤",
        color: getLedgerColor(fromLedger),
      };
    }
    if (isJournal && debitLines.length > 0) {
      const ledger = ledgers.find((l) => l.id === debitLines[0].ledger_id);
      return {
        label: ledger?.name || "Debit Account",
        sublabel: "Debit",
        icon: "📋",
        color: "amber",
      };
    }
    return null;
  }, [isAmountType, isJournal, fromLedger, voucherType, fromLabel, ledgers, debitLines]);

  const toNode: FlowNode | null = useMemo(() => {
    if (isAmountType && toLedger) {
      return {
        label: toLedger.name,
        sublabel: toLabel,
        icon: VOUCHER_FLOW_ICONS[voucherType] || "📥",
        color: getLedgerColor(toLedger),
      };
    }
    if (isJournal && creditLines.length > 0) {
      const ledger = ledgers.find((l) => l.id === creditLines[0].ledger_id);
      return {
        label: ledger?.name || "Credit Account",
        sublabel: "Credit",
        icon: "📋",
        color: "blue",
      };
    }
    return null;
  }, [isAmountType, isJournal, toLedger, voucherType, toLabel, ledgers, creditLines]);

  if (!fromNode && !toNode && !partyNode && !bankNode) return null;

  const showAmount = amount > 0 && (isAmountType || isItemType);
  const flowDirection = showAmount ? (moneyFlowsIn ? "in" as const : "out" as const) : undefined;

  // Render item voucher flow (Party ↔ Bank)
  if (isItemType && partyNode && bankNode) {
    // Money IN: Party → Bank (sales, debit_note)
    // Money OUT: Bank → Party (purchase, credit_note)
    const leftNode = moneyFlowsIn ? partyNode : bankNode;
    const rightNode = moneyFlowsIn ? bankNode : partyNode;

    return (
      <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-gradient-to-r from-slate-50 via-white to-slate-50 dark:from-[#12121a] dark:via-[#16161f] dark:to-[#12121a] p-4 shadow-sm">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <FlowCard node={leftNode} />
          <FlowArrow direction="right" />
          {showAmount && <AmountBadge amount={amount} flowDirection={flowDirection} />}
          {showAmount && <FlowArrow direction="right" />}
          <FlowCard node={rightNode} />
        </div>
      </div>
    );
  }

  // Render amount voucher flow or journal flow
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-gradient-to-r from-slate-50 via-white to-slate-50 dark:from-[#12121a] dark:via-[#16161f] dark:to-[#12121a] p-4 shadow-sm">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {fromNode && <FlowCard node={fromNode} />}

        {isJournal ? (
          <FlowArrow direction="both" />
        ) : (
          <FlowArrow direction="right" />
        )}

        {showAmount && <AmountBadge amount={amount} flowDirection={flowDirection} />}

        {showAmount && fromNode && toNode && (
          <FlowArrow direction="right" />
        )}

        {toNode && <FlowCard node={toNode} />}
      </div>
    </div>
  );
}
