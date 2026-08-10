/** Muted hint line advertising SortableTable keyboard navigation.
 *  Rendered above tables that enable `keyboardNav` so the arrows / Enter /
 *  Delete / Escape interactions are discoverable. Mirrors the Kbd chip style
 *  used in KeyboardHelp and the tab bars. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[22px] items-center justify-center rounded-md border border-slate-300 dark:border-[#3a3a45] bg-slate-100 dark:bg-[#1a1a24] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700 dark:text-[#cbd5e1]">
      {children}
    </kbd>
  );
}

export default function TableKeyboardHint({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[11px] text-slate-400 dark:text-[#64748b] ${className}`}>
      <Chip>↑</Chip> <Chip>↓</Chip> move · <Chip>Enter</Chip> open · <Chip>Del</Chip> danger action · <Chip>Esc</Chip> clear
    </p>
  );
}
