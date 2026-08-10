// ── AdminCompaniesPage: Superadmin company management ─────────────────────
//
// Allows superadmins to view all companies, create new ones, edit, and delete.

import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import Select from "../components/Select";
import { INDIAN_STATES } from "../components/IndianStates";
import { showConfirm } from "../components/ConfirmDialog";
import { MODULES } from "../config/modules";
import ModuleSelector from "../components/ModuleSelector";
import Modal from "../components/Modal";
import SortableTable, { type SortableColumn } from "../components/SortableTable";


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
  const [companyType, setCompanyType] = useState("");

  const loadCompanies = () => {
    api.get<Company[]>("/admin/companies")
      .then(setCompanies)
      .catch(() => toast.error("Failed to load companies"));
  };

  useEffect(() => { loadCompanies(); }, []);

  const resetForm = () => {
    setForm({ name: "", legal_name: "", gstin: "", state_code: "", pan: "", address: "" });
    setSelectedModules(MODULES.map((m) => m.id));
    setCompanyType("");
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
        <Modal
          open
          onClose={resetForm}
          maxWidth="3xl"
          scrollable
          panelClassName="p-6"
          label={editingId ? "Edit Company" : "New Company"}
        >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-semibold text-slate-800 dark:text-[#f1f5f9]">
                  {editingId ? "Edit Company" : "New Company"}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-[#94a3b8]">
                  {editingId ? "Update the company profile." : "Create a company — modules can be changed later."}
                </p>
              </div>
              <button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:bg-[#1a1a24]">
                Close
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-[#1a1a24] dark:bg-[#0f0f16]/60">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-[#f1f5f9]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-[#1a1a24] dark:text-[#94a3b8]">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                    </svg>
                  </span>
                  Company Details
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <label className={lbl}>Company Name *</label>
                    <input required type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus className={inputCls} />
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
              </div>

              {!editingId && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-[#1a1a24] dark:bg-[#0f0f16]/60">
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-[#f1f5f9]">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-[#1a1a24] dark:text-[#94a3b8]">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                      </svg>
                    </span>
                    Modules
                  </h4>
                  <ModuleSelector
                    selectedModules={selectedModules}
                    onModulesChange={setSelectedModules}
                    companyType={companyType}
                    onCompanyTypeChange={setCompanyType}
                    showHeading={false}
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#1a1a24]">
                <button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-brand-600 dark:bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600">
                  {editingId ? "Save Changes" : "Create Company"}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {/* Companies Table */}
      {(() => {
        const cols: SortableColumn<Company>[] = [
          { id: "name", header: "Name", size: 220, cell: ({ row: { original: c } }) => (
            <>
              <div className="font-medium text-slate-900 dark:text-[#f1f5f9]">{c.name}</div>
              {c.legal_name && <div className="text-xs text-slate-500 dark:text-[#cbd5e1]">{c.legal_name}</div>}
            </>
          )},
          { id: "gstin", header: "GSTIN", accessorFn: (c) => c.gstin || "—", size: 180 },
          { id: "state", header: "State", accessorFn: (c) => getStateName(c.state_code), size: 120 },
          { id: "pan", header: "PAN", accessorFn: (c) => c.pan || "—", size: 120 },
          { id: "members", header: "Members", accessorFn: (c) => `${c.member_count} ${c.member_count === 1 ? "member" : "members"}`, size: 100 },
        ];

        const editIcon = (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
          </svg>
        );
        const toggleIcon = (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
        const deleteIcon = (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        );

        return (
          <SortableTable
            columns={cols}
            data={companies}
            tableKey="admin-companies"
            keyboardNav
            emptyMessage="No companies found."
            actions={(c) => [
              { icon: editIcon, label: "Edit", onClick: () => handleEdit(c) },
              { icon: toggleIcon, label: c.is_active ? "Deactivate" : "Activate", onClick: () => handleToggleActive(c) },
              { icon: deleteIcon, label: "Delete", danger: true, onClick: () => handleDelete(c) },
            ]}
          />
        );
      })()}
    </div>
  );
}
