import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { NAV_GROUPS, useModules } from "../config/modules";
import type { NavGroup, NavItem } from "../config/modules";
import NavIcon from "./NavIcon";

/* ── Keyboard shortcut hints for sidebar items ───────────────────────── */
const SHORTCUT_HINTS: Record<string, string> = {
  "/": "D",
  "/vouchers": "V",
  "/chart-of-accounts": "C",
  "/parties": "P",
  "/reports": "R",
  "/gst": "G",
  "/tds-tcs": "T",
  "/inventory": "I",
  "/tally-import": "E",
  "/bank-reconciliation": "B",
  "/loans": "L",
  "/fixed-assets": "F",
  "/compliance": "N",
  "/payments": "M",
  "/manufacturing": "U",
  "/batches": "X",
  "/company-settings": "S",
  "/recurring-templates": "J",
};

/* ── Persist sidebar expand/subgroup state ────────────────────────────── */
const EXPAND_KEY = "zledger.sidebar.expanded";
const SUB_KEY = "zledger.sidebar.subgroups";
function loadJson(key: string): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
}
function saveJson(key: string, state: Record<string, boolean>) {
  localStorage.setItem(key, JSON.stringify(state));
}

const COLLAPSED_KEY = "zledger.sidebar.collapsed";
const SIDEBAR_EVENT = "zledger.sidebar.change";

export function getSidebarCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSED_KEY) === "true"; } catch { return true; }
}

