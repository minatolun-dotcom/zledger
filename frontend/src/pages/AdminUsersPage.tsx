import { useEffect, useState } from "react";
import { useAuthStore } from "../store/auth";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import Select from "../components/Select";
import ContextMenu from "../components/ContextMenu";
import { ListSkeleton } from "./skeletons";


interface User {
  id: string; email: string; name: string; is_active: boolean; is_superadmin: boolean;
  memberships: { company_id: string; company_name: string; role: string }[];
}

interface Company {
  id: string; name: string; gstin: string | null;
}

const emptyCreate = { name: "", email: "", password: "", is_superadmin: false };
const emptyAssign = { company_id: "", role: "accountant" };

function getPrimaryRole(u: User): string {
  if (u.is_superadmin) return "superadmin";
  if (!u.memberships || u.memberships.length === 0) return "—";
  const roleOrder: Record<string, number> = { owner: 0, accountant: 1, viewer: 2 };
  const sorted = [...u.memberships].sort((a, b) => (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3));
  return sorted[0].role;
}

function getPrimaryRoleColor(role: string): string {
  switch (role) {
    case "superadmin": return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400";
    case "owner": return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400";
    case "accountant": return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400";
    case "viewer": return "bg-slate-100 text-slate-600 dark:bg-[#282832] dark:text-[#cbd5e1]";
    default: return "bg-slate-100 text-slate-600 dark:bg-[#282832] dark:text-[#cbd5e1]";
  }
}

