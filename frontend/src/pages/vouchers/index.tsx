import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api/client";

import type { Voucher } from "./types";
import { VOUCHER_TYPES } from "./types";
import { useToastStore } from "../../store/toast";
import { showConfirm } from "../../components/ConfirmDialog";
import { useMasterData } from "../../hooks/useMasterData";
import { useFinancialYears } from "../../hooks/useMasterData";
import { queryClient } from "../../lib/queryClient";
import { useFyStore } from "../../store/fy";
import VoucherModal from "../../components/VoucherModal";
import Can from "../../components/Can";
import Button from "../../components/Button";
import Tabs from "../../components/Tabs";
import TransactionFlow from "./shared/TransactionFlow";
import type { FlowData } from "./shared/TransactionFlow";

import ItemVoucherForm from "./forms/ItemVoucherForm";
import AmountVoucherForm from "./forms/AmountVoucherForm";
import JournalForm from "./forms/JournalForm";
import VoucherList from "./VoucherList";

interface Attachment {
  id: string; voucher_id: string; original_filename: string;
  mime_type: string; file_size: number; uploaded_by: string | null; created_at: string | null;
}

interface VoucherPage {
  items: Voucher[];
  total: number;
  limit: number;
  offset: number;
}

const ITEM_TYPES = new Set(["sales", "purchase", "credit_note", "debit_note"]);
const AMOUNT_TYPES = new Set(["payment", "receipt", "contra"]);

