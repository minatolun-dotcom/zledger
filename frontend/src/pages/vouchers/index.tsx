import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../../api/client";

import type { Voucher } from "./types";
import { VOUCHER_TYPES, getVoucherColor } from "./types";
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
import TabContent from "../../components/TabContent";
import Select from "../../components/Select";
import type { FlowData } from "./shared/TransactionFlow";
import VoucherSidebar from "./shared/VoucherSidebar";
import type { VoucherSummaryData } from "./types";

import ItemVoucherForm from "./forms/ItemVoucherForm";
import AmountVoucherForm from "./forms/AmountVoucherForm";
import JournalForm from "./forms/JournalForm";
import SalesVoucherForm from "./forms/SalesVoucherForm";
import PurchaseVoucherForm from "./forms/PurchaseVoucherForm";
import ReceiptVoucherForm from "./forms/ReceiptVoucherForm";
import PaymentVoucherForm from "./forms/PaymentVoucherForm";
import ContraVoucherForm from "./forms/ContraVoucherForm";
import VoucherList from "./VoucherList";
import DayBookPage from "../DayBookPage";

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

type WorkspaceTab = "create" | "browse" | "daybook";

export default function VouchersPage() {
  const toast = useToastStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { ledgers, parties, stockItems, accountGroups } = useMasterData();
  const { data: financialYears = [] } = useFinancialYears();
  const { activeFyId, setActiveFy } = useFyStore();

  // ── Workspace tab ──────────────────────────────────────────────────────
  const rawTab = searchParams.get("tab");
  const workspaceTab: WorkspaceTab =
    rawTab === "browse" || rawTab === "daybook" ? rawTab : "create";

  const setWorkspaceTab = (tab: WorkspaceTab) => {
    setSearchParams({ tab }, { replace: tab === "create" });
  };

  // ── Create tab state ──────────────────────────────────────────────────
  const [activeType, setActiveType] = useState<string>(() => {
    const t = searchParams.get("type");
    return t && VOUCHER_TYPES.some((v) => v.id === t) ? t : "sales";
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [flowData, setFlowData] = useState<FlowData | null>(null);
  const [similarData, setSimilarData] = useState<any>(null);
  const [savedVoucher, setSavedVoucher] = useState<Voucher | null>(null);
  const [formError, setFormError] = useState("");
  const [voucherSummary, setVoucherSummary] = useState<VoucherSummaryData>({
    itemCount: 0, subtotal: 0, discountTotal: 0, taxableAmount: 0,
    cgst: 0, sgst: 0, igst: 0, roundOff: null, netAmount: 0,
    partyId: "", fromLedgerId: "", toLedgerId: "", amount: 0,
    totalDebit: 0, totalCredit: 0,
  });
  const autoOpenedRef = useRef(false);

  // ── Browse tab state ──────────────────────────────────────────────────
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState("voucher_date");
  const [sortOrder, setSortOrder] = useState("desc");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const skipLoadingRef = useRef(false);
  const fetchVouchersRef = useRef<() => void>(() => {});

  // ── Modal state (shared Create + Browse) ──────────────────────────────
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  // ── Browse: data fetch ────────────────────────────────────────────────
  const fetchVouchers = useCallback(() => {
    if (!skipLoadingRef.current) setLoading(true);
    const offset = (page - 1) * pageSize;
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    });
    if (filterType !== "all") params.set("voucher_type", filterType);
    if (search.trim()) params.set("search", search.trim());
    if (activeFyId) params.set("financial_year_id", activeFyId);
    params.set("sort_by", sortBy);
    params.set("sort_order", sortOrder);

    api.get<VoucherPage>(`/vouchers?${params.toString()}`)
      .then((data) => { setVouchers(data.items); setTotal(data.total); })
      .catch(() => { if (activeFyId) setActiveFy(null); })
      .finally(() => { if (!skipLoadingRef.current) setLoading(false); skipLoadingRef.current = false; });
  }, [page, pageSize, filterType, search, activeFyId, sortBy, sortOrder]);

  fetchVouchersRef.current = fetchVouchers;

  useEffect(() => { fetchVouchers(); }, [fetchVouchers]);

  const refresh = () => { fetchVouchersRef.current(); };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {}, 300);
  };

  const handleFilterChange = (type: string) => {
    setFilterType(type);
    setPage(1);
  };

  const handleSortChange = (sorting: { id: string; desc: boolean }[]) => {
    if (sorting.length > 0) {
      skipLoadingRef.current = true;
      setSortBy(sorting[0].id);
      setSortOrder(sorting[0].desc ? "desc" : "asc");
    }
  };

  // ── Auto-open from URL params ─────────────────────────────────────────
  useEffect(() => {
    if (autoOpenedRef.current) return;

    // ?v={id} → open modal
    const vid = searchParams.get("v");
    if (vid) {
      autoOpenedRef.current = true;
      setSearchParams({}, { replace: true });
      api.get<Voucher>(`/vouchers/${vid}`)
        .then((v) => setSelectedVoucher(v))
        .catch(() => {});
    }

    // ?similar={id} → switch to Create tab + pre-fill
    const similarId = searchParams.get("similar");
    if (similarId && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setSearchParams({}, { replace: true });
      setWorkspaceTab("create");
      api.get<Voucher>(`/vouchers/${similarId}`)
        .then((v) => {
          setActiveType(v.voucher_type);
          const counterLine = v.lines.find((l) => !l.stock_item_id && !l.hsn_sac_id && (l.debit > 0 || l.credit > 0));
          const itemLines = v.lines.filter((l) => l.stock_item_id).map((l) => ({
            ledger_id: l.ledger_id,
            stock_item_id: l.stock_item_id,
            hsn_sac_id: l.hsn_sac_id,
            is_inter_state: l.is_inter_state,
            is_reverse_charge: l.is_reverse_charge,
          }));
          setSimilarData({
            party_id: v.party_id,
            narration: v.narration,
            counterparty_gstin: v.counterparty_gstin,
            counterparty_state_code: v.counterparty_state_code,
            place_of_supply: v.place_of_supply,
            counterLedgerId: counterLine?.ledger_id,
            fromLedgerId: v.lines.find((l) => l.credit > 0)?.ledger_id,
            toLedgerId: v.lines.find((l) => l.debit > 0)?.ledger_id,
            lines: itemLines.length > 0 ? itemLines : undefined,
          });
          window.scrollTo({ top: 0, behavior: "smooth" });
        })
        .catch(() => {});
    }

    // ?action=new → switch to Create tab
    const action = searchParams.get("action");
    if (action === "new" && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      const t = searchParams.get("type");
      setSearchParams({}, { replace: true });
      setWorkspaceTab("create");
      if (t && VOUCHER_TYPES.some((v) => v.id === t)) setActiveType(t);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [searchParams]);

  // ── Tab click: sync URL without param ─────────────────────────────────
  useEffect(() => {
    if (workspaceTab === "create") {
      setSearchParams({}, { replace: true });
    }
  }, [workspaceTab]);

  // ── Create form handlers ──────────────────────────────────────────────
  const handleSubmit = async (payload: any) => {
    setIsSubmitting(true);
    try {
      const saved = await api.post<Voucher>("/vouchers", payload);
      setSavedVoucher(saved);
      refresh();
      setSimilarData(null);
      toast.success("Voucher created");
    } catch (err: any) {
      const detail = err?.detail;
      toast.error(typeof detail === "string" ? detail : "Failed to create voucher");
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Modal handlers ────────────────────────────────────────────────────
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

  const handleCreateSimilar = (voucher: Voucher) => {
    setSelectedVoucher(null);
    setSavedVoucher(null);
    navigate(`/vouchers?similar=${voucher.id}`);
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

  // ── Bulk handlers ─────────────────────────────────────────────────────
  const handleBulkCancel = async (ids: string[]) => {
    if (!await showConfirm(`Cancel ${ids.length} voucher(s)? Reversal entries will be created.`, { danger: true, confirmLabel: "Cancel Vouchers" })) return;
    try {
      const result = await api.post<{ processed: number; errors: string[] }>("/vouchers/bulk-cancel", { voucher_ids: ids, reason: "Bulk cancellation" });
      if (result.errors.length > 0) toast.error(`Completed with errors: ${result.errors.join("; ")}`);
      else toast.success(`Cancelled ${result.processed} voucher(s)`);
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel vouchers");
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    if (!await showConfirm(`Delete ${ids.length} voucher(s) permanently? This cannot be undone.`, { danger: true, confirmLabel: "Delete Vouchers" })) return;
    try {
      const result = await api.post<{ processed: number; errors: string[] }>("/vouchers/bulk-delete", { voucher_ids: ids });
      if (result.errors.length > 0) toast.error(`Completed with errors: ${result.errors.join("; ")}`);
      else toast.success(`Deleted ${result.processed} voucher(s)`);
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete vouchers");
    }
  };

  // ── Attachment handlers ───────────────────────────────────────────────
  const loadAttachments = async (voucherId: string) => {
    try {
      const data = await api.get<Attachment[]>(`/attachments/${voucherId}`);
      setAttachments(data);
    } catch { setAttachments([]); }
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
      toast.error(err?.message || "Failed to delete file");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedVoucher) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleModalClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [selectedVoucher]);

  // Post-save keyboard shortcuts (only in Create tab)
  useEffect(() => {
    if (!savedVoucher || workspaceTab !== "create") return;
    const sv = savedVoucher;
    function handleKey(e: KeyboardEvent) {
      if (!e.altKey) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setSavedVoucher(null);
        setActiveType(sv.voucher_type);
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        handleRowClick(sv.id);
        setSavedVoucher(null);
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        const blob = api.download(`/vouchers/${sv.id}/pdf`);
        blob.then((b) => {
          const url = URL.createObjectURL(b);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${sv.voucher_type}-${sv.voucher_number}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
      }
    }
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [savedVoucher, workspaceTab]);

  const handleRowClick = async (id: string) => {
    try {
      const v = await api.get<Voucher>(`/vouchers/${id}`);
      setSelectedVoucher(v);
      loadAttachments(id);
    } catch {
      toast.error("Failed to load voucher");
    }
  };

  // ── Quick Create ──────────────────────────────────────────────────────
  const handleQuickCreate = (_entityKey: string, _item: any) => {
    queryClient.invalidateQueries({ queryKey: ["ledgers"] });
    queryClient.invalidateQueries({ queryKey: ["parties"] });
    queryClient.invalidateQueries({ queryKey: ["stockItems"] });
    queryClient.invalidateQueries({ queryKey: ["accountGroups"] });
    queryClient.invalidateQueries({ queryKey: ["stockGroups"] });
  };

  // ── Create tab form ───────────────────────────────────────────────────
  const renderForm = () => {
    const sharedProps = {
      ledgers,
      parties,
      stockItems,
      accountGroups,
      onSubmit: handleSubmit,
      isSubmitting,
      error: formError,
      setError: setFormError,
      onQuickCreate: handleQuickCreate,
      createdFrom: VOUCHER_TYPES.find((t) => t.id === activeType)?.label || "Voucher",
      editingVoucher: null,
      onUpdate: undefined,
      onFlowChange: setFlowData,
      financialYears,
      setActiveFy,
      onSummary: setVoucherSummary,
      initialData: similarData || undefined,
    };
    if (activeType === "sales") {
      return <SalesVoucherForm key={activeType} {...sharedProps} />;
    }
    if (activeType === "purchase") {
      return <PurchaseVoucherForm key={activeType} {...sharedProps} />;
    }
    if (activeType === "receipt") {
      return <ReceiptVoucherForm key={activeType} {...sharedProps} />;
    }
    if (activeType === "payment") {
      return <PaymentVoucherForm key={activeType} {...sharedProps} />;
    }
    if (activeType === "contra") {
      return <ContraVoucherForm key={activeType} {...sharedProps} />;
    }
    if (AMOUNT_TYPES.has(activeType)) {
      return <AmountVoucherForm key={activeType} voucherType={activeType} {...sharedProps} />;
    }
    if (ITEM_TYPES.has(activeType)) {
      return <ItemVoucherForm key={activeType} voucherType={activeType} {...sharedProps} />;
    }
    return <JournalForm key={activeType} {...sharedProps} />;
  };

  // ── FY options for Browse filter ──────────────────────────────────────
  const fyOptions = financialYears.map((f) => ({ value: f.id, label: f.name }));

  // ── Workspace tab button class ────────────────────────────────────────
  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-semibold rounded-full transition-all ${
      active
        ? "bg-white text-brand-700 shadow-sm ring-1 ring-brand-200 dark:bg-[#30303d] dark:text-brand-300 dark:ring-[#4a4a5a]"
        : "text-slate-500 dark:text-[#64748b] hover:text-slate-700 dark:hover:text-white"
    }`;

  return (
    <div className="space-y-5">
      {/* ── Header + workspace tabs ───────────────────────────────────── */}
      <div className="flex items-center gap-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-[#f1f5f9] shrink-0">Vouchers</h1>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setWorkspaceTab("create")} className={tabClass(workspaceTab === "create")}>
            Create
          </button>
          <button onClick={() => setWorkspaceTab("browse")} className={tabClass(workspaceTab === "browse")}>
            Browse
          </button>
          <button onClick={() => setWorkspaceTab("daybook")} className={tabClass(workspaceTab === "daybook")}>
            Daybook
          </button>
        </div>
      </div>

      <TabContent activeKey={workspaceTab}>
      {/* ════════════════════════════════════════════════════════════════ */}
      {/* CREATE TAB                                                     */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {workspaceTab === "create" && (
        <Can
          permission="create_voucher"
          fallback={
            <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm px-5 py-6 text-sm text-slate-500 dark:text-[#64748b]">
              You have view-only access. Contact an owner to create vouchers.
            </div>
          }
        >
          <div className="flex gap-5 items-start">
            <div className="flex-[3] min-w-0">
              <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm">
                <div className="border-b border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#12121a] px-4 py-3 flex items-center rounded-t-xl">
                  <div className="overflow-x-auto flex-1 min-w-0">
                    <Tabs
                      tabs={VOUCHER_TYPES.map((t) => ({ key: t.id, label: t.shortLabel }))}
                      active={activeType}
                      onChange={(k) => { setActiveType(k); setSimilarData(null); setSavedVoucher(null); }}
                    />
                  </div>
                  <div className="ml-3 shrink-0">
                  </div>
                </div>
                <div className="p-5">
                  {savedVoucher ? (
                    <SavedVoucherBanner
                      voucher={savedVoucher}
                      onNewVoucher={() => { setSavedVoucher(null); setActiveType(savedVoucher.voucher_type); }}
                      onView={() => { handleRowClick(savedVoucher.id); setSavedVoucher(null); }}
                      onPrint={() => {
                        const blob = api.download(`/vouchers/${savedVoucher.id}/pdf`);
                        blob.then((b) => {
                          const url = URL.createObjectURL(b);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `${savedVoucher.voucher_type}-${savedVoucher.voucher_number}.pdf`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        });
                      }}
                      onCreateSimilar={() => handleCreateSimilar(savedVoucher)}
                    />
                  ) : (
                    renderForm()
                  )}
                </div>
              </div>
            </div>
            <div className="w-[320px] shrink-0 hidden lg:block">
              <div className="sticky top-4 space-y-4">
                <VoucherSidebar
                  summary={voucherSummary}
                  parties={parties}
                  voucherType={activeType}
                  flowData={flowData}
                  ledgers={ledgers}
                />
              </div>
            </div>
          </div>
        </Can>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* BROWSE TAB                                                     */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {workspaceTab === "browse" && (
        <>
          {/* Filters */}
          <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm px-5 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-48">
                <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">Financial Year</label>
                <Select
                  value={activeFyId || ""}
                  onChange={(v) => setActiveFy(v || null)}
                  options={fyOptions}
                  placeholder="All Years"
                />
              </div>
            </div>
          </div>

          {/* Voucher List */}
          <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm px-5 py-3">
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
              onSortChange={handleSortChange}
            />
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* DAYBOOK TAB                                                    */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {workspaceTab === "daybook" && (
        <DayBookPage />
      )}
      </TabContent>

      {/* ── VoucherModal (Create + Browse tabs) ──────────────────────── */}
      {workspaceTab !== "daybook" && (
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
          onCreateSimilar={() => selectedVoucher && handleCreateSimilar(selectedVoucher)}
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
      )}
    </div>
  );
}

// ── Post-Save Banner ──────────────────────────────────────────────────────

function SavedVoucherBanner({
  voucher,
  onNewVoucher,
  onView,
  onPrint,
  onCreateSimilar,
}: {
  voucher: Voucher;
  onNewVoucher: () => void;
  onView: () => void;
  onPrint: () => void;
  onCreateSimilar: () => void;
}) {
  const c = getVoucherColor(voucher.voucher_type);
  const typeLabel = VOUCHER_TYPES.find((t) => t.id === voucher.voucher_type)?.label || voucher.voucher_type;

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    const timer = setTimeout(onNewVoucher, 8000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/5 p-6 text-center">
      <div className="flex items-center justify-center gap-2 mb-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
          <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </span>
        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Voucher Saved</span>
      </div>
      <div className="mb-1">
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${c.bg} ${c.text}`}>
          {typeLabel}
        </span>
      </div>
      <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9] mb-1">{voucher.voucher_number}</p>
      <p className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1] mb-4">
        ₹{Number(voucher.grand_total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
      </p>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <button onClick={onPrint} className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#282832] transition-colors">
          Print
        </button>
        <button onClick={onView} className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#282832] transition-colors">
          View
        </button>
        <button onClick={onCreateSimilar} className="rounded-lg border border-brand-300 dark:border-blue-500/30 px-4 py-2 text-sm font-medium text-brand-700 dark:text-blue-400 hover:bg-brand-50 dark:hover:bg-blue-500/10 transition-colors">
          Create Similar
        </button>
        <button onClick={onNewVoucher} className="rounded-lg bg-brand-500 dark:bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 dark:hover:bg-blue-700 transition-colors">
          New Voucher
        </button>
      </div>
      <p className="mt-3 text-[11px] text-slate-400 dark:text-[#64748b]">
        Auto-clears in 8s · Alt+N new · Alt+E edit · Alt+P print
      </p>
    </div>
  );
}
