import { useEffect, useState } from "react";
import { api } from "../api/client";
import { toDisplayDate, generateFyName, calculateEndDate } from "../utils/dateUtils";
import DateInput from "../components/DateInput";

interface FinancialYear {
  id: string; name: string; start_date: string; end_date: string; is_closed: boolean;
}

const fmtDate = (d: string) => d ? toDisplayDate(d) : "";
const initialForm = { name: "", start_date: "", end_date: "" };

export default function FinancialYearsPage() {
  const [fys, setFys] = useState<FinancialYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FinancialYear | null>(null);
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError("");
    api.get<FinancialYear[]>("/coa/financial-years")
      .then(setFys)
      .catch((e) => setError(e?.detail || "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditing(null);
    setForm(initialForm);
    setShowForm(true);
    setFormError("");
  };

  const openEdit = (fy: FinancialYear) => {
    setEditing(fy);
    setForm({ name: fy.name, start_date: fy.start_date, end_date: fy.end_date });
    setShowForm(true);
    setFormError("");
  };

  const handleStartChange = (v: string) => {
    setForm((f) => ({ ...f, start_date: v, end_date: v ? calculateEndDate(v) : "", name: v ? generateFyName(v) : f.name }));
  };

  const handleSave = async () => {
    setFormError("");
    if (!form.name || !form.start_date || !form.end_date) {
      setFormError("All fields are required.");
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
    } catch (e: any) {
      setFormError(e?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.del(`/coa/financial-years/${id}`);
      setConfirmDelete(null);
      load();
    } catch (e: any) {
      setError(e?.detail || "Failed to delete");
      setConfirmDelete(null);
    }
  };

  const handleToggleClose = async (fy: FinancialYear) => {
    try {
      await api.patch(`/coa/financial-years/${fy.id}/close`, {});
      load();
    } catch (e: any) {
      setError(e?.detail || "Failed to toggle close");
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading financial years...</p>;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <h2 className="text-lg font-bold text-slate-900">Financial Years</h2>
        <button onClick={openCreate}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
          + New Financial Year
        </button>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {showForm && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 font-semibold text-slate-800">
            {editing ? "Edit Financial Year" : "New Financial Year"}
          </h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" placeholder="e.g. 2026-27" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Start Date</label>
                <DateInput value={form.start_date} onChange={handleStartChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">End Date</label>
                <DateInput value={form.end_date} onChange={(v) => setForm((f) => ({ ...f, end_date: v }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
              </div>
            </div>
          </div>
          {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
          <div className="mt-4 flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {saving ? "Saving..." : editing ? "Update" : "Create"}
            </button>
            <button onClick={() => { setShowForm(false); setFormError(""); }}
              className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
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
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No financial years found.</td></tr>
            )}
            {fys.map((fy) => (
              <tr key={fy.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">{fy.name}</td>
                <td className="px-4 py-2 text-slate-600">{fmtDate(fy.start_date)}</td>
                <td className="px-4 py-2 text-slate-600">{fmtDate(fy.end_date)}</td>
                <td className="px-4 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                    fy.is_closed ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                  }`}>
                    {fy.is_closed ? "Closed" : "Open"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => handleToggleClose(fy)}
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        fy.is_closed
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                      }`}>
                      {fy.is_closed ? "Reopen" : "Close"}
                    </button>
                    <button onClick={() => openEdit(fy)}
                      className="rounded bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
                      Edit
                    </button>
                    {confirmDelete === fy.id ? (
                      <>
                        <button onClick={() => handleDelete(fy.id)}
                          className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700">
                          Confirm
                        </button>
                        <button onClick={() => setConfirmDelete(null)}
                          className="rounded bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDelete(fy.id)}
                        className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100">
                        Delete
                      </button>
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
