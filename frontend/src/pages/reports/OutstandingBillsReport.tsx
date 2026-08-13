import { useState, useEffect } from "react";
import { listBillReferences, type BillReference, getPartyCreditNotes, adjustBillWithCreditNote, type CreditNoteInfo } from "../../api/bills";
import { useToastStore } from "../../store/toast";
import { api } from "../../api/client";
import { useFyStore } from "../../store/fy";
import Modal from "../../components/Modal";

interface Party {
  id: string;
  name: string;
  party_type: string;
}

export default function OutstandingBillsReport() {
  const { activeFyId: selectedFy } = useFyStore();
  const [parties, setParties] = useState<Party[]>([]);
  const [bills, setBills] = useState<BillReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<"receivable" | "payable">("receivable");
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const showToast = useToastStore((s) => s.show);

  // Credit-note adjust state: which bill is being adjusted + its party's unapplied credit notes
  const [adjustBill, setAdjustBill] = useState<BillReference | null>(null);
  const [creditNotes, setCreditNotes] = useState<CreditNoteInfo[] | null>(null);
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustingCnId, setAdjustingCnId] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [partiesRes, billsRes] = await Promise.all([
          api.get<Party[]>("/coa/parties"),
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

  const filteredBills = bills.filter((bill) => {
    const party = parties.find((p) => p.id === bill.party_id);
    if (!party) return false;
    
    const isReceivable = party.party_type === "customer" || party.party_type === "debtor";
    const typeMatch = filterType === "receivable" ? isReceivable : !isReceivable;
    
    if (!typeMatch) return false;
    if (selectedPartyId && bill.party_id !== selectedPartyId) return false;
    
    return true;
  });

  const billsByParty = filteredBills.reduce((acc, bill) => {
    const partyId = bill.party_id;
    if (!partyId) return acc;
    if (!acc[partyId]) {
      const party = parties.find((p) => p.id === partyId);
      acc[partyId] = {
        party_name: party?.name || "Unknown",
        bills: [],
        total: 0
      };
    }
    acc[partyId].bills.push(bill);
    acc[partyId].total += bill.outstanding_amount;
    return acc;
  }, {} as Record<string, { party_name: string; bills: BillReference[]; total: number }>);

  const totalOutstanding = filteredBills.reduce((sum, b) => sum + b.outstanding_amount, 0);
  const handleExport = async (format: "pdf" | "csv") => {
    if (!selectedFy) {
      showToast("Please select a financial year", "error");
      return;
    }
    try {
      const url = `/reports/outstanding/${format === "pdf" ? "pdf" : "xlsx"}?financial_year_id=${selectedFy}&type=${filterType}${selectedPartyId ? `&party_id=${selectedPartyId}` : ""}`;
      const blob = await api.download(url);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `outstanding-bills-${filterType}-${new Date().toISOString().split("T")[0]}.${format === "pdf" ? "pdf" : "xlsx"}`;
      link.click();
      URL.revokeObjectURL(link.href);
      showToast(`Report exported as ${format.toUpperCase()}`, "success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed";
      showToast(message, "error");
    }
  };

  const getAgingColor = (daysOverdue: number) => {
    if (daysOverdue <= 30) return "text-green-600 dark:text-green-400";
    if (daysOverdue <= 60) return "text-yellow-600 dark:text-yellow-400";
    if (daysOverdue <= 90) return "text-orange-600 dark:text-orange-400";
    return "text-red-600 dark:text-red-400";
  };

  const getAgingBadge = (daysOverdue: number) => {
    if (daysOverdue <= 30) return "bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400";
    if (daysOverdue <= 60) return "bg-yellow-100 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
    if (daysOverdue <= 90) return "bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400";
    return "bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400";
  };

  const openAdjust = async (bill: BillReference) => {
    if (!bill.party_id) {
      showToast("This bill has no party — cannot adjust", "error");
      return;
    }
    setAdjustBill(bill);
    setCreditNotes(null);
    try {
      const res = await getPartyCreditNotes(bill.party_id);
      setCreditNotes(res.credit_notes);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load credit notes";
      setCreditNotes([]);
      showToast(message, "error");
    }
  };

  const applyAdjustment = async (cn: CreditNoteInfo) => {
    if (!adjustBill) return;
    setAdjustingCnId(cn.credit_note_id);
    setAdjustLoading(true);
    try {
      const result = await adjustBillWithCreditNote(cn.credit_note_id, adjustBill.id);
      showToast(
        `Applied ${cn.voucher_number} (₹${cn.unapplied_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}) to ${adjustBill.bill_number}. Outstanding: ₹${result.outstanding_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        "success"
      );
      setAdjustBill(null);
      setCreditNotes(null);
      // Refresh bills so the adjusted bill reflects its new outstanding (or leaves the list)
      try {
        const billsRes = await listBillReferences({ status: "open" });
        setBills(billsRes);
      } catch { /* keep stale list on refresh failure */ }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Adjustment failed";
      showToast(message, "error");
      // Refresh credit-note availability in case the failure was a partial application
      if (adjustBill.party_id) {
        try {
          const res = await getPartyCreditNotes(adjustBill.party_id);
          setCreditNotes(res.credit_notes);
        } catch { /* ignore */ }
      }
    } finally {
      setAdjustingCnId(null);
      setAdjustLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-slate-600 dark:text-[#cbd5e1]">Loading outstanding bills...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-[#f1f5f9]">Outstanding Bills Report</h2>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4">
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => { setFilterType("receivable"); setSelectedPartyId(null); }}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                filterType === "receivable"
                  ? "border-brand-600 dark:border-blue-500/50 bg-brand-50 dark:bg-blue-500/10 text-brand-700 dark:text-blue-400"
                  : "border-slate-300 dark:border-[#282832] text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
              }`}
            >
              Receivables (Customers)
            </button>
            <button
              onClick={() => { setFilterType("payable"); setSelectedPartyId(null); }}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                filterType === "payable"
                  ? "border-brand-600 dark:border-blue-500/50 bg-brand-50 dark:bg-blue-500/10 text-brand-700 dark:text-blue-400"
                  : "border-slate-300 dark:border-[#282832] text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
              }`}
            >
              Payables (Suppliers)
            </button>
          </div>
          <div className="ml-auto flex gap-2">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4">
          <p className="text-xs text-slate-500 dark:text-[#94a3b8] mb-1">Total Outstanding</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-[#f1f5f9]">
            ₹{totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4">
          <p className="text-xs text-slate-500 dark:text-[#94a3b8] mb-1">Number of Parties</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-[#f1f5f9]">
            {Object.keys(billsByParty).length}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4">
          <p className="text-xs text-slate-500 dark:text-[#94a3b8] mb-1">Total Bills</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-[#f1f5f9]">
            {filteredBills.length}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {Object.keys(billsByParty).length === 0 ? (
          <div className="text-center py-12 text-slate-400 dark:text-[#64748b]">
            <p>No outstanding bills found</p>
          </div>
        ) : (
          Object.entries(billsByParty).map(([partyId, data]) => (
            <div key={partyId} className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] overflow-hidden">
              <div className="bg-slate-50 dark:bg-[#1a1a24] p-4 border-b border-slate-200 dark:border-[#282832]">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-[#f1f5f9]">{data.party_name}</h3>
                    <p className="text-xs text-slate-500 dark:text-[#94a3b8]">
                      {data.bills.length} bill{data.bills.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 dark:text-[#94a3b8] mb-1">Total Outstanding</p>
                    <p className="text-lg font-bold text-brand-600 dark:text-blue-400">
                      ₹{data.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8] bg-slate-50 dark:bg-[#1a1a24]">
                      <th className="px-4 py-2">Bill No</th>
                      <th className="px-4 py-2">Bill Date</th>
                      <th className="px-4 py-2">Due Date</th>
                      <th className="px-4 py-2 text-right">Original</th>
                      <th className="px-4 py-2 text-right">Paid</th>
                      <th className="px-4 py-2 text-right">Outstanding</th>
                      <th className="px-4 py-2 text-center">Days Overdue</th>
                      <th className="px-4 py-2 text-center">Status</th>
                      <th className="px-4 py-2 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700 dark:text-[#cbd5e1]">
                    {data.bills.map((bill) => {
                      const daysOverdue = bill.due_date
                        ? Math.max(0, Math.floor((Date.now() - new Date(bill.due_date).getTime()) / (1000 * 60 * 60 * 24)))
                        : 0;
                      
                      return (
                        <tr key={bill.id} className="border-b border-slate-100 dark:border-[#282832] hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors">
                          <td className="px-4 py-2 font-medium">{bill.bill_number}</td>
                          <td className="px-4 py-2">{new Date(bill.bill_date).toLocaleDateString()}</td>
                          <td className="px-4 py-2">
                            {bill.due_date ? new Date(bill.due_date).toLocaleDateString() : "-"}
                          </td>
                          <td className="px-4 py-2 text-right">
                            ₹{bill.original_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2 text-right">
                            ₹{bill.paid_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold text-brand-600 dark:text-blue-400">
                            ₹{bill.outstanding_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </td>
                          <td className={`px-4 py-2 text-center font-semibold ${getAgingColor(daysOverdue)}`}>
                            {daysOverdue > 0 ? daysOverdue : "-"}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                              bill.status === "open" 
                                ? getAgingBadge(daysOverdue)
                                : "bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400"
                            }`}>
                              {bill.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => openAdjust(bill)}
                              className="text-xs font-medium text-brand-600 dark:text-blue-400 hover:underline"
                              title="Apply an unapplied credit note to this bill to reduce its outstanding"
                            >
                              Adjust
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Credit-note adjust modal */}
      <Modal open={!!adjustBill} onClose={() => { if (!adjustLoading) { setAdjustBill(null); setCreditNotes(null); } }} maxWidth="md" panelClassName="p-5">
        {adjustBill && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 dark:text-[#f1f5f9]">Adjust Bill with Credit Note</h3>
              <button onClick={() => { setAdjustBill(null); setCreditNotes(null); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-[#94a3b8] text-lg leading-none">&times;</button>
            </div>
            <div className="mb-4 rounded-lg bg-slate-50 dark:bg-[#1a1a24] p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-[#94a3b8]">Bill</span>
                <span className="font-medium text-slate-900 dark:text-[#f1f5f9]">{adjustBill.bill_number}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate-500 dark:text-[#94a3b8]">Outstanding</span>
                <span className="font-semibold text-brand-600 dark:text-blue-400">
                  ₹{adjustBill.outstanding_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            {creditNotes === null ? (
              <p className="text-sm text-slate-500 dark:text-[#94a3b8]">Loading unapplied credit notes…</p>
            ) : creditNotes.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-[#94a3b8] italic">No unapplied credit notes for this party.</p>
            ) : (
              <div className="space-y-2">
                {creditNotes.map((cn) => (
                  <div key={cn.credit_note_id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-[#282832] p-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">{cn.voucher_number}</div>
                      <div className="text-xs text-slate-500 dark:text-[#94a3b8]">
                        {new Date(cn.voucher_date).toLocaleDateString()} · Unapplied ₹
                        {cn.unapplied_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <button
                      onClick={() => applyAdjustment(cn)}
                      disabled={adjustLoading}
                      className="rounded-lg bg-brand-600 dark:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600 disabled:opacity-50"
                    >
                      {adjustingCnId === cn.credit_note_id ? "Applying…" : "Apply"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
