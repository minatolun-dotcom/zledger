import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";

const NATURES = ["assets", "liabilities", "income", "expenses", "capital"];

interface AccountGroup {
  id: string;
  name: string;
  parent_id: string | null;
  group_type: string;
  nature: string;
}

interface GroupFormProps {
  mode: "create" | "edit";
  initialValues?: { id: string; name: string; nature: string; group_type: string; parent_id: string | null };
  parentGroupId?: string;
  parentGroupName?: string;
  primaryGroups: AccountGroup[];
  onClose: () => void;
  onSaved: () => void;
}

export default function GroupForm({ mode, initialValues, parentGroupId, parentGroupName, primaryGroups, onClose, onSaved }: GroupFormProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(initialValues?.name ?? "");
  const [nature, setNature] = useState(initialValues?.nature ?? "assets");
  const [groupType, setGroupType] = useState(initialValues?.group_type ?? (parentGroupId ? "sub" : "primary"));
  const [parentId, setParentId] = useState(initialValues?.parent_id ?? parentGroupId ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setError("");
    setSaving(true);
    const body = {
      name: name.trim(),
      nature,
      group_type: groupType,
      parent_id: groupType === "primary" ? null : (parentId || null),
    };
    try {
      if (mode === "edit" && initialValues) {
        await api.patch(`/coa/groups/${initialValues.id}`, body);
      } else {
        await api.post("/coa/groups", body);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.detail || "Failed to save group");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] shadow-2xl p-5">
        <h3 className="mb-4 text-base font-semibold text-slate-800 dark:text-[#f1f5f9]">
          {mode === "edit" ? "Edit Group" : parentGroupName ? `New Subgroup under ${parentGroupName}` : "New Group"}
        </h3>

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-[#252530] bg-white dark:bg-[#111118] px-3 py-2 text-sm text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20"
              placeholder="e.g. Rent Expense" autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Nature *</label>
            <select value={nature} onChange={(e) => setNature(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-[#252530] bg-white dark:bg-[#111118] px-3 py-2 text-sm text-slate-800 dark:text-[#f1f5f9]">
              {NATURES.map((n) => <option key={n} value={n}>{n.charAt(0).toUpperCase() + n.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Type</label>
            <select value={groupType} onChange={(e) => setGroupType(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-[#252530] bg-white dark:bg-[#111118] px-3 py-2 text-sm text-slate-800 dark:text-[#f1f5f9]">
              <option value="primary">Primary</option>
              <option value="sub">Sub-group</option>
            </select>
          </div>
          {groupType === "sub" && (
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Parent Group</label>
              <select value={parentId} onChange={(e) => setParentId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-[#252530] bg-white dark:bg-[#111118] px-3 py-2 text-sm text-slate-800 dark:text-[#f1f5f9]">
                <option value="">None (top-level)</option>
                {primaryGroups.map((pg) => (
                  <option key={pg.id} value={pg.id}>{pg.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose}
            className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530] transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="rounded-lg bg-brand-600 dark:bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600 transition-colors disabled:opacity-50">
            {saving ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
}
