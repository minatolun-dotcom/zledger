import { useState, useEffect, type FormEvent } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import SortableTable, { type SortableColumn } from "../components/SortableTable";

export interface WorkCenter {
  id: string;
  company_id: string;
  name: string;
  department: string | null;
  capacity: number;
  capacity_unit: string | null;
  hourly_rate: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Props {
  canEdit: boolean;
}

export default function WorkCentersTab({ canEdit }: Props) {
  const toast = useToastStore();
  const [centers, setCenters] = useState<WorkCenter[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDept, setFormDept] = useState("");
  const [formCapacity, setFormCapacity] = useState("1");
  const [formUnit, setFormUnit] = useState("units/hr");
  const [formRate, setFormRate] = useState("0");

  const fetchCenters = async () => {
    try {
      const res = await api.get<WorkCenter[]>("/manufacturing/work-centers");
      setCenters(res);
    } catch {
      toast.error("Failed to load work centers");
    }
  };

  useEffect(() => { fetchCenters(); }, []);

  const resetForm = () => {
    setFormName(""); setFormDept(""); setFormCapacity("1");
    setFormUnit("units/hr"); setFormRate("0"); setEditingId(null); setShowForm(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      name: formName, department: formDept || null,
      capacity: parseFloat(formCapacity) || 1,
      capacity_unit: formUnit || null,
      hourly_rate: parseFloat(formRate) || 0,
    };
    try {
      if (editingId) {
        await api.patch(`/manufacturing/work-centers/${editingId}`, payload);
        toast.success("Work center updated");
      } else {
        await api.post("/manufacturing/work-centers", payload);
        toast.success("Work center created");
      }
      resetForm();
      fetchCenters();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save work center");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete work center "${name}"?`)) return;
    try {
      await api.del(`/manufacturing/work-centers/${id}`);
      toast.success("Work center deleted");
      fetchCenters();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete");
    }
  };

  const cols: SortableColumn<WorkCenter>[] = [
    { id: "name", header: "Name", accessorKey: "name" },
    { id: "department", header: "Department", accessorKey: "department" },
    { id: "capacity", header: "Capacity", accessorFn: (r) => `${r.capacity} ${r.capacity_unit || ""}` },
    { id: "hourly_rate", header: "Rate (₹/hr)", accessorFn: (r) => `₹${r.hourly_rate.toFixed(2)}` },
    { id: "is_active", header: "Status", cell: ({ row: { original: r } }) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${r.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-[#16161f] dark:text-[#94a3b8]"}`}>
        {r.is_active ? "Active" : "Inactive"}
      </span>
    )},
  ];

  if (canEdit) {
    cols.push({ id: "_actions", header: "", cell: ({ row: { original: r } }) => (
      <div className="flex gap-1 justify-end">
        <button onClick={() => { setEditingId(r.id); setFormName(r.name); setFormDept(r.department || ""); setFormCapacity(String(r.capacity)); setFormUnit(r.capacity_unit || ""); setFormRate(String(r.hourly_rate)); setShowForm(true); }}
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
          <h4 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">{editingId ? "Edit Work Center" : "New Work Center"}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Name *</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} required
                className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-[#282832] dark:bg-[#0f0f16] dark:text-[#f1f5f9] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Department</label>
              <input type="text" value={formDept} onChange={(e) => setFormDept(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-[#282832] dark:bg-[#0f0f16] dark:text-[#f1f5f9] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Capacity</label>
              <input type="number" step="0.1" value={formCapacity} onChange={(e) => setFormCapacity(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-[#282832] dark:bg-[#0f0f16] dark:text-[#f1f5f9] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Unit</label>
              <input type="text" value={formUnit} onChange={(e) => setFormUnit(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-[#282832] dark:bg-[#0f0f16] dark:text-[#f1f5f9] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Rate (₹/hr)</label>
              <input type="number" step="0.01" value={formRate} onChange={(e) => setFormRate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-[#282832] dark:bg-[#0f0f16] dark:text-[#f1f5f9] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary px-3 py-1.5 text-sm">{editingId ? "Update" : "Create"}</button>
            <button type="button" onClick={resetForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 dark:text-[#94a3b8] dark:hover:text-[#f1f5f9]">Cancel</button>
          </div>
        </form>
      )}
      <SortableTable columns={cols} data={centers} tableKey="work-centers" />
    </div>
  );
}
