import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";

interface Member {
  id: string; company_id: string; user_id: string; role: string;
  user_email: string | null; user_name: string | null; user_is_active: boolean | null;
  created_at: string | null;
}

const ROLE_BADGE: Record<string, string> = {
  owner: "bg-purple-50 text-purple-700",
  accountant: "bg-blue-50 text-blue-700",
  viewer: "bg-slate-100 text-slate-600",
};

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("accountant");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");

  const refresh = () => {
    setLoading(true);
    api.get<Member[]>("/members")
      .then(setMembers)
      .catch((err) => setError(err?.detail || "Failed to load members"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/members", { email: addEmail, role: addRole });
      setAddEmail("");
      setAddRole("accountant");
      setShowAdd(false);
      refresh();
    } catch (err: any) {
      setError(err?.detail || "Failed to add member");
    }
  };

  const handleRoleChange = async (userId: string) => {
    setError("");
    try {
      await api.patch(`/members/${userId}`, { role: editRole });
      setEditingId(null);
      refresh();
    } catch (err: any) {
      setError(err?.detail || "Failed to change role");
    }
  };

  const handleRemove = async (userId: string, email: string) => {
    if (!confirm(`Remove ${email} from this company?`)) return;
    setError("");
    try {
      await api.del(`/members/${userId}`);
      refresh();
    } catch (err: any) {
      setError(err?.detail || "Failed to remove member");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <h2 className="text-lg font-bold text-slate-900">Company Members</h2>
        <button onClick={() => setShowAdd(!showAdd)}
          className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
          {showAdd ? "Cancel" : "+ Add Member"}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="user@example.com" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Role</label>
              <select value={addRole} onChange={(e) => setAddRole(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="accountant">Accountant</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Add Member
          </button>
        </form>
      )}

      {error && !showAdd && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
                <th className="pb-2">Name</th>
                <th className="pb-2">Email</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="py-2 font-medium">{m.user_name || "—"}</td>
                  <td className="py-2 text-slate-600">{m.user_email || "—"}</td>
                  <td className="py-2">
                    {editingId === m.id ? (
                      <div className="flex items-center gap-2">
                        <select value={editRole} onChange={(e) => setEditRole(e.target.value)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs">
                          <option value="accountant">Accountant</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button onClick={() => handleRoleChange(m.user_id)}
                          className="text-xs text-brand-600 hover:underline">Save</button>
                        <button onClick={() => setEditingId(null)}
                          className="text-xs text-slate-500 hover:underline">Cancel</button>
                      </div>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-xs ${ROLE_BADGE[m.role] || "bg-slate-100 text-slate-600"}`}>
                        {m.role}
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      m.user_is_active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                    }`}>
                      {m.user_is_active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {m.role !== "owner" && (
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => { setEditingId(m.id); setEditRole(m.role); }}
                          className="text-xs text-slate-500 hover:underline">Edit role</button>
                        <button onClick={() => handleRemove(m.user_id, m.user_email || "")}
                          className="text-xs text-red-600 hover:underline">Remove</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-slate-400">No members.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
