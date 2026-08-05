/**
 * BillSelector Component
 * 
 * Loads and displays outstanding bills for a selected party.
 * Used in Receipt and Payment forms to select bills for settlement.
 * 
 * Features:
 * - Fetches outstanding bills from API
 * - Passes allocations to parent
 * - Shows loading and error states
 * - Integrates with OutstandingBillsTable
 */

import { useEffect, useState } from "react";
import { getOutstandingBills, type OutstandingBillsResponse } from "../../api/bills";
import OutstandingBillsTable from "./OutstandingBillsTable";

interface BillAllocation {
  bill_reference_id: string;
  amount: number;
  remarks?: string;
}

interface BillSelectorProps {
  partyId: string | null;
  voucherType: "sales" | "purchase";
  allocations: BillAllocation[];
  onChange: (allocations: BillAllocation[]) => void;
  maxTotalAmount?: number;
  readonly?: boolean;
}

export default function BillSelector({
  partyId,
  voucherType,
  allocations,
  onChange,
  maxTotalAmount,
  readonly = false,
}: BillSelectorProps) {
  const [data, setData] = useState<OutstandingBillsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!partyId) {
      setData(null);
      setError(null);
      return;
    }

    const fetchBills = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await getOutstandingBills(partyId, voucherType);
        setData(response);
      } catch (err: any) {
        setError(err?.message || "Failed to load outstanding bills");
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchBills();
  }, [partyId, voucherType]);

  if (!partyId) {
    return (
      <div className="text-center py-4 text-slate-500 dark:text-[#94a3b8] text-sm">
        Select a party to view outstanding bills
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
        <div className="mt-2 text-sm text-slate-600 dark:text-[#cbd5e1]">Loading outstanding bills...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-4 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/10 p-3 rounded border border-red-100 dark:border-red-900/20">
        {error}
      </div>
    );
  }

  if (!data || data.bills.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500 dark:text-[#94a3b8] text-sm">
        <div className="text-lg mb-2">✓</div>
        <div>No outstanding bills for {data?.party_name || "this party"}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Party Info */}
      <div className="flex justify-between items-center">
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">
            Outstanding Bills - {data.party_name}
          </h4>
          <div className="text-xs text-slate-500 dark:text-[#94a3b8] mt-1">
            {data.bills.length} bill{data.bills.length !== 1 ? "s" : ""} • Total: ₹
            {data.total_outstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            {data.max_days_overdue > 0 && (
              <span className="ml-2 text-red-600 dark:text-red-400">
                • Oldest: {data.max_days_overdue} days overdue
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bills Table */}
      <OutstandingBillsTable
        bills={data.bills}
        allocations={allocations}
        onChange={onChange}
        maxTotalAmount={maxTotalAmount}
        readonly={readonly}
      />
    </div>
  );
}

export type { BillAllocation };
