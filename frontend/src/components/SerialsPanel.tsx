import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import Select from "./Select";
import MasterSelector from "./master/MasterSelector";
import { useStockItems, type Serial } from "../hooks/useMasterData";
import SortableTable, { type SortableColumn } from "./SortableTable";

interface Props {
  canEdit: boolean;
}

export default function SerialsPanel({ canEdit }: Props) {
  const toast = useToastStore();
  const { data: items = [] } = useStockItems();
  const [serials, setSerials] = useState<Serial[]>([]);
  const [filterItem, setFilterItem] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [formItem, setFormItem] = useState("");
  const [formCount, setFormCount] = useState("10");
  const [formPrefix, setFormPrefix] = useState("");
  const [formNumbers, setFormNumbers] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const serialItems = items.filter((i) => i.tracking_mode === "serial");

  const fetchSerials = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterItem) params.set("stock_item_id", filterItem);
      if (filterStatus) params.set("status", filterStatus);
      const res = await api.get<Serial[]>(`/manufacturing/serials?${params}`);
      setSerials(res);
    } catch {
      toast.error("Failed to load serials");
    }
  }, [filterItem, filterStatus, toast]);

  useEffect(() => { fetchSerials(); }, [fetchSerials]);

  const handleCreate = async () => {
    if (!formItem) { toast.error("Select a serial-tracked item"); return; }
    const explicit = formNumbers.split(",").map((s) => s.trim()).filter(Boolean);
    if (!explicit.length && (!formCount || parseInt(formCount) <= 0)) {
      toast.error("Enter a count or serial numbers");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = { stock_item_id: formItem };
      if (explicit.length) payload.serial_numbers = explicit;
      else { payload.count = parseInt(formCount) || 10; payload.prefix = formPrefix || null; }
      const created = await api.post<Serial[]>("/manufacturing/serials", payload);
      toast.success(`Created ${created.length} serial number(s)`);
      setShowCreate(false);
      setFormNumbers("");
      fetchSerials();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create serials");
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusColors: Record<string, string> = {
    in_stock: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    issued: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    scrapped: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };

  const columns: SortableColumn<Serial>[] = [
    { id: "serial_number", header: "Serial #", accessorKey: "serial_number", size: 160, className: "font-medium text-slate-900 dark:text-[#f1f5f9]" },
    { id: "item_name", header: "Item", accessorFn: (r) => r.item_name || "—", size: 180, className: "text-slate-600 dark:text-[#cbd5e1]" },
    { id: "status", header: "Status", accessorKey: "status", size: 100, cell: ({ getValue }) => (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColors[getValue() as string] || "bg-slate-100 text-slate-500 dark:bg-[#1a1a24] dark:text-[#94a3b8]"}`}>
        {(getValue() as string).replace("_", " ")}
      </span>
    ) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-[#94a3b8]">
          {serials.length} serial unit{serials.length !== 1 ? "s" : ""} tracked
        </p>
        {canEdit && (
          <button
            onClick={() => { setFormItem(""); setFormCount("10"); setFormPrefix(""); setFormNumbers(""); setShowCreate(true); }}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-medium text-white"
          >
            + New Serials
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Select
          value={filterItem}
          onChange={setFilterItem}
          options={[{ value: "", label: "All Items" }, ...serialItems.map((i) => ({ value: i.id, label: i.name }))]}
          placeholder="All Items"
          className="w-64"
        />
        <Select
          value={filterStatus}
          onChange={setFilterStatus}
          options={[
            { value: "", label: "All Serial Statuses" },
            { value: "in_stock", label: "In Stock" },
            { value: "issued", label: "Issued" },
            { value: "scrapped", label: "Scrapped" },
          ]}
          placeholder="All Serial Statuses"
          className="w-48"
        />
      </div>

      <SortableTable
        columns={columns}
        data={serials}
        tableKey="manufacturing-serials"
        emptyMessage="No serial numbers yet. Create some for serial-tracked items."
      />

      {showCreate && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-[#282832] dark:bg-[#16161f] space-y-3">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Create Serial Numbers</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Serial-Tracked Item *</label>
              <MasterSelector
                entityKey="stock_item"
                value={formItem}
                onChange={(v: string) => setFormItem(v)}
                options={serialItems.map((i) => ({ value: i.id, label: i.name }))}
                placeholder="Select item"
                className="mt-1 w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Count</label>
              <input
                type="number" min="1" value={formCount}
                onChange={(e) => setFormCount(e.target.value)}
                disabled={!!formNumbers.trim()}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-[#282832] dark:bg-[#0f0f16] dark:text-[#f1f5f9]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Prefix (auto-numbering)</label>
              <input
                type="text" value={formPrefix}
                onChange={(e) => setFormPrefix(e.target.value)}
                placeholder="e.g. SR-2026"
                disabled={!!formNumbers.trim()}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-[#282832] dark:bg-[#0f0f16] dark:text-[#f1f5f9]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Exact numbers (comma-separated)</label>
              <input
                type="text" value={formNumbers}
                onChange={(e) => setFormNumbers(e.target.value)}
                placeholder="SN-001, SN-002"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-[#282832] dark:bg-[#0f0f16] dark:text-[#f1f5f9]"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={isSubmitting} className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50">
              {isSubmitting ? "Creating..." : "Create Serials"}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 dark:text-[#94a3b8] dark:hover:text-[#f1f5f9]">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
