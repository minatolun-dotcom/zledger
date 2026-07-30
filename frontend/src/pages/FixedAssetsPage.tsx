import { useEffect, useState, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import { useRole } from "../hooks/useRole";
import Select from "../components/Select";
import Tabs from "../components/Tabs";
import TabContent from "../components/TabContent";
import { showConfirm } from "../components/ConfirmDialog";
import SortableTable, { type SortableColumn } from "../components/SortableTable";
import DateInput from "../components/DateInput";
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
  asset_status: string;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<"register" | "categories" | "depreciation">("register");

  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [assets, setAssets] = useState<AssetRegister[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [catModal, setCatModal] = useState<{ mode: "create" | "edit"; initial?: AssetCategory } | null>(null);
  const [assetModal, setAssetModal] = useState<{ mode: "create" | "edit"; initial?: AssetRegister } | null>(null);
  const [disposeAsset, setDisposeAsset] = useState<AssetRegister | null>(null);
  const [disposeForm, setDisposeForm] = useState({ disposal_date: "", disposal_amount: 0 });
  const [disposing, setDisposing] = useState(false);

  const [search, setSearch] = useState("");

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

  // Auto-open from command palette (?tab=register|categories&action=new)
  useEffect(() => {
    const paramTab = searchParams.get("tab") as "register" | "categories" | "depreciation" | null;
    const action = searchParams.get("action");
    if (!paramTab && !action) return;
    setSearchParams({}, { replace: true });
    if (paramTab) setTab(paramTab);
    setTimeout(() => {
      if (!action || !canEdit) return;
      const t = paramTab || tab;
      if (t === "categories" && action === "new") setCatModal({ mode: "create" });
      else if (t === "register" && action === "new") setAssetModal({ mode: "create" });
    }, 100);
  }, [searchParams]);

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

  const openDispose = (a: AssetRegister) => {
    setDisposeForm({ disposal_date: "", disposal_amount: 0 });
    setDisposeAsset(a);
  };

  const handleDispose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disposeAsset) return;
    if (!disposeForm.disposal_date) {
      toast.error("Disposal date is required");
      return;
    }
    setDisposing(true);
    try {
      await api.post(`/fixed-assets/assets/${disposeAsset.id}/dispose`, {
        disposal_date: disposeForm.disposal_date,
        disposal_amount: disposeForm.disposal_amount,
      });
      toast.success("Asset disposed successfully");
      setDisposeAsset(null);
      await refreshAssets();
    } catch (e: any) {
      toast.error(e?.message || "Failed to dispose asset");
    } finally {
      setDisposing(false);
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

  const assetStats = useMemo(() => {
    const totalCost = assets.reduce((s, a) => s + a.cost, 0);
    const totalAccumDep = assets.reduce((s, a) => s + a.accumulated_depreciation, 0);
    const totalWdv = assets.reduce((s, a) => s + a.wdv, 0);
    const activeAssets = assets.filter((a) => a.is_active || a.asset_status === "active").length;
    const disposedAssets = assets.filter((a) => !a.is_active).length;
    const catStats = new Map<string, { count: number; cost: number; wdv: number }>();
    for (const a of assets) {
      const cur = catStats.get(a.category_id) || { count: 0, cost: 0, wdv: 0 };
      cur.count++;
      cur.cost += a.cost;
      cur.wdv += a.wdv;
      catStats.set(a.category_id, cur);
    }
    return { totalCost, totalAccumDep, totalWdv, activeAssets, disposedAssets, catStats };
  }, [assets]);

  const editIcon = (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
  const deleteIcon = (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );

  const disposeIcon = (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );


  type AssetAction = {
    icon: ReactNode;
    label: string;
    onClick?: () => void;
    danger?: boolean;
  };

  const buildAssetActions = (a: AssetRegister): AssetAction[] => {
    const acts: AssetAction[] = [
      { icon: editIcon, label: "Edit", onClick: () => editAsset(a) },
    ];
    if (a.is_active || a.asset_status === "active") {
      acts.push({ icon: disposeIcon, label: "Dispose", onClick: () => openDispose(a) });
    }
    acts.push({ icon: deleteIcon, label: "Delete", danger: true, onClick: () => deleteAsset(a.id) });
    return acts;
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Fixed Assets</h1>
        {!loading && <p className="text-sm text-slate-500 dark:text-[#64748b] mt-1">{assets.length} assets · {categories.length} categories</p>}
      </div>
      <div className="flex gap-5 items-start">
        <div className="flex-1 min-w-0">

      {/* Tabs */}
      <Tabs
        tabs={TABS}
        active={tab}
        onChange={(k) => setTab(k as "register" | "categories" | "depreciation")}
        className="mt-6"
      />
      <TabContent activeKey={tab}>
        {/* ── Categories tab ── */}
        {tab === "categories" && (() => {
          const catCols: SortableColumn<AssetCategory>[] = [
          { id: "name", header: "Category", size: 200, cell: ({ row: { original: c } }) => <span className="font-medium truncate block max-w-[200px]" title={c.name}>{c.name}</span> },
          { id: "method", header: "Method", size: 150, cell: ({ row: { original: c } }) => <span className="uppercase">{c.depreciation_method}</span> },
          { id: "rate", header: "Rate %", size: 100, cell: ({ row: { original: c } }) => <span>{c.rate_pct}%</span> },
          { id: "life", header: "Life (yrs)", size: 100, cell: ({ row: { original: c } }) => <span>{c.useful_life_years ?? "—"}</span> },
        ];

        return (
          <SortableTable
            columns={catCols}
            data={categories}
            tableKey="fixed-assets-categories"
            emptyMessage="No categories yet. Create one to start tracking assets."
            actions={canEdit ? (c) => [
              { icon: editIcon, label: "Edit", onClick: () => editCat(c) },
              { icon: deleteIcon, label: "Delete", danger: true, onClick: () => deleteCat(c.id) },
            ] : undefined}
          />
        );
      })()}

      {/* ── Register tab ── */}
      {tab === "register" && (() => {
        const assetCols: SortableColumn<AssetRegister>[] = [
          { id: "code", header: "Code", size: 120, cell: ({ row: { original: a } }) => <span className="text-slate-500 dark:text-[#64748b]">{a.asset_code || "—"}</span> },
          { id: "name", header: "Asset", size: 200, cell: ({ row: { original: a } }) => <span className="font-medium truncate block max-w-[200px]" title={a.name}>{a.name}</span> },
          { id: "category", header: "Category", size: 150, cell: ({ row: { original: a } }) => <span className="truncate block max-w-[150px]" title={catName(a.category_id)}>{catName(a.category_id)}</span> },
          { id: "purchase_date", header: "Purchase Date", size: 140, accessorKey: "purchase_date", className: "whitespace-nowrap" },
          { id: "cost", header: "Cost", size: 130, cell: ({ row: { original: a } }) => <span className="whitespace-nowrap tabular-nums">{money(a.cost)}</span>, className: "text-right" },
          { id: "accum_dep", header: "Accum. Dep.", size: 130, cell: ({ row: { original: a } }) => <span className="whitespace-nowrap tabular-nums text-amber-600 dark:text-amber-400">{money(a.accumulated_depreciation)}</span>, className: "text-right" },
          { id: "wdv", header: "WDV", size: 130, cell: ({ row: { original: a } }) => <span className="whitespace-nowrap tabular-nums font-medium">{money(a.wdv)}</span>, className: "text-right" },
        ];

        return (
          <div className="mt-4">
            <div className="mb-3">
              <input type="text" placeholder="Search assets..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full max-w-xs rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-1.5 text-sm text-slate-900 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <SortableTable
              columns={assetCols}
              data={filteredAssets}
              tableKey="fixed-assets-register"
              emptyMessage="No assets yet."
              actions={canEdit ? (a) => buildAssetActions(a) : undefined}
            />
          </div>
        );
      })()}

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
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#1a1a24] text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">
                      <th className="px-3 py-2.5 min-w-[140px]">Asset</th>
                      <th className="px-3 py-2.5 w-[130px]">Category</th>
                      <th className="px-3 py-2.5 w-[90px]">Method</th>
                      <th className="px-3 py-2.5 w-[130px] text-right tabular-nums">Opening WDV</th>
                      <th className="px-3 py-2.5 w-[130px] text-right tabular-nums">Depreciation</th>
                      <th className="px-3 py-2.5 w-[130px] text-right tabular-nums">Closing WDV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((l) => (
                      <tr key={l.asset_id} className="border-b border-slate-100 dark:border-[#1a1a24]">
                        <td className="px-3 py-2 font-medium">{l.name}{l.asset_code ? ` (${l.asset_code})` : ""}</td>
                        <td className="px-3 py-2">{l.category}</td>
                        <td className="px-3 py-2 uppercase">{l.method}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{money(l.opening_wdv)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums text-amber-600 dark:text-amber-400">{money(l.depreciation)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums font-medium">{money(l.closing_wdv)}</td>
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
      </TabContent>
        </div>{/* /content flex-1 */}

        {/* Sidebar */}
        <div className="w-[300px] shrink-0 hidden lg:block self-start sticky top-4 mt-[80px] space-y-4">
          {/* Asset Summary */}
          <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
            <h3 className="text-sm font-bold text-slate-800 dark:text-[#f1f5f9]">Asset Summary</h3>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-[#94a3b8]">Total Assets</span>
              <span className="font-semibold text-slate-800 dark:text-[#f1f5f9]">{assets.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-[#94a3b8]">Categories</span>
              <span className="font-semibold text-slate-800 dark:text-[#f1f5f9]">{categories.length}</span>
            </div>
            <hr className="border-slate-100 dark:border-[#282832]" />
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-[#94a3b8]">Active</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{assetStats.activeAssets}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-[#94a3b8]">Disposed</span>
              <span className="font-semibold text-slate-500 dark:text-[#64748b]">{assetStats.disposedAssets}</span>
            </div>
            {assetStats.totalCost > 0 && (
              <>
                <hr className="border-slate-100 dark:border-[#282832]" />
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-[#94a3b8]">Total Cost</span>
                  <span className="font-semibold text-slate-800 dark:text-[#f1f5f9] tabular-nums">₹{money(assetStats.totalCost)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-[#94a3b8]">Accum. Dep.</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">₹{money(assetStats.totalAccumDep)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-[#94a3b8]">Net Book Value</span>
                  <span className="font-bold text-slate-800 dark:text-[#f1f5f9] tabular-nums">₹{money(assetStats.totalWdv)}</span>
                </div>
              </>
            )}
          </div>

          {/* Quick Actions */}
          {canEdit && (
            <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
              <h3 className="text-sm font-bold text-slate-800 dark:text-[#f1f5f9]">Quick Actions</h3>
              <button onClick={() => setAssetModal({ mode: "create" })}
                className="w-full rounded-lg bg-brand-600 dark:bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600 cursor-pointer">
                + New Asset
              </button>
              <button onClick={() => setCatModal({ mode: "create" })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#1a1a24] cursor-pointer">
                + New Category
              </button>
            </div>
          )}
        </div>
      </div>{/* /flex container */}
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

      {disposeAsset && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setDisposeAsset(null); }}>
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-[#16161f] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 dark:text-[#f1f5f9]">Dispose Asset</h3>
              <button onClick={() => setDisposeAsset(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleDispose} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Asset</label>
                <input type="text" value={disposeAsset.name} readOnly
                  className="w-full rounded-lg border border-slate-200 dark:border-[#282832] bg-slate-50 dark:bg-[#0f0f16] px-3 py-1.5 text-sm text-slate-900 dark:text-[#f1f5f9]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Current WDV (₹)</label>
                <input type="text" value={money(disposeAsset.wdv)} readOnly
                  className="w-full rounded-lg border border-slate-200 dark:border-[#282832] bg-slate-50 dark:bg-[#0f0f16] px-3 py-1.5 text-sm text-slate-900 dark:text-[#f1f5f9]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Disposal Date *</label>
                <DateInput value={disposeForm.disposal_date} onChange={(v) => setDisposeForm((f) => ({ ...f, disposal_date: v }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Disposal Amount (₹)</label>
                <input type="number" step="0.01" min="0" value={disposeForm.disposal_amount || ""} onChange={(e) => setDisposeForm((f) => ({ ...f, disposal_amount: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-1.5 text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setDisposeAsset(null)}
                  className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#1a1a24]">
                  Cancel
                </button>
                <button type="submit" disabled={disposing}
                  className="rounded-lg bg-red-600 dark:bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 dark:hover:bg-red-700 disabled:opacity-50">
                  {disposing ? "Disposing…" : "Dispose Asset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
