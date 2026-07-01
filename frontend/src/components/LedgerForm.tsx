import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";
import Select from "./Select";

interface AccountGroup {
  id: string;
  name: string;
  nature: string;
  group_type: string;
  parent_id: string | null;
}

interface CurrencyOption { code: string; symbol: string }

interface LedgerFormProps {
  mode: "create" | "edit";
  initialValues?: { id: string; name: string; group_id: string; opening_balance: number; opening_balance_type: string; currency: string | null; gstin: string; alias: string; is_protected?: boolean };
  groupId?: string;
  groupName?: string;
  primaryGroups: AccountGroup[];
  subGroups: AccountGroup[];
  onClose: () => void;
  onSaved: () => void;
}

export default function LedgerForm({ mode, initialValues, groupId, groupName, primaryGroups, subGroups, onClose, onSaved }: LedgerFormProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(initialValues?.name ?? "");
  const [group_id, setGroupId] = useState(initialValues?.group_id ?? groupId ?? "");
  const [openingBalance, setOpeningBalance] = useState(initialValues?.opening_balance ?? 0);
  const [openingBalanceType, setOpeningBalanceType] = useState(initialValues?.opening_balance_type ?? "Dr");
  const [currency, setCurrency] = useState(initialValues?.currency ?? "");
  const [gstin, setGstin] = useState(initialValues?.gstin ?? "");
  const [alias, setAlias] = useState(initialValues?.alias ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);

  useEffect(() => {
    api.get<CurrencyOption[]>("/forex/currencies").then(setCurrencies).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!name.trim() || !group_id) { setError("Name and group are required"); return; }
    setError("");
    setSaving(true);
    const body = {
      name: name.trim(),
      group_id,
      opening_balance: openingBalance || 0,
      opening_balance_type: openingBalanceType,
      currency: currency || null,
      gstin: gstin || null,
      alias: alias || null,
    };
    try {
      if (mode === "edit" && initialValues) {
        await api.patch(`/coa/ledgers/${initialValues.id}`, body);
      } else {
        await api.post("/coa/ledgers", body);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.detail || "Failed to save ledger");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!initialValues) return;
    if (!confirm(`Delete ledger "${initialValues.name}"?`)) return;
    setDeleting(true);
    try {
      await api.del(`/coa/ledgers/${initialValues.id}`);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.detail || "Failed to delete ledger");
    } finally {
      setDeleting(false);
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
          {mode === "edit" ? (initialValues?.is_protected ? "Edit Ledger Balance" : "Edit Ledger") : groupName ? `New Ledger under ${groupName}` : "New Ledger"}
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
          <div className="col-span-2">
            <Select
              value={group_id}
              onChange={setGroupId}
              options={[
                { value: "", label: "Select group" },
                ...primaryGroups.flatMap((pg) =>
                  subGroups
                    .filter((sg) => sg.parent_id === pg.id)
                    .map((sg) => ({ value: sg.id, label: `${pg.name} / ${sg.name}` }))
                ),
              ]}
              label="Group *"
              required
            />
          </div>
          <div>
            <Select
              value={currency}
              onChange={setCurrency}
              options={[
                { value: "", label: "Company Base Currency" },
                ...currencies.map((c) => ({ value: c.code, label: `${c.code} (${c.symbol})` })),
              ]}
              label="Currency"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Opening Balance</label>
            <input type="number" step="0.01" value={openingBalance}
              onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-300 dark:border-[#252530] bg-white dark:bg-[#111118] px-3 py-2 text-sm text-slate-800 dark:text-[#f1f5f9]" />
          </div>
          <div>
            <Select
              value={openingBalanceType}
              onChange={setOpeningBalanceType}
              options={[
                { value: "Dr", label: "Dr (Debit)" },
                { value: "Cr", label: "Cr (Credit)" },
              ]}
              label="Balance Type"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Alias</label>
            <input type="text" value={alias} onChange={(e) => setAlias(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-[#252530] bg-white dark:bg-[#111118] px-3 py-2 text-sm text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b]"
              placeholder="Optional" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">GSTIN</label>
            <input type="text" value={gstin} onChange={(e) => setGstin(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-[#252530] bg-white dark:bg-[#111118] px-3 py-2 text-sm text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b]"
              placeholder="Optional" />
          </div>
        </div>

        <div className="mt-5 flex justify-between">
          <div>
            {mode === "edit" && !initialValues?.is_protected && (
              <button onClick={handleDelete} disabled={deleting}
                className="rounded-lg border border-red-300 dark:border-red-500/30 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50">
                {deleting ? "Deleting..." : "Delete"}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530] transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={saving}
              className="rounded-lg bg-brand-600 dark:bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600 transition-colors disabled:opacity-50">
              {saving ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Ledger"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
