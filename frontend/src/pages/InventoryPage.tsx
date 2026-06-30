import { useEffect, useState } from "react";
import { api } from "../api/client";
import { todayIso } from "../utils/dateUtils";
import DateInput from "../components/DateInput";
import { toDisplayDate } from "../utils/dateUtils";

interface StockGroup { id: string; name: string; description: string | null; is_active: boolean; }
interface StockItem {
  id: string; stock_group_id: string | null; name: string; sku: string | null;
  hsn_sac_code: string | null; unit_of_measure: string; opening_qty: number;
  opening_rate: number; valuation_method: string; gst_rate: number; is_active: boolean;
}
interface StockEntry {
  id: string; stock_item_id: string; entry_type: string; quantity: number;
  rate: number; total_amount: number; entry_date: string;
  reference: string | null; narration: string | null; voucher_id: string | null;
}

type Tab = "groups" | "items" | "entries";
const UOMS = ["Nos", "Kgs", "Ltr", "Mtr", "Sqm", "Pcs", "Box", "Bag", "Set", "Pair", "Rft"];

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>("groups");
  const [groups, setGroups] = useState<StockGroup[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filterItem, setFilterItem] = useState("");

  const [grpForm, setGrpForm] = useState({ name: "", description: "" });
  const [itemForm, setItemForm] = useState({
    name: "", stock_group_id: "", sku: "", hsn_sac_code: "", unit_of_measure: "Nos",
    opening_qty: 0, opening_rate: 0, valuation_method: "weighted_avg", gst_rate: 0,
  });
  const [entryForm, setEntryForm] = useState({
    stock_item_id: "", entry_type: "inward", quantity: 0, rate: 0,
    entry_date: todayIso(), reference: "", narration: "",
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<StockGroup[]>("/inventory/groups"),
      api.get<StockItem[]>("/inventory/items"),
      api.get<StockEntry[]>("/inventory/entries"),
    ])
      .then(([g, i, e]) => { setGroups(g); setItems(i); setEntries(e); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const closeForm = () => { setShowForm(false); setEditingId(null); setError(""); };

  const displayEntries = filterItem
    ? entries.filter((e) => e.stock_item_id === filterItem)
    : entries;

  // ── Group CRUD ──
  const handleGroupSubmit = async () => {
    if (!grpForm.name.trim()) { setError("Name is required"); return; }
    setError("");
    try {
      if (editingId) { await api.patch(`/inventory/groups/${editingId}`, grpForm); }
      else { await api.post("/inventory/groups", grpForm); }
      closeForm(); load();
    } catch (err: any) { setError(err?.detail || "Failed to save group"); }
  };

  const handleGroupDelete = async (g: StockGroup) => {
    if (!confirm(`Delete group "${g.name}"?`)) return;
    try { await api.del(`/inventory/groups/${g.id}`); load(); }
    catch (err: any) { setError(err?.detail || "Failed to delete group"); }
  };

  // ── Item CRUD ──
  const handleItemSubmit = async () => {
    if (!itemForm.name.trim()) { setError("Name is required"); return; }
    setError("");
    const body = { ...itemForm, stock_group_id: itemForm.stock_group_id || null };
    try {
      if (editingId) { await api.patch(`/inventory/items/${editingId}`, body); }
      else { await api.post("/inventory/items", body); }
      closeForm(); load();
    } catch (err: any) { setError(err?.detail || "Failed to save item"); }
  };

  const handleItemDelete = async (i: StockItem) => {
    if (!confirm(`Delete item "${i.name}"?`)) return;
    try { await api.del(`/inventory/items/${i.id}`); load(); }
    catch (err: any) { setError(err?.detail || "Failed to delete item"); }
  };

  // ── Entry CRUD ──
  const handleEntrySubmit = async () => {
    if (!entryForm.stock_item_id || entryForm.quantity <= 0 || entryForm.rate < 0) {
      setError("Item, quantity (>0), and rate (>=0) are required"); return;
    }
    setError("");
    try {
      if (editingId) { await api.patch(`/inventory/entries/${editingId}`, entryForm); }
      else { await api.post("/inventory/entries", entryForm); }
      closeForm(); load();
    } catch (err: any) { setError(err?.detail || "Failed to save entry"); }
  };

  const handleEntryDelete = async (e: StockEntry) => {
    if (!confirm("Delete this stock entry?")) return;
    try { await api.del(`/inventory/entries/${e.id}`); load(); }
    catch (err: any) { setError(err?.detail || "Failed to delete entry"); }
  };

  const inputCls = "w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm dark:bg-[#252530] dark:text-[#f1f5f9] focus:border-brand-600 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:focus:ring-violet-500/20";
  const lbl = "mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]";

  return (
    <div>
      <div className="flex items-center gap-4 border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Inventory</h2>
        <div className="flex gap-1">
          {(["groups", "items", "entries"] as Tab[]).map((t) => (
            <button key={t} onClick={() => { setTab(t); closeForm(); }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-brand-600 text-white" : "text-slate-600 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#252530]"}`}>
              {t === "groups" ? "Stock Groups" : t === "items" ? "Stock Items" : "Stock Entries"}
            </button>
          ))}
        </div>
        <button onClick={() => { closeForm(); setShowForm(true);
          if (tab === "groups") setGrpForm({ name: "", description: "" });
          else if (tab === "items") setItemForm({ name: "", stock_group_id: "", sku: "", hsn_sac_code: "", unit_of_measure: "Nos", opening_qty: 0, opening_rate: 0, valuation_method: "weighted_avg", gst_rate: 0 });
          else setEntryForm({ stock_item_id: "", entry_type: "inward", quantity: 0, rate: 0, entry_date: todayIso(), reference: "", narration: "" });
        }}
          className="ml-auto rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
          {tab === "groups" ? "+ New Group" : tab === "items" ? "+ New Item" : "+ New Entry"}
        </button>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>}

      {/* ── Group Form ── */}
      {showForm && tab === "groups" && (
        <div className="mt-4 rounded-xl border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-5 shadow-sm">
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-[#f1f5f9]">{editingId ? "Edit Stock Group" : "New Stock Group"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Name *</label><input type="text" value={grpForm.name} onChange={(e) => setGrpForm({ ...grpForm, name: e.target.value })} className={inputCls} /></div>
            <div><label className={lbl}>Description</label><input type="text" value={grpForm.description} onChange={(e) => setGrpForm({ ...grpForm, description: e.target.value })} className={inputCls} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleGroupSubmit} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">{editingId ? "Save" : "Create"}</button>
            <button onClick={closeForm} className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Item Form ── */}
      {showForm && tab === "items" && (
        <div className="mt-4 rounded-xl border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-5 shadow-sm">
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-[#f1f5f9]">{editingId ? "Edit Stock Item" : "New Stock Item"}</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><label className={lbl}>Name *</label><input type="text" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} className={inputCls} /></div>
            <div><label className={lbl}>Stock Group</label>
              <select value={itemForm.stock_group_id} onChange={(e) => setItemForm({ ...itemForm, stock_group_id: e.target.value })} className={inputCls}>
                <option value="">None</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div><label className={lbl}>SKU</label><input type="text" value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} className={inputCls} /></div>
            <div><label className={lbl}>HSN/SAC Code</label><input type="text" value={itemForm.hsn_sac_code} onChange={(e) => setItemForm({ ...itemForm, hsn_sac_code: e.target.value })} className={inputCls} /></div>
            <div><label className={lbl}>Unit of Measure</label>
              <select value={itemForm.unit_of_measure} onChange={(e) => setItemForm({ ...itemForm, unit_of_measure: e.target.value })} className={inputCls}>
                {UOMS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div><label className={lbl}>Valuation Method</label>
              <select value={itemForm.valuation_method} onChange={(e) => setItemForm({ ...itemForm, valuation_method: e.target.value })} className={inputCls}>
                <option value="weighted_avg">Weighted Average</option>
                <option value="fifo">FIFO</option>
              </select>
            </div>
            <div><label className={lbl}>Opening Qty</label><input type="number" step="0.001" value={itemForm.opening_qty} onChange={(e) => setItemForm({ ...itemForm, opening_qty: parseFloat(e.target.value) || 0 })} className={inputCls} /></div>
            <div><label className={lbl}>Opening Rate</label><input type="number" step="0.01" value={itemForm.opening_rate} onChange={(e) => setItemForm({ ...itemForm, opening_rate: parseFloat(e.target.value) || 0 })} className={inputCls} /></div>
            <div><label className={lbl}>GST Rate (%)</label>
              <select value={itemForm.gst_rate} onChange={(e) => setItemForm({ ...itemForm, gst_rate: parseFloat(e.target.value) })} className={inputCls}>
                <option value={0}>None (0%)</option>
                <option value={0.25}>0.25%</option>
                <option value={3}>3%</option>
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18%</option>
                <option value={28}>28%</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleItemSubmit} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">{editingId ? "Save" : "Create"}</button>
            <button onClick={closeForm} className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Entry Form ── */}
      {showForm && tab === "entries" && (
        <div className="mt-4 rounded-xl border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-5 shadow-sm">
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-[#f1f5f9]">{editingId ? "Edit Stock Entry" : "New Stock Entry"}</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><label className={lbl}>Stock Item *</label>
              <select value={entryForm.stock_item_id} onChange={(e) => setEntryForm({ ...entryForm, stock_item_id: e.target.value })} className={inputCls}>
                <option value="">Select item</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div><label className={lbl}>Type *</label>
              <select value={entryForm.entry_type} onChange={(e) => setEntryForm({ ...entryForm, entry_type: e.target.value })} className={inputCls}>
                <option value="inward">Inward</option>
                <option value="outward">Outward</option>
              </select>
            </div>
            <div><label className={lbl}>Date *</label>
              <DateInput value={entryForm.entry_date} onChange={(v) => setEntryForm({ ...entryForm, entry_date: v })} className={inputCls} />
            </div>
            <div><label className={lbl}>Quantity *</label><input type="number" step="0.001" value={entryForm.quantity} onChange={(e) => setEntryForm({ ...entryForm, quantity: parseFloat(e.target.value) || 0 })} className={inputCls} /></div>
            <div><label className={lbl}>Rate *</label><input type="number" step="0.01" value={entryForm.rate} onChange={(e) => setEntryForm({ ...entryForm, rate: parseFloat(e.target.value) || 0 })} className={inputCls} /></div>
            <div><label className={lbl}>Reference</label><input type="text" value={entryForm.reference} onChange={(e) => setEntryForm({ ...entryForm, reference: e.target.value })} className={inputCls} placeholder="Invoice / GRN" /></div>
            <div className="col-span-3"><label className={lbl}>Narration</label><input type="text" value={entryForm.narration} onChange={(e) => setEntryForm({ ...entryForm, narration: e.target.value })} className={inputCls} /></div>
          </div>
          {entryForm.quantity > 0 && entryForm.rate > 0 && (
            <p className="mt-2 text-sm text-slate-500 dark:text-[#94a3b8]">Total: <span className="font-semibold text-slate-800 dark:text-[#f1f5f9]">₹{(entryForm.quantity * entryForm.rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></p>
          )}
          <div className="mt-4 flex gap-2">
            <button onClick={handleEntrySubmit} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">{editingId ? "Save" : "Create"}</button>
            <button onClick={closeForm} className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-[#94a3b8]">Loading...</p>
      ) : tab === "groups" ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.id} className="rounded-xl border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-[#f1f5f9]">{g.name}</h4>
                  {g.description && <p className="mt-0.5 text-xs text-slate-500 dark:text-[#94a3b8]">{g.description}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditingId(g.id); setGrpForm({ name: g.name, description: g.description ?? "" }); setShowForm(true); setError(""); }}
                    className="rounded-md p-1 text-slate-400 dark:text-[#64748b] hover:bg-slate-100 dark:hover:bg-[#252530] hover:text-brand-600 dark:hover:text-brand-400" title="Edit">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                  </button>
                  <button onClick={() => handleGroupDelete(g)}
                    className="rounded-md p-1 text-slate-400 dark:text-[#64748b] hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400" title="Delete">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-400 dark:text-[#64748b]">{items.filter((i) => i.stock_group_id === g.id).length} items</p>
            </div>
          ))}
          {groups.length === 0 && <p className="col-span-full py-8 text-center text-slate-400 dark:text-[#64748b]">No stock groups yet.</p>}
        </div>
      ) : tab === "items" ? (
        <div className="mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1e1e28] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                <th className="pb-2">Name</th>
                <th className="pb-2">Group</th>
                <th className="pb-2">SKU</th>
                <th className="pb-2">UOM</th>
                <th className="pb-2 text-right">Opening Qty</th>
                <th className="pb-2 text-right">Rate</th>
                <th className="pb-2">GST%</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const grp = groups.find((g) => g.id === i.stock_group_id);
                return (
                  <tr key={i.id} className="border-b border-slate-100 dark:border-[#1e1e28]">
                    <td className="py-2 font-medium text-slate-900 dark:text-[#f1f5f9]">{i.name}</td>
                    <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{grp?.name ?? "—"}</td>
                    <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{i.sku ?? "—"}</td>
                    <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{i.unit_of_measure}</td>
                    <td className="py-2 text-right">{i.opening_qty.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right">₹{i.opening_rate.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{i.gst_rate}%</td>
                    <td className="py-2 text-right">
                      <div className="inline-flex gap-1">
                        <button onClick={() => { setEditingId(i.id); setItemForm({ name: i.name, stock_group_id: i.stock_group_id ?? "", sku: i.sku ?? "", hsn_sac_code: i.hsn_sac_code ?? "", unit_of_measure: i.unit_of_measure, opening_qty: i.opening_qty, opening_rate: i.opening_rate, valuation_method: i.valuation_method, gst_rate: i.gst_rate }); setShowForm(true); setError(""); }}
                          className="rounded-md p-1 text-slate-400 dark:text-[#64748b] hover:bg-slate-100 dark:hover:bg-[#252530] hover:text-brand-600 dark:hover:text-brand-400" title="Edit">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                        </button>
                        <button onClick={() => handleItemDelete(i)}
                          className="rounded-md p-1 text-slate-400 dark:text-[#64748b] hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400" title="Delete">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-slate-400 dark:text-[#64748b]">No stock items yet.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4">
          <div className="mb-3">
            <select value={filterItem} onChange={(e) => setFilterItem(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm dark:bg-[#252530] dark:text-[#f1f5f9]">
              <option value="">All items</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1e1e28] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                <th className="pb-2">Date</th>
                <th className="pb-2">Item</th>
                <th className="pb-2">Type</th>
                <th className="pb-2 text-right">Qty</th>
                <th className="pb-2 text-right">Rate</th>
                <th className="pb-2 text-right">Amount</th>
                <th className="pb-2">Reference</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayEntries.map((e) => {
                const item = items.find((i) => i.id === e.stock_item_id);
                return (
                  <tr key={e.id} className="border-b border-slate-100 dark:border-[#1e1e28]">
                    <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{toDisplayDate(e.entry_date)}</td>
                    <td className="py-2 font-medium text-slate-900 dark:text-[#f1f5f9]">{item?.name ?? "—"}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.entry_type === "inward" ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400"}`}>
                        {e.entry_type}
                      </span>
                    </td>
                    <td className="py-2 text-right">{e.quantity.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right">₹{e.rate.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right font-medium">₹{e.total_amount.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{e.reference ?? "—"}</td>
                    <td className="py-2 text-right">
                      <div className="inline-flex gap-1">
                        <button onClick={() => { setEditingId(e.id); setEntryForm({ stock_item_id: e.stock_item_id, entry_type: e.entry_type, quantity: e.quantity, rate: e.rate, entry_date: e.entry_date, reference: e.reference ?? "", narration: e.narration ?? "" }); setShowForm(true); setError(""); }}
                          className="rounded-md p-1 text-slate-400 dark:text-[#64748b] hover:bg-slate-100 dark:hover:bg-[#252530] hover:text-brand-600 dark:hover:text-brand-400" title="Edit">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                        </button>
                        <button onClick={() => handleEntryDelete(e)}
                          className="rounded-md p-1 text-slate-400 dark:text-[#64748b] hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400" title="Delete">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {displayEntries.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-slate-400 dark:text-[#64748b]">{filterItem ? "No entries for this item." : "No stock entries yet."}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
