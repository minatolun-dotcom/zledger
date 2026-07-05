import { useEffect, useState } from "react";
import { useAuthStore } from "../store/auth";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import Select from "../components/Select";
import { ListSkeleton } from "./skeletons";

interface User {
  id: string; email: string; name: string; is_active: boolean; is_superadmin: boolean;
}

interface Company {
  id: string; name: string; gstin: string | null;
}

const emptyCreate = { name: "", email: "", password: "", is_superadmin: false };
const emptyAssign = { company_id: "", role: "accountant" };

export default function AdminUsersPage() {
  const { user: currentUser } = useAuthStore();
  const toast = useToastStore();
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);

  const [assignUserId, setAssignUserId] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState(emptyAssign);

  const ROLE_OPTIONS = [
    { value: "accountant", label: "Accountant" },
    { value: "viewer", label: "Viewer" },
  ];

  const refresh = () => {
    setLoading(true);
    Promise.all([
      api.get<User[]>("/admin/users"),
      api.get<Company[]>("/companies"),
    ])
      .then(([u, c]) => { setUsers(u); setCompanies(c); })
      .catch((err) => toast.error(err?.message || "Failed to load data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  if (!currentUser?.is_superadmin) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-[#94a3b8]">Access denied. Superadmin only.</p>
      </div>
    );
  }

  const handleToggleActive = async (u: User) => {
    if (u.id === currentUser.id) { toast.error("Cannot deactivate yourself"); return; }
    try {
      await api.patch(`/admin/users/${u.id}`, { is_active: !u.is_active });
      refresh();
    } catch (err: any) { toast.error(err?.message || "Failed to update user"); }
  };

  const handleToggleSuperadmin = async (u: User) => {
    if (u.id === currentUser.id) { toast.error("Cannot change your own superadmin status"); return; }
    try {
      await api.patch(`/admin/users/${u.id}`, { is_superadmin: !u.is_superadmin });
      refresh();
    } catch (err: any) { toast.error(err?.message || "Failed to update user"); }
  };

  const handleSaveEdit = async (userId: string) => {
    try {
      await api.patch(`/admin/users/${userId}`, { name: editName, email: editEmail });
      setEditingId(null);
      refresh();
    } catch (err: any) { toast.error(err?.message || "Failed to update user"); }
  };

  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.email.trim() || !createForm.password) {
      toast.error("Name, email, and password are required"); return;
    }
    try {
      await api.post("/admin/users", createForm);
      toast.success(`User "${createForm.email}" created successfully`);
      setShowCreate(false);
      setCreateForm(emptyCreate);
      refresh();
    } catch (err: any) { toast.error(err?.message || "Failed to create user"); }
  };

  const handleAssign = async () => {
    if (!assignUserId || !assignForm.company_id) { toast.error("Select a company"); return; }
    try {
      const company = companies.find((c) => c.id === assignForm.company_id);
      await api.post(`/admin/users/${assignUserId}/memberships`, {
        company_id: assignForm.company_id,
        role: assignForm.role,
      });
      toast.success(`User assigned to ${company?.name ?? "company"}`);
      setAssignUserId(null);
      setAssignForm(emptyAssign);
    } catch (err: any) { toast.error(err?.message || "Failed to assign user"); }
  };

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">User Management (Admin)</h2>
        <button
          onClick={() => { setShowCreate(!showCreate); }}
          className="rounded-lg bg-brand-600 dark:bg-violet-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600"
        >
          {showCreate ? "Cancel" : "+ New User"}
        </button>
      </div>

      {showCreate && (
        <div className="mt-4 rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-[#f1f5f9]">Create New User</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Name *</label>
              <input type="text" value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm bg-white dark:bg-[#111118]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Email *</label>
              <input type="email" value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm bg-white dark:bg-[#111118]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Password *</label>
              <input type="password" value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm bg-white dark:bg-[#111118]" minLength={8} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={createForm.is_superadmin}
                  onChange={(e) => setCreateForm({ ...createForm, is_superadmin: e.target.checked })}
                  className="rounded border-slate-300 dark:border-[#252530]" />
                Make superadmin
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleCreate}
              className="rounded-lg bg-brand-600 dark:bg-violet-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600">
              Create User
            </button>
            <button onClick={() => { setShowCreate(false); setCreateForm(emptyCreate); }}
              className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {assignUserId && (
        <div className="mt-4 rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-[#f1f5f9]">Assign to Company</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Select
                label="Company *"
                value={assignForm.company_id}
                onChange={(v) => setAssignForm({ ...assignForm, company_id: v })}
                options={[{ value: "", label: "Select company" }, ...companies.map((c) => ({ value: c.id, label: c.name }))]}
                className="w-full"
                required
              />
            </div>
            <div>
              <Select
                label="Role *"
                value={assignForm.role}
                onChange={(v) => setAssignForm({ ...assignForm, role: v })}
                options={ROLE_OPTIONS}
                className="w-full"
                required
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleAssign}
              className="rounded-lg bg-brand-600 dark:bg-violet-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600">
              Assign
            </button>
            <button onClick={() => { setAssignUserId(null); setAssignForm(emptyAssign); }}
              className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <ListSkeleton title="Users" cols={4} />
      ) : (
        <div className="mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1e1e28] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                <th className="pb-2">Name</th>
                <th className="pb-2">Email</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 dark:border-[#1e1e28]">
                  <td className="py-2">
                    {editingId === u.id ? (
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                        className="rounded border border-slate-300 dark:border-[#252530] px-2 py-1 text-xs bg-white dark:bg-[#111118]" />
                    ) : (
                      <span className="font-medium">{u.name}</span>
                    )}
                  </td>
                  <td className="py-2 text-slate-600 dark:text-[#94a3b8]">
                    {editingId === u.id ? (
                      <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                        className="rounded border border-slate-300 dark:border-[#252530] px-2 py-1 text-xs bg-white dark:bg-[#111118]" />
                    ) : (
                      u.email
                    )}
                  </td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      u.is_superadmin ? "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400" : "bg-slate-100 text-slate-600 dark:bg-[#252530] dark:text-[#94a3b8]"
                    }`}>
                      {u.is_superadmin ? "superadmin" : "user"}
                    </span>
                  </td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      u.is_active ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                    }`}>
                      {u.is_active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {editingId === u.id ? (
                      <div className="inline-flex gap-2">
                        <button onClick={() => handleSaveEdit(u.id)}
                          className="text-xs text-brand-600 dark:text-violet-400 hover:underline">Save</button>
                        <button onClick={() => setEditingId(null)}
                          className="text-xs text-slate-500 dark:text-[#94a3b8] hover:underline">Cancel</button>
                      </div>
                    ) : (
                      <div className="inline-flex gap-2">
                        <button onClick={() => { setEditingId(u.id); setEditName(u.name); setEditEmail(u.email); }}
                          className="text-xs text-slate-500 dark:text-[#94a3b8] hover:underline">Edit</button>
                        <button onClick={() => { setAssignUserId(u.id); setAssignForm(emptyAssign); }}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Assign</button>
                        {u.id !== currentUser.id && (
                          <>
                            <button onClick={() => handleToggleActive(u)}
                              className="text-xs text-amber-600 dark:text-amber-400 hover:underline">
                              {u.is_active ? "Deactivate" : "Activate"}
                            </button>
                            <button onClick={() => handleToggleSuperadmin(u)}
                              className="text-xs text-purple-600 dark:text-purple-400 hover:underline">
                              {u.is_superadmin ? "Revoke Admin" : "Make Admin"}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-slate-400 dark:text-[#64748b]">No users.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
