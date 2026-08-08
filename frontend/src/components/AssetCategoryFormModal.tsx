import { useState } from "react";
import { api } from "../api/client";
import Select from "./Select";
import Modal from "./Modal";

interface AssetCategory {
  id: string;
  name: string;
  depreciation_method: string;
  rate_pct: number;
  useful_life_years: number | null;
  is_active: boolean;
}

interface Props {
  mode: "create" | "edit";
  initial?: AssetCategory;
  onClose: () => void;
  onSaved?: (item?: AssetCategory) => void;
}

const METHOD_OPTIONS = [
  { value: "wdv", label: "WDV (Written Down Value)" },
  { value: "slm", label: "SLM (Straight Line)" },
];

const inputCls =
  "w-full rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-2 text-sm text-slate-900 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20";

export default function AssetCategoryFormModal({ mode, initial, onClose, onSaved }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [depreciation_method, setMethod] = useState(initial?.depreciation_method ?? "wdv");
  const [rate_pct, setRate] = useState(initial?.rate_pct ?? 0);
  const [useful_life_years, setLife] = useState<number | null>(initial?.useful_life_years ?? 5);
  const [is_active, setIsActive] = useState(initial?.is_active ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setError("");
    setSaving(true);
    const body = {
      name: name.trim(),
      depreciation_method,
      rate_pct: rate_pct || 0,
      useful_life_years: useful_life_years,
      is_active,
    };
    try {
      let saved: AssetCategory | undefined;
      if (mode === "edit" && initial) {
        saved = await api.patch<AssetCategory>(`/fixed-assets/categories/${initial.id}`, body);
      } else {
        saved = await api.post<AssetCategory>("/fixed-assets/categories", body);
      }
      onSaved?.(saved);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} maxWidth="lg" panelClassName="p-5" label={mode === "edit" ? "Edit Category" : "New Category"}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800 dark:text-[#f1f5f9]">
            {mode === "edit" ? "Edit Category" : "New Category"}
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
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Computers" autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Method</label>
            <Select value={depreciation_method} onChange={setMethod} options={METHOD_OPTIONS} className="mt-0" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Rate % (annual)</label>
            <input type="number" step="0.01" value={rate_pct} onChange={(e) => setRate(parseFloat(e.target.value) || 0)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Useful life (yrs)</label>
            <input type="number" value={useful_life_years ?? ""} onChange={(e) => setLife(e.target.value ? parseInt(e.target.value) : null)} className={inputCls} placeholder="Optional" />
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
            {saving ? "Saving..." : mode === "edit" ? "Update Category" : "Create Category"}
          </button>
        </div>
    </Modal>
  );
}
