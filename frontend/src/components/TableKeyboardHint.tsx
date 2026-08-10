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

interface TableKeyboardHintProps {
  className?: string;
  /** Hide the "Del danger action" chip — for tables whose keyboardNav has no
   *  danger actions (e.g. VoucherList browse / DayBook: Delete is a no-op). */
  hideDelete?: boolean;
}

export default function TableKeyboardHint({ className = "", hideDelete = false }: TableKeyboardHintProps) {
  return (
    <p className={`text-[11px] text-slate-400 dark:text-[#64748b] ${className}`}>
      <Chip>↑</Chip> <Chip>↓</Chip> move · <Chip>Enter</Chip> open
      {!hideDelete && <> · <Chip>Del</Chip> danger action</>} · <Chip>Esc</Chip> clear
    </p>
  );
}
