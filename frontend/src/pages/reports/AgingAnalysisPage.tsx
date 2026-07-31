import { useState, useEffect } from "react";
import { listBillReferences, type BillReference } from "../../api/bills";
import { useToastStore } from "../../store/toast";
import { api } from "../../api/client";

interface Party {
  id: string;
  name: string;
  group_name: string;
}

interface AgingBucket {
  bucket: string;
  count: number;
  amount: number;
  percentage: number;
}

interface AgingData {
  type: "receivable" | "payable";
  total_outstanding: number;
  total_count: number;
  buckets: AgingBucket[];
  party_breakdown: Array<{
    party_id: string;
    party_name: string;
    total_outstanding: number;
    aging_0_30: number;
    aging_31_60: number;
    aging_61_90: number;
    aging_90_plus: number;
  }>;
}

export default function AgingAnalysisPage() {
  const [parties, setParties] = useState<Party[]>([]);
  const [bills, setBills] = useState<BillReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<"receivable" | "payable">("receivable");
  const showToast = useToastStore((s) => s.show);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [partiesRes, billsRes] = await Promise.all([
          api.get<Party[]>("/parties"),
          listBillReferences({ status: "open" })
        ]);
        setParties(partiesRes);
        setBills(billsRes);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load data";
        showToast(message, "error");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [showToast]);

  const agingData: AgingData = (() => {
    const filteredBills = bills.filter((bill) => {
      const party = parties.find((p) => p.id === bill.party_id);
      if (!party) return false;
      const isReceivable = party.group_name === "sundry_debtors";
      return filterType === "receivable" ? isReceivable : !isReceivable;
    });

    const bucketRanges = [
      { bucket: "0-30 days", min: 0, max: 30 },
      { bucket: "31-60 days", min: 31, max: 60 },
      { bucket: "61-90 days", min: 61, max: 90 },
      { bucket: "90+ days", min: 91, max: Infinity }
    ];

    const buckets: AgingBucket[] = bucketRanges.map(({ bucket, min, max }) => {
      const bucketBills = filteredBills.filter((bill) => {
        if (!bill.due_date) return false;
        const daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(bill.due_date).getTime()) / (1000 * 60 * 60 * 24)));
        return daysOverdue >= min && daysOverdue <= max;
      });
      const amount = bucketBills.reduce((sum, b) => sum + b.outstanding_amount, 0);
      return {
        bucket,
        count: bucketBills.length,
        amount,
        percentage: 0
      };
    });

    const totalOutstanding = buckets.reduce((sum, b) => sum + b.amount, 0);
    buckets.forEach((b) => {
      b.percentage = totalOutstanding > 0 ? (b.amount / totalOutstanding) * 100 : 0;
    });

    const partyMap = new Map<string, {
      party_name: string;
      total_outstanding: number;
      aging_0_30: number;
      aging_31_60: number;
      aging_61_90: number;
      aging_90_plus: number;
    }>();
    filteredBills.forEach((bill) => {
      const party = parties.find((p) => p.id === bill.party_id);
      if (!party || !bill.party_id) return;

      if (!partyMap.has(bill.party_id)) {
        partyMap.set(bill.party_id, {
          party_name: party.name,
          total_outstanding: 0,
          aging_0_30: 0,
          aging_31_60: 0,
          aging_61_90: 0,
          aging_90_plus: 0
        });
      }

      const partyData = partyMap.get(bill.party_id);
      if (!partyData) return;
      partyData.total_outstanding += bill.outstanding_amount;

      if (bill.due_date) {
        const daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(bill.due_date).getTime()) / (1000 * 60 * 60 * 24)));
        if (daysOverdue <= 30) partyData.aging_0_30 += bill.outstanding_amount;
        else if (daysOverdue <= 60) partyData.aging_31_60 += bill.outstanding_amount;
        else if (daysOverdue <= 90) partyData.aging_61_90 += bill.outstanding_amount;
        else partyData.aging_90_plus += bill.outstanding_amount;
      }
    });

    const party_breakdown = Array.from(partyMap.entries())
      .map(([party_id, data]) => ({ party_id, ...data }))
      .sort((a, b) => b.total_outstanding - a.total_outstanding);

    return {
      type: filterType,
      total_outstanding: totalOutstanding,
      total_count: filteredBills.length,
      buckets,
      party_breakdown
    };
  })();

  const handleExport = async (format: "pdf" | "csv") => {
    try {
      const url = `/reports/aging/${format}?type=${filterType}`;
      const blob = await api.download(url);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `aging-analysis-${filterType}-${new Date().toISOString().split("T")[0]}.${format}`;
      link.click();
      URL.revokeObjectURL(link.href);
      showToast(`Report exported as ${format.toUpperCase()}`, "success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed";
      showToast(message, "error");
    }
  };

  const getBucketColor = (bucket: string) => {
    if (bucket.startsWith("0-30")) return "bg-green-500";
    if (bucket.startsWith("31-60")) return "bg-yellow-500";
    if (bucket.startsWith("61-90")) return "bg-orange-500";
    return "bg-red-500";
  };

  const getBucketBg = (bucket: string) => {
    if (bucket.startsWith("0-30")) return "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20";
    if (bucket.startsWith("31-60")) return "bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20";
    if (bucket.startsWith("61-90")) return "bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20";
    return "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-slate-600 dark:text-[#cbd5e1]">Loading aging analysis...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-[#f1f5f9]">Aging Analysis</h2>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setFilterType("receivable")}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                filterType === "receivable"
                  ? "border-brand-600 dark:border-blue-500/50 bg-brand-50 dark:bg-blue-500/10 text-brand-700 dark:text-blue-400"
                  : "border-slate-300 dark:border-[#282832] text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
              }`}
            >
              Receivables (Customers)
            </button>
            <button
              onClick={() => setFilterType("payable")}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                filterType === "payable"
                  ? "border-brand-600 dark:border-blue-500/50 bg-brand-50 dark:bg-blue-500/10 text-brand-700 dark:text-blue-400"
                  : "border-slate-300 dark:border-[#282832] text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
              }`}
            >
              Payables (Suppliers)
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleExport("pdf")}
              className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] border border-slate-300 dark:border-[#282832] rounded-lg hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors"
            >
              Export PDF
            </button>
            <button
              onClick={() => handleExport("csv")}
              className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] border border-slate-300 dark:border-[#282832] rounded-lg hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4">
          <p className="text-xs text-slate-500 dark:text-[#94a3b8] mb-1">Total Outstanding</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-[#f1f5f9]">
            ₹{agingData.total_outstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4">
          <p className="text-xs text-slate-500 dark:text-[#94a3b8] mb-1">Total Bills</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-[#f1f5f9]">
            {agingData.total_count}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-6 space-y-4">
        <h3 className="font-bold text-slate-900 dark:text-[#f1f5f9]">Aging Distribution</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {agingData.buckets.map((bucket) => (
            <div key={bucket.bucket} className={`rounded-lg border p-4 ${getBucketBg(bucket.bucket)}`}>
              <p className="text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-2">{bucket.bucket}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-[#f1f5f9] mb-1">
                ₹{bucket.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-[#cbd5e1]">
                <span>{bucket.count} bills</span>
                <span className="font-semibold">{bucket.percentage.toFixed(1)}%</span>
              </div>
              <div className="mt-3 h-2 bg-slate-200 dark:bg-[#282832] rounded-full overflow-hidden">
                <div
                  className={`h-full ${getBucketColor(bucket.bucket)} transition-all duration-300`}
                  style={{ width: `${bucket.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-6">
        <h3 className="font-bold text-slate-900 dark:text-[#f1f5f9] mb-4">Party-wise Breakdown</h3>
        {agingData.party_breakdown.length === 0 ? (
          <p className="text-center py-8 text-slate-400 dark:text-[#64748b]">No outstanding bills</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8] border-b border-slate-200 dark:border-[#282832]">
                  <th className="pb-2">Party Name</th>
                  <th className="pb-2 text-right">Total Outstanding</th>
                  <th className="pb-2 text-right">0-30 Days</th>
                  <th className="pb-2 text-right">31-60 Days</th>
                  <th className="pb-2 text-right">61-90 Days</th>
                  <th className="pb-2 text-right">90+ Days</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 dark:text-[#cbd5e1]">
                {agingData.party_breakdown.map((party) => (
                  <tr key={party.party_id} className="border-b border-slate-100 dark:border-[#282832] hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors">
                    <td className="py-3 font-medium">{party.party_name}</td>
                    <td className="py-3 text-right font-bold text-brand-600 dark:text-blue-400">
                      ₹{party.total_outstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 text-right text-green-600 dark:text-green-400">
                      {party.aging_0_30 > 0 ? `₹${party.aging_0_30.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
                    </td>
                    <td className="py-3 text-right text-yellow-600 dark:text-yellow-400">
                      {party.aging_31_60 > 0 ? `₹${party.aging_31_60.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
                    </td>
                    <td className="py-3 text-right text-orange-600 dark:text-orange-400">
                      {party.aging_61_90 > 0 ? `₹${party.aging_61_90.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
                    </td>
                    <td className="py-3 text-right text-red-600 dark:text-red-400 font-semibold">
                      {party.aging_90_plus > 0 ? `₹${party.aging_90_plus.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
