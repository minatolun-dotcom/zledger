import { useRef, useEffect } from "react";

export interface TabItem {
  key: string;
  label: string;
  count?: number;
  /** Optional F-key / shortcut hint shown as a small kbd chip next to the label */
  shortcut?: string;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
  /** Compact mode: smaller padding/text for dense layouts */
  compact?: boolean;
}

export default function Tabs({ tabs, active, onChange, className = "", compact = false }: TabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Listen for F-key switch-tab events dispatched by usePageAccelerators
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ tab: string }>).detail;
      if (tabs.some((t) => t.key === detail.tab)) {
        onChange(detail.tab);
      }
    };
    window.addEventListener("switch-tab", handler);
    return () => window.removeEventListener("switch-tab", handler);
  }, [tabs, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Left/Right arrow keys (when tabs have focus)
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const currentIdx = tabs.findIndex((t) => t.key === active);
    if (currentIdx < 0) return;
    const nextIdx =
      e.key === "ArrowRight"
        ? (currentIdx + 1) % tabs.length
        : (currentIdx - 1 + tabs.length) % tabs.length;
    if (nextIdx === currentIdx) return;
    e.preventDefault();
    onChange(tabs[nextIdx].key);
    setTimeout(() => {
      const buttons = containerRef.current?.querySelectorAll("button");
      buttons?.[nextIdx]?.focus();
    }, 0);
  };

  return (
    <div
      ref={containerRef}
      role="tablist"
      className={`${compact ? "flex w-full" : "inline-flex items-center"} gap-1 rounded-full bg-slate-200/70 dark:bg-[#12121a] p-1 ${className}`}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((t) => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.key)}
            className={`relative whitespace-nowrap rounded-full font-medium transition-all duration-150 flex items-center justify-center gap-1 ${
              compact ? "flex-1 px-2 py-1.5 text-[13px]" : "px-3.5 py-1.5 text-sm gap-1.5"
            } ${
              isActive
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-300 dark:bg-[#30303d] dark:text-white dark:ring-[#4a4a5a]"
                : "text-slate-500 hover:text-slate-700 dark:text-[#64748b] dark:hover:text-white"
            }`}
          >
            <span>{t.label}</span>
            {t.shortcut && (
              <kbd
                className={`rounded px-1 py-0.5 font-bold leading-none tracking-wider ${
                  compact ? "text-[8px]" : "text-[9px] px-1.5"
                } ${
                  isActive
                    ? "border border-slate-300 bg-slate-50 text-slate-600 dark:border-[#3a3a4a] dark:bg-[#1a1a24] dark:text-[#94a3b8]"
                    : "border border-slate-300 bg-white/70 text-slate-400 dark:border-[#282832] dark:bg-[#0f0f16] dark:text-[#64748b]"
                }`}
              >
                {t.shortcut}
              </kbd>
            )}
            {t.count != null && (
              <span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                isActive
                  ? "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300"
                  : "bg-slate-200 dark:bg-[#282832] text-slate-500 dark:text-[#64748b]"
              }`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
