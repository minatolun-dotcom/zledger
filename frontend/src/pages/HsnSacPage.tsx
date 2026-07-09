import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import Select from "../components/Select";
import { showConfirm } from "../components/ConfirmDialog";
import { ListSkeleton } from "./skeletons";
import { useRole } from "../hooks/useRole";

interface HsnSac {
  id: string;
  code: string;
  description: string;
  gst_rate: number;
  code_type: string;
  is_active: boolean;
}

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

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">HSN / SAC Codes</h2>

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

          {showForm && (
            <div className="mb-4 rounded-lg border border-slate-200 dark:border-[#1a1a24] p-4">
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
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-[#1a1a24]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-300 dark:border-[#282832] bg-slate-50 dark:bg-[#16161f]/80 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">
                {canEdit && (
                  <th className="px-3 py-2.5 w-8">
                    <input type="checkbox"
                      checked={list.length > 0 && list.every((h) => selected.has(h.id))}
                      onChange={() => toggleAll(list.length > 0 && list.every((h) => selected.has(h.id)) ? [] : list.map((h) => h.id))}
                      className="h-4 w-4 rounded border-slate-300 dark:border-[#282832] text-brand-600 focus:ring-brand-500 dark:bg-[#282832]"
                    />
                  </th>
                )}
                <th className="px-3 py-2.5">Code</th>
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5 text-right">GST Rate</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((h) => (
                <tr key={h.id} className="border-b border-slate-100 dark:border-[#1a1a24]/50">
                  {canEdit && (
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggleSelect(h.id)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-[#282832] text-brand-600 focus:ring-brand-500 dark:bg-[#282832]"
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-[#f1f5f9]">{h.code}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-[#cbd5e1]">{h.description}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-[#cbd5e1] uppercase">{h.code_type}</td>
                  <td className="px-3 py-2 text-right font-medium">{h.gst_rate}%</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${h.is_active ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400"}`}>
                      {h.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => handleDelete(h.id)} className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">Delete</button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="py-8 text-center text-slate-400 dark:text-[#64748b]">
                    No HSN/SAC codes yet. Add your first code above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
