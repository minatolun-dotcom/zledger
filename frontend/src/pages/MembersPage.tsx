import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import Select from "../components/Select";
import { useRole } from "../hooks/useRole";
import { showConfirm } from "../components/ConfirmDialog";
import { ListSkeleton } from "./skeletons";
import Modal from "../components/Modal";
import { useToastStore } from "../store/toast";
import { ROLE_BADGES, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_HIERARCHY, type CompanyRole } from "../config/roles";
import SortableTable, { type SortableColumn } from "../components/SortableTable";
import TableKeyboardHint from "../components/TableKeyboardHint";


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


  const editIcon = (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
  const deleteIcon = (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );

  const cols: SortableColumn<Member>[] = [
    { id: "member", header: "Member", size: 300, cell: ({ row: { original: m } }) => (
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
    )},
    { id: "role", header: "Role", size: 150, cell: ({ row: { original: m } }) => (
      m.user_is_superadmin ? (
        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400">superadmin</span>
      ) : (
        <span className={`rounded-full px-2 py-0.5 text-xs ${ROLE_BADGES[m.role as keyof typeof ROLE_BADGES] || "bg-slate-100 text-slate-600 dark:bg-[#282832] dark:text-[#cbd5e1]"}`}>
          {m.role}
        </span>
      )
    )},
  ];

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
      <Modal open onClose={() => setEditingMember(null)} maxWidth="sm" panelClassName="p-5">
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
      </Modal>
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
            <TableKeyboardHint className="mb-3" />
            <SortableTable
              columns={cols}
              data={filtered}
              tableKey="members"
              emptyMessage="No members yet."
              keyboardNav
              selectable={canManageMembers}
              selected={selected}
              onToggleSelect={toggleSelect}
              onToggleAll={toggleAll}
              rowClassName={(m) => (m.role === "owner" || m.user_is_superadmin) ? "bg-slate-50/50 dark:bg-[#1a1a24]/30" : ""}
              actions={canManageMembers ? (m) => {
                const isProtected = m.role === "owner" || m.user_is_superadmin;
                if (isProtected) return null;
                return [
                  { icon: editIcon, label: "Edit role", onClick: () => { setEditingMember(m); setEditRole(m.role); } },
                  { icon: deleteIcon, label: "Remove", danger: true, onClick: () => handleRemove(m.user_id, m.user_email || "") },
                ];
              } : undefined}
            />
          </div>
        </div>
      )}

    </div>
  );
}
