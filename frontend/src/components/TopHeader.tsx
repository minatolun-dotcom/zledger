import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useFyStore } from "../store/fy";
import { useThemeStore } from "../store/theme";
import { api } from "../api/client";
import Select from "./Select";
import NotificationBell from "./NotificationBell";
import { NAV_GROUPS, SEARCH_COMMANDS, useModules, PAGE_TABS, SEARCH_VOUCHER_TYPES } from "../config/modules";
import type { NavItem } from "../config/modules";
import NavIcon from "./NavIcon";
import useEscapeToClose from "../hooks/useEscapeToClose";
import { getUserRole } from "../store/auth";
import { usePermissions } from "../hooks/useRole";
import { ROLE_BADGES, ROLE_LABELS, type CompanyRole } from "../config/roles";

function RoleBadge({ role }: { role: CompanyRole }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${ROLE_BADGES[role]}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

interface FinancialYear { id: string; name: string; start_date: string; end_date: string; }

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
interface CompanyDetails { id: string; name: string; gstin: string | null; legal_name: string | null; state_code: string | null; is_active: boolean; logo_url: string | null; }

export interface TopHeaderProps {
  onCompanyUpdate: (details: CompanyDetails, logoVer: number) => void;
}

export default function TopHeader({ onCompanyUpdate }: TopHeaderProps) {
  const { user, companies, activeCompanyId, logout } = useAuthStore();
  const { activeFyId, setActiveFy } = useFyStore();
  const { theme, setTheme } = useThemeStore();
  const activeCompany = companies.find((c) => c.id === activeCompanyId);
  const role = getUserRole();
  const [fys, setFys] = useState<FinancialYear[]>([]);
  const activeFy = fys.find((f) => f.id === activeFyId);
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  interface ServerResult { entity_type: string; id: string; name: string; subtitle: string; link: string; }
  const [serverResults, setServerResults] = useState<ServerResult[]>([]);
  const [serverLoading, setServerLoading] = useState(false);
  const searchDebounceRef = useRef<globalThis.NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchListRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  /* ── FY data ── */
  useEffect(() => {
    api.get<FinancialYear[]>("/coa/financial-years").then((data) => {
      setFys(data);
      if (!activeFyId && data.length > 0) setActiveFy(data[data.length - 1].id);
    });
  }, []);

  /* ── Company details ── */
  useEffect(() => {
    if (!activeCompanyId) return;
    const loadCompany = () =>
      api.get<CompanyDetails>(`/companies/${activeCompanyId}`).then((d) => { setCompanyDetails(d); onCompanyUpdate(d, logoVersion); }).catch(() => {});
    loadCompany();
    const onUpdated = () => { setLogoVersion((v) => { const nv = v + 1; return nv; }); loadCompany(); };
    window.addEventListener("company-updated", onUpdated);
    return () => window.removeEventListener("company-updated", onUpdated);
  }, [activeCompanyId]);

  useEffect(() => { if (companyDetails) onCompanyUpdate(companyDetails, logoVersion); }, [logoVersion]);

  /* ── Profile dropdown close (click outside) ── */
  useEffect(() => {
    if (!profileOpen) return;
    const handleClick = (e: MouseEvent) => { if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileOpen]);

  // Escape closes the profile dropdown (shared hook → topmost-modal semantics)
  useEscapeToClose(profileOpen, () => setProfileOpen(false));

  /* ── Build search items (pages + actions) ── */
  const enabledModules = useModules();
  const { can } = usePermissions();
  interface SearchItem {
    type: "page" | "tab" | "voucher" | "action";
    label: string;
    to: string;
    icon: string;
    group: string;
    params?: Record<string, string>;
    keywords: string;
  }

  const searchItems = useMemo(() => {
    const items: SearchItem[] = [];
    const seen = new Set<string>();

    // Populate the set of valid page routes (for tab-nesting), respecting module gating.
    const pageToGroup: Record<string, string> = {};
    const pageToIcon: Record<string, string> = {};

    // Pages
    const addPage = (label: string, to: string, icon: string, group: string) => {
      const key = `page|${to}|${label}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push({ type: "page", label, to, icon, group, keywords: label.toLowerCase() });
        pageToGroup[to] = group;
        pageToIcon[to] = icon;
      }
    };
    addPage("Dashboard", "/", "dashboard", "");
    for (const g of NAV_GROUPS) {
      if (g.module && !enabledModules.includes(g.module)) continue;
      for (const item of g.items) {
        if ("type" in item && item.type === "subgroup") {
          for (const sub of item.items) {
            const subMod = sub.module;
            if (subMod && !enabledModules.includes(subMod)) continue;
            addPage(sub.label, sub.to, sub.icon, `${g.label} / ${item.label}`);
          }
        } else {
          const nav = item as NavItem & { module?: string };
          if (nav.module && !enabledModules.includes(nav.module)) continue;
          if (nav.to !== "#") addPage(nav.label, nav.to, nav.icon, g.label);
        }
      }
    }
    addPage("My Profile", "/profile", "user", "Profile");
    addPage("Members", "/members", "user", "Settings");
    addPage("Audit Log", "/audit", "user", "Settings");
    if (companies.length > 1) addPage("Switch Company", "/companies", "arrow-left-on-rectangle", "Profile");
    if (user?.is_superadmin) {
      addPage("Admin Users", "/admin/users", "user", "Admin");
      addPage("Admin Companies", "/admin/companies", "building", "Admin");
      addPage("Admin Backups", "/admin/backups", "document", "Admin");
      addPage("Admin Activity", "/admin/activity", "activity", "Admin");
    }

    // Per-page tabs (skip routes that aren't in the search results — they're module-gated)
    const pagePaths = new Set(items.filter((i) => i.type === "page").map((i) => i.to));
    for (const [path, tabs] of Object.entries(PAGE_TABS)) {
      if (!pagePaths.has(path)) continue;
      const group = pageToGroup[path] || "";
      const icon = pageToIcon[path] || "redirect";
      for (const tab of tabs) {
        const key = `tab|${path}|${JSON.stringify(tab.params ?? {})}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          type: "tab",
          label: tab.label,
          to: path,
          icon,
          group,
          params: { ...(tab.params ?? {}) },
          keywords: `${tab.label} ${path}`.toLowerCase(),
        });
      }
    }

    // Voucher create types (only if vouchers page is available — it always is for core)
    if (pagePaths.has("/vouchers")) {
      for (const vt of SEARCH_VOUCHER_TYPES) {
        const key = `voucher|${vt.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          type: "voucher",
          label: `New ${vt.label}`,
          to: "/vouchers",
          icon: "receipt",
          group: "Vouchers",
          params: { action: "new", type: vt.id },
          keywords: `new ${vt.label} voucher create ${vt.id}`.toLowerCase(),
        });
      }
    }

    // Actions
    for (const cmd of SEARCH_COMMANDS) {
      if (cmd.module && !enabledModules.includes(cmd.module)) continue;
      if (cmd.permission && !can(cmd.permission)) continue;
      items.push({
        type: "action",
        label: cmd.label,
        to: cmd.to,
        icon: cmd.icon,
        group: cmd.category,
        params: cmd.params,
        keywords: `${cmd.label} ${cmd.category}`.toLowerCase(),
      });
    }

    return items;
  }, [companies.length, user?.is_superadmin, enabledModules, can]);

  /* ── Filtered results ── */
  const filteredResults = useMemo(() => {
    if (!searchQuery) return searchItems;
    const q = searchQuery.toLowerCase();
    return searchItems.filter((item) => item.keywords.includes(q) || item.label.toLowerCase().includes(q));
  }, [searchQuery, searchItems]);

  const filteredPages = filteredResults.filter((i) => i.type === "page");
  const filteredTabs = filteredResults.filter((i) => i.type === "tab");
  const filteredVouchers = filteredResults.filter((i) => i.type === "voucher");
  const filteredActions = filteredResults.filter((i) => i.type === "action");

  /* ── Navigate with params ── */
  const goTo = useCallback((item: { to: string; params?: Record<string, string> }) => {
    setSearchOpen(false);
    
    // Handle utility commands
    if (item.to === "refresh") {
      window.location.reload();
      return;
    }
    if (item.to === "toggle-theme") {
      const current = localStorage.getItem("theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      localStorage.setItem("theme", next);
      document.documentElement.classList.toggle("dark");
      return;
    }
    if (item.to === "show-shortcuts") {
      window.dispatchEvent(new CustomEvent("show-keyboard-help"));
      return;
    }
    if (item.to === "toggle-sidebar") {
      window.dispatchEvent(new CustomEvent("toggle-sidebar"));
      return;
    }
    
    // Normal navigation
    if (item.params) {
      const qs = new URLSearchParams(item.params).toString();
      navigate(`${item.to}?${qs}`);
    } else {
      navigate(item.to);
    }
  }, [navigate]);

  /* ── Keyboard shortcut (Ctrl/Cmd+K opens the search modal) ── */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        if (!searchOpen) { e.preventDefault(); setSearchOpen(true); }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [searchOpen]);

  // Escape closes the search modal (shared hook)
  useEscapeToClose(searchOpen, () => setSearchOpen(false));

  useEffect(() => {
    if (searchOpen) { setSearchQuery(""); setSearchIndex(0); setServerResults([]); setTimeout(() => searchInputRef.current?.focus(), 100); }
  }, [searchOpen]);

  // Debounced server search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!searchQuery || searchQuery.length < 2) { setServerResults([]); return; }
    setServerLoading(true);
    searchDebounceRef.current = setTimeout(() => {
      api.get<{ results: ServerResult[]; total: number }>(`/search?q=${encodeURIComponent(searchQuery)}&limit=20`)
        .then((d) => setServerResults(d.results))
        .catch(() => setServerResults([]))
        .finally(() => setServerLoading(false));
    }, 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery]);

  const go = (path: string) => { navigate(path); setProfileOpen(false); };

  /* ── Combined list for keyboard nav ── */
  const allItems = useMemo(() => {
    const result: (SearchItem | { to: string; label: string; params?: Record<string, string> })[] = [];
    const maxPages = searchQuery ? filteredPages.length : Math.min(filteredPages.length, 8);
    result.push(...filteredPages.slice(0, maxPages));
    result.push(...filteredVouchers);
    result.push(...filteredTabs);
    result.push(...filteredActions);
    // Add server results as navigable items
    for (const sr of serverResults) {
      result.push({ to: sr.link, label: sr.name, params: undefined });
    }
    return result;
  }, [filteredPages, filteredTabs, filteredVouchers, filteredActions, serverResults, searchQuery]);

  return (
    <>
      {/* ── Header Bar ── */}
      <header className="fixed top-0 left-0 right-0 z-30 flex h-16 items-center border-b border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#0f0f16] px-4">
        {/* Logo — left */}
        <button onClick={() => navigate("/")} className="flex items-center gap-2 shrink-0 ml-10 lg:ml-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-500/20">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
              <path d="M6 6h12l-10 6h8L6 18h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
            </svg>
          </div>
          <span className="hidden sm:inline text-[15px] font-bold tracking-tight text-slate-900 dark:text-[#f1f5f9]">Zledger</span>
        </button>

        {/* Search — centered */}
        <div className="flex-1 flex justify-center px-6">
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden md:flex items-center gap-2 w-full max-w-md rounded-lg bg-slate-50 dark:bg-[#16161f] border border-slate-200 dark:border-[#1a1a24] px-3 py-1.5 text-slate-400 dark:text-[#64748b] transition-colors hover:border-slate-300 dark:hover:border-[#2a2a35]"
          >
            <NavIcon name="search" className="h-3.5 w-3.5" />
            <span className="text-[13px] font-medium">Search pages, actions...</span>
            <kbd className="ml-auto rounded-md bg-white dark:bg-[#282832] border border-slate-200 dark:border-[#2a2a35] px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:text-[#64748b]">Ctrl K</kbd>
          </button>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Company + FY */}
          <div className="flex items-center gap-2.5 min-w-0">
            {companyDetails?.logo_url ? (
              <img
                src={`${companyDetails.logo_url}${companyDetails.logo_url.includes("?") ? "&" : "?"}v=${logoVersion}`}
                alt={activeCompany?.name ?? "Company"}
                className="h-7 w-7 shrink-0 rounded-lg object-contain"
              />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <NavIcon name="building" className="h-3.5 w-3.5" />
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => go("/company-settings")}
                  className="text-[15px] font-semibold text-slate-800 dark:text-[#f1f5f9] whitespace-nowrap leading-tight truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  {activeCompany?.name ?? "—"}
                </button>
                <RoleBadge role={role} />
              </div>
              {activeFy && (
                <span className="text-[11px] text-slate-400 dark:text-[#64748b] whitespace-nowrap leading-tight">
                  {formatShortDate(activeFy.start_date)} – {formatShortDate(activeFy.end_date)}
                </span>
              )}
            </div>
            {fys.length > 0 && (
              <div className="flex items-center gap-1.5 self-center">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">FY</span>
                <Select
                  value={activeFyId ?? ""}
                  onChange={(v) => setActiveFy(v || null)}
                  options={fys.map((fy) => ({ value: fy.id, label: fy.name }))}
                  className="w-auto min-w-[120px]"
                />
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-slate-200 dark:bg-[#282832] hidden sm:block" />

          {/* Settings — clean gear icon */}
          <button
            onClick={() => go("/company-settings")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-[#64748b] hover:bg-slate-100 dark:hover:bg-[#1a1a24] hover:text-slate-600 dark:hover:text-[#e2e8f0] transition-colors"
            title="Settings"
          >
            <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Help / Keyboard shortcuts */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("toggle-help"))}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-[#64748b] hover:bg-slate-100 dark:hover:bg-[#1a1a24] hover:text-slate-600 dark:hover:text-[#e2e8f0] transition-colors"
            title="Keyboard shortcuts (Alt+F1)"
          >
            <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </button>

          {/* Notification Bell */}
          <NotificationBell />

          {/* User Avatar + Dropdown */}
          <div ref={profileRef} className="relative">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-[11px] font-bold text-white uppercase shadow-md shadow-blue-500/20 hover:ring-2 hover:ring-blue-500/30 transition-all"
            >
              {user?.name?.charAt(0) ?? "?"}
            </button>

            {profileOpen && (
              <div className="absolute top-full right-0 mt-2 w-64 z-[9999] rounded-2xl border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] shadow-xl dark:shadow-dark-xl overflow-hidden">
              <div className="p-1.5">
                {/* User info */}
                <div className="px-3 py-2 mb-1">
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-[#f1f5f9]">{user?.name}</p>
                  <p className="text-[11px] text-slate-400 dark:text-[#64748b]">{user?.email}</p>
                  <div className="mt-1.5">
                    <RoleBadge role={role} />
                  </div>
                </div>

                {/* Profile */}
                <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Profile</p>
                <button onClick={() => go("/profile")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 dark:text-[#cbd5e1] dark:hover:bg-[#282832] dark:hover:text-[#f1f5f9] transition-colors">
                  <NavIcon name="user" className="h-4 w-4" />
                  My Profile
                </button>

                {/* Theme switcher */}
                <div className="flex items-center gap-1.5 px-3 py-1.5">
                  {(["light", "dark", "system"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setTheme(mode)}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                        theme === mode ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "text-slate-400 hover:text-slate-600 dark:hover:text-[#cbd5e1]"
                      }`}
                    >
                      {mode === "light" ? (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                        </svg>
                      ) : mode === "dark" ? (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                        </svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                        </svg>
                      )}
                      <span className="capitalize">{mode === "system" ? "Auto" : mode}</span>
                    </button>
                  ))}
                </div>

                {/* Workspace */}
                <div className="my-1 border-t border-slate-100 dark:border-[#282832]" />
                <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Workspace</p>
                <button onClick={() => go("/members")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 dark:text-[#cbd5e1] dark:hover:bg-[#282832] dark:hover:text-[#f1f5f9] transition-colors">
                  <NavIcon name="user" className="h-4 w-4" />
                  Members
                </button>
                <button onClick={() => go("/company-settings")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 dark:text-[#cbd5e1] dark:hover:bg-[#282832] dark:hover:text-[#f1f5f9] transition-colors">
                  <NavIcon name="settings" className="h-4 w-4" />
                  Settings
                </button>
                <button onClick={() => go("/audit")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 dark:text-[#cbd5e1] dark:hover:bg-[#282832] dark:hover:text-[#f1f5f9] transition-colors">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Audit Log
                </button>

                {/* Administration */}
                {user?.is_superadmin && (
                  <>
                    <div className="my-1 border-t border-slate-100 dark:border-[#282832]" />
                    <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Administration</p>
                    <button onClick={() => go("/admin/users")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10 transition-colors">
                      <NavIcon name="user" className="h-4 w-4" />
                      Users
                    </button>
                    <button onClick={() => go("/admin/companies")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10 transition-colors">
                      <NavIcon name="building" className="h-4 w-4" />
                      Companies
                    </button>
                    <button onClick={() => go("/admin/backups")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10 transition-colors">
                      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      Backups
                    </button>
                    <button onClick={() => go("/admin/activity")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10 transition-colors">
                      <NavIcon name="user" className="h-4 w-4" />
                      Activity
                    </button>
                  </>
                )}

                {/* Session */}
                <div className="my-1 border-t border-slate-100 dark:border-[#282832]" />
                <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Session</p>
                {companies.length > 1 && (
                  <button onClick={() => go("/companies")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 dark:text-[#cbd5e1] dark:hover:bg-[#282832] dark:hover:text-[#f1f5f9] transition-colors">
                    <NavIcon name="arrow-left-on-rectangle" className="h-4 w-4" />
                    Switch Company
                  </button>
                )}
                <button onClick={logout} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 transition-colors">
                  <NavIcon name="arrow-right-on-rectangle" className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
        </div>
      </header>

      {/* ── Search Modal ── */}
      {searchOpen && (
        <div className="fixed inset-0 z-[99999] flex items-start justify-center pt-[15vh]" onClick={() => setSearchOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] shadow-2xl dark:shadow-dark-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-[#1a1a24] px-4 py-3">
              <NavIcon name="search" className="h-4 w-4 shrink-0 text-slate-400 dark:text-[#64748b]" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search pages and actions..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchIndex(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setSearchIndex((i) => Math.min(i + 1, allItems.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setSearchIndex((i) => Math.max(i - 1, 0)); }
                  else if (e.key === "Enter") { e.preventDefault(); if (allItems[searchIndex]) goTo(allItems[searchIndex]); }
                }}
                className="flex-1 bg-transparent text-sm text-slate-900 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] outline-none"
              />
              <kbd className="rounded-md bg-slate-100 dark:bg-[#282832] px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:text-[#64748b]">ESC</kbd>
            </div>
            <div ref={searchListRef} className="max-h-80 overflow-y-auto p-2">
              {!searchQuery ? (
                <p className="py-8 text-center text-sm text-slate-400 dark:text-[#64748b]">Type to search pages, vouchers, ledgers, parties…</p>
              ) : allItems.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400 dark:text-[#64748b]">No results found.</p>
              ) : (
                <>
                  {/* Pages section */}
                  {filteredPages.length > 0 && (
                    <div>
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Pages</p>
                      {filteredPages.slice(0, searchQuery ? filteredPages.length : 8).map((item, idx) => (
                        <button
                          key={item.to + "|" + item.label}
                          data-search-item
                          onClick={() => goTo(item)}
                          onMouseEnter={() => setSearchIndex(idx)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${idx === searchIndex ? "bg-slate-100 text-slate-900 dark:bg-[#282832] dark:text-[#f1f5f9]" : "text-slate-700 hover:bg-slate-50 dark:text-[#e2e8f0] dark:hover:bg-[#282832]"}`}
                        >
                          <span className="flex-1 text-left">{item.label}</span>
                          {item.group && <span className="text-[11px] text-slate-400 dark:text-[#475569]">{item.group}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Vouchers section */}
                  {filteredVouchers.length > 0 && (
                    <div className={filteredPages.length > 0 ? "mt-1 border-t border-slate-100 dark:border-[#1a1a24] pt-1" : ""}>
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Create Voucher</p>
                      {filteredVouchers.map((item, idx) => {
                        const pagesCount = searchQuery ? filteredPages.length : Math.min(filteredPages.length, 8);
                        const globalIdx = pagesCount + idx;
                        return (
                          <button
                            key={item.to + "|" + item.label}
                            data-search-item
                            onClick={() => goTo(item)}
                            onMouseEnter={() => setSearchIndex(globalIdx)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${globalIdx === searchIndex ? "bg-slate-100 text-slate-900 dark:bg-[#282832] dark:text-[#f1f5f9]" : "text-slate-700 hover:bg-slate-50 dark:text-[#e2e8f0] dark:hover:bg-[#282832]"}`}
                          >
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-500/10">
                              <NavIcon name="plus" className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                            </div>
                            <span className="flex-1 text-left">{item.label}</span>
                            <span className="text-[11px] text-slate-400 dark:text-[#475569]">Vouchers</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {/* Server results (ledgers, parties, stock items, vouchers) */}
                  {serverResults.length > 0 && (
                    <div className={(filteredPages.length > 0 || filteredVouchers.length > 0) ? "mt-1 border-t border-slate-100 dark:border-[#1a1a24] pt-1" : ""}>
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Results</p>
                      {serverResults.map((item, idx) => {
                        const offset = (searchQuery ? filteredPages.length : Math.min(filteredPages.length, 8)) + filteredVouchers.length + filteredTabs.length + filteredActions.length;
                        const globalIdx = offset + idx;
                        const iconMap: Record<string, string> = { ledger: "book-open", party: "users", stock_item: "cube", voucher: "receipt", account_group: "folder" };
                        const labelMap: Record<string, string> = { ledger: "Ledger", party: "Party", stock_item: "Stock Item", voucher: "Voucher", account_group: "Group" };
                        return (
                          <button
                            key={`server|${item.entity_type}|${item.id}`}
                            data-search-item
                            onClick={() => { setSearchOpen(false); navigate(item.link); }}
                            onMouseEnter={() => setSearchIndex(globalIdx)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${globalIdx === searchIndex ? "bg-slate-100 text-slate-900 dark:bg-[#282832] dark:text-[#f1f5f9]" : "text-slate-700 hover:bg-slate-50 dark:text-[#e2e8f0] dark:hover:bg-[#282832]"}`}
                          >
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-500/10">
                              <NavIcon name={iconMap[item.entity_type] || "search"} className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <span className="flex-1 text-left truncate">{item.name}</span>
                            {item.subtitle && <span className="text-[11px] text-slate-400 dark:text-[#475569] truncate max-w-[120px]">{item.subtitle}</span>}
                            <span className="text-[11px] text-slate-400 dark:text-[#475569]">{labelMap[item.entity_type] || item.entity_type}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {serverLoading && (
                    <div className={(filteredPages.length > 0 || filteredVouchers.length > 0) ? "mt-1 border-t border-slate-100 dark:border-[#1a1a24] pt-1" : ""}>
                      <p className="px-3 py-2 text-xs text-slate-400 dark:text-[#64748b]">Searching...</p>
                    </div>
                  )}
                  {/* Tabs section */}
                  {filteredTabs.length > 0 && (
                    <div className={(filteredPages.length > 0 || filteredVouchers.length > 0 || serverResults.length > 0) ? "mt-1 border-t border-slate-100 dark:border-[#1a1a24] pt-1" : ""}>
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Tabs</p>
                      {filteredTabs.map((item, idx) => {
                        const pagesCount = searchQuery ? filteredPages.length : Math.min(filteredPages.length, 8);
                        const globalIdx = pagesCount + filteredVouchers.length + idx;
                        return (
                          <button
                            key={item.to + "|" + item.label + "|" + JSON.stringify(item.params ?? {})}
                            data-search-item
                            onClick={() => goTo(item)}
                            onMouseEnter={() => setSearchIndex(globalIdx)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${globalIdx === searchIndex ? "bg-slate-100 text-slate-900 dark:bg-[#282832] dark:text-[#f1f5f9]" : "text-slate-700 hover:bg-slate-50 dark:text-[#e2e8f0] dark:hover:bg-[#282832]"}`}
                          >
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-purple-50 dark:bg-purple-500/10">
                              <NavIcon name="redirect" className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                            </div>
                            <span className="flex-1 text-left">{item.label}</span>
                            {item.group && <span className="text-[11px] text-slate-400 dark:text-[#475569]">{item.group}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {/* Actions section */}
                  {filteredActions.length > 0 && (
                    <div className={(filteredPages.length > 0 || filteredVouchers.length > 0 || serverResults.length > 0 || filteredTabs.length > 0) ? "mt-1 border-t border-slate-100 dark:border-[#1a1a24] pt-1" : ""}>
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Actions</p>
                      {filteredActions.map((item, idx) => {
                        const pagesCount = searchQuery ? filteredPages.length : Math.min(filteredPages.length, 8);
                        const globalIdx = pagesCount + filteredVouchers.length + filteredTabs.length + idx;
                        return (
                          <button
                            key={item.to + "|" + item.label}
                            data-search-item
                            onClick={() => goTo(item)}
                            onMouseEnter={() => setSearchIndex(globalIdx)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${globalIdx === searchIndex ? "bg-slate-100 text-slate-900 dark:bg-[#282832] dark:text-[#f1f5f9]" : "text-slate-700 hover:bg-slate-50 dark:text-[#e2e8f0] dark:hover:bg-[#282832]"}`}
                          >
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-500/10">
                              <NavIcon name="plus" className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                            </div>
                            <span className="flex-1 text-left">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
