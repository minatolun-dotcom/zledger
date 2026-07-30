/**
 * OutstandingBillsTable Component
 * 
 * Displays outstanding bills for a party with inline allocation input.
 * Used in Receipt and Payment voucher forms for bill-wise settlement.
 * 
 * Features:
 * - Shows bill details (number, date, amounts, aging)
 * - Inline allocation input per bill
 * - Real-time validation (cannot exceed outstanding)
 * - Total allocated calculation
 * - Aging bucket color coding
 */

import { useEffect, useState } from "react";
import type { OutstandingBill } from "../../api/bills";

interface BillAllocation {
  bill_reference_id: string;
  amount: number;
  remarks?: string;
}

interface OutstandingBillsTableProps {
  bills: OutstandingBill[];
  allocations: BillAllocation[];
  onChange: (allocations: BillAllocation[]) => void;
  maxTotalAmount?: number;
  readonly?: boolean;
}

export default function OutstandingBillsTable({
  bills,
  allocations,
  onChange,
  maxTotalAmount,
  readonly = false,
}: OutstandingBillsTableProps) {
  const [localAllocations, setLocalAllocations] = useState<Map<string, number>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  // Sync local state with props
  useEffect(() => {
    const map = new Map<string, number>();
    allocations.forEach((a) => map.set(a.bill_reference_id, a.amount));
    setLocalAllocations(map);
  }, [allocations]);

  const totalAllocated = Array.from(localAllocations.values()).reduce((sum, amt) => sum + amt, 0);

  const handleAllocationChange = (billId: string, value: string) => {
    const amount = parseFloat(value) || 0;
    const bill = bills.find((b) => b.bill_reference_id === billId);

    if (!bill) return;

    const newErrors = new Map(errors);

    // Validation
    if (amount < 0) {
      newErrors.set(billId, "Amount cannot be negative");
    } else if (amount > bill.outstanding_amount) {
      newErrors.set(billId, `Cannot exceed outstanding ₹${bill.outstanding_amount.toFixed(2)}`);
    } else {
      newErrors.delete(billId);
    }

    setErrors(newErrors);

    // Update local state
    const newAllocations = new Map(localAllocations);
    if (amount > 0) {
      newAllocations.set(billId, amount);
    } else {
      newAllocations.delete(billId);
    }
    setLocalAllocations(newAllocations);

    // Emit change
    const allocationArray: BillAllocation[] = [];
    newAllocations.forEach((amt, id) => {
      allocationArray.push({ bill_reference_id: id, amount: amt });
    });
    onChange(allocationArray);
  };

  const handleAllocateFull = (billId: string) => {
    const bill = bills.find((b) => b.bill_reference_id === billId);
    if (!bill) return;

    let amount = bill.outstanding_amount;

    // Check if total would exceed max
    if (maxTotalAmount) {
      const currentTotal = totalAllocated - (localAllocations.get(billId) || 0);
      const remaining = maxTotalAmount - currentTotal;
      amount = Math.min(amount, remaining);
    }

    handleAllocationChange(billId, amount.toFixed(2));
  };

  const getAgingColor = (bucket: string) => {
    switch (bucket) {
      case "Current":
        return "text-green-600 dark:text-green-400";
      case "1-30 Days":
        return "text-blue-600 dark:text-blue-400";
      case "31-60 Days":
        return "text-yellow-600 dark:text-yellow-400";
      case "61-90 Days":
        return "text-orange-600 dark:text-orange-400";
      case "90+":
        return "text-red-600 dark:text-red-400";
      default:
        return "text-slate-600 dark:text-slate-400";
    }
  };

  const totalError =
    maxTotalAmount && totalAllocated > maxTotalAmount
      ? `Total allocation (₹${totalAllocated.toFixed(2)}) exceeds payment amount (₹${maxTotalAmount.toFixed(2)})`
      : null;

  if (bills.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
        No outstanding bills found
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-[#282832]">
              <th className="text-left py-2 px-2 font-semibold text-slate-700 dark:text-[#cbd5e1]">Bill Number</th>
              <th className="text-left py-2 px-2 font-semibold text-slate-700 dark:text-[#cbd5e1]">Date</th>
              <th className="text-left py-2 px-2 font-semibold text-slate-700 dark:text-[#cbd5e1]">Due Date</th>
              <th className="text-right py-2 px-2 font-semibold text-slate-700 dark:text-[#cbd5e1]">Original</th>
              <th className="text-right py-2 px-2 font-semibold text-slate-700 dark:text-[#cbd5e1]">Paid</th>
              <th className="text-right py-2 px-2 font-semibold text-slate-700 dark:text-[#cbd5e1]">Outstanding</th>
              <th className="text-left py-2 px-2 font-semibold text-slate-700 dark:text-[#cbd5e1]">Aging</th>
              <th className="text-right py-2 px-2 font-semibold text-slate-700 dark:text-[#cbd5e1]">Allocate</th>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => {
              const allocated = localAllocations.get(bill.bill_reference_id) || 0;
              const error = errors.get(bill.bill_reference_id);

              return (
                <tr
                  key={bill.bill_reference_id}
                  className="border-b border-slate-100 dark:border-[#1a1a24] hover:bg-slate-50 dark:hover:bg-[#1a1a24]"
                >
                  <td className="py-2 px-2 font-medium text-slate-900 dark:text-[#f1f5f9]">
                    {bill.bill_number}
                  </td>
                  <td className="py-2 px-2 text-slate-600 dark:text-[#cbd5e1]">{bill.bill_date}</td>
                  <td className="py-2 px-2 text-slate-600 dark:text-[#cbd5e1]">
                    {bill.due_date || "-"}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-900 dark:text-[#f1f5f9]">
                    ₹{bill.original_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-600 dark:text-[#cbd5e1]">
                    ₹{bill.paid_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 px-2 text-right font-semibold text-slate-900 dark:text-[#f1f5f9]">
                    ₹{bill.outstanding_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 px-2">
                    <span className={`text-xs font-medium ${getAgingColor(bill.aging_bucket)}`}>
                      {bill.aging_bucket}
                      {bill.days_overdue > 0 && (
                        <span className="ml-1 text-slate-500 dark:text-slate-400">
                          ({bill.days_overdue}d)
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={bill.outstanding_amount}
                      value={allocated > 0 ? allocated : ""}
                      onChange={(e) => handleAllocationChange(bill.bill_reference_id, e.target.value)}
                      disabled={readonly}
                      placeholder="0.00"
                      className={`w-28 px-2 py-1 text-right text-sm border rounded
                        ${error
                          ? "border-red-500 dark:border-red-400"
                          : "border-slate-300 dark:border-[#282832]"
                        }
                        bg-white dark:bg-[#1a1a24]
                        text-slate-900 dark:text-[#f1f5f9]
                        focus:outline-none focus:ring-2 focus:ring-brand-500
                        disabled:opacity-50 disabled:cursor-not-allowed
                      `}
                    />
                    {error && (
                      <div className="text-xs text-red-500 dark:text-red-400 mt-1">{error}</div>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    {!readonly && (
                      <button
                        type="button"
                        onClick={() => handleAllocateFull(bill.bill_reference_id)}
                        className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        Full
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-[#282832]">
        <div className="text-sm text-slate-600 dark:text-[#cbd5e1]">
          {bills.length} bill{bills.length !== 1 ? "s" : ""} • Total Outstanding:{" "}
          <span className="font-semibold text-slate-900 dark:text-[#f1f5f9]">
            ₹{bills.reduce((sum, b) => sum + b.outstanding_amount, 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="text-sm">
          <span className="text-slate-600 dark:text-[#cbd5e1]">Total Allocated: </span>
          <span className={`font-bold ${totalError ? "text-red-600 dark:text-red-400" : "text-brand-600 dark:text-brand-400"}`}>
            ₹{totalAllocated.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
          {maxTotalAmount && (
            <span className="text-slate-500 dark:text-slate-400 ml-2">
              / ₹{maxTotalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>
      </div>

      {totalError && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 p-2 rounded border border-red-100 dark:border-red-900/20">
          {totalError}
        </div>
      )}
    </div>
  );
}
