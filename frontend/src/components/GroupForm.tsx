import { useState, useRef } from "react";
import useEscapeToClose from "../hooks/useEscapeToClose";
import { api } from "../api/client";
import Select from "./Select";

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
  defaultGroupType?: "primary" | "sub";
  primaryGroups: AccountGroup[];
  onClose: () => void;
  onSaved: () => void;
}

export default function GroupForm({ mode, initialValues, parentGroupId, defaultGroupType, primaryGroups, onClose, onSaved }: GroupFormProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(initialValues?.name ?? "");
  const [nature, setNature] = useState(initialValues?.nature ?? "assets");
  const [groupType, setGroupType] = useState(initialValues?.group_type ?? defaultGroupType ?? (parentGroupId ? "sub" : "primary"));
  const [parentId, setParentId] = useState(initialValues?.parent_id ?? parentGroupId ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEscapeToClose(true, onClose);

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setError("");
    setSaving(true);
    const body: Record<string, any> = {
      name: name.trim(),
      group_type: groupType,
      parent_id: groupType === "sub" ? (parentId || null) : null,
    };
    if (groupType !== "sub") body.nature = nature;
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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-2xl p-5">
        <h3 className="mb-4 text-base font-semibold text-slate-800 dark:text-[#f1f5f9]">
          {mode === "edit" ? "Edit Group" : groupType === "sub" ? "New Subgroup" : "New Group"}
        </h3>

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-2 text-sm text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20"
              placeholder="e.g. Rent Expense" autoFocus />
          </div>
          {groupType === "sub" ? null : (
            <div>
              <Select
                value={nature}
                onChange={setNature}
                options={NATURES.map((n) => ({ value: n, label: n.charAt(0).toUpperCase() + n.slice(1) }))}
                label="Nature *"
                required
              />
            </div>
          )}
          {groupType !== "sub" && (
            <div>
              <Select
                value={groupType}
                onChange={setGroupType}
                options={[
                  { value: "primary", label: "Primary" },
                  { value: "sub", label: "Sub-group" },
                ]}
                label="Type"
              />
            </div>
          )}
          {groupType === "sub" && (
            <div className="col-span-2">
              <Select
                value={parentId}
                onChange={setParentId}
                options={[{ value: "", label: "None (top-level)" }, ...primaryGroups.map((pg) => ({ value: pg.id, label: pg.name }))]}
                label="Parent Group *"
              />
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose}
            className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="rounded-lg bg-brand-600 dark:bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50">
            {saving ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
}
