import { useRef, useState, useEffect } from "react";

interface TemplateState {
  open: boolean;
  voucherType: string;
  onSave: ((name: string, frequency: string) => Promise<void>) | null;
}

const DEFAULT_STATE: TemplateState = {
  open: false,
  voucherType: "",
  onSave: null,
};

export function showTemplateModal(
  voucherType: string,
  onSave: (name: string, frequency: string) => Promise<void>,
) {
  templateState.setState({ open: true, voucherType, onSave });
}

const templateState = {
  listeners: new Set<() => void>(),
  state: { ...DEFAULT_STATE } as TemplateState,
  setState(s: TemplateState) {
    this.state = s;
    this.listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  },
  getSnapshot() {
    return this.state;
  },
};

function useTemplateState(): TemplateState {
  const [, rerender] = useState(0);
  const stateRef = useRef(templateState.getSnapshot());

  useEffect(() => {
    return templateState.subscribe(() => {
      stateRef.current = templateState.getSnapshot();
      rerender((n) => n + 1);
    });
  }, []);

  return stateRef.current;
}

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export default function VoucherTemplateModal() {
  const state = useTemplateState();
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Auto-focus name input when opened
  useEffect(() => {
    if (state.open) {
      setName("");
      setFrequency("monthly");
      setSaving(false);
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [state.open]);

  if (!state.open) return null;

  const handleConfirm = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await state.onSave?.(name.trim(), frequency);
    } finally {
      setSaving(false);
      templateState.setState({ ...DEFAULT_STATE });
    }
  };

  const handleCancel = () => {
    templateState.setState({ ...DEFAULT_STATE });
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50"
      onClick={handleCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Save as Template"
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white dark:bg-[#16161f] shadow-2xl border border-slate-200 dark:border-[#1a1a24]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">
            Save as Template
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-[#64748b]">
            {state.voucherType} voucher will be saved as a reusable template.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
                Template Name <span className="text-red-500">*</span>
              </label>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirm();
                  if (e.key === "Escape") handleCancel();
                }}
                placeholder="e.g. Monthly rent, Salary payment"
                className="block w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm bg-white dark:bg-[#0f0f16] text-slate-800 dark:text-[#f1f5f9] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
                Frequency
              </label>
              <div className="flex gap-2">
                {FREQUENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFrequency(opt.value)}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                      frequency === opt.value
                        ? "border-brand-500 dark:border-blue-500 bg-brand-50 dark:bg-blue-500/10 text-brand-700 dark:text-blue-400"
                        : "border-slate-200 dark:border-[#282832] text-slate-500 dark:text-[#64748b] hover:bg-slate-50 dark:hover:bg-[#1a1a24]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            onClick={handleCancel}
            disabled={saving}
            className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!name.trim() || saving}
            className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 dark:from-blue-500 dark:to-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow-md hover:shadow-lg disabled:opacity-50 transition-all"
          >
            {saving ? "Saving..." : "Save Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
