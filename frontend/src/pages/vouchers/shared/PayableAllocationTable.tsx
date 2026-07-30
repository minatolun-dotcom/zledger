import { useEffect, useMemo, useState } from "react";
import { api } from "../../../api/client";

interface PayableLine {
  voucher_id: string;
  voucher_number: string;
  voucher_date: string;
  due_date: string | null;
  party_id: string | null;
  party_name: string | null;
  grand_total: number;
  paid_amount: number;
  unpaid_amount: number;
  days_overdue: number;
  aging_bucket: string;
}

export interface PayableAllocation {
  invoice_voucher_id: string;
  voucher_number: string;
  amount: number;
  balance_due: number;
}

interface PayableAllocationTableProps {
  /** The party's ledger ID — used to fetch outstanding bills */
  partyLedgerId: string;
  /** Party name for display */
  partyName?: string;
  /** Total payment amount entered by user */
  paymentAmount: number;
  /** Called when allocations change */
  onAllocationChange: (allocations: PayableAllocation[], advanceAmount: number) => void;
}

const fmt = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PayableAllocationTable({
  partyLedgerId,
  partyName,
  paymentAmount,
  onAllocationChange,
}: PayableAllocationTableProps) {
  const [bills, setBills] = useState<PayableLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  // Fetch outstanding bills for this party
  useEffect(() => {
    if (!partyLedgerId) {
      setBills([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<{ items: PayableLine[] }>("/payments/payables")
      .then((res) => {
        if (cancelled) return;
        // Filter bills for this party
        const partyBills = (res.items || []).filter(
          (bill) => bill.party_id === partyLedgerId && bill.unpaid_amount > 0
        );
        setBills(partyBills);
      })
      .catch(() => {
        if (!cancelled) setBills([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [partyLedgerId]);

  // Auto-allocate: fill bills sequentially up to paymentAmount
  const handleAutoAllocate = () => {
    const newAlloc: Record<string, number> = {};
    let remaining = paymentAmount;
    for (const bill of bills) {
      if (remaining <= 0) break;
      const alloc = Math.min(remaining, bill.unpaid_amount);
      newAlloc[bill.voucher_id] = Math.round(alloc * 100) / 100;
      remaining -= alloc;
    }
    setAllocations(newAlloc);
  };

  // Update allocation for a specific bill
  const updateAllocation = (voucherId: string, amount: number) => {
    setAllocations((prev) => ({
      ...prev,
      [voucherId]: Math.max(0, Math.min(amount, bills.find((b) => b.voucher_id === voucherId)?.unpaid_amount || 0)),
    }));
  };

  // Compute total allocated and advance
  const totalAllocated = useMemo(
    () => Object.values(allocations).reduce((sum, a) => sum + a, 0),
    [allocations]
  );
  const advanceAmount = Math.max(0, paymentAmount - totalAllocated);

  // Notify parent of allocation changes
  useEffect(() => {
    const allocList: PayableAllocation[] = bills
      .filter((bill) => (allocations[bill.voucher_id] || 0) > 0)
      .map((bill) => ({
        invoice_voucher_id: bill.voucher_id,
        voucher_number: bill.voucher_number,
        amount: allocations[bill.voucher_id] || 0,
        balance_due: bill.unpaid_amount - (allocations[bill.voucher_id] || 0),
      }));
    onAllocationChange(allocList, advanceAmount);
  }, [allocations, bills, advanceAmount, onAllocationChange]);

  if (!partyLedgerId) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4">
        <p className="text-sm text-slate-400 dark:text-[#64748b] italic">
          Select "Paid To" to view outstanding bills
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4">
        <p className="text-sm text-slate-400">Loading outstanding bills...</p>
      </div>
    );
  }

  if (bills.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4">
        <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider mb-2">
          Outstanding Bills
        </h3>
        <p className="text-sm text-slate-400 dark:text-[#64748b] italic">
          No outstanding bills for {partyName || "this party"}. Amount will be treated as advance payment.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider">
          Outstanding Bills
        </h3>
        <button
          type="button"
          onClick={handleAutoAllocate}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          Auto-Allocate
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-[#282832]">
              <th className="text-left py-2 px-2 font-semibold text-slate-600 dark:text-[#94a3b8]">Bill #</th>
              <th className="text-left py-2 px-2 font-semibold text-slate-600 dark:text-[#94a3b8]">Date</th>
              <th className="text-right py-2 px-2 font-semibold text-slate-600 dark:text-[#94a3b8]">Amount</th>
              <th className="text-right py-2 px-2 font-semibold text-slate-600 dark:text-[#94a3b8]">Balance Due</th>
              <th className="text-right py-2 px-2 font-semibold text-slate-600 dark:text-[#94a3b8]">Pay</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => {
              const allocAmount = allocations[bill.voucher_id] || 0;
              const remaining = bill.unpaid_amount - allocAmount;
              return (
                <tr
                  key={bill.voucher_id}
                  className="border-b border-slate-100 dark:border-[#1a1a24] hover:bg-slate-50 dark:hover:bg-[#1a1a24]"
                >
                  <td className="py-2 px-2 text-slate-900 dark:text-[#f1f5f9] font-medium">
                    {bill.voucher_number}
                  </td>
                  <td className="py-2 px-2 text-slate-600 dark:text-[#94a3b8]">
                    {bill.voucher_date}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-700 dark:text-[#cbd5e1]">
                    {fmt(bill.grand_total)}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <span className={remaining > 0 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-green-600 dark:text-green-400"}>
                      {fmt(bill.unpaid_amount)}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <input
                      type="number"
                      min={0}
                      max={bill.unpaid_amount}
                      step={0.01}
                      value={allocAmount || ""}
                      placeholder="0.00"
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateAllocation(bill.voucher_id, val);
                      }}
                      className="w-24 text-right px-2 py-1 rounded border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#1a1a24] text-slate-900 dark:text-[#f1f5f9] text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Allocation Summary */}
      <div className="flex justify-between text-xs pt-2 border-t border-slate-200 dark:border-[#282832]">
        <span className="text-slate-500 dark:text-[#64748b]">Total Allocated</span>
        <span className="font-semibold text-slate-900 dark:text-[#f1f5f9]">{fmt(totalAllocated)}</span>
      </div>
      {advanceAmount > 0 && (
        <div className="flex justify-between text-xs">
          <span className="text-slate-500 dark:text-[#64748b]">Advance (unallocated)</span>
          <span className="font-semibold text-blue-600 dark:text-blue-400">{fmt(advanceAmount)}</span>
        </div>
      )}
    </div>
  );
}
