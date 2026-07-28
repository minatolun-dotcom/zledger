import { useState, useRef } from "react";
import useEscapeToClose from "../hooks/useEscapeToClose";
import { api } from "../api/client";
import Select from "./Select";
import { showConfirm } from "./ConfirmDialog";

interface AccountGroup {
  id: string;
  name: string;
  nature: string;
  group_type: string;
  parent_id: string | null;
}

interface LedgerFormProps {
  mode: "create" | "edit";
  initialValues?: { id: string; name: string; group_id: string; opening_balance: number; opening_balance_type: string; gstin: string; alias: string; is_protected?: boolean; bank_name?: string; bank_account_number?: string; bank_ifsc?: string; bank_branch?: string };
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
  const [gstin, setGstin] = useState(initialValues?.gstin ?? "");
  const [alias, setAlias] = useState(initialValues?.alias ?? "");
  const [bankName, setBankName] = useState(initialValues?.bank_name ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(initialValues?.bank_account_number ?? "");
  const [bankIfsc, setBankIfsc] = useState(initialValues?.bank_ifsc ?? "");
  const [bankBranch, setBankBranch] = useState(initialValues?.bank_branch ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Detect if the selected group is a bank group
  const selectedGroupName = subGroups.find((sg) => sg.id === group_id)?.name?.toLowerCase() || "";
  const isBankGroup = selectedGroupName.includes("bank");

  useEscapeToClose(true, onClose);

  const handleSubmit = async () => {
    if (!name.trim() || !group_id) { setError("Name and group are required"); return; }
    setError("");
    setSaving(true);
    const body: Record<string, any> = {
      name: name.trim(),
      group_id,
      opening_balance: openingBalance || 0,
      opening_balance_type: openingBalanceType,
      gstin: gstin || null,
      alias: alias || null,
    };
    // Include bank fields if the selected group is a bank group
    if (isBankGroup) {
      body.bank_name = bankName || null;
      body.bank_account_number = bankAccountNumber || null;
      body.bank_ifsc = bankIfsc || null;
      body.bank_branch = bankBranch || null;
    }
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
    if (!await showConfirm(`Delete ledger "${initialValues.name}"?`, { danger: true, confirmLabel: "Delete" })) return;
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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-2xl p-5">
        <h3 className="mb-4 text-base font-semibold text-slate-800 dark:text-[#f1f5f9]">
          {mode === "edit" ? (initialValues?.is_protected ? "Edit Ledger Balance" : "Edit Ledger") : groupName ? `New Ledger under ${groupName}` : "New Ledger"}
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
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Opening Balance</label>
            <input type="number" step="0.01" value={openingBalance}
              onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-2 text-sm text-slate-800 dark:text-[#f1f5f9]" />
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
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Alias</label>
            <input type="text" value={alias} onChange={(e) => setAlias(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-2 text-sm text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b]"
              placeholder="Optional" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">GSTIN</label>
            <input type="text" value={gstin} onChange={(e) => setGstin(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-2 text-sm text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b]"
              placeholder="Optional" />
          </div>
          {isBankGroup && (
            <>
              <div className="col-span-2 mt-2 border-t border-slate-100 dark:border-[#282832] pt-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Bank Details</h4>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Bank Name</label>
                <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-2 text-sm text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b]"
                  placeholder="e.g. HDFC Bank" />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Account Number</label>
                <input type="text" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-2 text-sm text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b]"
                  placeholder="Bank account number" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">IFSC Code</label>
                <input type="text" value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-2 text-sm text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b]"
                  placeholder="e.g. HDFC0001234" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Branch</label>
                <input type="text" value={bankBranch} onChange={(e) => setBankBranch(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-2 text-sm text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b]"
                  placeholder="Branch name" />
              </div>
            </>
          )}
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
              className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={saving}
              className="rounded-lg bg-brand-600 dark:bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50">
              {saving ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Ledger"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
