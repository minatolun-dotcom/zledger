import { useEffect, useState } from "react";
import { api } from "../api/client";
import Select from "../components/Select";

interface HsnSac {
  id: string;
  code: string;
  description: string;
  gst_rate: number;
  code_type: string;
  is_active: boolean;
}

export default function HsnSacPage() {
  const [list, setList] = useState<HsnSac[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", description: "", gst_rate: 18, code_type: "hsn" });

  const HSN_TYPE_OPTIONS = [
    { value: "hsn", label: "HSN" },
    { value: "sac", label: "SAC" },
  ];

  useEffect(() => { loadData(); }, []);

  function loadData() {
    setLoading(true);
    api.get<HsnSac[]>("/gst/hsn-sac").then(setList).finally(() => setLoading(false));
  }

  async function handleCreate() {
    try {
      await api.post("/gst/hsn-sac", form);
      setShowForm(false);
      setForm({ code: "", description: "", gst_rate: 18, code_type: "hsn" });
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create HSN/SAC");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this HSN/SAC code?")) return;
    try {
      await api.del(`/gst/hsn-sac/${id}`);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">HSN / SAC Codes</h2>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-[#94a3b8]">Loading…</p>
      ) : (
        <div className="mt-4">
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setShowForm(!showForm)}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              {showForm ? "Cancel" : "+ Add HSN/SAC"}
            </button>
          </div>

          {showForm && (
            <div className="mb-4 rounded-lg border border-slate-200 dark:border-[#1e1e28] p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Code</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                    placeholder="e.g. 998314"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Description</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                    placeholder="e.g. Other IT services"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">GST Rate (%)</label>
                  <input
                    type="number"
                    value={form.gst_rate}
                    onChange={(e) => setForm({ ...form, gst_rate: Number(e.target.value) })}
                    className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
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

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1e1e28] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                <th className="pb-2">Code</th>
                <th className="pb-2">Description</th>
                <th className="pb-2">Type</th>
                <th className="pb-2 text-right">GST Rate</th>
                <th className="pb-2">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((h) => (
                <tr key={h.id} className="border-b border-slate-100 dark:border-[#1e1e28]/50">
                  <td className="py-2 font-medium text-slate-900 dark:text-[#f1f5f9]">{h.code}</td>
                  <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{h.description}</td>
                  <td className="py-2 text-slate-600 dark:text-[#94a3b8] uppercase">{h.code_type}</td>
                  <td className="py-2 text-right font-medium">{h.gst_rate}%</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${h.is_active ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400"}`}>
                      {h.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => handleDelete(h.id)} className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">Delete</button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 dark:text-[#64748b]">
                    No HSN/SAC codes yet. Add your first code above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
