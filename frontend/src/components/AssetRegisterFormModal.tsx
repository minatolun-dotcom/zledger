import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { api } from "../api/client";
import DateInput from "./DateInput";
import AssetCategoryFormModal from "./AssetCategoryFormModal";
import useEscapeToClose from "../hooks/useEscapeToClose";

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

  /* ── Category searchable dropdown state ── */
  const [catSearchOpen, setCatSearchOpen] = useState(false);
  const [catSearchQuery, setCatSearchQuery] = useState("");
  const [catHighlighted, setCatHighlighted] = useState(-1);
  const catContainerRef = useRef<HTMLDivElement>(null);
  const catInputRef = useRef<HTMLInputElement>(null);
  const catListRef = useRef<HTMLDivElement>(null);
  const [catPopupStyle, setCatPopupStyle] = useState<React.CSSProperties>({});

  const catOptions = categoryList.map((c) => ({ value: c.id, label: c.name }));
  const selectedCat = catOptions.find((o) => o.value === category_id);
  const filteredCat = catOptions.filter((o) =>
    o.label.toLowerCase().includes(catSearchQuery.toLowerCase())
  );
  const catTrimmed = catSearchQuery.trim();
  const catShowCreate = catTrimmed.length > 0 &&
    !filteredCat.some((o) => o.label.toLowerCase() === catTrimmed.toLowerCase());

  /* Close on click outside */
  useEffect(() => {
    if (!catSearchOpen) return;
    const handler = (e: MouseEvent) => {
      if (catContainerRef.current && !catContainerRef.current.contains(e.target as Node)) {
        setCatSearchOpen(false);
        setCatSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [catSearchOpen]);

  /* Keyboard navigation (Escape, arrows, Enter) */
  useEffect(() => {
    if (!catSearchOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCatSearchOpen(false);
        setCatSearchQuery("");
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCatHighlighted((h) => {
          const max = filteredCat.length + (catShowCreate ? 1 : 0) - 1;
          return h < max ? h + 1 : 0;
        });
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCatHighlighted((h) => {
          const max = filteredCat.length + (catShowCreate ? 1 : 0) - 1;
          return h > 0 ? h - 1 : max;
        });
      }
      if (e.key === "Enter" && catHighlighted >= 0) {
        e.preventDefault();
        if (catHighlighted < filteredCat.length) {
          setCategoryId(filteredCat[catHighlighted].value);
          setCatSearchOpen(false);
          setCatSearchQuery("");
        } else {
          /* Last item = "Create" */
          setCatSearchOpen(false);
          setShowCatModal(true);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [catSearchOpen, catHighlighted, filteredCat, catShowCreate]);

  /* Scroll highlighted into view */
  useEffect(() => {
    if (!catSearchOpen || catHighlighted < 0 || !catListRef.current) return;
    const el = catListRef.current.children[catHighlighted] as HTMLElement;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [catHighlighted, catSearchOpen]);

  /* Reset highlight when opening */
  useEffect(() => {
    if (catSearchOpen) {
      setCatHighlighted(0);
      setTimeout(() => catInputRef.current?.focus(), 0);
    }
  }, [catSearchOpen]);

  /* Position popup portal */
  useLayoutEffect(() => {
    if (!catSearchOpen || !catContainerRef.current) return;
    const rect = catContainerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openDownward = spaceBelow >= 240 || spaceBelow > spaceAbove;
    setCatPopupStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      zIndex: 99999,
      maxHeight: 280,
      ...(openDownward ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
    });
  }, [catSearchOpen]);

  useEscapeToClose(!showCatModal, onClose);

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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
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
          <div ref={catContainerRef}>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Category *</label>
            <button
              type="button"
              onClick={() => setCatSearchOpen((o) => !o)}
              onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!catSearchOpen) setCatSearchOpen(true); } }}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                catSearchOpen
                  ? "border-brand-500 dark:border-blue-500/50 ring-1 ring-brand-500 dark:ring-blue-500/20"
                  : "border-slate-300 dark:border-[#282832]"
              } bg-white dark:bg-[#0f0f16] text-slate-800 dark:text-[#f1f5f9]`}
            >
              <span className={`truncate ${selectedCat ? "" : "text-slate-400 dark:text-[#64748b]"}`}>
                {selectedCat ? selectedCat.label : "Select category"}
              </span>
              <svg
                className={`ml-2 h-4 w-4 shrink-0 text-slate-400 dark:text-[#64748b] transition-transform ${catSearchOpen ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {catSearchOpen && createPortal(
              <div
                ref={catListRef}
                onMouseDown={(e) => e.stopPropagation()}
                style={catPopupStyle}
                className="overflow-auto rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] shadow-lg dark:shadow-dark-lg"
              >
                <div className="sticky top-0 z-10 border-b border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-2">
                  <input
                    ref={catInputRef}
                    type="text"
                    value={catSearchQuery}
                    onChange={(e) => { setCatSearchQuery(e.target.value); setCatHighlighted(0); }}
                    placeholder="Type to search..."
                    className="w-full rounded-md border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-1.5 text-sm text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div className="max-h-[200px] overflow-auto">
                  {filteredCat.length === 0 && !catShowCreate && (
                    <div className="px-3 py-2 text-sm text-slate-400 dark:text-[#64748b]">No categories found</div>
                  )}
                  {filteredCat.map((opt, i) => {
                    const isSelected = opt.value === category_id;
                    const isHighlighted = i === catHighlighted;
                    return (
                      <div
                        key={opt.value}
                        onClick={() => { setCategoryId(opt.value); setCatSearchOpen(false); setCatSearchQuery(""); }}
                        onMouseEnter={() => setCatHighlighted(i)}
                        className={`flex cursor-pointer items-center px-3 py-1.5 text-sm transition-colors ${
                          isHighlighted ? "bg-slate-100 dark:bg-[#1a1a24]" : ""
                        } ${isSelected ? "font-medium text-brand-600 dark:text-blue-400" : "text-slate-700 dark:text-[#cbd5e1]"}`}
                      >
                        <span className="truncate">{opt.label}</span>
                        {isSelected && (
                          <svg className="ml-auto h-4 w-4 shrink-0 text-brand-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </div>
                    );
                  })}
                  {catShowCreate && (
                    <div
                      onClick={() => { setCatSearchOpen(false); setShowCatModal(true); }}
                      onMouseEnter={() => setCatHighlighted(filteredCat.length)}
                      className={`flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                        catHighlighted === filteredCat.length
                          ? "bg-brand-50 dark:bg-blue-500/10 text-brand-700 dark:text-blue-300"
                          : "text-brand-600 dark:text-blue-400"
                      }`}
                    >
                      <span className="text-base leading-none">+</span>
                      <span className="truncate">Create &ldquo;{catTrimmed}&rdquo;</span>
                    </div>
                  )}
                </div>
              </div>,
              document.body
            )}
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
