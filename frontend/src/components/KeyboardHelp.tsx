import { useState, useEffect } from "react";

interface ShortcutGroup {
  group: string;
  items: { keys: string; label: string }[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    group: "Page Navigation",
    items: [
      { keys: "Alt+D", label: "Dashboard" },
      { keys: "Alt+V", label: "Vouchers" },
      { keys: "Alt+C", label: "Chart of Accounts" },
      { keys: "Alt+P", label: "Parties" },
      { keys: "Alt+R", label: "Reports" },
      { keys: "Alt+G", label: "GST" },
      { keys: "Alt+T", label: "TDS / TCS" },
      { keys: "Alt+I", label: "Inventory" },
      { keys: "Alt+E", label: "Data Import / Export" },
      { keys: "Alt+B", label: "Bank Reconciliation" },
      { keys: "Alt+L", label: "Loans" },
      { keys: "Alt+F", label: "Fixed Assets" },
      { keys: "Alt+N", label: "Compliance" },
    ],
  },
  {
    group: "Actions",
    items: [
      { keys: "F2", label: "New voucher" },
      { keys: "F3", label: "Search" },
      { keys: "F4", label: "New record (list pages)" },
      { keys: "F5", label: "Refresh page" },
      { keys: "F7", label: "Toggle sidebar" },
      { keys: "F8", label: "Toggle dark/light mode" },
      { keys: "F1", label: "Open keyboard help" },
      { keys: "Ctrl+A / Ctrl+S", label: "Save voucher" },
      { keys: "Ctrl+F", label: "Focus search on page" },
      { keys: "Ctrl+D", label: "Duplicate voucher" },
    ],
  },
  {
    group: "Tab Navigation",
    items: [
      { keys: "Alt+F1–F9", label: "Switch to Nth tab" },
      { keys: "← / →", label: "Prev / Next tab (when focused)" },
    ],
  },
  {
    group: "Voucher Form Fields",
    items: [
      { keys: "Enter / Tab", label: "Next field" },
      { keys: "Esc", label: "Reset form / Close top modal" },
    ],
  },
  {
    group: "Master Selector Popups",
    items: [
      { keys: "Ctrl+Enter", label: "Open inline edit" },
      { keys: "Enter", label: "Select highlighted option" },
      { keys: "↑ / ↓", label: "Navigate options" },
      { keys: "Esc", label: "Close popup" },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded-md border border-slate-300 dark:border-[#3a3a45] bg-slate-100 dark:bg-[#1a1a24] px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-700 dark:text-[#cbd5e1] min-w-[22px]">
      {children}
    </kbd>
  );
}

export function useKeyboardHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "F1" && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return { open, setOpen };
}

export default function KeyboardHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-start justify-center bg-black/40 pt-12 pb-8 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-[#16161f] shadow-xl border border-slate-200 dark:border-[#282832] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#282832]">
          <h2 className="text-base font-bold text-slate-900 dark:text-[#f1f5f9]">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-[#cbd5e1]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-5 max-h-[65vh] overflow-y-auto">
          {SHORTCUTS.map((group) => (
            <div key={group.group}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#94a3b8] mb-2">
                {group.group}
              </h3>
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <div key={item.keys + item.label} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700 dark:text-[#e2e8f0]">{item.label}</span>
                    <span className="flex items-center gap-1">
                      {item.keys.split(" ").map((key, i) => (
                        <span key={i}>
                          {i > 0 && <span className="text-slate-400 mx-0.5 text-xs">then</span>}
                          <Kbd>{key}</Kbd>
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 dark:border-[#282832] text-[11px] text-slate-400 dark:text-[#64748b] text-center">
          Press <Kbd>F1</Kbd> to toggle this help at any time
        </div>
      </div>
    </div>
  );
}
