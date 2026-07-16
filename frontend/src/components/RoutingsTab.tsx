import { useState, useEffect, type FormEvent } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import SortableTable, { type SortableColumn } from "../components/SortableTable";
import type { WorkCenter } from "./WorkCentersTab";
import Select from "./Select";

export interface RoutingOperation {
  id: string;
  routing_id: string;
  step_number: number;
  work_center_id: string;
  work_center_name: string | null;
  description: string | null;
  setup_time_minutes: number;
  run_time_per_unit_minutes: number;
}

export interface Routing {
  id: string;
  company_id: string;
  name: string;
  finished_item_id: string;
  is_active: boolean;
  operations: RoutingOperation[];
  created_at: string;
  updated_at: string;
}

interface Props {
  canEdit: boolean;
}

export default function RoutingsTab({ canEdit }: Props) {
  const toast = useToastStore();
  const [routings, setRoutings] = useState<Routing[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formFinishedItem, setFormFinishedItem] = useState("");
  const [formOps, setFormOps] = useState<Array<{ step: number; wc_id: string; desc: string; setup: string; run: string }>>([]);

  const fetchRoutings = async () => {
    try {
      const [rRes, wcRes] = await Promise.all([
        api.get<Routing[]>("/manufacturing/routings"),
        api.get<WorkCenter[]>("/manufacturing/work-centers"),
      ]);
      setRoutings(rRes);
      setWorkCenters(wcRes);
    } catch {
      toast.error("Failed to load routings");
    }
  };

  useEffect(() => { fetchRoutings(); }, []);

  const resetForm = () => {
    setFormName(""); setFormFinishedItem(""); setFormOps([]);
    setEditingId(null); setShowForm(false);
  };

  const addOp = () => {
    setFormOps([...formOps, { step: formOps.length + 1, wc_id: workCenters[0]?.id || "", desc: "", setup: "0", run: "0" }]);
  };

  const updateOp = (idx: number, field: string, value: string) => {
    const updated = [...formOps];
    (updated[idx] as any)[field] = value;
    setFormOps(updated);
  };

  const removeOp = (idx: number) => {
    setFormOps(formOps.filter((_, i) => i !== idx).map((o, i) => ({ ...o, step: i + 1 })));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      name: formName,
      finished_item_id: formFinishedItem,
      operations: formOps.map((o) => ({
        step_number: parseInt(String(o.step)) || 1,
        work_center_id: o.wc_id,
        description: o.desc || null,
        setup_time_minutes: parseFloat(o.setup) || 0,
        run_time_per_unit_minutes: parseFloat(o.run) || 0,
      })),
    };
    try {
      if (editingId) {
        await api.patch(`/manufacturing/routings/${editingId}`, payload);
        toast.success("Routing updated");
      } else {
        await api.post("/manufacturing/routings", payload);
        toast.success("Routing created");
      }
      resetForm();
      fetchRoutings();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save routing");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete routing "${name}"?`)) return;
    try {
      await api.del(`/manufacturing/routings/${id}`);
      toast.success("Routing deleted");
      fetchRoutings();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete");
    }
  };

  const cols: SortableColumn<Routing>[] = [
    { id: "name", header: "Name", accessorKey: "name" },
    { id: "operations", header: "Steps", accessorFn: (r) => `${r.operations.length} operation${r.operations.length !== 1 ? "s" : ""}` },
    { id: "is_active", header: "Status", cell: ({ row: { original: r } }) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${r.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-[#16161f] dark:text-[#94a3b8]"}`}>
        {r.is_active ? "Active" : "Inactive"}
      </span>
    )},
  ];

  if (canEdit) {
    cols.push({ id: "_actions", header: "", cell: ({ row: { original: r } }) => (
      <div className="flex gap-1 justify-end">
        <button onClick={() => {
          setEditingId(r.id); setFormName(r.name); setFormFinishedItem(r.finished_item_id);
          setFormOps(r.operations.map((o) => ({ step: o.step_number, wc_id: o.work_center_id, desc: o.description || "", setup: String(o.setup_time_minutes), run: String(o.run_time_per_unit_minutes) })));
          setShowForm(true);
        }}
          className="text-slate-400 hover:text-blue-500 dark:text-[#64748b] dark:hover:text-blue-400" title="Edit">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
        </button>
        <button onClick={() => handleDelete(r.id, r.name)}
          className="text-slate-400 hover:text-red-500 dark:text-[#64748b] dark:hover:text-red-400" title="Delete">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
        </button>
      </div>
    )});
  }

  return (
    <div className="space-y-4">
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-[#282832] dark:bg-[#16161f] space-y-3">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">{editingId ? "Edit Routing" : "New Routing"}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Routing Name *</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} required
                className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-[#282832] dark:bg-[#0f0f16] dark:text-[#f1f5f9] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Finished Item ID *</label>
              <input type="text" value={formFinishedItem} onChange={(e) => setFormFinishedItem(e.target.value)} required
                className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-[#282832] dark:bg-[#0f0f16] dark:text-[#f1f5f9] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-semibold text-slate-600 dark:text-[#94a3b8]">Operations</h5>
              {canEdit && (
                <button type="button" onClick={addOp}
                  className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">+ Add Step</button>
              )}
            </div>
            {formOps.length === 0 && <p className="text-xs text-slate-400 dark:text-[#64748b]">No operations added yet.</p>}
            {formOps.map((op, idx) => (
              <div key={idx} className="flex items-end gap-2 rounded-lg border border-slate-100 p-2 dark:border-[#282832]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-600 dark:bg-[#282832] dark:text-[#cbd5e1]">{op.step}</span>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <Select value={op.wc_id} onChange={(v) => updateOp(idx, "wc_id", v)}
                    options={workCenters.map((wc) => ({ value: wc.id, label: wc.name }))}
                  />
                  <input type="text" placeholder="Description" value={op.desc} onChange={(e) => updateOp(idx, "desc", e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-[#282832] dark:bg-[#0f0f16] dark:text-[#f1f5f9]" />
                  <input type="number" placeholder="Setup (min)" value={op.setup} onChange={(e) => updateOp(idx, "setup", e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-[#282832] dark:bg-[#0f0f16] dark:text-[#f1f5f9]" />
                  <input type="number" placeholder="Run (min/unit)" value={op.run} onChange={(e) => updateOp(idx, "run", e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-[#282832] dark:bg-[#0f0f16] dark:text-[#f1f5f9]" />
                </div>
                {canEdit && (
                  <button type="button" onClick={() => removeOp(idx)}
                    className="shrink-0 text-slate-400 hover:text-red-500 dark:text-[#64748b] dark:hover:text-red-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary px-3 py-1.5 text-sm">{editingId ? "Update" : "Create"}</button>
            <button type="button" onClick={resetForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 dark:text-[#94a3b8] dark:hover:text-[#f1f5f9]">Cancel</button>
          </div>
        </form>
      )}
      <SortableTable columns={cols} data={routings} tableKey="routings" />
    </div>
  );
}
