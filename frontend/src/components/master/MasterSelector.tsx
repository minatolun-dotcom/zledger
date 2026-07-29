import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import type { EntityKey } from "./masterConfigs";
import MasterSelectorModal from "./MasterSelectorModal";

interface MasterSelectorProps {
  entityKey: EntityKey;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Prefill the name field when opening the create modal */
  defaultName?: string;
  /** Tag written to the audit log (e.g. "Sales Voucher") */
  createdFrom?: string;
  /** Show the edit affordance (Ctrl+Enter / pencil) on selected masters */
  allowEdit?: boolean;
  /** Called with the newly created item so the parent can refresh its list */
  onItemCreated?: (item: any) => void;
  /** Internal: stacking depth for nested create modals */
  depth?: number;
}

export default function MasterSelector({
  entityKey,
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled = false,
  className = "",
  defaultName,
  createdFrom,
  allowEdit = true,
  onItemCreated,
  depth = 0,
}: MasterSelectorProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [modalDefaultName, setModalDefaultName] = useState("");
  const [modalItem, setModalItem] = useState<{ id: string; name?: string } | undefined>();

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionsContainerRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLElement | null>(null);

  const selected = options.find((o) => o.value === value);
  const trimmed = searchQuery.trim();
  const filtered = trimmed === ""
    ? options
    : options.filter((o) => o.label.toLowerCase().includes(trimmed.toLowerCase()));
  const exact = trimmed !== "" && filtered.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());
  const showCreate = trimmed !== "" && !exact;
  const createIndex = filtered.length;
  const maxIndex = filtered.length + (showCreate ? 1 : 0) - 1;

  const closePopup = useCallback(() => {
    setOpen(false);
    setSearchQuery("");
  }, []);

  const choose = useCallback(
    (opt: { value: string; label: string }) => {
      onChange(opt.value);
      closePopup();
      // Return focus to the trigger button so keyboard nav (Enter→next field) works
      setTimeout(() => containerRef.current?.querySelector<HTMLElement>("button")?.focus(), 0);
    },
    [onChange, closePopup]
  );

  const openCreate = useCallback(
    (name?: string) => {
      focusRef.current = document.activeElement as HTMLElement;
      setModalMode("create");
      setModalDefaultName(name ?? defaultName ?? "");
      setModalItem(undefined);
      setModalOpen(true);
      closePopup();
    },
    [defaultName, closePopup]
  );

  const openEdit = useCallback(
    (opt: { value: string; label: string }) => {
      focusRef.current = document.activeElement as HTMLElement;
      setModalMode("edit");
      setModalItem({ id: opt.value, name: opt.label });
      setModalOpen(true);
      closePopup();
    },
    [closePopup]
  );

  const handleCreated = useCallback(
    (item: any) => {
      onChange(item.id);
      if (onItemCreated) onItemCreated(item);
      setModalOpen(false);
      closePopup();
    },
    [onChange, onItemCreated, closePopup]
  );

  // Close on click outside (ignore mousedowns inside the portal popup,
  // which lives at document.body and is outside containerRef — otherwise
  // clicking an option would close the popup before its onClick fires)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(t) &&
        !(listRef.current && listRef.current.contains(t))
      ) {
        closePopup();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, closePopup]);

  // Keyboard navigation & create/edit shortcuts
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closePopup();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((h) => (maxIndex >= 0 ? Math.min(h + 1, maxIndex) : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if ((e.ctrlKey || e.metaKey) && allowEdit && highlighted >= 0 && highlighted < filtered.length) {
          openEdit(filtered[highlighted]);
          return;
        }
        if (showCreate && highlighted === createIndex) {
          openCreate(trimmed);
          return;
        }
        if (highlighted >= 0 && highlighted < filtered.length) {
          choose(filtered[highlighted]);
          return;
        }
        if (filtered.length > 0) {
          choose(filtered[0]);
        }
        return;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, highlighted, filtered, showCreate, createIndex, maxIndex, trimmed, allowEdit, closePopup, openEdit, openCreate, choose]);

  // Scroll highlighted into view
  useEffect(() => {
    if (!open || highlighted < 0 || !optionsContainerRef.current) return;
    const el = optionsContainerRef.current.children[highlighted] as HTMLElement;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  // Reset highlight when opening
  useEffect(() => {
    if (open) {
      const idx = filtered.findIndex((o) => o.value === value);
      setHighlighted(idx >= 0 ? idx : 0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, filtered, value]);

  // Position popup via portal
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
      maxHeight: 280,
    };
    if (openDownward) {
      style.top = rect.bottom + 4;
    } else {
      style.bottom = window.innerHeight - rect.top + 4;
    }
    setPopupStyle(style);
  }, [open, searchQuery]);

  const handleToggle = useCallback(() => {
    if (!disabled) setOpen((o) => !o);
  }, [disabled]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
      setHighlighted(0);
    },
    []
  );

  const triggerClass = `flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-sm transition-colors ${
    disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
  } ${
    open
      ? "border-brand-500 dark:border-blue-500/50 ring-1 ring-brand-500 dark:ring-blue-500/20"
      : "border-slate-300 dark:border-[#282832]"
  } bg-white dark:bg-[#0f0f16] text-slate-800 dark:text-[#f1f5f9]`;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleToggle}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (!open) setOpen(true);
            }
          }}
          disabled={disabled}
          className={triggerClass}
        >
          <span className={`truncate ${selected ? "" : "text-slate-400 dark:text-[#64748b]"}`}>
            {selected ? selected.label : placeholder}
          </span>
          <svg
            className={`ml-2 h-4 w-4 shrink-0 text-slate-400 dark:text-[#64748b] transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>

      {open &&
        createPortal(
          <div
            ref={listRef}
            onMouseDown={(e) => e.stopPropagation()}
            style={popupStyle}
            data-master-popup="true"
            data-parent-field={containerRef.current?.closest("[data-field]")?.getAttribute("data-field") || ""}
            className="overflow-auto rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] shadow-lg dark:shadow-dark-lg"
          >
            <div className="sticky top-0 z-10 border-b border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-2">
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Type to search..."
                className="w-full rounded-md border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-1.5 text-sm text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div ref={optionsContainerRef} className="max-h-[200px] overflow-auto">
              {filtered.length === 0 && !showCreate && (
                <div className="px-3 py-2 text-sm text-slate-400 dark:text-[#64748b]">No options found</div>
              )}
              {filtered.map((opt, i) => {
                const isSelected = opt.value === value;
                const isHighlighted = i === highlighted;
                return (
                  <div
                    key={opt.value}
                    onClick={() => choose(opt)}
                    onMouseEnter={() => setHighlighted(i)}
                    className={`flex cursor-pointer items-center px-3 py-1.5 text-sm transition-colors ${
                      isHighlighted ? "bg-slate-100 dark:bg-[#1a1a24]" : ""
                    } ${isSelected ? "font-medium text-brand-600 dark:text-blue-400" : "text-slate-700 dark:text-[#cbd5e1]"}`}
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
              {showCreate && (
                <div
                  onClick={() => openCreate(trimmed)}
                  onMouseEnter={() => setHighlighted(createIndex)}
                  className={`flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                    highlighted === createIndex
                      ? "bg-brand-50 dark:bg-blue-500/10 text-brand-700 dark:text-blue-300"
                      : "text-brand-600 dark:text-blue-400"
                  }`}
                >
                  <span className="text-base leading-none">+</span>
                  <span className="truncate">Create &ldquo;{trimmed}&rdquo;</span>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {modalOpen && (
        <MasterSelectorModal
          entityKey={entityKey}
          mode={modalMode}
          defaultName={modalDefaultName}
          createdFrom={createdFrom}
          item={modalItem}
          depth={depth + 1}
          onClose={() => { setModalOpen(false); setTimeout(() => focusRef.current?.focus(), 0); }}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