function CompanyBadges({ memberships }: { memberships: User["memberships"] }) {
  const [expanded, setExpanded] = useState(false);
  if (!memberships || memberships.length === 0) {
    return <span className="text-xs text-slate-400 dark:text-[#64748b]">—</span>;
  }
  const visible = expanded ? memberships : memberships.slice(0, 2);
  const remaining = memberships.length - 2;
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {visible.map((m) => (
        <span key={m.company_id} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
          m.role === "owner"
            ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
            : m.role === "accountant"
              ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
              : "bg-slate-100 text-slate-600 dark:bg-[#282832] dark:text-[#cbd5e1]"
        }`}>
          {m.company_name} <span className="ml-1 opacity-60">({m.role})</span>
        </span>
      ))}
      {!expanded && remaining > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#94a3b8] transition-colors"
          title={memberships.slice(2).map(m => `${m.company_name} (${m.role})`).join(", ")}
        >
          +{remaining} more
        </button>
      )}
      {expanded && remaining > 0 && (
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#94a3b8] transition-colors"
        >
          Show less
        </button>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuthStore();
  const toast = useToastStore();
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);

  const [assignUserId, setAssignUserId] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState(emptyAssign);

  const [menuState, setMenuState] = useState<{ userId: string; x: number; y: number } | null>(null);

  const ROLE_OPTIONS = [
    { value: "admin", label: "Admin" },
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

  useEffect(() => {
    const handler = () => setMenuState(null);
    if (menuState) {
      document.addEventListener("click", handler);
      document.addEventListener("scroll", handler, true);
      return () => { document.removeEventListener("click", handler); document.removeEventListener("scroll", handler, true); };
    }
  }, [menuState]);

  if (!currentUser?.is_superadmin) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-[#cbd5e1]">Access denied. Superadmin only.</p>
      </div>
    );
  }

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

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

  const handleMakeAdmin = async (u: User) => {
    const targets = (u.memberships || []).length
      ? u.memberships
      : companies.map((c) => ({ company_id: c.id, company_name: c.name, role: "" }));
    if (targets.length === 0) { toast.error("No company available to assign"); return; }
    try {
      for (const m of targets) {
        await api.post(`/admin/users/${u.id}/memberships`, { company_id: m.company_id, role: "admin" });
      }
      toast.success(`Promoted ${u.name || u.email} to admin`);
      setAssignUserId(null);
      setAssignForm(emptyAssign);
      refresh();
    } catch (err: any) { toast.error(err?.message || "Failed to promote user"); }
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    try {
      await api.patch(`/admin/users/${editingUser.id}`, { name: editName, email: editEmail });
      setEditingUser(null);
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
      refresh();
    } catch (err: any) { toast.error(err?.message || "Failed to assign user"); }
  };

  const openMenu = (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    setMenuState({ userId, x: e.clientX, y: e.clientY });
  };

  const getMenuItems = (u: User): { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }[] => [
    {
      label: "Edit",
      onClick: () => { setEditingUser(u); setEditName(u.name); setEditEmail(u.email); },
    },
    {
      label: "Assign to company",
      onClick: () => { setAssignUserId(u.id); setAssignForm(emptyAssign); },
    },
    ...(u.id !== currentUser.id ? [
      {
        label: u.is_active ? "Deactivate" : "Activate",
        onClick: () => handleToggleActive(u),
        danger: u.is_active,
      },
      {
        label: "Make admin",
        onClick: () => handleMakeAdmin(u),
      },
      {
        label: u.is_superadmin ? "Revoke superadmin" : "Make superadmin",
        onClick: () => handleToggleSuperadmin(u),
        danger: u.is_superadmin,
      },
    ] : []),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">User Management</h1>
          {!loading && <p className="text-sm text-slate-500 dark:text-[#64748b] mt-1">{users.length} users</p>}
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); }}
          className="rounded-lg bg-brand-600 dark:bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600"
        >
          {showCreate ? "Cancel" : "+ New User"}
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="mt-4 max-w-2xl rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4 shadow-sm">
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-[#f1f5f9]">Create New User</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Name *</label>
              <input type="text" value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm bg-white dark:bg-[#0f0f16]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Email *</label>
              <input type="email" value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm bg-white dark:bg-[#0f0f16]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Password *</label>
              <input type="password" value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm bg-white dark:bg-[#0f0f16]" minLength={8} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={createForm.is_superadmin}
                  onChange={(e) => setCreateForm({ ...createForm, is_superadmin: e.target.checked })}
                  className="rounded border-slate-300 dark:border-[#282832]" />
                Make superadmin
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleCreate}
              className="rounded-lg bg-brand-600 dark:bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600">
              Create User
            </button>
            <button onClick={() => { setShowCreate(false); setCreateForm(emptyCreate); }}
              className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Assign Form */}
      {assignUserId && (
        <div className="mt-4 max-w-2xl rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4 shadow-sm">
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-[#f1f5f9]">Assign to Company</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              className="rounded-lg bg-brand-600 dark:bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600">
              Assign
            </button>
            <button onClick={() => { setAssignUserId(null); setAssignForm(emptyAssign); }}
              className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingUser && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setEditingUser(null); }}
        >
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-[#16161f] p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 dark:text-[#f1f5f9]">Edit User</h3>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-[#94a3b8] text-lg leading-none">&times;</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Name</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm bg-white dark:bg-[#0f0f16]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Email</label>
                <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm bg-white dark:bg-[#0f0f16]" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditingUser(null)}
                className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">
                Cancel
              </button>
              <button onClick={handleSaveEdit}
                className="rounded-lg bg-brand-600 dark:bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search + Table */}
      {loading ? (
        <ListSkeleton title="Users" cols={4} />
      ) : (
        <div className="mt-4">
          {/* Search */}
          <div className="mb-3">
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-xs rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-1.5 text-sm text-slate-900 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#1a1a24] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1]">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Companies</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 dark:border-[#1a1a24] hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-[#f1f5f9]">{u.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-[#cbd5e1]">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${getPrimaryRoleColor(getPrimaryRole(u))}`}>
                      {getPrimaryRole(u)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <CompanyBadges memberships={u.memberships} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? "bg-emerald-500" : "bg-slate-300 dark:bg-[#64748b]"}`} />
                      <span className={u.is_active ? "text-slate-600 dark:text-[#cbd5e1]" : "text-slate-400 dark:text-[#64748b]"}>
                        {u.is_active ? "active" : "inactive"}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="relative flex justify-end">
                      <button
                        onClick={(e) => openMenu(e, u.id)}
                        className="rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#1a1a24] transition-colors"
                        title="Actions"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <circle cx="12" cy="5" r="1" />
                          <circle cx="12" cy="12" r="1" />
                          <circle cx="12" cy="19" r="1" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && users.length > 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center">
                    <p className="text-sm text-slate-500 dark:text-[#cbd5e1]">No users match "{search}"</p>
                    <button onClick={() => setSearch("")} className="mt-1 text-xs text-brand-600 dark:text-blue-400 hover:underline">Clear search</button>
                  </td>
                </tr>
              )}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center">
                    <svg className="mx-auto h-10 w-10 text-slate-300 dark:text-[#64748b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                    <p className="mt-2 text-sm text-slate-500 dark:text-[#cbd5e1]">No users yet</p>
                    <button
                      onClick={() => setShowCreate(true)}
                      className="mt-2 text-sm text-brand-600 dark:text-blue-400 hover:underline"
                    >
                      Create your first user
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Kebab Context Menu */}
      {menuState && (() => {
        const targetUser = users.find((u) => u.id === menuState.userId);
        if (!targetUser) return null;
        return (
          <ContextMenu
            x={menuState.x}
            y={menuState.y}
            onClose={() => setMenuState(null)}
            items={getMenuItems(targetUser)}
          />
        );
      })()}
    </div>
  );
}
