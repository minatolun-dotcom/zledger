import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from "react";
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
  defaultName?: string;
  createdFrom?: string;
  allowEdit?: boolean;
  onItemCreated?: (item: any) => void;
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
  // When a create/edit modal closes, focus returns to this input and would
  // otherwise re-open the popup — hiding the freshly selected label behind an
  // empty search box. Set by handleCreated, consumed by onFocus.
  const suppressOpenOnFocusRef = useRef(false);
  const [modalItem, setModalItem] = useState<{ id: string; name?: string } | undefined>();

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionsContainerRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLElement | null>(null);

  const selected = options.find((o) => o.value === value);
  const trimmed = searchQuery.trim();
  const filtered = useMemo(() =>
    trimmed === ""
      ? options
      : options.filter((o) => o.label.toLowerCase().includes(trimmed.toLowerCase()))
  , [trimmed, options]);
  const exact = trimmed !== "" && filtered.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());
  const showCreate = trimmed !== "" && !exact;
  const createIndex = filtered.length;
  const maxIndex = filtered.length + (showCreate ? 1 : 0) - 1;

  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  const highlightedRef = useRef(highlighted);
  highlightedRef.current = highlighted;
  const maxIndexRef = useRef(maxIndex);
  maxIndexRef.current = maxIndex;
  const showCreateRef = useRef(showCreate);
  showCreateRef.current = showCreate;
  const createIndexRef = useRef(createIndex);
  createIndexRef.current = createIndex;
  const trimmedRef = useRef(trimmed);
  trimmedRef.current = trimmed;
  const allowEditRef = useRef(allowEdit);
  allowEditRef.current = allowEdit;
  const openRef = useRef(open);
  openRef.current = open;

  const closePopup = useCallback(() => {
    setOpen(false);
    setSearchQuery("");
  }, []);

  const choose = useCallback(
    (opt: { value: string; label: string }) => {
      onChange(opt.value);
      closePopup();
      setTimeout(() => inputRef.current?.blur(), 0);
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
      // The modal's onClose refocuses this input; consume the auto-open so the
      // field shows the new selection instead of an empty popup.
      suppressOpenOnFocusRef.current = true;
    },
    [onChange, onItemCreated, closePopup]
  );

  const closePopupRef = useRef(closePopup);
  closePopupRef.current = closePopup;
  const openEditRef = useRef(openEdit);
  openEditRef.current = openEdit;
  const openCreateRef = useRef(openCreate);
  openCreateRef.current = openCreate;
  const chooseRef = useRef(choose);
  chooseRef.current = choose;

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
        inputRef.current?.blur();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, closePopup]);

  useEffect(() => {
    if (!open || highlighted < 0 || !optionsContainerRef.current) return;
    const el = optionsContainerRef.current.children[highlighted] as HTMLElement;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setHighlighted(idx >= 0 ? idx : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);

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

  const inputClass = `w-full rounded-lg border px-3 py-1.5 pr-8 text-sm transition-colors ${
    disabled ? "cursor-not-allowed opacity-50" : ""
  } ${
    open
      ? "border-brand-500 dark:border-blue-500/50 ring-1 ring-brand-500 dark:ring-blue-500/20"
      : "border-slate-300 dark:border-[#282832]"
  } bg-white dark:bg-[#0f0f16] text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20`;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={open ? searchQuery : (selected?.label || "")}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!open) setOpen(true);
            setHighlighted(0);
          }}
          onFocus={() => {
            if (suppressOpenOnFocusRef.current) {
              suppressOpenOnFocusRef.current = false;
              return;
            }
            if (!disabled) setOpen(true);
          }}
          onBlur={() => {
            setTimeout(() => {
              if (!openRef.current) return;
              setOpen(false);
              setSearchQuery("");
            }, 150);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              closePopupRef.current();
              inputRef.current?.blur();
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!openRef.current) {
                setOpen(true);
              } else {
                setHighlighted((h) => Math.min(h + 1, maxIndexRef.current));
              }
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              if (!openRef.current) {
                setOpen(true);
              } else {
                setHighlighted((h) => Math.max(h - 1, 0));
              }
              return;
            }
            if (e.key === "Enter" && openRef.current) {
              e.preventDefault();
              const f = filteredRef.current;
              const h = highlightedRef.current;
              if ((e.ctrlKey || e.metaKey) && allowEditRef.current && h >= 0 && h < f.length) {
                openEditRef.current(f[h]);
                return;
              }
              if (showCreateRef.current && h === createIndexRef.current) {
                openCreateRef.current(trimmedRef.current);
                return;
              }
              if (h >= 0 && h < f.length) {
                chooseRef.current(f[h]);
                return;
              }
              if (f.length > 0) {
                chooseRef.current(f[0]);
              }
              return;
            }
            if (e.key === "Tab" && openRef.current) {
              closePopupRef.current();
              return;
            }
          }}
          placeholder={selected ? "" : placeholder}
          disabled={disabled}
          className={inputClass}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onMouseDown={(e) => {
            e.preventDefault();
            if (disabled) return;
            if (open) {
              closePopup();
              inputRef.current?.blur();
            } else {
              inputRef.current?.focus();
            }
          }}
          className="pointer-events-auto absolute right-2 top-1/2 -translate-y-1/2 p-0.5"
        >
          <svg
            className={`h-4 w-4 shrink-0 text-slate-400 dark:text-[#64748b] transition-transform ${open ? "rotate-180" : ""}`}
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
            onMouseDown={(e) => e.preventDefault()}
            style={popupStyle}
            data-master-popup="true"
            data-parent-field={containerRef.current?.closest("[data-field]")?.getAttribute("data-field") || ""}
            className="overflow-auto rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] shadow-lg dark:shadow-dark-lg"
          >
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
                      isHighlighted ? "bg-blue-50 dark:bg-blue-500/15" : ""
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
