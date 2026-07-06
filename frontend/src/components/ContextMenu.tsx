import { useEffect, useRef, useState, useLayoutEffect } from "react";

interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  items: ContextMenuItem[];
}

export default function ContextMenu({ x, y, onClose, items }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const menuW = el.offsetWidth;
    const menuH = el.offsetHeight;
    const pad = 4;
    let left = x;
    let top = y;
    if (left + menuW > window.innerWidth - pad) left = window.innerWidth - menuW - pad;
    if (top + menuH > window.innerHeight - pad) top = window.innerHeight - menuH - pad;
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", keyHandler); };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 99999 }}
      className="w-48 rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-lg dark:shadow-dark-lg py-1"
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.onClick(); onClose(); }}
          disabled={item.disabled}
          className={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 transition-colors ${
            item.danger
              ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
              : item.disabled
              ? "text-slate-400 dark:text-[#64748b] cursor-not-allowed"
              : "text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1a1a24]"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