export default function VouchersPage() {
  const toast = useToastStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const { ledgers, parties, stockItems, accountGroups } = useMasterData();
  const { data: financialYears = [] } = useFinancialYears();
  const [loading, setLoading] = useState(true);
  const { activeFyId, setActiveFy } = useFyStore();

  // Pagination state
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  const [activeType, setActiveType] = useState<string>("sales");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [flowData, setFlowData] = useState<FlowData | null>(null);

  // Modal state
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const autoOpenedRef = useRef(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchVouchersRef = useRef<() => void>(() => {});

  const fetchVouchers = useCallback(() => {
    setLoading(true);
    const offset = (page - 1) * pageSize;
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    });
    if (filterType !== "all") {
      params.set("voucher_type", filterType);
    }
    if (search.trim()) {
      params.set("search", search.trim());
    }
    if (activeFyId) {
      params.set("financial_year_id", activeFyId);
    }
    api.get<VoucherPage>(`/vouchers?${params.toString()}`)
      .then((data) => {
        setVouchers(data.items);
        setTotal(data.total);
      })
      .catch(() => {
        if (activeFyId) {
          setActiveFy(null);
        }
      })
      .finally(() => setLoading(false));
  }, [page, pageSize, filterType, search, activeFyId]);

  fetchVouchersRef.current = fetchVouchers;

  const refresh = () => {
    fetchVouchersRef.current();
  };

  useEffect(() => {
    fetchVouchers();
  }, []);

  // Refetch when pagination/filter/search changes
  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1); // Reset to first page on search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      // The useEffect will trigger fetchVouchers
    }, 300);
  };

  // Reset to first page when filter changes
  const handleFilterChange = (type: string) => {
    setFilterType(type);
    setPage(1);
  };

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
    // Auto-open create form from command palette (?action=new)
    const action = searchParams.get("action");
    if (action === "new" && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setSearchParams({}, { replace: true });
      // Form is already visible by default; scroll to it
      window.scrollTo({ top: 0, behavior: "smooth" });
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
      refresh();
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
      refresh();
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
      refresh();
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
      refresh();
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

  const handleQuickCreate = (_entityKey: string, _item: any) => {
    // Refetch master data to include the newly created item
    queryClient.invalidateQueries({ queryKey: ["ledgers"] });
    queryClient.invalidateQueries({ queryKey: ["parties"] });
    queryClient.invalidateQueries({ queryKey: ["stockItems"] });
    queryClient.invalidateQueries({ queryKey: ["accountGroups"] });
    queryClient.invalidateQueries({ queryKey: ["stockGroups"] });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const renderForm = () => {
    const sharedProps = {
      ledgers,
      parties,
      stockItems,
      accountGroups,
      onSubmit: handleSubmit,
      isSubmitting,
      error: "",
      setError: () => {},
      onQuickCreate: handleQuickCreate,
      createdFrom: VOUCHER_TYPES.find((t) => t.id === activeType)?.label || "Voucher",
      editingVoucher: null,
      onUpdate: undefined,
      onFlowChange: setFlowData,
      financialYears,
      setActiveFy,
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

  return (
    <div className="space-y-5">
      {/* Header — title + live transaction flow indicator */}
      <div className="flex items-center gap-5">
        <h1 className="text-xl font-bold text-slate-900 dark:text-[#f1f5f9] shrink-0">Vouchers</h1>
        {flowData && (
          <div className="flex-1 min-w-0">
            <TransactionFlow {...flowData} ledgers={ledgers} />
          </div>
        )}
      </div>

      {/* Voucher type tabs + create form */}
      <Can
        permission="create_voucher"
        fallback={
          <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm px-5 py-6 text-sm text-slate-500 dark:text-[#64748b]">
            You have view-only access. Contact an owner to create vouchers.
          </div>
        }
      >
        <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm">
          {/* Voucher type tabs */}
          <div className="border-b border-slate-200 dark:border-[#1a1a24] px-4 py-3 overflow-x-auto">
            <Tabs
              tabs={VOUCHER_TYPES.map((t) => ({ key: t.id, label: t.shortLabel }))}
              active={activeType}
              onChange={(k) => setActiveType(k)}
            />
          </div>

          {/* Form body */}
          <div className="p-5">
            {activeConfig && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">{activeConfig.label}</h3>
                <p className="text-xs text-slate-500 dark:text-[#cbd5e1]">{activeConfig.description}</p>
              </div>
            )}
            {renderForm()}
          </div>
        </div>
      </Can>

      {/* Recent Vouchers */}
      <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">Recent Vouchers</h3>
      <VoucherList
        vouchers={vouchers}
        loading={loading}
        filterType={filterType}
        onFilterChange={handleFilterChange}
        onClick={handleRowClick}
        onBulkCancel={handleBulkCancel}
        onBulkDelete={handleBulkDelete}
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        search={search}
        onSearchChange={handleSearchChange}
      />

      {/* Voucher Modal */}
      <VoucherModal
        voucher={selectedVoucher}
        isSubmitting={isSubmitting}
        ledgers={ledgers}
        parties={parties}
        stockItems={stockItems}
        accountGroups={accountGroups}
        onSubmit={handleModalSubmit}
        onUpdate={handleModalUpdate}
        onDuplicate={handleModalDuplicate}
        onDelete={handleModalDelete}
        onClose={handleModalClose}
        showPdfActions
        onPreviewPdf={() => {
          if (selectedVoucher?.id) {
            setPreviewUrl(`/vouchers/${selectedVoucher.id}/pdf`);
            setPreviewTitle(`${selectedVoucher.voucher_type} ${selectedVoucher.voucher_number}`);
          }
        }}
        onPrintPdf={() => {
          if (!selectedVoucher?.id) return;
          const blob = api.download(`/vouchers/${selectedVoucher.id}/pdf`);
          blob.then((b) => {
            const url = URL.createObjectURL(b);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${selectedVoucher.voucher_type}-${selectedVoucher.voucher_number}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          });
        }}
        previewUrl={previewUrl}
        previewTitle={previewTitle}
        onPreviewClose={() => { setPreviewUrl(null); setPreviewTitle(""); }}
        financialYears={financialYears}
        setActiveFy={setActiveFy}
        attachments={
          selectedVoucher?.id ? (
            <div className="border-t border-slate-200 dark:border-[#1a1a24] px-5 py-4">
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
                  <Button variant="primary" size="xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? "Uploading..." : "Upload File"}
                  </Button>
                </div>
              </div>
              {attachments.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-[#64748b]">No attachments. Click "Upload File" to add one.</p>
              ) : (
                <div className="space-y-1.5">
                  {attachments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-[#282832] px-3 py-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm">
                          {a.mime_type.includes("pdf") ? "📄" : a.mime_type.includes("image") ? "🖼️" : "📎"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-[#f1f5f9] truncate">{a.original_filename}</p>
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
                          className="rounded p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
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
          ) : undefined
        }
      />
    </div>
  );
}
