import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import Select from "../components/Select";
import ContextMenu from "../components/ContextMenu";
import { useRole } from "../hooks/useRole";
import { showConfirm } from "../components/ConfirmDialog";
import { ListSkeleton } from "./skeletons";
import { useToastStore } from "../store/toast";
import { ROLE_BADGES, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_HIERARCHY, type CompanyRole } from "../config/roles";


interface Member {
  id: string; company_id: string; user_id: string; role: string;
  user_email: string | null; user_name: string | null; user_is_active: boolean | null;
  user_is_superadmin: boolean | null;
  created_at: string | null;
}

export default function MembersPage() {
  const { canManageMembers } = useRole();
  const toast = useToastStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("accountant");

  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editRole, setEditRole] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuState, setMenuState] = useState<{ userId: string; x: number; y: number } | null>(null);

  const ROLE_OPTIONS = useMemo(() => {
    const opts = [
      { value: "accountant", label: "Accountant" },
      { value: "viewer", label: "Viewer" },
    ];
    if (canManageMembers) {
      opts.unshift({ value: "admin", label: "Admin" });
    }
    return opts;
  }, [canManageMembers]);

  const refresh = () => {
    setLoading(true);
    api.get<Member[]>("/members")
      .then(setMembers)
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Failed to load members"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  // Auto-open from command palette (?action=add)
  useEffect(() => {
    const action = searchParams.get("action");
    if (!action) return;
    setSearchParams({}, { replace: true });
    if (action === "add") setShowAdd(true);
  }, [searchParams]);

  useEffect(() => {
    const handler = () => setMenuState(null);
    if (menuState) {
      document.addEventListener("click", handler);
      document.addEventListener("scroll", handler, true);
      return () => { document.removeEventListener("click", handler); document.removeEventListener("scroll", handler, true); };
    }
  }, [menuState]);

  const filtered = members.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (m.user_name || "").toLowerCase().includes(q) || (m.user_email || "").toLowerCase().includes(q) || m.role.toLowerCase().includes(q);
  });

  const selectable = members.filter((m) => m.role !== "owner" && !m.user_is_superadmin);
  const allSelected = selectable.length > 0 && selectable.every((m) => selected.has(m.user_id));

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/members", { email: addEmail, role: addRole });
      setAddEmail("");
      setAddRole("accountant");
      setShowAdd(false);
      toast.success("Member added successfully");
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to add member");
    }
  };

  const handleRoleChange = async () => {
    if (!editingMember) return;
    try {
      await api.patch(`/members/${editingMember.user_id}`, { role: editRole });
      setEditingMember(null);
      toast.success(`Role changed to ${editRole}`);
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to change role");
    }
  };

  const handleRemove = async (userId: string, email: string) => {
    if (!await showConfirm(`Remove ${email} from this company?`, { danger: true, confirmLabel: "Remove" })) return;
    try {
      await api.del(`/members/${userId}`);
      toast.success("Member removed");
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove member");
    }
  };

  function toggleSelect(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function toggleAll() {
    if (allSelected) { setSelected(new Set()); }
    else { setSelected(new Set(selectable.map((m) => m.user_id))); }
  }

  async function bulkRemove() {
    if (selected.size === 0) return;
    if (!await showConfirm(`Remove ${selected.size} member(s)?`, { danger: true, confirmLabel: "Remove" })) return;
    try {
      const result = await api.post<{ processed: number; errors: string[] }>("/members/bulk-remove", { ids: Array.from(selected) });
      if (result.errors?.length) toast.error(result.errors.join("; "));
      else toast.success(`Removed ${result.processed} member(s)`);
      setSelected(new Set());
      refresh();
    } catch (err: any) { toast.error(err?.message || "Failed to remove members"); }
  }

  async function bulkRoleChange(role: string) {
    if (selected.size === 0) return;
    if (!await showConfirm(`Change role of ${selected.size} member(s) to ${role}?`, { confirmLabel: "Change Role" })) return;
    try {
      const result = await api.post<{ processed: number; errors: string[] }>("/members/bulk-role", { ids: Array.from(selected), role });
      if (result.errors?.length) toast.error(result.errors.join("; "));
      else toast.success(`Changed role of ${result.processed} member(s) to ${role}`);
      setSelected(new Set());
      refresh();
    } catch (err: any) { toast.error(err?.message || "Failed to change roles"); }
  }

  const openMenu = (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    setMenuState({ userId, x: e.clientX, y: e.clientY });
  };

  const getMenuItems = (m: Member) => {
    const items: { label: string; onClick: () => void; danger?: boolean }[] = [];
    if (m.role !== "owner" && !m.user_is_superadmin) {
      items.push({ label: "Edit role", onClick: () => { setEditingMember(m); setEditRole(m.role); } });
      items.push({ label: "Remove", onClick: () => handleRemove(m.user_id, m.user_email || ""), danger: true });
    }
    return items;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Company Members</h1>
        {canManageMembers && (
          <button onClick={() => setShowAdd(!showAdd)}
            className="btn-primary px-4 py-1.5 text-sm font-medium">
            {showAdd ? "Cancel" : "+ Add Member"}
          </button>
        )}
      </div>
      {!loading && <p className="text-sm text-slate-500 dark:text-[#64748b] mb-4">{members.length} members</p>}

      {/* Role reference note */}
      <div className="mb-6 rounded-xl border border-slate-200/60 dark:border-[#1a1a24] bg-gradient-to-br from-white to-slate-50/80 dark:from-[#16161f] dark:to-[#1a1a25] p-4 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-[#94a3b8] mb-3">Role types &amp; access</h2>
        <ul className="space-y-2.5">
          {ROLE_HIERARCHY.map((r) => (
            <li key={r} className="flex items-start gap-3">
              <span className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGES[r]}`}>
                {ROLE_LABELS[r]}
              </span>
              <span className="text-sm text-slate-600 dark:text-[#cbd5e1]">{ROLE_DESCRIPTIONS[r as CompanyRole]}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Add Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="mt-4 rounded-xl border border-slate-200/60 dark:border-[#1a1a24] bg-gradient-to-br from-white to-slate-50/80 dark:from-[#16161f] dark:to-[#1a1a25] p-4 shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Email</label>
              <input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm bg-white dark:bg-[#0f0f16]"
                placeholder="user@example.com" required />
            </div>
            <div>
              <Select label="Role" value={addRole} onChange={(v) => setAddRole(v)} options={ROLE_OPTIONS} className="mt-1" />
            </div>
          </div>
          <button type="submit" className="btn-primary px-4 py-1.5 text-sm font-medium">Add Member</button>
        </form>
      )}

      {/* Edit Role Modal */}
      {editingMember && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setEditingMember(null); }}
        >
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-[#16161f] p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 dark:text-[#f1f5f9]">Change Role</h3>
              <button onClick={() => setEditingMember(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-[#94a3b8] text-lg leading-none">&times;</button>
            </div>
            <p className="text-sm text-slate-600 dark:text-[#cbd5e1] mb-3">
              Changing role for <span className="font-medium text-slate-800 dark:text-[#f1f5f9]">{editingMember.user_name || editingMember.user_email}</span>
            </p>
            <Select value={editRole} onChange={(v) => setEditRole(v)} options={ROLE_OPTIONS} className="w-full" />
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditingMember(null)}
                className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">
                Cancel
              </button>
              <button onClick={handleRoleChange}
                className="rounded-lg bg-brand-600 dark:bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search + Bulk Toolbar + Table */}
      {loading ? (
        <ListSkeleton title="Members" cols={5} />
      ) : (
        <div className="mt-4">
          {/* Search + Bulk Toolbar */}
          <div className="mb-3 flex items-center gap-3">
            <input
              type="text"
              placeholder="Search members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-xs rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-1.5 text-sm text-slate-900 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {canManageMembers && selected.size > 0 && (
              <>
                <div className="h-5 w-px bg-slate-200 dark:bg-[#282832]" />
                <button onClick={bulkRemove}
                  className="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors">
                  Remove ({selected.size})
                </button>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-400 dark:text-[#64748b]">Set role:</span>
                  {["accountant", "viewer"].map((r) => (
                    <button key={r} onClick={() => bulkRoleChange(r)}
                      className="rounded-md border border-slate-200 dark:border-[#282832] px-2 py-1 text-xs capitalize text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#282832] transition-colors">
                      {r}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#1a1a24] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1]">
                {canManageMembers && (
                  <th className="pl-4 px-4 py-3 w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      className="h-4 w-4 rounded border-slate-300 dark:border-[#282832] text-brand-600 focus:ring-brand-500 dark:bg-[#282832]" />
                  </th>
                )}
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const isProtected = m.role === "owner" || m.user_is_superadmin;
                return (
                  <tr key={m.id} className={`border-b border-slate-100 dark:border-[#1a1a24] hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors ${isProtected ? "bg-slate-50/50 dark:bg-[#1a1a24]/30" : ""}`}>
                    {canManageMembers && (
                      <td className="pl-4 px-4 py-3">
                        {!isProtected && (
                          <input type="checkbox" checked={selected.has(m.user_id)} onChange={() => toggleSelect(m.user_id)}
                            className="h-4 w-4 rounded border-slate-300 dark:border-[#282832] text-brand-600 focus:ring-brand-500 dark:bg-[#282832]" />
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium flex items-center gap-1.5">
                            {m.user_name || "—"}
                            {m.user_is_superadmin && (
                              <span className="text-[10px] font-medium text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 rounded px-1 py-0.5">superadmin</span>
                            )}
                            {m.role === "owner" && !m.user_is_superadmin && (
                              <svg className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                              </svg>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 dark:text-[#64748b]">{m.user_email || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {m.user_is_superadmin ? (
                        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400">superadmin</span>
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-xs ${ROLE_BADGES[m.role as keyof typeof ROLE_BADGES] || "bg-slate-100 text-slate-600 dark:bg-[#282832] dark:text-[#cbd5e1]"}`}>
                          {m.role}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!isProtected && canManageMembers && (
                        <div className="relative flex justify-end">
                          <button
                            onClick={(e) => openMenu(e, m.user_id)}
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
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && members.length > 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center">
                    <p className="text-sm text-slate-500 dark:text-[#cbd5e1]">No members match "{search}"</p>
                    <button onClick={() => setSearch("")} className="mt-1 text-xs text-brand-600 dark:text-blue-400 hover:underline">Clear search</button>
                  </td>
                </tr>
              )}
              {members.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center">
                    <svg className="mx-auto h-10 w-10 text-slate-300 dark:text-[#64748b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                    </svg>
                    <p className="mt-2 text-sm text-slate-500 dark:text-[#cbd5e1]">No members yet</p>
                    {canManageMembers && (
                      <button onClick={() => setShowAdd(true)} className="mt-2 text-sm text-brand-600 dark:text-blue-400 hover:underline">
                        Add your first member
                      </button>
                    )}
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
        const target = members.find((m) => m.user_id === menuState.userId);
        if (!target) return null;
        const items = getMenuItems(target);
        if (items.length === 0) return null;
        return (
          <ContextMenu
            x={menuState.x}
            y={menuState.y}
            onClose={() => setMenuState(null)}
            items={items}
          />
        );
      })()}
    </div>
  );
}
