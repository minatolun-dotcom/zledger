import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import { todayIso } from "../utils/dateUtils";
import DateInput from "../components/DateInput";
import { toDisplayDate } from "../utils/dateUtils";
import Select from "../components/Select";

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
const GRP_FORM_EMPTY = { name: "", description: "" };
const ITEM_FORM_EMPTY = { name: "", stock_group_id: "", sku: "", hsn_sac_code: "", unit_of_measure: "Nos", opening_qty: 0, opening_rate: 0, valuation_method: "weighted_avg", gst_rate: 0 };
const ENTRY_FORM_EMPTY = { stock_item_id: "", entry_type: "inward", quantity: 0, rate: 0, entry_date: todayIso(), reference: "", narration: "" };

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>("groups");
  const [groups, setGroups] = useState<StockGroup[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterItem, setFilterItem] = useState("");

  // Modal state for all three entity types
  const [selectedGroup, setSelectedGroup] = useState<StockGroup | null>(null);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<StockEntry | null>(null);
  const [modalError, setModalError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state (populated when modal opens)
  const [grpForm, setGrpForm] = useState(GRP_FORM_EMPTY);
  const [itemForm, setItemForm] = useState(ITEM_FORM_EMPTY);
  const [entryForm, setEntryForm] = useState(ENTRY_FORM_EMPTY);

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

  const displayEntries = filterItem
    ? entries.filter((e) => e.stock_item_id === filterItem)
    : entries;

  // Select option arrays
  const filterItemOpts = [{ value: "", label: "All items" }, ...items.map((i) => ({ value: i.id, label: i.name }))];
  const groupOpts = [{ value: "", label: "None" }, ...groups.map((g) => ({ value: g.id, label: g.name }))];
  const uomOpts = UOMS.map((u) => ({ value: u, label: u }));
  const valuationOpts = [{ value: "weighted_avg", label: "Weighted Average" }, { value: "fifo", label: "FIFO" }];
  const gstOpts = [
    { value: "0", label: "None (0%)" }, { value: "0.25", label: "0.25%" }, { value: "3", label: "3%" },
    { value: "5", label: "5%" }, { value: "12", label: "12%" }, { value: "18", label: "18%" }, { value: "28", label: "28%" },
  ];
  const stockItemOpts = [{ value: "", label: "Select item" }, ...items.map((i) => ({ value: i.id, label: i.name }))];
  const entryTypeOpts = [{ value: "inward", label: "Inward" }, { value: "outward", label: "Outward" }];

  // ── Group Modal Handlers ──
  const handleGroupClick = useCallback((group: StockGroup) => {
    setGrpForm({ name: group.name, description: group.description ?? "" });
    setSelectedGroup(group);
    setModalError("");
  }, []);

  const handleGroupNew = useCallback(() => {
    setGrpForm(GRP_FORM_EMPTY);
    setSelectedGroup({ id: "", name: "", description: null, is_active: true });
    setModalError("");
  }, []);

  const handleGroupModalUpdate = async (id: string, payload: any) => {
    setIsSubmitting(true);
    setModalError("");
    try {
      await api.patch(`/inventory/groups/${id}`, payload);
      setSelectedGroup(null);
      load();
    } catch (err: any) { setModalError(err?.detail || "Failed to update group"); }
    finally { setIsSubmitting(false); }
  };

  const handleGroupModalSubmit = async (payload: any) => {
    setIsSubmitting(true);
    setModalError("");
    try {
      await api.post("/inventory/groups", payload);
      setSelectedGroup(null);
      load();
    } catch (err: any) { setModalError(err?.detail || "Failed to create group"); }
    finally { setIsSubmitting(false); }
  };

  const handleGroupModalDelete = async () => {
    if (!selectedGroup?.id) return;
    if (!confirm(`Delete group "${selectedGroup.name}"?`)) return;
    try {
      await api.del(`/inventory/groups/${selectedGroup.id}`);
      setSelectedGroup(null);
      load();
    } catch (err: any) { setModalError(err?.detail || "Failed to delete group"); }
  };

  const handleGroupModalClose = () => { setSelectedGroup(null); setModalError(""); };

  // ── Item Modal Handlers ──
  const handleItemClick = useCallback((item: StockItem) => {
    setItemForm({
      name: item.name, stock_group_id: item.stock_group_id ?? "", sku: item.sku ?? "",
      hsn_sac_code: item.hsn_sac_code ?? "", unit_of_measure: item.unit_of_measure,
      opening_qty: item.opening_qty, opening_rate: item.opening_rate,
      valuation_method: item.valuation_method, gst_rate: item.gst_rate,
    });
    setSelectedItem(item);
    setModalError("");
  }, []);

  const handleItemNew = useCallback(() => {
    setItemForm(ITEM_FORM_EMPTY);
    setSelectedItem({ id: "", stock_group_id: null, name: "", sku: null, hsn_sac_code: null, unit_of_measure: "Nos", opening_qty: 0, opening_rate: 0, valuation_method: "weighted_avg", gst_rate: 0, is_active: true });
    setModalError("");
  }, []);

  const handleItemModalUpdate = async (id: string, payload: any) => {
    setIsSubmitting(true);
    setModalError("");
    try {
      await api.patch(`/inventory/items/${id}`, payload);
      setSelectedItem(null);
      load();
    } catch (err: any) { setModalError(err?.detail || "Failed to update item"); }
    finally { setIsSubmitting(false); }
  };

  const handleItemModalSubmit = async (payload: any) => {
    setIsSubmitting(true);
    setModalError("");
    try {
      await api.post("/inventory/items", payload);
      setSelectedItem(null);
      load();
    } catch (err: any) { setModalError(err?.detail || "Failed to create item"); }
    finally { setIsSubmitting(false); }
  };

  const handleItemModalDuplicate = () => {
    if (!selectedItem) return;
    const dup = { ...selectedItem, id: "" as string, name: selectedItem.name + " (copy)" };
    setSelectedItem(dup);
    setItemForm({ name: dup.name, stock_group_id: dup.stock_group_id ?? "", sku: dup.sku ?? "", hsn_sac_code: dup.hsn_sac_code ?? "", unit_of_measure: dup.unit_of_measure, opening_qty: dup.opening_qty, opening_rate: dup.opening_rate, valuation_method: dup.valuation_method, gst_rate: dup.gst_rate });
    setModalError("");
  };

  const handleItemModalDelete = async () => {
    if (!selectedItem?.id) return;
    if (!confirm(`Delete item "${selectedItem.name}"?`)) return;
    try {
      await api.del(`/inventory/items/${selectedItem.id}`);
      setSelectedItem(null);
      load();
    } catch (err: any) { setModalError(err?.detail || "Failed to delete item"); }
  };

  const handleItemModalClose = () => { setSelectedItem(null); setModalError(""); };

  // ── Entry Modal Handlers ──
  const handleEntryClick = useCallback((entry: StockEntry) => {
    setEntryForm({ stock_item_id: entry.stock_item_id, entry_type: entry.entry_type, quantity: entry.quantity, rate: entry.rate, entry_date: entry.entry_date, reference: entry.reference ?? "", narration: entry.narration ?? "" });
    setSelectedEntry(entry);
    setModalError("");
  }, []);

  const handleEntryNew = useCallback(() => {
    setEntryForm(ENTRY_FORM_EMPTY);
    setSelectedEntry({ id: "", stock_item_id: "", entry_type: "inward", quantity: 0, rate: 0, total_amount: 0, entry_date: todayIso(), reference: null, narration: null, voucher_id: null });
    setModalError("");
  }, []);

  const handleEntryModalUpdate = async (id: string, payload: any) => {
    setIsSubmitting(true);
    setModalError("");
    try {
      await api.patch(`/inventory/entries/${id}`, payload);
      setSelectedEntry(null);
      load();
    } catch (err: any) { setModalError(err?.detail || "Failed to update entry"); }
    finally { setIsSubmitting(false); }
  };

  const handleEntryModalSubmit = async (payload: any) => {
    setIsSubmitting(true);
    setModalError("");
    try {
      await api.post("/inventory/entries", payload);
      setSelectedEntry(null);
      load();
    } catch (err: any) { setModalError(err?.detail || "Failed to create entry"); }
    finally { setIsSubmitting(false); }
  };

  const handleEntryModalDuplicate = () => {
    if (!selectedEntry) return;
    const dup = { ...selectedEntry, id: "" as string };
    setSelectedEntry(dup);
    setEntryForm({ stock_item_id: dup.stock_item_id, entry_type: dup.entry_type, quantity: dup.quantity, rate: dup.rate, entry_date: dup.entry_date, reference: dup.reference ?? "", narration: dup.narration ?? "" });
    setModalError("");
  };

  const handleEntryModalDelete = async () => {
    if (!selectedEntry?.id) return;
    if (!confirm("Delete this stock entry?")) return;
    try {
      await api.del(`/inventory/entries/${selectedEntry.id}`);
      setSelectedEntry(null);
      load();
    } catch (err: any) { setModalError(err?.detail || "Failed to delete entry"); }
  };

  const handleEntryModalClose = () => { setSelectedEntry(null); setModalError(""); };

  const inputCls = "w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm dark:bg-[#252530] dark:text-[#f1f5f9] focus:border-brand-600 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:focus:ring-violet-500/20";
  const lbl = "mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]";

  return (
    <div>
      <div className="flex items-center gap-4 border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Inventory</h2>
        <div className="flex gap-1">
          {(["groups", "items", "entries"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-brand-600 text-white" : "text-slate-600 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#252530]"}`}>
              {t === "groups" ? "Stock Groups" : t === "items" ? "Stock Items" : "Stock Entries"}
            </button>
          ))}
        </div>
        <button onClick={() => {
            setError("");
            if (tab === "groups") handleGroupNew();
            else if (tab === "items") handleItemNew();
            else handleEntryNew();
          }}
          className="ml-auto rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
          {tab === "groups" ? "+ New Group" : tab === "items" ? "+ New Item" : "+ New Entry"}
        </button>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-[#94a3b8]">Loading...</p>
      ) : tab === "groups" ? (
        /* ── Groups: clickable card grid ── */
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.id} onClick={() => handleGroupClick(g)}
              className="rounded-xl border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4 shadow-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-[#1e1e28] transition-colors">
              <h4 className="font-semibold text-slate-800 dark:text-[#f1f5f9]">{g.name}</h4>
              {g.description && <p className="mt-0.5 text-xs text-slate-500 dark:text-[#94a3b8]">{g.description}</p>}
              <p className="mt-2 text-xs text-slate-400 dark:text-[#64748b]">{items.filter((i) => i.stock_group_id === g.id).length} items</p>
            </div>
          ))}
          {groups.length === 0 && <p className="col-span-full py-8 text-center text-slate-400 dark:text-[#64748b]">No stock groups yet.</p>}
        </div>
      ) : tab === "items" ? (
        /* ── Items Table ── */
        <div className="mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1e1e28] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                <th className="pb-2 w-[30%]">Name</th>
                <th className="pb-2 w-[18%]">Group</th>
                <th className="pb-2 w-[15%]">SKU</th>
                <th className="pb-2 w-[7%]">UOM</th>
                <th className="pb-2 w-[10%] text-right pr-4">Opening Qty</th>
                <th className="pb-2 w-[10%] text-right pr-4">Rate</th>
                <th className="pb-2 w-[10%] pl-4">GST%</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const grp = groups.find((g) => g.id === i.stock_group_id);
                return (
                  <tr key={i.id} onClick={() => handleItemClick(i)}
                    className="border-b border-slate-100 dark:border-[#1e1e28] cursor-pointer hover:bg-slate-50 dark:hover:bg-[#1e1e28] transition-colors">
                    <td className="py-2 font-medium text-slate-900 dark:text-[#f1f5f9]">{i.name}</td>
                    <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{grp?.name ?? "—"}</td>
                    <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{i.sku ?? "—"}</td>
                    <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{i.unit_of_measure}</td>
                    <td className="py-2 text-right pr-4">{i.opening_qty.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right pr-4">₹{i.opening_rate.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-slate-600 dark:text-[#94a3b8] pl-4">{i.gst_rate}%</td>
                  </tr>
                );
              })}
              {items.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-400 dark:text-[#64748b]">No stock items yet.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Entries Table ── */
        <div className="mt-4">
          <div className="mb-3">
            <Select value={filterItem} onChange={setFilterItem} options={filterItemOpts} />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1e1e28] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                <th className="pb-2 w-[12%]">Date</th>
                <th className="pb-2 w-[25%]">Item</th>
                <th className="pb-2 w-[10%]">Type</th>
                <th className="pb-2 w-[10%] text-right">Qty</th>
                <th className="pb-2 w-[12%] text-right">Rate</th>
                <th className="pb-2 w-[13%] text-right pr-4">Amount</th>
                <th className="pb-2 w-[18%] pl-4">Reference</th>
              </tr>
            </thead>
            <tbody>
              {displayEntries.map((e) => {
                const item = items.find((i) => i.id === e.stock_item_id);
                return (
                  <tr key={e.id} onClick={() => handleEntryClick(e)}
                    className="border-b border-slate-100 dark:border-[#1e1e28] cursor-pointer hover:bg-slate-50 dark:hover:bg-[#1e1e28] transition-colors">
                    <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{toDisplayDate(e.entry_date)}</td>
                    <td className="py-2 font-medium text-slate-900 dark:text-[#f1f5f9]">{item?.name ?? "—"}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.entry_type === "inward" ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400"}`}>
                        {e.entry_type}
                      </span>
                    </td>
                    <td className="py-2 text-right">{e.quantity.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right">₹{e.rate.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right font-medium pr-4">₹{e.total_amount.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-slate-600 dark:text-[#94a3b8] pl-4">{e.reference ?? "—"}</td>
                  </tr>
                );
              })}
              {displayEntries.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-400 dark:text-[#64748b]">{filterItem ? "No entries for this item." : "No stock entries yet."}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Stock Group Modal ── */}
      {selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 pt-10 pb-10" onClick={handleGroupModalClose}>
          <div className="relative w-full max-w-lg rounded-xl bg-white dark:bg-[#18181f] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">
                {selectedGroup.id ? `Edit Stock Group — ${selectedGroup.name}` : "New Stock Group"}
              </h3>
              <div className="flex items-center gap-2">
                {selectedGroup.id && (
                  <button onClick={handleGroupModalDelete} className="rounded border border-red-200 dark:border-red-700 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">Delete</button>
                )}
                <button onClick={handleGroupModalClose} className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Close</button>
              </div>
            </div>
            <div className="p-5">
              {modalError && <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{modalError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Name *</label><input type="text" value={grpForm.name} onChange={(e) => setGrpForm({ ...grpForm, name: e.target.value })} className={inputCls} /></div>
                <div><label className={lbl}>Description</label><input type="text" value={grpForm.description} onChange={(e) => setGrpForm({ ...grpForm, description: e.target.value })} className={inputCls} /></div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => {
                    if (!grpForm.name.trim()) { setModalError("Name is required"); return; }
                    if (selectedGroup.id) handleGroupModalUpdate(selectedGroup.id, grpForm);
                    else handleGroupModalSubmit(grpForm);
                  }}
                  disabled={isSubmitting}
                  className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : selectedGroup.id ? "Update" : "Create"}
                </button>
                <button onClick={handleGroupModalClose} className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Stock Item Modal ── */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 pt-10 pb-10" onClick={handleItemModalClose}>
          <div className="relative w-full max-w-4xl rounded-xl bg-white dark:bg-[#18181f] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">
                {selectedItem.id ? `Edit Stock Item — ${selectedItem.name}` : "New Stock Item"}
              </h3>
              <div className="flex items-center gap-2">
                {selectedItem.id ? (
                  <>
                    <button onClick={handleItemModalDuplicate} className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Duplicate</button>
                    <button onClick={handleItemModalDelete} className="rounded border border-red-200 dark:border-red-700 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">Delete</button>
                  </>
                ) : (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Creating new item</span>
                )}
                <button onClick={handleItemModalClose} className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Close</button>
              </div>
            </div>
            <div className="p-5">
              {modalError && <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{modalError}</div>}
              <div className="grid grid-cols-3 gap-3">
                <div><label className={lbl}>Name *</label><input type="text" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} className={inputCls} /></div>
                <div>
                  <Select label="Stock Group" value={itemForm.stock_group_id} onChange={(v) => setItemForm({ ...itemForm, stock_group_id: v })} options={groupOpts} />
                </div>
                <div><label className={lbl}>SKU</label><input type="text" value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} className={inputCls} /></div>
                <div><label className={lbl}>HSN/SAC Code</label><input type="text" value={itemForm.hsn_sac_code} onChange={(e) => setItemForm({ ...itemForm, hsn_sac_code: e.target.value })} className={inputCls} /></div>
                <div>
                  <Select label="Unit of Measure" value={itemForm.unit_of_measure} onChange={(v) => setItemForm({ ...itemForm, unit_of_measure: v })} options={uomOpts} />
                </div>
                <div>
                  <Select label="Valuation Method" value={itemForm.valuation_method} onChange={(v) => setItemForm({ ...itemForm, valuation_method: v })} options={valuationOpts} />
                </div>
                <div><label className={lbl}>Opening Qty</label><input type="number" step="0.001" value={itemForm.opening_qty} onChange={(e) => setItemForm({ ...itemForm, opening_qty: parseFloat(e.target.value) || 0 })} className={inputCls} /></div>
                <div><label className={lbl}>Opening Rate</label><input type="number" step="0.01" value={itemForm.opening_rate} onChange={(e) => setItemForm({ ...itemForm, opening_rate: parseFloat(e.target.value) || 0 })} className={inputCls} /></div>
                <div>
                  <Select label="GST Rate (%)" value={String(itemForm.gst_rate)} onChange={(v) => setItemForm({ ...itemForm, gst_rate: parseFloat(v) })} options={gstOpts} />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => {
                    if (!itemForm.name.trim()) { setModalError("Name is required"); return; }
                    const body = { ...itemForm, stock_group_id: itemForm.stock_group_id || null };
                    if (selectedItem.id) handleItemModalUpdate(selectedItem.id, body);
                    else handleItemModalSubmit(body);
                  }}
                  disabled={isSubmitting}
                  className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : selectedItem.id ? "Update" : "Create"}
                </button>
                <button onClick={handleItemModalClose} className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Stock Entry Modal ── */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 pt-10 pb-10" onClick={handleEntryModalClose}>
          <div className="relative w-full max-w-4xl rounded-xl bg-white dark:bg-[#18181f] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">
                {selectedEntry.id ? `Edit Stock Entry — ${toDisplayDate(selectedEntry.entry_date)}` : "New Stock Entry"}
              </h3>
              <div className="flex items-center gap-2">
                {selectedEntry.id ? (
                  <>
                    <button onClick={handleEntryModalDuplicate} className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Duplicate</button>
                    <button onClick={handleEntryModalDelete} className="rounded border border-red-200 dark:border-red-700 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">Delete</button>
                  </>
                ) : (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Creating new entry</span>
                )}
                <button onClick={handleEntryModalClose} className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Close</button>
              </div>
            </div>
            <div className="p-5">
              {modalError && <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{modalError}</div>}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Select label="Stock Item *" value={entryForm.stock_item_id} onChange={(v) => setEntryForm({ ...entryForm, stock_item_id: v })} options={stockItemOpts} />
                </div>
                <div>
                  <Select label="Type *" value={entryForm.entry_type} onChange={(v) => setEntryForm({ ...entryForm, entry_type: v })} options={entryTypeOpts} />
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
                <button onClick={() => {
                    if (!entryForm.stock_item_id || entryForm.quantity <= 0 || entryForm.rate < 0) {
                      setModalError("Item, quantity (>0), and rate (>=0) are required"); return;
                    }
                    if (selectedEntry.id) handleEntryModalUpdate(selectedEntry.id, entryForm);
                    else handleEntryModalSubmit(entryForm);
                  }}
                  disabled={isSubmitting}
                  className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : selectedEntry.id ? "Update" : "Create"}
                </button>
                <button onClick={handleEntryModalClose} className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
