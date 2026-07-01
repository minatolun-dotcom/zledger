import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { Ledger, Party, StockItem, Voucher } from "./types";
import type { EntityKey } from "./shared/QuickCreate/configs";
import { VOUCHER_TYPES } from "./types";

import ItemVoucherForm from "./forms/ItemVoucherForm";
import AmountVoucherForm from "./forms/AmountVoucherForm";
import JournalForm from "./forms/JournalForm";
import VoucherList from "./VoucherList";

const ITEM_TYPES = new Set(["sales", "purchase", "credit_note", "debit_note"]);
const AMOUNT_TYPES = new Set(["payment", "receipt", "contra"]);

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeType, setActiveType] = useState<string>("sales");
  const [filterType, setFilterType] = useState("all");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal state
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [modalError, setModalError] = useState("");

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

  // ── Create form handlers ──────────────────────────────────────────────────

  const handleSubmit = async (payload: any) => {
    setIsSubmitting(true);
    try {
      await api.post<Voucher>("/vouchers", payload);
      refresh();
    } catch (err: any) {
      const detail = err?.detail;
      setError(typeof detail === "string" ? detail : "Failed to create voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Modal handlers ────────────────────────────────────────────────────────

  const handleModalUpdate = async (id: string, payload: any) => {
    setIsSubmitting(true);
    setModalError("");
    try {
      const v = await api.patch<Voucher>(`/vouchers/${id}`, payload);
      setSelectedVoucher(v);
      refresh(false);
    } catch (err: any) {
      setModalError(err?.detail || "Failed to update voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalSubmit = async (payload: any) => {
    setIsSubmitting(true);
    setModalError("");
    try {
      await api.post<Voucher>("/vouchers", payload);
      setSelectedVoucher(null);
      refresh();
    } catch (err: any) {
      setModalError(err?.detail || "Failed to create voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalDuplicate = () => {
    if (!selectedVoucher) return;
    const dup = { ...selectedVoucher, id: undefined as any, voucher_number: "" };
    setSelectedVoucher(dup);
    setModalError("");
  };

  const handleModalDelete = async () => {
    if (!selectedVoucher?.id) return;
    if (!window.confirm("Delete this voucher?")) return;
    try {
      await api.del(`/vouchers/${selectedVoucher.id}`);
      setSelectedVoucher(null);
      refresh(true);
    } catch (err: any) {
      setModalError(err?.detail || "Failed to delete voucher");
    }
  };

  const handleModalClose = () => {
    setSelectedVoucher(null);
    setModalError("");
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
      setModalError("");
    } catch {
      setError("Failed to load voucher");
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
      error,
      setError,
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
      error: modalError,
      setError: setModalError,
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
      <div className="border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <h2 className="text-base font-bold text-slate-900 dark:text-[#f1f5f9]">Vouchers</h2>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}

      {/* Voucher type tabs + create form */}
      <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] shadow-sm">
        {/* Voucher type tabs */}
        <div className="border-b border-slate-200 dark:border-[#1e1e28] px-4 pt-1.5">
          <div className="flex gap-0.5 overflow-x-auto">
            {VOUCHER_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setActiveType(t.id);
                  setError("");
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t transition-colors whitespace-nowrap ${
                  activeType === t.id
                    ? "bg-brand-500 text-white shadow-sm"
                    : "text-slate-500 dark:text-[#94a3b8] hover:text-slate-800 dark:hover:text-[#f1f5f9] hover:bg-slate-100 dark:hover:bg-[#252530]"
                }`}
              >
                {t.shortLabel}
              </button>
            ))}
          </div>
        </div>

        {/* Form body */}
        <div className="p-4">
          {activeConfig && (
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">{activeConfig.label}</h3>
              <p className="text-[11px] text-slate-500 dark:text-[#94a3b8]">{activeConfig.description}</p>
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
      />

      {/* Voucher Modal */}
      {selectedVoucher && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 pt-10 pb-10">
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
              </div>
            </div>

            {/* Form */}
            <div className="p-5">
              {renderModalForm()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
