import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import { useRole } from "../hooks/useRole";
import Select from "../components/Select";
import ContextMenu from "../components/ContextMenu";
import { showConfirm } from "../components/ConfirmDialog";

import AssetCategoryFormModal from "../components/AssetCategoryFormModal";
import AssetRegisterFormModal from "../components/AssetRegisterFormModal";

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

interface DepreciationLine {
  asset_id: string;
  asset_code: string | null;
  name: string;
  category: string;
  method: string;
  opening_wdv: number;
  depreciation: number;
  closing_wdv: number;
}

interface FinancialYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

const TABS = [
  { key: "register", label: "Asset Register" },
  { key: "categories", label: "Categories" },
  { key: "depreciation", label: "Depreciation" },
];

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n || 0);

export default function FixedAssetsPage() {
  const toast = useToastStore();
  const { canEdit } = useRole();
  const [tab, setTab] = useState<"register" | "categories" | "depreciation">("register");

  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [assets, setAssets] = useState<AssetRegister[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [catModal, setCatModal] = useState<{ mode: "create" | "edit"; initial?: AssetCategory } | null>(null);
  const [assetModal, setAssetModal] = useState<{ mode: "create" | "edit"; initial?: AssetRegister } | null>(null);

  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<{ id: string; kind: "asset" | "cat"; x: number; y: number } | null>(null);

  // Depreciation
  const [fys, setFys] = useState<FinancialYear[]>([]);
  const [selectedFy, setSelectedFy] = useState<string>("");
  const [schedule, setSchedule] = useState<DepreciationLine[]>([]);
  const [scheduleTotal, setScheduleTotal] = useState(0);
  const [depLoading, setDepLoading] = useState(false);

  const refreshCategories = () => {
    return api
      .get<AssetCategory[]>("/fixed-assets/categories")
      .then(setCategories)
      .catch((e) => toast.error(e?.message || "Failed to load categories"));
  };

  const refreshAssets = () => {
    setLoading(true);
    api
      .get<AssetRegister[]>("/fixed-assets/assets")
      .then(setAssets)
      .catch((e) => toast.error(e?.message || "Failed to load assets"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    Promise.all([refreshCategories(), refreshAssets()]);
    api
      .get<FinancialYear[]>("/coa/financial-years")
      .then((list) => {
        setFys(list);
        if (list.length) setSelectedFy(list[list.length - 1].id);
      })
      .catch(() => {});
  }, []);

  // ── Category handlers ──
  const editCat = (c: AssetCategory) => {
    setCatModal({ mode: "edit", initial: c });
  };

  const deleteCat = async (id: string) => {
    if (!(await showConfirm("Delete this category?", { danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api.del(`/fixed-assets/categories/${id}`);
      await refreshCategories();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    }
  };

  // ── Asset handlers ──
  const editAsset = (a: AssetRegister) => {
    setAssetModal({ mode: "edit", initial: a });
  };

  const deleteAsset = async (id: string) => {
    if (!(await showConfirm("Delete this asset?", { danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api.del(`/fixed-assets/assets/${id}`);
      await refreshAssets();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    }
  };

  // ── Depreciation handlers ──
  const loadSchedule = async () => {
    if (!selectedFy) return;
    setDepLoading(true);
    try {
      const data = await api.get<{ total_depreciation: number; lines: DepreciationLine[] }>(
        `/fixed-assets/depreciation/schedule?financial_year_id=${selectedFy}`
      );
      setSchedule(data.lines);
      setScheduleTotal(data.total_depreciation);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load schedule");
    } finally {
      setDepLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "depreciation" && selectedFy) loadSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedFy]);

  const runDepreciation = async () => {
    if (!selectedFy) return;
    if (!(await showConfirm(`Post depreciation journal for the selected financial year?`, { confirmLabel: "Run" }))) return;
    try {
      const data = await api.post<{ message: string; total_depreciation: number }>(
        "/fixed-assets/depreciation/run",
        { financial_year_id: selectedFy, force: false }
      );
      toast.success(data.message || "Depreciation posted");
      await loadSchedule();
    } catch (e: any) {
      toast.error(e?.message || "Failed to post depreciation");
    }
  };

  const catName = (id: string) => categories.find((c) => c.id === id)?.name || "—";
  const filteredAssets = assets.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      (a.asset_code || "").toLowerCase().includes(q) ||
      catName(a.category_id).toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Fixed Assets</h1>
          {!loading && <p className="text-sm text-slate-500 dark:text-[#64748b] mt-1">{assets.length} assets · {categories.length} categories</p>}
        </div>
        {tab === "categories" && canEdit ? (
          <button
            onClick={() => setCatModal({ mode: "create" })}
            className="rounded-lg bg-brand-600 dark:bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600"
          >
            + New Category
          </button>
        ) : tab === "register" && canEdit ? (
          <button
            onClick={() => setAssetModal({ mode: "create" })}
            className="rounded-lg bg-brand-600 dark:bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600"
          >
            + New Asset
          </button>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 border-b border-slate-200 dark:border-[#1a1a24]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-brand-600 dark:border-blue-500 text-brand-600 dark:text-blue-400"
                : "text-slate-500 dark:text-[#cbd5e1] hover:text-slate-700 dark:hover:text-[#f1f5f9]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Categories tab ── */}
      {tab === "categories" && (
        <div className="mt-4">
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-[#1a1a24]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 dark:border-[#282832] bg-slate-50 dark:bg-[#16161f]/80 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Method</th>
                  <th className="px-3 py-2.5">Rate %</th>
                  <th className="px-3 py-2.5">Life (yrs)</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 dark:border-[#1a1a24]">
                    <td className="px-3 py-2 font-medium">{c.name}</td>
                    <td className="px-3 py-2 uppercase">{c.depreciation_method}</td>
                    <td className="px-3 py-2">{c.rate_pct}%</td>
                    <td className="px-3 py-2">{c.useful_life_years ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${c.is_active ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-slate-100 dark:bg-[#282832] text-slate-500 dark:text-[#64748b]"}`}>
                        {c.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="relative flex justify-end">
                        <button onClick={(e) => setMenu({ id: c.id, kind: "cat", x: e.clientX, y: e.clientY })} className="rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#1a1a24]">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {categories.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-500 dark:text-[#cbd5e1]">No categories yet. Create one to start tracking assets.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Register tab ── */}
      {tab === "register" && (
        <div className="mt-4">
          <div className="mb-3">
            <input type="text" placeholder="Search assets..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-xs rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-1.5 text-sm text-slate-900 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-[#1a1a24]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 dark:border-[#282832] bg-slate-50 dark:bg-[#16161f]/80 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">
                  <th className="px-3 py-2.5">Code</th>
                  <th className="px-3 py-2.5">Asset</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Purchase Date</th>
                  <th className="px-3 py-2.5 text-right">Cost</th>
                  <th className="px-3 py-2.5 text-right">Accum. Dep.</th>
                  <th className="px-3 py-2.5 text-right">WDV</th>
                  <th className="px-3 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="py-8 text-center text-sm text-slate-500 dark:text-[#cbd5e1]">Loading…</td></tr>
                ) : (
                  filteredAssets.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100 dark:border-[#1a1a24]">
                      <td className="px-3 py-2 text-slate-500 dark:text-[#64748b]">{a.asset_code || "—"}</td>
                      <td className="px-3 py-2 font-medium">{a.name}</td>
                      <td className="px-3 py-2">{catName(a.category_id)}</td>
                      <td className="px-3 py-2">{a.purchase_date}</td>
                      <td className="px-3 py-2 text-right">{money(a.cost)}</td>
                      <td className="px-3 py-2 text-right text-amber-600 dark:text-amber-400">{money(a.accumulated_depreciation)}</td>
                      <td className="px-3 py-2 text-right font-medium">{money(a.wdv)}</td>
                      <td className="px-3 py-2">
                        <div className="relative flex justify-end">
                          <button onClick={(e) => setMenu({ id: a.id, kind: "asset", x: e.clientX, y: e.clientY })} className="rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#1a1a24]">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
                {!loading && filteredAssets.length === 0 && (
                  <tr><td colSpan={8} className="py-8 text-center text-sm text-slate-500 dark:text-[#cbd5e1]">No assets yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Depreciation tab ── */}
      {tab === "depreciation" && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Financial Year</label>
              <Select
                value={selectedFy}
                onChange={setSelectedFy}
                options={fys.map((f) => ({ value: f.id, label: f.name }))}
                className="mt-1 w-48"
                placeholder="Select FY"
              />
            </div>
            <button onClick={loadSchedule} disabled={!selectedFy || depLoading}
              className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#1a1a24] disabled:opacity-50">
              {depLoading ? "Loading…" : "Preview"}
            </button>
            {canEdit && (
              <button onClick={runDepreciation} disabled={!selectedFy || scheduleTotal <= 0}
                className="rounded-lg bg-brand-600 dark:bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600 disabled:opacity-50">
                Run Depreciation
              </button>
            )}
          </div>

          {schedule.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-[#1a1a24]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-300 dark:border-[#282832] bg-slate-50 dark:bg-[#16161f]/80 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">
                      <th className="px-3 py-2.5">Asset</th>
                      <th className="px-3 py-2.5">Category</th>
                      <th className="px-3 py-2.5">Method</th>
                      <th className="px-3 py-2.5 text-right">Opening WDV</th>
                      <th className="px-3 py-2.5 text-right">Depreciation</th>
                      <th className="px-3 py-2.5 text-right">Closing WDV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((l) => (
                      <tr key={l.asset_id} className="border-b border-slate-100 dark:border-[#1a1a24]">
                        <td className="px-3 py-2 font-medium">{l.name}{l.asset_code ? ` (${l.asset_code})` : ""}</td>
                        <td className="px-3 py-2">{l.category}</td>
                        <td className="px-3 py-2 uppercase">{l.method}</td>
                        <td className="px-3 py-2 text-right">{money(l.opening_wdv)}</td>
                        <td className="px-3 py-2 text-right text-amber-600 dark:text-amber-400">{money(l.depreciation)}</td>
                        <td className="px-3 py-2 text-right font-medium">{money(l.closing_wdv)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 dark:border-[#282832] font-semibold">
                      <td className="px-3 py-2.5" colSpan={4}>Total Depreciation</td>
                      <td className="px-3 py-2.5 text-right text-amber-600 dark:text-amber-400">{money(scheduleTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-xs text-slate-500 dark:text-[#64748b]">
                Running depreciation posts a journal voucher: Debit "Depreciation Expense", Credit "Accumulated Depreciation".
                It flows automatically into the Balance Sheet (net of accumulated depreciation) and P&amp;L.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-[#cbd5e1]">No depreciation to post for the selected financial year.</p>
          )}
        </div>
      )}

      {menu && (() => {
        const kind = menu.kind;
        const id = menu.id;
        return (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            items={
              kind === "cat"
                ? [
                    { label: "Edit", onClick: () => { const c = categories.find((x) => x.id === id); if (c) editCat(c); setMenu(null); } },
                    { label: "Delete", onClick: () => { setMenu(null); deleteCat(id); }, danger: true },
                  ]
                : [
                    { label: "Edit", onClick: () => { const a = assets.find((x) => x.id === id); if (a) editAsset(a); setMenu(null); } },
                    { label: "Delete", onClick: () => { setMenu(null); deleteAsset(id); }, danger: true },
                  ]
            }
          />
        );
      })()}

      {catModal && (
        <AssetCategoryFormModal
          mode={catModal.mode}
          initial={catModal.initial}
          onClose={() => setCatModal(null)}
          onSaved={refreshCategories}
        />
      )}

      {assetModal && (
        <AssetRegisterFormModal
          mode={assetModal.mode}
          initial={assetModal.initial}
          categories={categories}
          onClose={() => setAssetModal(null)}
          onSaved={refreshAssets}
          onCategorySaved={refreshCategories}
        />
      )}
    </div>
  );
}
