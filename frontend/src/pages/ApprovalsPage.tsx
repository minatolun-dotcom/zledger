import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useRole } from "../hooks/useRole";
import { useToastStore } from "../store/toast";
import { showConfirm } from "../components/ConfirmDialog";
import SortableTable from "../components/SortableTable";
import type { SortableColumn } from "../components/SortableTable";

interface Voucher {
  id: string;
  voucher_type: string;
  voucher_number: string;
  voucher_date: string;
  narration: string | null;
  party_id: string | null;
  grand_total: number;
  status: string;
  approval_status: string | null;
  created_at: string | null;
}

export default function ApprovalsPage() {
  const { canEdit } = useRole();
  const toast = useToastStore();
  const queryClient = useQueryClient();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [rejectModal, setRejectModal] = useState<{ voucher: Voucher; reason: string } | null>(null);

  const fetchPending = useCallback(async () => {
    try {
      const data = await api.get<Voucher[]>("/vouchers?approval_status=pending");
      setVouchers(data);
    } catch {
      toast.error("Failed to load pending approvals");
    }
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const handleApprove = async (v: Voucher) => {
    if (!(await showConfirm(`Approve ${v.voucher_type} voucher #${v.voucher_number}?`, { confirmLabel: "Approve" }))) return;
    try {
      await api.post(`/vouchers/${v.id}/approve`);
      toast.success("Voucher approved");
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      fetchPending();
    } catch (err: any) {
      toast.error(err?.message || "Failed to approve");
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    try {
      await api.post(`/vouchers/${rejectModal.voucher.id}/reject?reason=${encodeURIComponent(rejectModal.reason)}`);
      toast.success("Voucher rejected");
      setRejectModal(null);
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      fetchPending();
    } catch (err: any) {
      toast.error(err?.message || "Failed to reject");
    }
  };

  const columns: SortableColumn<Voucher>[] = [
    { id: "voucher_number", header: "Voucher #", accessorKey: "voucher_number", size: 140, className: "font-medium text-slate-900 dark:text-[#f1f5f9]" },
    { id: "voucher_type", header: "Type", accessorKey: "voucher_type", size: 120, cell: ({ getValue }) => {
      const t = getValue() as string;
      const colors: Record<string, string> = {
        purchase: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
        sales: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
        payment: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
        receipt: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
        journal: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
        credit_note: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
        debit_note: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
      };
      return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colors[t] || ""}`}>{t.replace("_", " ")}</span>;
    }},
    { id: "voucher_date", header: "Date", accessorKey: "voucher_date", size: 110 },
    { id: "grand_total", header: "Amount", accessorKey: "grand_total", size: 120, cell: ({ getValue }) => `₹${(getValue() as number).toLocaleString("en-IN")}`, className: "text-right" },
    { id: "approval_status", header: "Status", accessorKey: "approval_status", size: 100, cell: ({ getValue }) => {
      const s = getValue() as string;
      return <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">{s}</span>;
    }},
    ...(canEdit ? [{
      id: "actions",
      header: "",
      size: 160,
      cell: ({ row }: { row: { original: Voucher } }) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleApprove(row.original); }}
            className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
          >
            Approve
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setRejectModal({ voucher: row.original, reason: "" }); }}
            className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
          >
            Reject
          </button>
        </div>
      ),
    }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200/60 pb-3 dark:border-slate-700/60">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Pending Approvals</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-[#64748b]">Vouchers submitted for your review</p>
        </div>
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
          {vouchers.length} pending
        </span>
      </div>

      <SortableTable
        columns={columns}
        data={vouchers}
        tableKey="approvals"
        emptyMessage="No vouchers pending approval"
      />

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRejectModal(null)}>
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100">Reject Voucher</h2>
            <p className="mb-3 text-sm text-slate-600 dark:text-[#cbd5e1]">
              Rejecting <strong>#{rejectModal.voucher.voucher_number}</strong> ({rejectModal.voucher.voucher_type})
            </p>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Reason (optional)</label>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              rows={3}
              placeholder="Why is this voucher being rejected?"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRejectModal(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
                Cancel
              </button>
              <button onClick={handleReject} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
