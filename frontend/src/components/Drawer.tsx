import { useEffect, useRef } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export default function Drawer({ open, onClose, title, children, width = "w-[480px]" }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex justify-end">
      <div className="absolute inset-0 bg-black/30 transition-opacity" onClick={onClose} />
      <div
        ref={panelRef}
        className={`relative ${width} h-full bg-white dark:bg-[#16161f] shadow-2xl dark:shadow-dark-xl flex flex-col transform transition-transform duration-200 ease-out translate-x-0`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#282832] px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 dark:text-[#64748b] hover:bg-slate-100 dark:hover:bg-[#282832] hover:text-slate-600 dark:hover:text-[#e2e8f0] transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}
