import { useEffect, useState } from "react";
import { api } from "../api/client";

import { useToastStore } from "../store/toast";
import Select from "../components/Select";
import { showConfirm } from "../components/ConfirmDialog";
import { ListSkeleton } from "./skeletons";
import { useRole } from "../hooks/useRole";
import Modal from "../components/Modal";
import SortableTable, { type SortableColumn } from "../components/SortableTable";

interface HsnSac {
  id: string;
  code: string;
  description: string;
  gst_rate: number;
  code_type: string;
  is_active: boolean;
}

const deleteIcon = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

export default function HsnSacPage() {
  const { canEdit } = useRole();
  const [list, setList] = useState<HsnSac[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", description: "", gst_rate: 18, code_type: "hsn" });
  const toast = useToastStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());



  const HSN_TYPE_OPTIONS = [
    { value: "hsn", label: "HSN" },
    { value: "sac", label: "SAC" },
  ];

  useEffect(() => { loadData(); }, []);

  function loadData() {
    setLoading(true);
    api.get<HsnSac[]>("/gst/hsn-sac").then(setList).catch(() => {}).finally(() => setLoading(false));
  }

  async function handleCreate() {
    try {
      await api.post("/gst/hsn-sac", form);
      setShowForm(false);
      setForm({ code: "", description: "", gst_rate: 18, code_type: "hsn" });
      loadData();
      toast.success("HSN/SAC created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create HSN/SAC");
    }
  }

  async function handleDelete(id: string) {
    if (!await showConfirm("Delete this HSN/SAC code?", { danger: true, confirmLabel: "Delete" })) return;
    try {
      await api.del(`/gst/hsn-sac/${id}`);
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
      loadData();
      toast.success("HSN/SAC deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function toggleAll(ids: string[]) { setSelected(new Set(ids)); }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!await showConfirm(`Delete ${selected.size} HSN/SAC code(s)?`, { danger: true, confirmLabel: "Delete" })) return;
    try {
      const result = await api.post<{ processed: number; errors: string[] }>("/hsn-sac/bulk-delete", { ids: Array.from(selected) });
      if (result.errors?.length) toast.error(result.errors.join("; "));
      else toast.success(`Deleted ${result.processed} HSN/SAC code(s)`);
      setSelected(new Set());
      loadData();
    } catch (err: any) { toast.error(err?.message || "Failed to delete"); }
  }

  const columns: SortableColumn<HsnSac>[] = [
    { id: "code", header: "Code", accessorKey: "code", size: 130, cell: ({ getValue }) => (
      <span className="font-medium text-slate-900 dark:text-[#f1f5f9]">{getValue() as string}</span>
    ) },
    { id: "description", header: "Description", accessorKey: "description", size: 280, cell: ({ getValue }) => (
      <span className="block max-w-[280px] truncate text-slate-600 dark:text-[#cbd5e1]" title={getValue() as string}>{getValue() as string}</span>
    ) },
    { id: "code_type", header: "Type", accessorKey: "code_type", size: 90, cell: ({ getValue }) => (
      <span className="uppercase text-slate-600 dark:text-[#cbd5e1]">{getValue() as string}</span>
    ) },
    { id: "gst_rate", header: "GST Rate", accessorKey: "gst_rate", size: 110, cell: ({ getValue }) => (
      <span className="whitespace-nowrap font-medium tabular-nums">{getValue() as number}%</span>
    ), className: "text-right" },
    { id: "status", header: "Status", accessorFn: (row) => row.is_active ? "Active" : "Inactive", size: 110, cell: ({ getValue }) => {
      const v = getValue() as string;
      return (
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${v === "Active" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"}`}>
          {v}
        </span>
      );
    } },
  ];

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">HSN / SAC Codes</h1>

      {loading ? (
        <ListSkeleton title="HSN/SAC" cols={4} />
      ) : (
        <div className="mt-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              {selected.size > 0 && (
                <button onClick={bulkDelete} className="rounded-lg bg-gradient-to-r from-red-500 to-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:from-red-600 hover:to-rose-700">
                  Delete ({selected.size})
                </button>
              )}
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              {showForm ? "Cancel" : "+ Add HSN/SAC"}
            </button>
          </div>

          <Modal open={showForm} onClose={() => setShowForm(false)} maxWidth="md" panelClassName="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-800 dark:text-[#f1f5f9]">Add HSN/SAC Code</h3>
                  <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-[#94a3b8] text-lg leading-none">&times;</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Code</label>
                    <input
                      type="text"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      className="mt-1 w-full rounded border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm"
                      placeholder="e.g. 998314"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Description</label>
                    <input
                      type="text"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="mt-1 w-full rounded border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm"
                      placeholder="e.g. Other IT services"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">GST Rate (%)</label>
                    <input
                      type="number"
                      value={form.gst_rate}
                      onChange={(e) => setForm({ ...form, gst_rate: Number(e.target.value) })}
                      className="mt-1 w-full rounded border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm"
                      min={0}
                      max={100}
                    />
                  </div>
                  <div>
                    <Select
                      label="Type"
                      value={form.code_type}
                      onChange={(v) => setForm({ ...form, code_type: v })}
                      options={HSN_TYPE_OPTIONS}
                      className="mt-1 w-full"
                    />
                  </div>
                </div>
                <button
                  onClick={handleCreate}
                  className="mt-4 rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Save
                </button>
          </Modal>

          <SortableTable
            data={list}
            columns={columns}
            tableKey="hsn-sac"
            emptyMessage="No HSN/SAC codes yet. Add your first code above."
            keyboardNav
            selectable={canEdit}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
            actions={(h) => [
              { icon: deleteIcon, label: "Delete", danger: true, onClick: () => handleDelete(h.id) },
            ]}
          />
        </div>
      )}
    </div>
  );
}
