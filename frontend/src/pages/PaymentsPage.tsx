import { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import { toDisplayDate } from "../utils/dateUtils";
import DateInput from "../components/DateInput";
import Select from "../components/Select";
import Tabs from "../components/Tabs";
import SortableTable from "../components/SortableTable";
import type { SortableColumn } from "../components/SortableTable";
import { todayIso } from "../utils/dateUtils";
import { showConfirm } from "../components/ConfirmDialog";
import { ListSkeleton } from "./skeletons";


interface ReceivableItem {
  voucher_id: string; voucher_number: string; voucher_date: string;
  due_date: string | null; party_id: string | null; party_name: string | null;
  grand_total: number; paid_amount: number; unpaid_amount: number;
  days_overdue: number; aging_bucket: string;
}
interface PayableItem {
  voucher_id: string; voucher_number: string; voucher_date: string;
  due_date: string | null; party_id: string | null; party_name: string | null;
  grand_total: number; paid_amount: number; unpaid_amount: number;
  days_overdue: number; aging_bucket: string;
}
interface ReceivablesResponse {
  items: ReceivableItem[]; total_unpaid: number; total_overdue: number; overdue_count: number;
}
interface PayablesResponse {
  items: PayableItem[]; total_unpaid: number; total_overdue: number; overdue_count: number;
}
interface PaymentAllocation {
  id: string; invoice_voucher_id: string; payment_voucher_id: string;
  amount: number; allocation_date: string; remarks: string | null;
  created_at: string | null;
}
interface VoucherOption { value: string; label: string; }

type Tab = "receivables" | "payables";

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const agingBadge = (bucket: string) => {
  const colors: Record<string, string> = {
    current: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    "1-30": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    "31-60": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    "61-90": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    "90+": "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300",
  };
  const labels: Record<string, string> = {
    current: "Current", "1-30": "1–30 days", "31-60": "31–60 days",
    "61-90": "61–90 days", "90+": "90+ days",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${colors[bucket] ?? colors.current}`}>
      {labels[bucket] ?? bucket}
    </span>
  );
};

export default function PaymentsPage() {
  const [tab, setTab] = useState<Tab>("receivables");
  const [receivables, setReceivables] = useState<ReceivablesResponse | null>(null);
  const [payables, setPayables] = useState<PayablesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const toast = useToastStore();

  // Detail modal
  const [selectedInvoice, setSelectedInvoice] = useState<ReceivableItem | PayableItem | null>(null);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [allocLoading, setAllocLoading] = useState(false);

  // Record payment modal
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [payVouchers, setPayVouchers] = useState<VoucherOption[]>([]);
  const [allocForm, setAllocForm] = useState({ payment_voucher_id: "", amount: 0, allocation_date: todayIso(), remarks: "" });
  const [allocSubmitting, setAllocSubmitting] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<ReceivablesResponse>("/payments/receivables"),
      api.get<PayablesResponse>("/payments/payables"),
    ])
      .then(([r, p]) => { setReceivables(r); setPayables(p); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openDetail = useCallback(async (item: ReceivableItem | PayableItem) => {
    setSelectedInvoice(item);
    setAllocLoading(true);
    setAllocations([]);
    try {
      const data = await api.get<PaymentAllocation[]>(`/payments/allocations/${item.voucher_id}`);
      setAllocations(data);
    } catch {
      setAllocations([]);
    } finally {
      setAllocLoading(false);
    }
  }, []);

  const openRecordPayment = useCallback(async () => {
    if (!selectedInvoice) return;
    setShowRecordModal(true);
    setAllocForm({ payment_voucher_id: "", amount: selectedInvoice.unpaid_amount, allocation_date: todayIso(), remarks: "" });
    try {
      const type = tab === "receivables" ? "receipt" : "payment";
      const res = await api.get<{ items: { id: string; voucher_number: string; voucher_type: string }[] }>("/vouchers?limit=500");
      const vouchers = res.items || [];
      const filtered = vouchers.filter((v) => v.voucher_type === type);
      setPayVouchers(filtered.map((v) => ({ value: v.id, label: `${v.voucher_number} (${v.voucher_type})` })));
    } catch {
      setPayVouchers([]);
    }
  }, [selectedInvoice, tab]);

  const submitAllocation = useCallback(async () => {
    if (!selectedInvoice || !allocForm.payment_voucher_id || allocForm.amount <= 0) {
      toast.error("Please select a payment voucher and enter a valid amount");
      return;
    }
    setAllocSubmitting(true);
    try {
      await api.post("/payments/allocate", {
        invoice_voucher_id: selectedInvoice.voucher_id,
        payment_voucher_id: allocForm.payment_voucher_id,
        amount: allocForm.amount,
        allocation_date: allocForm.allocation_date,
        remarks: allocForm.remarks || null,
      });
      setShowRecordModal(false);
      loadData();
      openDetail(selectedInvoice);
      toast.success("Payment allocated");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to allocate payment");
    } finally {
      setAllocSubmitting(false);
    }
  }, [selectedInvoice, allocForm, loadData, openDetail]);

  const deleteAllocation = useCallback(async (allocId: string) => {
    if (!await showConfirm("Remove this allocation?", { danger: true, confirmLabel: "Delete" })) return;
    try {
      await api.del(`/payments/allocations/${allocId}`);
      loadData();
      if (selectedInvoice) openDetail(selectedInvoice);
      toast.success("Allocation removed");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }, [loadData, selectedInvoice, openDetail]);

  const data = tab === "receivables" ? receivables : payables;
  const filteredItems = data?.items.filter((i) =>
    !searchQuery || (i.party_name ?? "").toLowerCase().includes(searchQuery.toLowerCase())
    || i.voucher_number.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Payments & Receivables</h1>
      <p className="text-sm text-slate-500 dark:text-[#64748b] mt-1">Track outstanding invoices and payment allocations</p>

      {/* Tab Bar */}
      <Tabs
        tabs={[
          { key: "receivables", label: "Receivables (Customers owe us)" },
          { key: "payables", label: "Payables (We owe suppliers)" },
        ]}
        active={tab}
        onChange={(t) => { setTab(t as Tab); setSearchQuery(""); }}
      />

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/80 dark:border-[#1a1a24] dark:from-[#0f0f16] dark:to-[#13131d] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Total Outstanding</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{fmt(data.total_unpaid)}</p>
          </div>
          <div className="rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-red-50/40 dark:border-[#1a1a24] dark:from-[#0f0f16] dark:to-red-900/10 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Overdue Amount</p>
            <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">{fmt(data.total_overdue)}</p>
          </div>
          <div className="rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-orange-50/40 dark:border-[#1a1a24] dark:from-[#0f0f16] dark:to-orange-900/10 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Overdue Invoices</p>
            <p className="mt-1 text-2xl font-bold text-orange-600 dark:text-orange-400">{data.overdue_count}</p>
          </div>
        </div>
      )}

      {/* Search + Table */}
      <div className="rounded-xl border border-slate-200/60 dark:border-[#1a1a24] bg-gradient-to-br from-white to-slate-50/80 dark:from-[#0f0f16] dark:to-[#13131d] overflow-hidden shadow-sm">
        <div className="border-b border-slate-200 dark:border-[#1a1a24] px-4 py-3">
          <input
            type="text"
            placeholder="Search by party or invoice number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#16161f] px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-400"
          />
        </div>

        {loading ? (
          <ListSkeleton title="Payments" cols={4} />
        ) : filteredItems.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            {searchQuery ? "No matching invoices found." : "No outstanding invoices."}
          </div>
        ) : (
          <PaymentsSortableTable items={filteredItems} onRowClick={openDetail} />
        )}
      </div>

      {/* Detail Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-[99998] flex items-center justify-center p-4" onClick={() => setSelectedInvoice(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Invoice {selectedInvoice.voucher_number}</h2>
                <p className="text-sm text-slate-500 dark:text-[#94a3b8]">{selectedInvoice.party_name ?? "No party"} &middot; {fmt(selectedInvoice.unpaid_amount)} outstanding</p>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#282832]">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Invoice Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 border-b border-slate-100 dark:border-[#1a1a24] px-6 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase text-slate-400 dark:text-[#64748b]">Amount</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{fmt(selectedInvoice.grand_total)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase text-slate-400 dark:text-[#64748b]">Paid</p>
                <p className="text-sm font-bold text-green-600 dark:text-green-400">{fmt(selectedInvoice.paid_amount)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase text-slate-400 dark:text-[#64748b]">Unpaid</p>
                <p className="text-sm font-bold text-red-600 dark:text-red-400">{fmt(selectedInvoice.unpaid_amount)}</p>
              </div>
            </div>

            {/* Allocations */}
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Payment Allocations</h3>
                <button
                  onClick={openRecordPayment}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  Record Payment
                </button>
              </div>
              {allocLoading ? (
                <p className="text-sm text-slate-400">Loading allocations...</p>
              ) : allocations.length === 0 ? (
                <p className="text-sm text-slate-400">No payments allocated to this invoice yet.</p>
              ) : (
                <div className="space-y-2">
                  {allocations.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-[#1a1a24] px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{fmt(a.amount)}</p>
                        <p className="text-[11px] text-slate-500 dark:text-[#94a3b8]">Allocated on {toDisplayDate(a.allocation_date)}</p>
                      </div>
                      <button
                        onClick={() => deleteAllocation(a.id)}
                        className="rounded p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showRecordModal && selectedInvoice && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" onClick={() => setShowRecordModal(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Record Payment</h2>
              <button onClick={() => setShowRecordModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#282832]">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Payment Voucher</label>
                <Select
                  value={allocForm.payment_voucher_id}
                  onChange={(v) => setAllocForm((f) => ({ ...f, payment_voucher_id: v }))}
                  options={[{ value: "", label: "Select payment..." }, ...payVouchers]}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={selectedInvoice.unpaid_amount}
                  value={allocForm.amount}
                  onChange={(e) => setAllocForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#1a1a24] px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Date</label>
                <DateInput
                  value={allocForm.allocation_date}
                  onChange={(v) => setAllocForm((f) => ({ ...f, allocation_date: v }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Remarks</label>
                <input
                  type="text"
                  value={allocForm.remarks}
                  onChange={(e) => setAllocForm((f) => ({ ...f, remarks: e.target.value }))}
                  placeholder="Optional"
                  className="w-full rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#1a1a24] px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-400"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowRecordModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#282832]">Cancel</button>
                <button
                  onClick={submitAllocation}
                  disabled={allocSubmitting || !allocForm.payment_voucher_id || allocForm.amount <= 0}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {allocSubmitting ? "Saving..." : "Allocate Payment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentsSortableTable({
  items,
  onRowClick,
}: {
  items: ReceivableItem[] | PayableItem[];
  onRowClick: (item: ReceivableItem | PayableItem) => void;
}) {
  const columns: SortableColumn<ReceivableItem | PayableItem>[] = useMemo(
    () => [
      {
        id: "voucher_number",
        header: "Invoice No.",
        accessorKey: "voucher_number",
        size: 100,
        className: "font-medium text-slate-900 dark:text-white",
      },
      {
        id: "voucher_date",
        header: "Date",
        accessorKey: "voucher_date",
        size: 110,
        cell: ({ getValue }) => toDisplayDate(getValue()),
        className: "text-slate-600 dark:text-[#94a3b8]",
      },
      {
        id: "due_date",
        header: "Due Date",
        accessorKey: "due_date",
        size: 110,
        cell: ({ getValue }) => getValue() ? toDisplayDate(getValue()) : "—",
        className: "text-slate-600 dark:text-[#94a3b8]",
      },
      {
        id: "party_name",
        header: "Party",
        accessorKey: "party_name",
        size: 150,
        cell: ({ getValue }) => getValue() ?? "—",
        className: "text-slate-600 dark:text-[#94a3b8]",
      },
      {
        id: "grand_total",
        header: "Amount",
        accessorKey: "grand_total",
        size: 110,
        cell: ({ getValue }) => (
          <span className="text-right block">{fmt(getValue())}</span>
        ),
        className: "text-right font-medium text-slate-900 dark:text-white",
        headerClassName: "text-right",
      },
      {
        id: "paid_amount",
        header: "Paid",
        accessorKey: "paid_amount",
        size: 100,
        cell: ({ getValue }) => (
          <span className="text-right block text-green-600 dark:text-green-400">{fmt(getValue())}</span>
        ),
        className: "text-right",
        headerClassName: "text-right",
      },
      {
        id: "unpaid_amount",
        header: "Unpaid",
        accessorKey: "unpaid_amount",
        size: 100,
        cell: ({ getValue }) => (
          <span className="text-right block font-semibold text-red-600 dark:text-red-400">{fmt(getValue())}</span>
        ),
        className: "text-right",
        headerClassName: "text-right",
      },
      {
        id: "aging_bucket",
        header: "Status",
        accessorKey: "aging_bucket",
        size: 110,
        cell: ({ getValue }) => agingBadge(getValue()),
        className: "text-center",
        headerClassName: "text-center",
      },
    ],
    []
  );

  return (
    <SortableTable
      data={items}
      columns={columns}
      tableKey="payments"
      initialSorting={[{ id: "voucher_date", desc: true }]}
      onRowClick={(item) => onRowClick(item)}
      emptyMessage="No outstanding invoices"
    />
  );
}
