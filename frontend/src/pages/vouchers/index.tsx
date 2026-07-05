import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import type { Ledger, Party, StockItem, Voucher } from "./types";
import type { EntityKey } from "./shared/QuickCreate/configs";
import { VOUCHER_TYPES, getVoucherColor } from "./types";
import { useToastStore } from "../../store/toast";
import { showConfirm } from "../../components/ConfirmDialog";
import PdfPreviewModal from "../../components/PdfPreviewModal";

import ItemVoucherForm from "./forms/ItemVoucherForm";
import AmountVoucherForm from "./forms/AmountVoucherForm";
import JournalForm from "./forms/JournalForm";
import VoucherList from "./VoucherList";

interface Attachment {
  id: string; voucher_id: string; original_filename: string;
  mime_type: string; file_size: number; uploaded_by: string | null; created_at: string | null;
}

const ITEM_TYPES = new Set(["sales", "purchase", "credit_note", "debit_note"]);
const AMOUNT_TYPES = new Set(["payment", "receipt", "contra"]);

export default function VouchersPage() {
  const toast = useToastStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeType, setActiveType] = useState<string>("sales");
  const [filterType, setFilterType] = useState("all");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal state
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const autoOpenedRef = useRef(false);

  const refresh = (includeMaster: boolean = true) => {
    setLoading(true);
    const fetches: Promise<any>[] = [api.get<Voucher[]>("/vouchers")];
    if (includeMaster) {
      fetches.push(
        api.get<Ledger[]>("/coa/ledgers"),
        api.get<Party[]>("/coa/parties"),
        api.get<StockItem[]>("/inventory/items"),
      );
    }
    Promise.all(fetches)
      .then(([v, ...rest]) => {
        setVouchers(v);
        if (includeMaster && rest.length >= 3) {
          setLedgers(rest[0]);
          setParties(rest[1]);
          setStockItems(rest[2]);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh(true);
  }, []);

  // Auto-open voucher from URL param ?v={id}
  useEffect(() => {
    if (autoOpenedRef.current) return;
    const vid = searchParams.get("v");
    if (vid) {
      autoOpenedRef.current = true;
      setSearchParams({}, { replace: true });
      api.get<Voucher>(`/vouchers/${vid}`)
        .then((v) => setSelectedVoucher(v))
        .catch(() => {});
    }
  }, [searchParams]);

  // ── Create form handlers ──────────────────────────────────────────────────

  const handleSubmit = async (payload: any) => {
    setIsSubmitting(true);
    try {
      await api.post<Voucher>("/vouchers", payload);
      refresh();
      toast.success("Voucher created");
    } catch (err: any) {
      const detail = err?.detail;
      toast.error(typeof detail === "string" ? detail : "Failed to create voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Modal handlers ────────────────────────────────────────────────────────

  const handleModalUpdate = async (id: string, payload: any) => {
    setIsSubmitting(true);
    try {
      const v = await api.patch<Voucher>(`/vouchers/${id}`, payload);
      setSelectedVoucher(v);
      refresh(false);
      toast.success("Voucher updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalSubmit = async (payload: any) => {
    setIsSubmitting(true);
    try {
      await api.post<Voucher>("/vouchers", payload);
      setSelectedVoucher(null);
      refresh();
      toast.success("Voucher created");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalDuplicate = () => {
    if (!selectedVoucher) return;
    const dup = { ...selectedVoucher, id: undefined as any, voucher_number: "" };
    setSelectedVoucher(dup);
  };

  const handleModalDelete = async () => {
    if (!selectedVoucher?.id) return;
    if (!await showConfirm("Delete this voucher?", { danger: true, confirmLabel: "Delete" })) return;
    try {
      await api.del(`/vouchers/${selectedVoucher.id}`);
      setSelectedVoucher(null);
      refresh(true);
      toast.success("Voucher deleted");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete voucher");
    }
  };

  const handleModalClose = () => {
    setSelectedVoucher(null);
    setAttachments([]);
  };

  // ── Bulk handlers ────────────────────────────────────────────────────────

  const handleBulkCancel = async (ids: string[]) => {
    if (!await showConfirm(`Cancel ${ids.length} voucher(s)? Reversal entries will be created.`, { danger: true, confirmLabel: "Cancel Vouchers" })) return;
    try {
      const result = await api.post<{ processed: number; errors: string[] }>("/vouchers/bulk-cancel", { voucher_ids: ids, reason: "Bulk cancellation" });
      if (result.errors.length > 0) {
        toast.error(`Completed with errors: ${result.errors.join("; ")}`);
      } else {
        toast.success(`Cancelled ${result.processed} voucher(s)`);
      }
      refresh(true);
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel vouchers");
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    if (!await showConfirm(`Delete ${ids.length} voucher(s) permanently? This cannot be undone.`, { danger: true, confirmLabel: "Delete Vouchers" })) return;
    try {
      const result = await api.post<{ processed: number; errors: string[] }>("/vouchers/bulk-delete", { voucher_ids: ids });
      if (result.errors.length > 0) {
        toast.error(`Completed with errors: ${result.errors.join("; ")}`);
      } else {
        toast.success(`Deleted ${result.processed} voucher(s)`);
      }
      refresh(true);
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete vouchers");
    }
  };

  // ── Attachment handlers ──────────────────────────────────────────────────

  const loadAttachments = async (voucherId: string) => {
    try {
      const data = await api.get<Attachment[]>(`/attachments/${voucherId}`);
      setAttachments(data);
    } catch {
      setAttachments([]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedVoucher?.id) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post(`/attachments/upload/${selectedVoucher.id}`, formData);
      loadAttachments(selectedVoucher.id);
    } catch (err: any) {
      toast.error(err?.message || "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!await showConfirm("Delete this attachment?", { danger: true, confirmLabel: "Delete" })) return;
    try {
      await api.del(`/attachments/${attachmentId}`);
      if (selectedVoucher?.id) loadAttachments(selectedVoucher.id);
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete attachment");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  useEffect(() => {
    if (!selectedVoucher) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleModalClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [selectedVoucher]);

  const handleRowClick = async (id: string) => {
    try {
      const v = await api.get<Voucher>(`/vouchers/${id}`);
      setSelectedVoucher(v);
      loadAttachments(id);
    } catch {
      toast.error("Failed to load voucher");
    }
  };

  // ── Quick Create ──────────────────────────────────────────────────────────

  const handleQuickCreate = (entityKey: string, item: any) => {
    switch (entityKey as EntityKey) {
      case "ledger":
        setLedgers((prev) => [...prev, item]);
        break;
      case "party":
        setParties((prev) => [...prev, item]);
        break;
      case "stock_item":
        setStockItems((prev) => [...prev, item]);
        break;
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const renderForm = () => {
    const sharedProps = {
      ledgers,
      parties,
      stockItems,
      onSubmit: handleSubmit,
      isSubmitting,
      error: "",
      setError: () => {},
      onQuickCreate: handleQuickCreate,
      editingVoucher: null,
      onUpdate: undefined,
    };

    if (ITEM_TYPES.has(activeType)) {
      return <ItemVoucherForm key={activeType} voucherType={activeType} {...sharedProps} />;
    }
    if (AMOUNT_TYPES.has(activeType)) {
      return <AmountVoucherForm key={activeType} voucherType={activeType} {...sharedProps} />;
    }
    return <JournalForm key={activeType} {...sharedProps} />;
  };

  const activeConfig = VOUCHER_TYPES.find((t) => t.id === activeType);

  // ── Modal form component ──────────────────────────────────────────────────

  const renderModalForm = () => {
    if (!selectedVoucher) return null;
    const sharedProps = {
      ledgers,
      parties,
      stockItems,
      onSubmit: handleModalSubmit,
      isSubmitting,
      error: "",
      setError: () => {},
      editingVoucher: selectedVoucher,
      onUpdate: selectedVoucher?.id ? handleModalUpdate : undefined,
    };
    const vt = selectedVoucher.voucher_type;
    if (ITEM_TYPES.has(vt)) {
      return <ItemVoucherForm key={selectedVoucher.id || "new"} voucherType={vt} {...sharedProps} />;
    }
    if (AMOUNT_TYPES.has(vt)) {
      return <AmountVoucherForm key={selectedVoucher.id || "new"} voucherType={vt} {...sharedProps} />;
    }
    return <JournalForm key={selectedVoucher.id || "new"} {...sharedProps} />;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border-b border-slate-200/60 dark:border-[#1e1e28] pb-3">
        <h2 className="text-base font-bold text-slate-900 dark:text-[#f1f5f9]">Vouchers</h2>
      </div>

      {/* Voucher type tabs + create form */}
      <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] shadow-sm">
        {/* Voucher type tabs */}
        <div className="border-b border-slate-200 dark:border-[#1e1e28] px-4 pt-2">
          <div className="flex gap-1 overflow-x-auto">
            {VOUCHER_TYPES.map((t) => {
              const c = getVoucherColor(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveType(t.id);
                  }}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all whitespace-nowrap ${
                    activeType === t.id
                      ? c.tabActive
                      : `text-slate-500 dark:text-[#94a3b8] ${c.tab}`
                  }`}
                >
                  <span className="text-base leading-none">{t.icon}</span>
                  {t.shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* Form body */}
        <div className="p-5">
          {activeConfig && (
            <div className="mb-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">{activeConfig.label}</h3>
              <p className="text-xs text-slate-500 dark:text-[#94a3b8]">{activeConfig.description}</p>
            </div>
          )}
          {renderForm()}
        </div>
      </div>

      {/* Recent Vouchers */}
      <div className="border-b border-slate-200 dark:border-[#1e1e28] pb-1">
        <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">Recent Vouchers</h3>
      </div>
      <VoucherList
        vouchers={vouchers}
        loading={loading}
        filterType={filterType}
        onFilterChange={setFilterType}
        onClick={handleRowClick}
        onBulkCancel={handleBulkCancel}
        onBulkDelete={handleBulkDelete}
      />

      {/* Voucher Modal */}
      {selectedVoucher && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 pt-10 pb-10" onClick={(e) => { if (e.target === e.currentTarget) handleModalClose(); }}>
          <div className="relative w-full max-w-4xl rounded-xl bg-white dark:bg-[#18181f] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">
                {selectedVoucher.id
                  ? (selectedVoucher.voucher_type.charAt(0).toUpperCase() + selectedVoucher.voucher_type.slice(1).replace(/_/, " "))
                    + ' — ' + selectedVoucher.voucher_number
                  : 'Duplicate ' + (selectedVoucher.voucher_type.charAt(0).toUpperCase() + selectedVoucher.voucher_type.slice(1).replace(/_/, " "))
                }
              </h3>
              <div className="flex items-center gap-2">
                {selectedVoucher.id ? (
                  <>
                    <button onClick={handleModalDuplicate} className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#1e1e28]">Duplicate</button>
                    <button onClick={handleModalDelete} className="rounded border border-red-200 dark:border-red-500/20 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10">Delete</button>
                  </>
                ) : (
                  <span className="text-xs text-amber-600 font-medium">Pre-filled from original — edit and save as new</span>
                )}
                <button onClick={handleModalClose} className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#1e1e28]">Close</button>
                {selectedVoucher.id && (
                  <>
                    <button onClick={() => { setPreviewUrl(`/vouchers/${selectedVoucher.id}/pdf`); setPreviewTitle(`${selectedVoucher.voucher_type} ${selectedVoucher.voucher_number}`); }} className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#1e1e28]">Preview PDF</button>
                    <button onClick={() => { const blob = api.download(`/vouchers/${selectedVoucher.id}/pdf`); blob.then(b => { const url = URL.createObjectURL(b); const a = document.createElement("a"); a.href = url; a.download = `${selectedVoucher.voucher_type}-${selectedVoucher.voucher_number}.pdf`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }); }} className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#1e1e28]">Print PDF</button>
                  </>
                )}
              </div>
            </div>

            {/* Form */}
            <div className="p-5">
              {renderModalForm()}
            </div>

            {/* Attachments */}
            {selectedVoucher.id && (
              <div className="border-t border-slate-200 dark:border-[#1e1e28] px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#64748b]">
                    Attachments ({attachments.length})
                  </h4>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc,.csv,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                    >
                      {uploading ? "Uploading..." : "Upload File"}
                    </button>
                  </div>
                </div>
                {attachments.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-[#64748b]">No attachments. Click "Upload File" to add one.</p>
                ) : (
                  <div className="space-y-1.5">
                    {attachments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-[#1a1a24] px-3 py-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-sm">
                            {a.mime_type.includes("pdf") ? "📄" : a.mime_type.includes("image") ? "🖼️" : "📎"}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{a.original_filename}</p>
                            <p className="text-[11px] text-slate-500 dark:text-[#64748b]">{formatFileSize(a.file_size)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={async () => {
                              try {
                                const blob = await api.download(`/attachments/${selectedVoucher.id}/download/${a.id}`);
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement("a");
                                link.href = url;
                                link.download = a.original_filename;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                URL.revokeObjectURL(url);
                              } catch { /* ignore */ }
                            }}
                            className="rounded p-1.5 text-slate-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
                            title="Download"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                          </button>
                          <button
                            onClick={() => handleDeleteAttachment(a.id)}
                            className="rounded p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            title="Delete"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {previewUrl && (
        <PdfPreviewModal
          url={previewUrl}
          title={previewTitle}
          onClose={() => { setPreviewUrl(null); setPreviewTitle(""); }}
        />
      )}
    </div>
  );
}