/* ── Component ────────────────────────────────────────────────────────── */
export default function AppSidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === "true"; } catch { return true; }
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => loadJson(EXPAND_KEY));
  const [subgroups, setSubgroups] = useState<Record<string, boolean>>(() => loadJson(SUB_KEY));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const sidebarRef = useRef<HTMLElement>(null);

  const isExpanded = !collapsed;

  useEffect(() => { localStorage.setItem(COLLAPSED_KEY, String(collapsed)); window.dispatchEvent(new Event(SIDEBAR_EVENT)); }, [collapsed]);

  // Close mobile sidebar on navigation
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const toggleGroup = (key: string) => {
    setExpanded((prev) => { const next = { ...prev, [key]: !prev[key] }; saveJson(EXPAND_KEY, next); return next; });
  };
  const toggleSubgroup = (key: string) => {
    setSubgroups((prev) => { const next = { ...prev, [key]: !prev[key] }; saveJson(SUB_KEY, next); return next; });
  };

  const enabledModules = useModules();
  const groups = useMemo(() => {
    return NAV_GROUPS
      .filter((g) => !g.module || enabledModules.includes(g.module))
      .map((g) => ({
        ...g,
        items: g.items.filter((item) => {
          if ("type" in item && item.type === "subgroup") {
            return item.items.some((sub) => !sub.module || enabledModules.includes(sub.module));
          }
          return !(item as NavItem).module || enabledModules.includes((item as NavItem).module!);
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [enabledModules]);

  const isGroupActive = (group: NavGroup) =>
    group.items.some((item) => {
      if ("type" in item && item.type === "subgroup") return item.items.some((sub) => location.pathname.startsWith(sub.to));
      return location.pathname === (item as NavItem).to || location.pathname.startsWith((item as NavItem).to + "/");
    });

  // Reset keyboard focus when navigating
  useEffect(() => { setFocusIdx(-1); }, [location.pathname]);

  // Keyboard navigation for sidebar
  const handleSidebarKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const nav = sidebarRef.current?.querySelector("nav");
      if (!nav) return;
      const items = Array.from(
        nav.querySelectorAll<HTMLElement>("button:not([hidden]), a:not([hidden])")
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;

      let idx = focusIdx;
      if (idx < 0 || idx >= items.length) {
        idx = items.findIndex(
          (el) =>
            el.classList.contains("active") ||
            el.getAttribute("aria-current") === "page"
        );
        if (idx < 0) idx = 0;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        idx = Math.min(idx + 1, items.length - 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        idx = Math.max(idx - 1, 0);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        items[idx]?.click();
        return;
      } else if (e.key === "ArrowRight") {
        // Expand group if it's collapsed
        const btn = items[idx];
        if (btn?.tagName === "BUTTON") {
          const arrow = btn.querySelector(".-rotate-90");
          if (arrow) { e.preventDefault(); btn.click(); return; }
        }
        return;
      } else if (e.key === "ArrowLeft") {
        // Collapse group if it's expanded
        const btn = items[idx];
        if (btn?.tagName === "BUTTON") {
          const arrow = btn.querySelector(".rotate-0:not(.-rotate-90)");
          if (arrow) { e.preventDefault(); btn.click(); return; }
        }
        return;
      } else {
        return;
      }

      setFocusIdx(idx);
      items[idx]?.focus();
      items[idx]?.scrollIntoView({ block: "nearest" });
    },
    [focusIdx]
  );

  const sidebarWidth = isExpanded ? "w-60" : "w-16";

  const navContent = (
    <nav className="flex-1 overflow-y-auto px-2 py-2">
      {/* Dashboard */}
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors mb-3 ${
            isActive
              ? "bg-blue-500/15 text-blue-400 dark:bg-blue-500/15 dark:text-blue-400"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-[#cbd5e1] dark:hover:bg-[#16161f] dark:hover:text-[#f1f5f9]"
          }`
        }
      >
        <NavIcon name="dashboard" className="h-[18px] w-[18px]" strokeWidth={1.75} />
        {isExpanded && (
          <span className="flex-1">
            Dashboard
            <kbd className="ml-1.5 inline-flex items-center rounded border border-slate-200 dark:border-[#282832] bg-slate-100 dark:bg-[#1a1a24] px-1 py-0.5 text-[9px] font-medium text-slate-400 dark:text-[#64748b]">D</kbd>
          </span>
        )}
        {!isExpanded && <span className="pointer-events-none absolute left-full ml-2 rounded-lg bg-[#16161f] dark:bg-[#282832] px-2.5 py-1.5 text-xs font-medium text-[#f1f5f9] whitespace-nowrap opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">Dashboard</span>}
      </NavLink>

      {groups.map((group) => {
        const groupActive = isGroupActive(group);
        const groupExpanded = expanded[group.key] !== false;
        return (
          <div key={group.key} className="mt-2">
            <button
              onClick={() => { toggleGroup(group.key); if (collapsed) setCollapsed(false); }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest transition-colors group relative ${
                groupActive ? "text-blue-500 dark:text-blue-400" : "text-slate-400 hover:text-slate-700 dark:text-white/40 dark:hover:text-[#f1f5f9]"
              }`}
            >
              <NavIcon name={group.icon} className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {isExpanded && (
                <>
                  <span className="flex-1 text-left">{group.label}</span>
                  <svg className={`h-3 w-3 transition-transform duration-200 opacity-40 ${groupExpanded ? "rotate-0" : "-rotate-90"}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </>
              )}
              {!isExpanded && <span className="pointer-events-none absolute left-full ml-2 rounded-lg bg-[#16161f] dark:bg-[#282832] px-2.5 py-1.5 text-xs font-medium text-[#f1f5f9] whitespace-nowrap opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">{group.label}</span>}
            </button>

            {isExpanded && groupExpanded && (
              <div className="ml-3 border-l border-slate-100 dark:border-[#1a1a24] pl-2 mt-0.5 mb-2 space-y-0.5">
                {group.items.map((item) => {
                  if ("type" in item && item.type === "subgroup") {
                    const subExpanded = subgroups[item.key] !== false;
                    const subActive = item.items.some((s) => location.pathname.startsWith(s.to));
                    return (
                      <div key={item.key}>
                        <button
                          onClick={() => toggleSubgroup(item.key)}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                            subActive ? "bg-blue-500/10 text-blue-400" : "text-slate-600 hover:bg-slate-50 hover:text-slate-800 dark:text-[#cbd5e1] dark:hover:bg-[#16161f] dark:hover:text-[#f1f5f9]"
                          }`}
                        >
                          <span className="flex-1 text-left">{item.label}</span>
                          <svg className={`h-2.5 w-2.5 transition-transform duration-200 opacity-40 ${subExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </button>
                        {subExpanded && (
                          <div className="ml-2 border-l border-slate-100 dark:border-[#1a1a24] pl-2 mt-0.5 space-y-0.5">
                            {item.items.map((sub) => (
                              <NavLink
                                key={sub.to + sub.label}
                                to={sub.to}
                                end={sub.end}
                                className={({ isActive }) =>
                                  `flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                                    isActive ? "bg-blue-500/15 text-blue-400" : "text-slate-600 hover:bg-slate-50 hover:text-slate-800 dark:text-[#cbd5e1] dark:hover:bg-[#16161f] dark:hover:text-[#f1f5f9]"
                                  }`
                                }
                              >
                                {sub.label}
                              </NavLink>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  const navItem = item as NavItem;
                  const disabled = navItem.to === "#";
                  return (
                    <NavLink
                      key={navItem.to}
                      to={navItem.to}
                      end={navItem.end}
                      onClick={disabled ? (e) => e.preventDefault() : undefined}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors flex-1 ${
                          disabled ? "cursor-not-allowed text-slate-300 dark:text-[#334155]" : isActive ? "bg-blue-500/15 text-blue-400 font-semibold" : "text-slate-600 hover:bg-slate-50 hover:text-slate-800 dark:text-[#cbd5e1] dark:hover:bg-[#16161f] dark:hover:text-[#f1f5f9]"
                        }`
                      }
                    >
                      <span className="flex-1">
                        {navItem.label}
                        {SHORTCUT_HINTS[navItem.to] && (
                          <kbd className="ml-1.5 inline-flex items-center rounded border border-slate-200 dark:border-[#282832] bg-slate-100 dark:bg-[#1a1a24] px-1 py-0.5 text-[9px] font-medium text-slate-400 dark:text-[#64748b]">{SHORTCUT_HINTS[navItem.to]}</kbd>
                        )}
                      </span>
                      {disabled && (
                        <span className="rounded-md bg-slate-100 dark:bg-[#1a1a24] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-400 dark:text-[#475569]">Soon</span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <aside
        ref={sidebarRef}
        onKeyDown={handleSidebarKeyDown}
        className={`hidden lg:flex flex-col fixed top-16 bottom-0 left-0 z-20 bg-white dark:bg-[#0f0f16] border-r border-slate-200 dark:border-[#1a1a24] transition-all duration-300 ${sidebarWidth}`}
        tabIndex={0}
      >
        {navContent}
        {/* Collapse toggle */}
        <div className="border-t border-slate-200 dark:border-[#1a1a24] p-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12px] font-medium text-slate-400 dark:text-[#64748b] hover:bg-slate-100 dark:hover:bg-[#16161f] hover:text-slate-600 dark:hover:text-[#cbd5e1] transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg className={`h-4 w-4 transition-transform duration-300 ${collapsed ? "rotate-0" : "rotate-180"}`} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
            </svg>
            {isExpanded && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ── Mobile Sidebar ── */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-3 left-3 z-40 flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-[#16161f] border border-slate-200 dark:border-[#282832] shadow-lg lg:hidden"
      >
        <svg className="h-4 w-4 text-slate-700 dark:text-[#e2e8f0]" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          {mobileOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          )}
        </svg>
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`flex flex-col fixed top-16 bottom-0 left-0 z-40 w-60 bg-white dark:bg-[#0f0f16] border-r border-slate-200 dark:border-[#1a1a24] transition-transform duration-300 lg:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {navContent}
      </aside>
    </>
  );
}
