import { useState, useEffect, useCallback } from "react";

interface Shortcut {
  keys: string[];
  label: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ["Enter"], label: "Next field" },
  { keys: ["Ctrl", "Enter"], label: "Save voucher" },
  { keys: ["Esc"], label: "Reset form" },
  { keys: ["Ctrl", "A"], label: "Add new line" },
  { keys: ["Alt", "L"], label: "Focus ledger" },
  { keys: ["Ctrl", "/"], label: "Toggle this help" },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded border border-slate-300 dark:border-[#282832] bg-slate-100 dark:bg-[#1a1a24] px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-600 dark:text-[#cbd5e1] min-w-[22px]">
      {children}
    </kbd>
  );
}

interface KeyboardHelpProps {
  active?: boolean;
}

export default function KeyboardHelp({ active = false }: KeyboardHelpProps) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => {
    setOpen((o) => !o);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "/") {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [toggle, open]);

  if (!active) return null;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#1a1a24] transition-colors text-xs font-bold"
        title="Keyboard shortcuts (Ctrl+/)"
      >
        ?
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[99998]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-[99999] w-64 rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#64748b] mb-3">
              Keyboard Shortcuts
            </h4>
            <div className="space-y-2">
              {SHORTCUTS.map((s) => (
                <div key={s.label} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-[#cbd5e1]">{s.label}</span>
                  <div className="flex items-center gap-0.5">
                    {s.keys.map((k, i) => (
                      <span key={i} className="flex items-center gap-0.5">
                        {i > 0 && <span className="text-slate-300 dark:text-[#333340] text-[10px]">+</span>}
                        <Kbd>{k}</Kbd>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
