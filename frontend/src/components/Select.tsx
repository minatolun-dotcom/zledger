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
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  const selected = options.find((o) => o.value === value);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  // Keep latest values in refs so the keydown handler never needs re-registration
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  const highlightedRef = useRef(highlighted);
  highlightedRef.current = highlighted;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setTimeout(() => containerRef.current?.querySelector<HTMLButtonElement>("button")?.focus(), 0);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape, navigate with arrow keys — registered once per open/close cycle
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const f = filteredRef.current;
      const h = highlightedRef.current;
      if (e.key === "Escape") { setOpen(false); setTimeout(() => containerRef.current?.querySelector<HTMLButtonElement>("button")?.focus(), 0); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((prev) => Math.min(prev + 1, filteredRef.current.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((prev) => Math.max(prev - 1, 0)); }
      if (e.key === "Enter" && h >= 0 && f[h]) {
        e.preventDefault();
        onChangeRef.current(f[h].value);
        setOpen(false);
        setTimeout(() => containerRef.current?.querySelector<HTMLButtonElement>("button")?.focus(), 0);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Scroll highlighted into view
  useEffect(() => {
    if (!open || highlighted < 0 || !listRef.current) return;
    const el = listRef.current.children[highlighted] as HTMLElement;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  // Reset highlight + query when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      const idx = options.findIndex((o) => o.value === value);
      setHighlighted(idx >= 0 ? idx : 0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, options, value]);

  // Position popup using portal
  useLayoutEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openDownward = spaceBelow >= 280 || spaceBelow > spaceAbove;
    const style: React.CSSProperties = {
      position: "fixed",
      left: rect.left,
      width: rect.width,
      zIndex: 99999,
      maxHeight: 280,
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
    setTimeout(() => containerRef.current?.querySelector<HTMLButtonElement>("button")?.focus(), 0);
  }, [onChange]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {/* Trigger */}
      <button
        type="button"
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) setOpen(true);
          }
        }}
        disabled={disabled}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-sm transition-colors ${
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer"
        } ${
          open
            ? "border-brand-500 dark:border-blue-500/50 ring-1 ring-brand-500 dark:ring-blue-500/20"
            : "border-slate-300 dark:border-[#282832]"
        } bg-white dark:bg-[#16161f] text-slate-800 dark:text-[#f1f5f9]`}
      >
        <span className={`truncate ${selected ? "" : "text-slate-400 dark:text-[#64748b]"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className={`ml-2 h-4 w-4 shrink-0 text-slate-400 dark:text-[#64748b] transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {/* Portal Popup */}
      {open && createPortal(
        <div
          style={popupStyle}
          onMouseDown={(e) => e.stopPropagation()}
          role="listbox"
          className="overflow-auto rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] shadow-lg dark:shadow-dark-lg"
        >
          {/* Search input */}
          <div className="sticky top-0 border-b border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] px-2 py-1.5">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHighlighted(0); }}
              placeholder="Type to search..."
              className="w-full rounded-md border border-slate-200 dark:border-[#282832] bg-slate-50 dark:bg-[#0f0f16] px-2.5 py-1 text-sm text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] focus:border-blue-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-500/20"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); setHighlighted((h) => Math.min(h + 1, filteredRef.current.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); setHighlighted((h) => Math.max(h - 1, 0)); }
                if (e.key === "Enter") {
                  e.preventDefault(); e.stopPropagation();
                  if (highlightedRef.current >= 0 && filteredRef.current[highlightedRef.current]) {
                    onChangeRef.current(filteredRef.current[highlightedRef.current].value);
                    setOpen(false);
                    setTimeout(() => containerRef.current?.querySelector<HTMLButtonElement>("button")?.focus(), 0);
                  }
                }
                if (e.key === "Escape") { e.stopPropagation(); setOpen(false); setTimeout(() => containerRef.current?.querySelector<HTMLButtonElement>("button")?.focus(), 0); }
              }}
            />
          </div>
          <div ref={listRef}>
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-slate-400 dark:text-[#64748b]">No results</div>
            )}
            {filtered.map((opt, i) => {
              const isSelected = opt.value === value;
              const isHighlighted = i === highlighted;
              return (
                <div
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`flex cursor-pointer items-center px-3 py-1.5 text-sm transition-colors ${
                    isHighlighted
                      ? "bg-slate-100 dark:bg-[#1a1a24]"
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
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
