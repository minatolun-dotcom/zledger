import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";
import Select from "./Select";
import DateInput from "./DateInput";
import AssetCategoryFormModal from "./AssetCategoryFormModal";

interface AssetCategory {
  id: string;
  name: string;
  depreciation_method: string;
  rate_pct: number;
  useful_life_years: number | null;
  is_active: boolean;
}

interface AssetRegister {
  id: string;
  category_id: string;
  asset_code: string | null;
  name: string;
  purchase_date: string;
  cost: number;
  salvage_value: number;
  accumulated_depreciation: number;
  wdv: number;
  put_to_use_date: string | null;
  is_active: boolean;
}

interface Props {
  mode: "create" | "edit";
  initial?: AssetRegister;
  categories: AssetCategory[];
  onClose: () => void;
  onSaved: () => void;
  onCategorySaved?: () => void;
}

const inputCls =
  "w-full rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-2 text-sm text-slate-900 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20";

export default function AssetRegisterFormModal({ mode, initial, categories, onClose, onSaved, onCategorySaved }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [asset_code, setAssetCode] = useState(initial?.asset_code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryList, setCategoryList] = useState<AssetCategory[]>(categories);
  const [category_id, setCategoryId] = useState(initial?.category_id ?? categories[0]?.id ?? "");
  const [showCatModal, setShowCatModal] = useState(false);
  const [purchase_date, setPurchaseDate] = useState(initial?.purchase_date ?? new Date().toISOString().split("T")[0]);
  const [put_to_use_date, setPutToUseDate] = useState(initial?.put_to_use_date ?? "");
  const [cost, setCost] = useState(initial?.cost ?? 0);
  const [salvage_value, setSalvage] = useState(initial?.salvage_value ?? 0);
  const [is_active, setIsActive] = useState(initial?.is_active ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !showCatModal) onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, showCatModal]);

  useEffect(() => { setCategoryList(categories); }, [categories]);

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    if (!category_id) { setError("Category is required"); return; }
    setError("");
    setSaving(true);
    const body = {
      category_id,
      asset_code: asset_code.trim() || null,
      name: name.trim(),
      purchase_date,
      put_to_use_date: put_to_use_date || null,
      cost: cost || 0,
      salvage_value: salvage_value || 0,
      is_active,
    };
    try {
      if (mode === "edit" && initial) {
        await api.patch(`/fixed-assets/assets/${initial.id}`, body);
      } else {
        await api.post("/fixed-assets/assets", body);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save asset");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800 dark:text-[#f1f5f9]">
            {mode === "edit" ? "Edit Asset" : "New Asset"}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#282832]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Asset Code</label>
            <input type="text" value={asset_code} onChange={(e) => setAssetCode(e.target.value)} className={inputCls} placeholder="e.g. IT001" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Dell Laptop" autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Category *</label>
            <div className="flex items-center gap-1.5">
              <Select
                value={category_id}
                onChange={setCategoryId}
                options={categoryList.map((c) => ({ value: c.id, label: c.name }))}
                className="mt-0 flex-1 min-w-0"
                placeholder="Select category"
              />
              <button
                type="button"
                onClick={() => setShowCatModal(true)}
                title="Create new category"
                className="flex-shrink-0 rounded-lg border border-slate-300 dark:border-[#282832] px-2.5 py-2 text-base font-bold leading-none text-brand-600 dark:text-blue-400 hover:bg-brand-50 dark:hover:bg-blue-500/10 transition-colors"
              >
                +
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Purchase Date</label>
            <DateInput value={purchase_date} onChange={setPurchaseDate} className="mt-0" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Put to Use Date</label>
            <DateInput value={put_to_use_date} onChange={setPutToUseDate} className="mt-0" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Cost (₹)</label>
            <input type="number" step="0.01" value={cost} onChange={(e) => setCost(parseFloat(e.target.value) || 0)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Salvage Value (₹)</label>
            <input type="number" step="0.01" value={salvage_value} onChange={(e) => setSalvage(parseFloat(e.target.value) || 0)} className={inputCls} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-[#cbd5e1]">
              <input type="checkbox" checked={is_active} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 dark:border-[#282832]" />
              Active
            </label>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose}
            className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="rounded-lg bg-brand-600 dark:bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50">
            {saving ? "Saving..." : mode === "edit" ? "Update Asset" : "Create Asset"}
          </button>
        </div>
      </div>

      {showCatModal && (
        <AssetCategoryFormModal
          mode="create"
          onClose={() => setShowCatModal(false)}
          onSaved={(cat) => {
            if (cat?.id) {
              setCategoryList((prev) => {
                if (prev.some((c) => c.id === cat.id)) return prev;
                return [cat, ...prev];
              });
              setCategoryId(cat.id);
            }
            onCategorySaved?.();
          }}
        />
      )}
    </div>
  );
}
