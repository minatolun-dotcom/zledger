import StatusBadge from "../components/StatusBadge";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";

import Select from "../components/Select";
import { showConfirm } from "../components/ConfirmDialog";
import { ListSkeleton } from "./skeletons";
import { useToastStore } from "../store/toast";

interface EInvoice {
  id: string; voucher_id: string; voucher_number: string | null;
  gstin: string | null; irn: string | null; ack_no: string | null; ack_dt: string | null;
  status: string; error_message: string | null; created_at: string | null;
  signed_qr_code?: string | null;
}

interface Voucher { id: string; voucher_number: string; voucher_type: string; counterparty_gstin: string | null; }
interface GstRegistration { id: string; gstin: string; legal_name: string; is_primary: boolean; }


const CANCEL_REASONS = [
  { code: "1", label: "Duplicate" },
  { code: "2", label: "Data Entry Mistake" },
  { code: "3", label: "Order Cancelled" },
  { code: "4", label: "Other" },
];

export default function EInvoicePage() {
  const toast = useToastStore();
  const [einvoices, setEinvoices] = useState<EInvoice[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [registrations, setRegistrations] = useState<GstRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<EInvoice | null>(null);

  // create form
  const [selectedVoucher, setSelectedVoucher] = useState("");
  const [selectedGstin, setSelectedGstin] = useState("");

  // cancel form
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("4");
  const [cancelRemark, setCancelRemark] = useState("");

  const refresh = () => {
    setLoading(true);
    Promise.all([
      api.get<EInvoice[]>("/einvoice"),
      api.get<{ items: Voucher[] }>("/vouchers?limit=500").catch(() => ({ items: [] as Voucher[] })),
      api.get<GstRegistration[]>("/gst/registrations"),
    ]).then(([ei, vRes, reg]) => {
      const v = vRes.items || [];
      // Filter to only B2B vouchers (those with GSTIN)
      setVouchers(v.filter((v: Voucher) => v.counterparty_gstin));
      setRegistrations(reg);
      setEinvoices(ei);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/einvoice/create", {
        voucher_id: selectedVoucher,
        gstin_id: selectedGstin,
      });
      setShowCreate(false);
      setSelectedVoucher("");
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create e-invoice");
    }
  };

  const handleGenerate = async (ei: EInvoice) => {
    if (!await showConfirm(`Generate IRN for this invoice? This will submit to GSTN.`, { confirmLabel: "Generate" })) return;
    try {
      const result = await api.post<EInvoice>(`/einvoice/${ei.id}/generate`);
      setDetail(result);
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to generate IRN");
    }
  };

  const handleCancel = async (e: FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    try {
      const result = await api.post<EInvoice>(`/einvoice/${detail.id}/cancel`, {
        cancel_reason: cancelReason,
        cancel_remark: cancelRemark,
      });
      setDetail(result);
      setShowCancel(false);
      setCancelRemark("");
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel IRN");
    }
  };

  const viewDetail = async (ei: EInvoice) => {
    try {
      const full = await api.get<EInvoice>(`/einvoice/${ei.id}`);
      setDetail(full);
    } catch {
      setDetail(ei);
    }
  };

  const cancelReasonOptions = CANCEL_REASONS.map((r) => ({ value: r.code, label: r.label }));

  const voucherOptions = [
    { value: "", label: "Select voucher..." },
    ...vouchers.map((v) => ({ value: v.id, label: `${v.voucher_number} — ${v.counterparty_gstin}` })),
  ];

  const gstinOptions = [
    { value: "", label: "Select GSTIN..." },
    ...registrations.map((r) => ({ value: r.id, label: `${r.gstin} — ${r.legal_name}` })),
  ];

  if (detail) {
    return (
      <div>
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] pb-2">
          <div>
            <button onClick={() => { setDetail(null); setShowCancel(false); }} className="text-sm text-brand-600 dark:text-blue-400 hover:underline">← Back to e-invoices</button>
            <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">E-Invoice Detail</h2>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={detail.status} />
            {detail.status === "draft" && (
              <button onClick={() => handleGenerate(detail)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                Generate IRN
              </button>
            )}
            {detail.status === "generated" && (
              <button onClick={() => setShowCancel(!showCancel)}
                className="rounded-lg border border-red-300 dark:border-red-700 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">
                Cancel IRN
              </button>
            )}
          </div>
        </div>

        {showCancel && (
          <form onSubmit={handleCancel} className="mt-4 rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-500/10 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">Cancel IRN (within 24 hours)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Select
                  value={cancelReason}
                  onChange={setCancelReason}
                  options={cancelReasonOptions}
                  label="Reason"
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Remark</label>
                <input type="text" value={cancelRemark} onChange={(e) => setCancelRemark(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm"
                  placeholder="Cancellation remark..." required />
              </div>
            </div>
            <button type="submit"
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
              Confirm Cancel
            </button>
          </form>
        )}

        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm p-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">IRN Details</h3>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-slate-500 dark:text-[#cbd5e1]">IRN</span>
                <p className="font-mono font-medium break-all">{detail.irn || "—"}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-[#cbd5e1]">Ack No</span>
                <p className="font-medium">{detail.ack_no || "—"}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-[#cbd5e1]">Ack Date</span>
                <p className="font-medium">{detail.ack_dt || "—"}</p>
              </div>
            </div>
          </div>

          {detail.status === "failed" && detail.error_message && (
            <div className="rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-500/10 p-4">
              <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">Error</h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-400">{detail.error_message}</p>
            </div>
          )}

          {detail.status === "generated" && (
            <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">QR Code</h3>
              <div className="mt-3">
                <img
                  src={`/api/einvoice/${detail.id}/qr`}
                  alt="E-Invoice QR Code"
                  className="h-48 w-48 border border-slate-200 dark:border-[#1a1a24] rounded-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm p-4 text-sm text-slate-500 dark:text-[#cbd5e1]">
            <p>Voucher ID: <span className="font-mono text-xs">{detail.voucher_id}</span></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">E-Invoice (GSTN IRP)</h1>
        <button onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
          {showCreate ? "Cancel" : "+ Create E-Invoice"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mt-4 rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm p-4 shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Select
                value={selectedVoucher}
                onChange={setSelectedVoucher}
                options={voucherOptions}
                label="B2B Voucher"
                required
                className="w-full"
              />
            </div>
            <div>
              <Select
                value={selectedGstin}
                onChange={setSelectedGstin}
                options={gstinOptions}
                label="Seller GSTIN"
                required
                className="w-full"
              />
            </div>
          </div>
          <button type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Create E-Invoice
          </button>
        </form>
      )}

      {loading ? (
        <ListSkeleton title="E-Invoice" cols={4} />
      ) : (
        <div className="mt-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#1a1a24] text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">
                <th className="px-3 py-2.5">Voucher</th>
                <th className="px-3 py-2.5">GSTIN</th>
                <th className="px-3 py-2.5">IRN</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Error</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {einvoices.map((ei) => (
                <tr key={ei.id} className="border-b border-slate-100 dark:border-[#1a1a24]/50 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#282832]"
                  onClick={() => viewDetail(ei)}>
                  <td className="py-2 font-medium">{ei.voucher_number || ei.voucher_id.slice(0, 8)}</td>
                  <td className="py-2 text-slate-600 dark:text-[#cbd5e1]">{ei.gstin || "—"}</td>
                  <td className="py-2 font-mono text-xs text-slate-600 dark:text-[#cbd5e1]">{ei.irn ? `${ei.irn.slice(0, 16)}...` : "—"}</td>
                  <td className="py-2">
                    <StatusBadge status={ei.status} />
                  </td>
                  <td className="py-2 text-xs text-red-600 dark:text-red-400 max-w-[200px] truncate">{ei.error_message || "—"}</td>
                  <td className="py-2 text-right">
                    {ei.status === "draft" && (
                      <button onClick={(e) => { e.stopPropagation(); handleGenerate(ei); }}
                        className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline">Generate</button>
                    )}
                  </td>
                </tr>
              ))}
              {einvoices.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-400 dark:text-[#64748b]">No e-invoices yet.</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
