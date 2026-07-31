import { useState, useEffect } from "react";
import { getPartyStatement, type PartyStatementResponse } from "../../api/bills";
import MasterSelector from "../../components/master/MasterSelector";
import DateInput from "../../components/DateInput";
import { todayIso } from "../../utils/dateUtils";
import { useToastStore } from "../../store/toast";
import { api } from "../../api/client";

interface Party {
  id: string;
  name: string;
  group_name: string;
}

export default function CustomerStatement() {
  const [parties, setParties] = useState<Party[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-04-01`;
  });
  const [endDate, setEndDate] = useState<string>(todayIso());
  const [statement, setStatement] = useState<PartyStatementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const showToast = useToastStore((s) => s.show);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const res = await api.get<Party[]>("/parties");
        const customers = res.filter((p) => p.group_name === "sundry_debtors");
        setParties(customers);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load customers";
        showToast(message, "error");
      }
    };
    loadCustomers();
  }, [showToast]);

  const handleFetch = async () => {
    if (!selectedPartyId) {
      showToast("Please select a customer", "error");
      return;
    }
    setLoading(true);
    try {
      const data = await getPartyStatement(selectedPartyId, startDate, endDate);
      setStatement(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch statement";
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: "pdf" | "csv") => {
    if (!statement) return;
    try {
      const url = `/reports/party-statement/${format}?party_id=${selectedPartyId}&start_date=${startDate}&end_date=${endDate}`;
      const blob = await api.download(url);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `customer-statement-${statement.party_name}-${startDate}-${endDate}.${format}`;
      link.click();
      URL.revokeObjectURL(link.href);
      showToast(`Statement exported as ${format.toUpperCase()}`, "success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed";
      showToast(message, "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-[#f1f5f9]">Customer Statement</h2>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Customer</label>
            <MasterSelector
              entityKey="party"
              value={selectedPartyId}
              onChange={setSelectedPartyId}
              options={parties.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Select customer..."
              allowEdit={false}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Start Date</label>
            <DateInput value={startDate} onChange={setStartDate} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">End Date</label>
            <DateInput value={endDate} onChange={setEndDate} />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleFetch}
              disabled={loading || !selectedPartyId}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Loading..." : "Fetch Statement"}
            </button>
          </div>
        </div>
      </div>

      {statement && (
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-6 space-y-4">
          <div className="flex items-start justify-between border-b border-slate-200 dark:border-[#282832] pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">{statement.party_name}</h3>
              <p className="text-sm text-slate-600 dark:text-[#cbd5e1]">
                {new Date(startDate).toLocaleDateString()} to {new Date(endDate).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleExport("pdf")}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-[#cbd5e1] border border-slate-300 dark:border-[#282832] rounded-lg hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors"
              >
                Export PDF
              </button>
              <button
                onClick={() => handleExport("csv")}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-[#cbd5e1] border border-slate-300 dark:border-[#282832] rounded-lg hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors"
              >
                Export CSV
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center bg-slate-50 dark:bg-[#1a1a24] p-3 rounded-lg">
            <span className="font-semibold text-slate-700 dark:text-[#cbd5e1]">Opening Balance</span>
            <span className={`font-bold ${statement.opening_balance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              ₹{Math.abs(statement.opening_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              {statement.opening_balance >= 0 ? " Dr" : " Cr"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8] border-b border-slate-200 dark:border-[#282832]">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Voucher Type</th>
                  <th className="pb-2">Voucher No</th>
                  <th className="pb-2 text-right">Debit</th>
                  <th className="pb-2 text-right">Credit</th>
                  <th className="pb-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 dark:text-[#cbd5e1]">
                {statement.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 dark:text-[#64748b]">
                      No transactions in this period
                    </td>
                  </tr>
                ) : (
                  statement.transactions.map((txn, idx) => (
                    <tr key={idx} className="border-b border-slate-100 dark:border-[#282832] hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors">
                      <td className="py-2">{new Date(txn.date).toLocaleDateString()}</td>
                      <td className="py-2 capitalize">{txn.voucher_type.replace("_", " ")}</td>
                      <td className="py-2">{txn.voucher_number}</td>
                      <td className="py-2 text-right font-medium">
                        {txn.debit > 0 ? `₹${txn.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
                      </td>
                      <td className="py-2 text-right font-medium">
                        {txn.credit > 0 ? `₹${txn.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
                      </td>
                      <td className={`py-2 text-right font-semibold ${txn.balance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        ₹{Math.abs(txn.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        {txn.balance >= 0 ? " Dr" : " Cr"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center bg-brand-50 dark:bg-blue-500/10 p-3 rounded-lg border border-brand-200 dark:border-blue-500/20">
            <span className="font-bold text-slate-900 dark:text-[#f1f5f9]">Closing Balance</span>
            <span className={`font-bold text-lg ${statement.closing_balance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              ₹{Math.abs(statement.closing_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              {statement.closing_balance >= 0 ? " Dr" : " Cr"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-200 dark:border-[#282832]">
            <div className="text-center">
              <p className="text-xs text-slate-500 dark:text-[#94a3b8] mb-1">Total Debit</p>
              <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">
                ₹{statement.total_debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500 dark:text-[#94a3b8] mb-1">Total Credit</p>
              <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">
                ₹{statement.total_credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500 dark:text-[#94a3b8] mb-1">Net Movement</p>
              <p className={`text-lg font-bold ${(statement.total_debit - statement.total_credit) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                ₹{Math.abs(statement.total_debit - statement.total_credit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
      )}

      {!statement && !loading && (
        <div className="text-center py-12 text-slate-400 dark:text-[#64748b]">
          <p>Select a customer and date range to view statement</p>
        </div>
      )}
    </div>
  );
}
