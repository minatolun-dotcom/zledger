import { useState, useEffect, useCallback } from "react";

interface Shortcut {
  keys: string[];
  label: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ["Enter"], label: "Next field" },
  { keys: ["Tab"], label: "Next field" },
  { keys: ["Ctrl", "A"], label: "Save voucher" },
  { keys: ["Ctrl", "Enter"], label: "Save voucher" },
  { keys: ["Esc"], label: "Reset form" },
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
        className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg text-amber-500 hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all shadow-sm shadow-amber-500/20 hover:shadow-amber-500/40"
        title="Keyboard shortcuts (Ctrl+/)"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
        </svg>
        {open && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_6px_2px_rgba(251,191,36,0.5)]" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[99998]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-[99999] w-64 rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-xl p-4">
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
