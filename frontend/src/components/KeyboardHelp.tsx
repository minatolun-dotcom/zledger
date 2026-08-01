import { SHORTCUTS } from "../config/shortcuts";

interface ShortcutGroup {
  group: string;
  items: { keys: string; label: string }[];
}

function groupShortcuts(): ShortcutGroup[] {
  const map = new Map<string, { keys: string; label: string }[]>();
  for (const s of SHORTCUTS) {
    if (!map.has(s.group)) map.set(s.group, []);
    map.get(s.group)!.push({ keys: s.keys, label: s.label });
  }
  return Array.from(map.entries()).map(([group, items]) => ({ group, items }));
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded-md border border-slate-300 dark:border-[#3a3a45] bg-slate-100 dark:bg-[#1a1a24] px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-700 dark:text-[#cbd5e1] min-w-[22px]">
      {children}
    </kbd>
  );
}


export default function KeyboardHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  const groups = groupShortcuts();
  const col1 = groups.slice(0, 2);
  const col2 = groups.slice(2);

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-3xl rounded-xl bg-white dark:bg-[#16161f] shadow-xl border border-slate-200 dark:border-[#282832] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#282832]">
          <h2 className="text-base font-bold text-slate-900 dark:text-[#f1f5f9]">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-[#cbd5e1]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 grid grid-cols-2 gap-x-8 gap-y-5">

          {/* Column 1: Page Navigation + Actions */}

          <div className="space-y-5">

            {col1.map((group) => (

              <div key={group.group}>

                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#94a3b8] mb-2">{group.group}</h3>

                <div className="space-y-1">

                  {group.items.map((item) => (

                    <div key={item.keys + item.label} className="flex items-center justify-between gap-3">

                      <span className="text-sm text-slate-700 dark:text-[#e2e8f0]">{item.label}</span>

                      <span className="flex items-center gap-1 shrink-0">

                        {item.keys.split(" ").map((key, i) => (

                          <span key={i} className="flex items-center gap-0.5">

                            {i > 0 && <span className="text-slate-400 text-[10px]">+</span>}

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



          {/* Column 2: Tab Navigation + Form Fields + Master Selector */}

          <div className="space-y-5">

            {col2.map((group) => (

              <div key={group.group}>

                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#94a3b8] mb-2">{group.group}</h3>

                <div className="space-y-1">

                  {group.items.map((item) => (

                    <div key={item.keys + item.label} className="flex items-center justify-between gap-3">

                      <span className="text-sm text-slate-700 dark:text-[#e2e8f0]">{item.label}</span>

                      <span className="flex items-center gap-1 shrink-0">

                        {item.keys.split(" ").map((key, i) => (

                          <span key={i} className="flex items-center gap-0.5">

                            {i > 0 && <span className="text-slate-400 text-[10px]">+</span>}

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

        </div>

        <div className="px-6 py-3 border-t border-slate-200 dark:border-[#282832] text-[11px] text-slate-400 dark:text-[#64748b] text-center">

          Press <Kbd>Alt+F1</Kbd> or <Kbd>?</Kbd> to toggle this help at any time

        </div>

      </div>

    </div>
  );
}
