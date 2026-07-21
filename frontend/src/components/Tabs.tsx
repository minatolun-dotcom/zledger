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
  return (
    <div className={`flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-[#16161f] w-fit ${className}`}>
      {tabs.map((t) => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`relative whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
              isActive
                ? "bg-white text-slate-900 shadow-sm dark:bg-[#282832] dark:text-[#f1f5f9]"
                : "text-slate-500 hover:text-slate-700 hover:bg-white/50 dark:text-[#64748b] dark:hover:text-[#cbd5e1] dark:hover:bg-white/5"
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
            {isActive && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 dark:from-blue-400 dark:to-indigo-400" />
            )}
          </button>
        );
      })}
    </div>
  );
}
