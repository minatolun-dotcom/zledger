import { useEffect, useState } from "react";
import { api } from "../api/client";
import { toDisplayDate, generateFyName, calculateEndDate } from "../utils/dateUtils";
import DateInput from "../components/DateInput";
import { useRole } from "../hooks/useRole";
import { useToastStore } from "../store/toast";
import { ListSkeleton } from "./skeletons";

interface FinancialYear {
  id: string; name: string; start_date: string; end_date: string; is_closed: boolean;
}

const fmtDate = (d: string) => d ? toDisplayDate(d) : "";
const initialForm = { name: "", start_date: "", end_date: "" };

export default function FinancialYearsPage() {
  const { canEdit } = useRole();
  const toast = useToastStore();
  const [fys, setFys] = useState<FinancialYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FinancialYear | null>(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.get<FinancialYear[]>("/coa/financial-years")
      .then(setFys)
      .catch((e) => toast.error(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditing(null);
    setForm(initialForm);
    setShowForm(true);
  };

  const openEdit = (fy: FinancialYear) => {
    setEditing(fy);
    setForm({ name: fy.name, start_date: fy.start_date, end_date: fy.end_date });
    setShowForm(true);
  };

  const handleStartChange = (v: string) => {
    setForm((f) => ({ ...f, start_date: v, end_date: v ? calculateEndDate(v) : "", name: v ? generateFyName(v) : f.name }));
  };

  const handleSave = async () => {
    if (!form.name || !form.start_date || !form.end_date) {
      toast.error("All fields are required.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/coa/financial-years/${editing.id}`, {
          name: form.name,
          start_date: form.start_date,
          end_date: form.end_date,
        });
      } else {
        await api.post("/coa/financial-years", form);
      }
      setShowForm(false);
      load();
      toast.success(editing ? "Financial year updated" : "Financial year created");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.del(`/coa/financial-years/${id}`);
      setConfirmDelete(null);
      load();
      toast.success("Financial year deleted");
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
      setConfirmDelete(null);
    }
  };

  const handleToggleClose = async (fy: FinancialYear) => {
    try {
      await api.patch(`/coa/financial-years/${fy.id}/close`, {});
      load();
      toast.success(fy.is_closed ? "Financial year reopened" : "Financial year closed");
    } catch (e: any) {
      toast.error(e?.message || "Failed to toggle close");
    }
  };

  if (loading) return <ListSkeleton title="Financial Years" cols={5} />;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Financial Years</h2>
        {canEdit && (
          <button onClick={openCreate}
            className="btn-primary px-3 py-1.5 text-sm font-medium">
            + New Financial Year
          </button>
        )}
      </div>

      {showForm && (
        <div className="mt-4 rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4 shadow-sm">
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-[#f1f5f9]">
            {editing ? "Edit Financial Year" : "New Financial Year"}
          </h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm dark:bg-[#282832] dark:text-[#f1f5f9]" placeholder="e.g. 2026-27" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Start Date</label>
                <DateInput value={form.start_date} onChange={handleStartChange}
                  className="w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm dark:bg-[#282832] dark:text-[#f1f5f9]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">End Date</label>
                <DateInput value={form.end_date} onChange={(v) => setForm((f) => ({ ...f, end_date: v }))}
                  className="w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm dark:bg-[#282832] dark:text-[#f1f5f9]" />
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="btn-primary px-4 py-1.5 text-sm font-medium">
              {saving ? "Saving..." : editing ? "Update" : "Create"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-[#1a1a24]">
        <table className="w-full text-sm">
          <thead className="border-b-2 border-slate-300 dark:border-[#282832] bg-slate-50 dark:bg-[#16161f]/80 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Start Date</th>
              <th className="px-4 py-2">End Date</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {fys.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 dark:text-[#64748b]">No financial years found.</td></tr>
            )}
            {fys.map((fy) => (
              <tr key={fy.id} className="border-t border-slate-100 dark:border-[#1a1a24]">
                <td className="px-4 py-2 font-medium text-slate-800 dark:text-[#f1f5f9]">{fy.name}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-[#cbd5e1]">{fmtDate(fy.start_date)}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-[#cbd5e1]">{fmtDate(fy.end_date)}</td>
                <td className="px-4 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                    fy.is_closed ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400" : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  }`}>
                    {fy.is_closed ? "Closed" : "Open"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {canEdit && (
                      <>
                        <button onClick={() => handleToggleClose(fy)}
                          className={`rounded px-2 py-1 text-xs font-medium ${
                            fy.is_closed
                              ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                              : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                          }`}>
                          {fy.is_closed ? "Reopen" : "Close"}
                        </button>
                        <button onClick={() => openEdit(fy)}
                          className="rounded bg-slate-50 dark:bg-[#282832] px-2 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-slate-600">
                          Edit
                        </button>
                        {confirmDelete === fy.id ? (
                          <>
                            <button onClick={() => handleDelete(fy.id)}
                              className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700">
                              Confirm
                            </button>
                            <button onClick={() => setConfirmDelete(null)}
                              className="rounded bg-slate-50 dark:bg-[#282832] px-2 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-slate-600">
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmDelete(fy.id)}
                            className="rounded bg-red-50 dark:bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/10">
                            Delete
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
