// ── AdminCompaniesPage: Superadmin company management ─────────────────────
//
// Allows superadmins to view all companies, create new ones, edit, and delete.

import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import Select from "../components/Select";
import { INDIAN_STATES } from "../components/IndianStates";
import { showConfirm } from "../components/ConfirmDialog";
import { ListSkeleton } from "./skeletons";
import { MODULES, ALWAYS_ON } from "../config/modules";
import NavIcon from "../components/NavIcon";


interface Company {
  id: string;
  name: string;
  legal_name: string | null;
  gstin: string | null;
  state_code: string | null;
  pan: string | null;
  address: string | null;
  is_active: boolean;
  member_count: number;
  modules?: string[];
}

const inputCls = "mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm bg-white dark:bg-[#0f0f16] focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20";
const lbl = "block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]";

export default function AdminCompaniesPage() {
  const toast = useToastStore();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    legal_name: "",
    gstin: "",
    state_code: "",
    pan: "",
    address: "",
  });
  const [selectedModules, setSelectedModules] = useState<string[]>(MODULES.map((m) => m.id));

  const loadCompanies = () => {
    setLoading(true);
    api.get<Company[]>("/admin/companies")
      .then(setCompanies)
      .catch(() => toast.error("Failed to load companies"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCompanies(); }, []);

  const resetForm = () => {
    setForm({ name: "", legal_name: "", gstin: "", state_code: "", pan: "", address: "" });
    setSelectedModules(MODULES.map((m) => m.id));
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (c: Company) => {
    setForm({
      name: c.name,
      legal_name: c.legal_name ?? "",
      gstin: c.gstin ?? "",
      state_code: c.state_code ?? "",
      pan: c.pan ?? "",
      address: c.address ?? "",
    });
    setSelectedModules(c.modules ?? MODULES.map((m) => m.id));
    setEditingId(c.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        legal_name: form.legal_name || null,
        gstin: form.gstin || null,
        state_code: form.state_code || null,
        pan: form.pan || null,
        address: form.address || null,
      };

      if (!editingId) {
        payload.modules = selectedModules;
      }

      if (editingId) {
        await api.patch(`/admin/companies/${editingId}`, payload);
      } else {
        await api.post("/admin/companies", payload);
      }
      resetForm();
      loadCompanies();
    } catch (err: any) {
      toast.error(err?.message || "Operation failed");
    }
  };

  const handleDelete = async (c: Company) => {
    if (!await showConfirm(`Delete company "${c.name}"? This will permanently remove all data (vouchers, ledgers, etc.). This cannot be undone.`, { danger: true, confirmLabel: "Delete" })) return;
    try {
      await api.del(`/admin/companies/${c.id}?force=true`);
      loadCompanies();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete company");
    }
  };

  const handleToggleActive = async (c: Company) => {
    try {
      await api.patch(`/admin/companies/${c.id}`, { is_active: !c.is_active });
      loadCompanies();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update company");
    }
  };

  const getStateName = (code: string | null) => {
    if (!code) return "—";
    return INDIAN_STATES.find((s) => s.code === code)?.name ?? code;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Company Management</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="rounded-lg bg-brand-600 dark:bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600"
        >
          + New Company
        </button>
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-6" onClick={resetForm}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-200 dark:bg-[#16161f] dark:shadow-dark-xl dark:ring-[#1a1a24] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 dark:text-[#f1f5f9]">
                {editingId ? "Edit Company" : "New Company"}
              </h3>
              <button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:bg-[#1a1a24]">
                Close
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Company Name *</label>
                  <input required type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={lbl}>Legal Name</label>
                  <input type="text" value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={lbl}>GSTIN</label>
                  <input type="text" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} placeholder="27AAAAA1111A1Z5" className={inputCls} />
                </div>
                <div>
                  <label className={lbl}>PAN</label>
                  <input type="text" value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} placeholder="AAAAA1111A" className={inputCls} />
                </div>
                <div>
                  <Select
                    value={form.state_code}
                    onChange={(v) => setForm({ ...form, state_code: v })}
                    options={INDIAN_STATES.map((s) => ({ value: s.code, label: s.name }))}
                    label="State"
                    placeholder="Select state"
                  />
                </div>
                <div>
                  <label className={lbl}>Address</label>
                  <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
                </div>
              </div>

              {!editingId && (
                <div className="border-t border-slate-200 pt-4 dark:border-[#1a1a24]">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Modules</h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-[#cbd5e1]">Choose which features this company needs.</p>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {MODULES.map((m) => {
                      const isOn = selectedModules.includes(m.id);
                      const locked = ALWAYS_ON.includes(m.id);
                      return (
                        <button key={m.id} type="button" disabled={locked}
                          onClick={() => { if (locked) return; setSelectedModules((prev) => isOn ? prev.filter((id) => id !== m.id) : [...prev, m.id]); }}
                          className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                            isOn ? "border-blue-500/50 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10" : "border-slate-200 bg-white hover:border-slate-300 dark:border-[#282832] dark:bg-[#0f0f16] dark:hover:border-[#383848]"
                          } ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
                          <NavIcon name={m.icon} className={`h-4 w-4 shrink-0 ${isOn ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-[#64748b]"}`} />
                          <div className="min-w-0">
                            <span className={`block font-medium truncate ${isOn ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-[#cbd5e1]"}`}>{m.label}</span>
                            <span className="block text-[11px] text-slate-400 dark:text-[#64748b] truncate">{m.description}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button type="submit" className="rounded-lg bg-brand-600 dark:bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600">
                  {editingId ? "Save Changes" : "Create Company"}
                </button>
                <button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Companies Table */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm overflow-hidden">
        {loading ? (
          <ListSkeleton title="Companies" cols={4} />
        ) : companies.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-400 dark:text-[#64748b]">No companies found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#1a1a24] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1]">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">GSTIN</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">PAN</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 dark:border-[#1a1a24] hover:bg-slate-50 dark:hover:bg-[#1a1a24]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-[#f1f5f9]">{c.name}</div>
                    {c.legal_name && <div className="text-xs text-slate-500 dark:text-[#cbd5e1]">{c.legal_name}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-[#cbd5e1]">{c.gstin || "—"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-[#cbd5e1]">{getStateName(c.state_code)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-[#cbd5e1]">{c.pan || "—"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-[#cbd5e1]">
                    {c.member_count} {c.member_count === 1 ? "member" : "members"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.is_active ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                    }`}>
                      {c.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => handleEdit(c)}
                        className="rounded-md p-1 text-slate-400 dark:text-[#64748b] hover:bg-slate-100 dark:hover:bg-[#282832] hover:text-brand-600 dark:hover:text-blue-400" title="Edit">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                        </svg>
                      </button>
                      <button onClick={() => handleToggleActive(c)}
                        className="rounded-md p-1 text-slate-400 dark:text-[#64748b] hover:bg-slate-100 dark:hover:bg-[#282832] hover:text-amber-600 dark:hover:text-amber-400" title={c.is_active ? "Deactivate" : "Activate"}>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(c)}
                        className="rounded-md p-1 text-slate-400 dark:text-[#64748b] hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400" title="Delete">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
