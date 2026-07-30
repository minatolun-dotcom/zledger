import { useRef } from "react";

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export default function Tabs({ tabs, active, onChange, className = "" }: TabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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
      className={`inline-flex items-center gap-1 rounded-full bg-slate-200/70 dark:bg-[#12121a] p-1 ${className}`}
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
            className={`relative whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-150 ${
              isActive
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-300 dark:bg-[#30303d] dark:text-white dark:ring-[#4a4a5a]"
                : "text-slate-500 hover:text-slate-700 dark:text-[#64748b] dark:hover:text-white"
            }`}
          >
            {t.label}
            {t.count != null && (
              <span className={`ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
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
