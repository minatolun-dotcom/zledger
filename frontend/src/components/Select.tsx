import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  label?: string;
  required?: boolean;
}

export default function Select({
  value,
  onChange,
  options,
  placeholder = "Select...",
  className = "",
  disabled = false,
  label,
  required = false,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  const selected = options.find((o) => o.value === value);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape, navigate with arrow keys
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, options.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
      if (e.key === "Enter" && highlighted >= 0) { e.preventDefault(); onChange(options[highlighted].value); setOpen(false); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, highlighted, options, onChange]);

  // Scroll highlighted into view
  useEffect(() => {
    if (!open || highlighted < 0 || !listRef.current) return;
    const el = listRef.current.children[highlighted] as HTMLElement;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  // Reset highlight when opening
  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setHighlighted(idx >= 0 ? idx : 0);
    }
  }, [open, options, value]);

  // Position popup using portal — always above everything
  useLayoutEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openDownward = spaceBelow >= 240 || spaceBelow > spaceAbove;
    const style: React.CSSProperties = {
      position: "fixed",
      left: rect.left,
      width: rect.width,
      zIndex: 99999,
      maxHeight: 240,
    };
    if (openDownward) {
      style.top = rect.bottom + 4;
    } else {
      style.bottom = window.innerHeight - rect.top + 4;
    }
    setPopupStyle(style);
  }, [open]);

  const handleToggle = useCallback(() => {
    if (!disabled) setOpen((o) => !o);
  }, [disabled]);

  const handleSelect = useCallback((val: string) => {
    onChange(val);
    setOpen(false);
  }, [onChange]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {/* Trigger */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-sm transition-colors ${
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer"
        } ${
          open
            ? "border-brand-500 dark:border-blue-500/50 ring-1 ring-brand-500 dark:ring-blue-500/20"
            : "border-slate-300 dark:border-[#252530]"
        } bg-white dark:bg-[#111118] text-slate-800 dark:text-[#f1f5f9]`}
      >
        <span className={`truncate ${selected ? "" : "text-slate-400 dark:text-[#64748b]"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className={`ml-2 h-4 w-4 shrink-0 text-slate-400 dark:text-[#64748b] transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {/* Portal Popup — renders above everything */}
      {open && createPortal(
        <div
          ref={listRef}
          onMouseDown={(e) => e.stopPropagation()}
          style={popupStyle}
          className="overflow-auto rounded-lg border border-slate-200 dark:border-[#252530] bg-white dark:bg-[#18181f] shadow-lg dark:shadow-dark-lg"
        >
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-400 dark:text-[#64748b]">No options</div>
          )}
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            const isHighlighted = i === highlighted;
            return (
              <div
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                onMouseEnter={() => setHighlighted(i)}
                className={`flex cursor-pointer items-center px-3 py-1.5 text-sm transition-colors ${
                  isHighlighted
                    ? "bg-slate-100 dark:bg-[#1e1e28]"
                    : ""
                } ${
                  isSelected
                    ? "font-medium text-brand-600 dark:text-blue-400"
                    : "text-slate-700 dark:text-[#cbd5e1]"
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <svg className="ml-auto h-4 w-4 shrink-0 text-brand-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
