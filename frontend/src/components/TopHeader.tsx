import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useFyStore } from "../store/fy";
import { useThemeStore } from "../store/theme";
import { api } from "../api/client";
import Select from "./Select";
import NotificationBell from "./NotificationBell";

interface FinancialYear { id: string; name: string; start_date: string; end_date: string; }
interface CompanyDetails { id: string; name: string; gstin: string | null; legal_name: string | null; state_code: string | null; is_active: boolean; logo_url: string | null; }

/* ── Nav items used for search index (same as sidebar) ────────────────── */
interface NavItem { to: string; label: string; icon: string; end?: boolean; }
interface NavGroup { label: string; key: string; icon: string; items: (NavItem | { type: "subgroup"; label: string; icon: string; key: string; items: NavItem[] })[]; }

const navGroups: NavGroup[] = [
  { label: "Accounting", key: "accounting", icon: "book-open", items: [
    { to: "/chart-of-accounts", label: "Chart of Accounts", icon: "sitemap" },
    { to: "/vouchers", label: "Vouchers", icon: "receipt" },
    { to: "/fixed-assets", label: "Fixed Assets", icon: "assets" },
    { to: "/bank-reconciliation", label: "Reconciliation", icon: "scale" },
  ]},
  { label: "Inventory", key: "inventory", icon: "package", items: [
    { to: "/inventory", label: "Stock & Inventory", icon: "package" },
    { to: "/manufacturing", label: "Manufacturing", icon: "cog" },
    { to: "/batches", label: "Batches", icon: "layers" },
    { to: "/batch-trace", label: "Batch Trace", icon: "search" },
  ]},
  { label: "GST & Tax", key: "gst-tax", icon: "shield-check", items: [
    { to: "/gst", label: "GST", icon: "gst" },
    { to: "/tds-tcs", label: "TDS / TCS", icon: "tax" },
  ]},
  { label: "Reports", key: "reports", icon: "chart-bar", items: [
    { to: "/daybook", label: "Day Book", icon: "book" },
    { to: "/reports", label: "Financial Reports", icon: "chart" },
    { to: "/payments", label: "Payments & Receivables", icon: "currency" },
  ]},
  { label: "Settings", key: "company", icon: "building", items: [
    { to: "/company-settings", label: "Company Settings", icon: "settings" },
    { to: "/recurring-templates", label: "Recurring Templates", icon: "receipt" },
    { to: "/tally-import", label: "Import / Export", icon: "upload" },
  ]},
];

/* ── Tiny icon helper (only search icon needed in header) ─────────────── */
const searchPath = <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />;

export interface TopHeaderProps {
  onCompanyUpdate: (details: CompanyDetails, logoVer: number) => void;
}

export default function TopHeader({ onCompanyUpdate }: TopHeaderProps) {
  const { user, companies, activeCompanyId, logout } = useAuthStore();
  const { activeFyId, setActiveFy } = useFyStore();
  const { theme, setTheme } = useThemeStore();
  const activeCompany = companies.find((c) => c.id === activeCompanyId);
  const [fys, setFys] = useState<FinancialYear[]>([]);
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [dataResults, setDataResults] = useState<{ entity_type: string; id: string; name: string; subtitle: string; link: string }[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
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

  /* ── Profile dropdown close ── */
  useEffect(() => {
    if (!profileOpen) return;
    const handleClick = (e: MouseEvent) => { if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false); };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setProfileOpen(false); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("mousedown", handleClick); document.removeEventListener("keydown", handleKey); };
  }, [profileOpen]);

  /* ── Search index builder ── */
  const buildSearchItems = () => {
    const seen = new Set<string>();
    const items: { label: string; to: string; icon: string; group: string }[] = [];
    const add = (label: string, to: string, icon: string, group: string) => {
      const key = `${to}|${label}`;
      if (!seen.has(key)) { seen.add(key); items.push({ label, to, icon, group }); }
    };
    add("Dashboard", "/", "dashboard", "");
    for (const g of navGroups) {
      for (const item of g.items) {
        if ("type" in item && item.type === "subgroup") {
          for (const sub of item.items) add(sub.label, sub.to, sub.icon, `${g.label} / ${item.label}`);
        } else {
          const nav = item as NavItem;
          if (nav.to !== "#") add(nav.label, nav.to, nav.icon, g.label);
        }
      }
    }
    add("My Profile", "/profile", "user", "Profile");
    add("Members", "/members", "user", "Settings");
    add("Audit Log", "/audit", "user", "Settings");
    if (companies.length > 1) add("Switch Company", "/companies", "arrow-left-on-rectangle", "Profile");
    if (user?.is_superadmin) {
      add("Admin Users", "/admin/users", "user", "Admin");
      add("Admin Companies", "/admin/companies", "building", "Admin");
      add("Admin Backups", "/admin/backups", "document", "Admin");
      add("Admin Activity", "/admin/activity", "activity", "Admin");
    }
    return items;
  };

  /* ── Keyboard shortcut ── */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "k")) {
        if (!searchOpen) { e.preventDefault(); setSearchOpen(true); }
      }
      if (e.key === "Escape" && searchOpen) setSearchOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [searchOpen]);

  useEffect(() => {
    if (searchOpen) { setSearchQuery(""); setSearchIndex(0); setDataResults([]); setTimeout(() => searchInputRef.current?.focus(), 100); }
  }, [searchOpen]);

  /* ── Data search ── */
  const fetchData = useCallback(async (query: string) => {
    if (query.length < 2) { setDataResults([]); return; }
    setDataLoading(true);
    try {
      const data = await api.get<{ results: typeof dataResults }>(`/search?q=${encodeURIComponent(query)}&limit=20`);
      setDataResults(data.results || []);
    } catch { setDataResults([]); } finally { setDataLoading(false); }
  }, []);

  useEffect(() => {
    if (!searchOpen || searchQuery.length < 2) { setDataResults([]); return; }
    const timer = setTimeout(() => fetchData(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen, fetchData]);

  const go = (path: string) => { navigate(path); setProfileOpen(false); };

  /* ── Icon for nav items in search results ── */
  const navIconMap: Record<string, React.ReactNode> = {
    dashboard: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />,
    sitemap: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 12h-4.5M9 12l2.25 2.25M9 12l-2.25 2.25M15 12h4.5M15 12l2.25 2.25M15 12l-2.25 2.25" />,
    receipt: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08" />,
    package: <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-8.25-4.5L3.75 7.5m16.5 0l-8.25 4.5m8.25-4.5v9l-8.25 4.5M3.75 7.5v9l8.25 4.5M3.75 7.5l8.25 4.5" />,
    cog: <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124" />,
    layers: <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75" />,
    search: searchPath,
    gst: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75" />,
    tax: <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5" />,
    book: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292" />,
    chart: <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25" />,
    currency: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182" />,
    settings: <><path strokeLinecap="round" strokeLinejoin="round" d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>,
    calendar: <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />,
    upload: <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />,
    user: <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />,
    "arrow-left-on-rectangle": <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />,
    building: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18" />,
    assets: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5h16.5v6H3.75v-6zm0 9h6v6h-6v-6zm9 0h6v6h-6v-6z" />,
    scale: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21" />,
    "book-open": <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292" />,
    "chart-bar": <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75" />,
    "shield-check": <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622" />,
  };

  const NavIcon = ({ name, className = "h-4 w-4" }: { name: string; className?: string }) => (
    <svg className={`${className} shrink-0`} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      {navIconMap[name] ?? navIconMap.dashboard}
    </svg>
  );

  return (
    <>
      {/* ── Header Bar ── */}
      <header className="fixed top-0 left-0 right-0 z-30 flex h-14 items-center border-b border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#0f0f16] px-4">
        {/* Logo — left */}
        <button onClick={() => navigate("/")} className="flex items-center gap-2 shrink-0">
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
            <span className="text-[13px] font-medium">Search</span>
            <kbd className="ml-auto rounded-md bg-white dark:bg-[#282832] border border-slate-200 dark:border-[#2a2a35] px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:text-[#64748b]">/</kbd>
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
            <span className="text-[13px] font-semibold text-slate-800 dark:text-[#f1f5f9] whitespace-nowrap">{activeCompany?.name ?? "—"}</span>
            {fys.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">FY</span>
                <Select
                  value={activeFyId ?? ""}
                  onChange={(v) => setActiveFy(v || null)}
                  options={fys.map((fy) => ({ value: fy.id, label: fy.name }))}
                  className="w-[160px]"
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
                placeholder="Search pages..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchIndex(0); }}
                onKeyDown={(e) => {
                  const items = searchListRef.current;
                  if (!items) return;
                  const buttons = items.querySelectorAll<HTMLButtonElement>("[data-search-item]");
                  if (e.key === "ArrowDown") { e.preventDefault(); setSearchIndex((i) => { const next = Math.min(i + 1, buttons.length - 1); buttons[next]?.scrollIntoView({ block: "nearest" }); return next; }); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setSearchIndex((i) => { const prev = Math.max(i - 1, 0); buttons[prev]?.scrollIntoView({ block: "nearest" }); return prev; }); }
                  else if (e.key === "Enter") { e.preventDefault(); buttons[searchIndex]?.click(); }
                }}
                className="flex-1 bg-transparent text-sm text-slate-900 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] outline-none"
              />
              <kbd className="rounded-md bg-slate-100 dark:bg-[#282832] px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:text-[#64748b]">ESC</kbd>
            </div>
            <div ref={searchListRef} className="max-h-80 overflow-y-auto p-2">
              {(() => {
                const navItems = buildSearchItems();
                const filtered = searchQuery ? navItems.filter((i) => i.label.toLowerCase().includes(searchQuery.toLowerCase())) : navItems;
                const hasDataResults = dataResults.length > 0;
                const hasNavResults = filtered.length > 0;
                if (!hasDataResults && !hasNavResults) return <p className="py-8 text-center text-sm text-slate-400 dark:text-[#64748b]">No results found.</p>;
                return (
                  <>
                    {hasNavResults && (
                      <div>
                        {!hasDataResults && filtered.map((item, idx) => (
                          <button
                            key={item.to + "|" + item.label}
                            data-search-item
                            onClick={() => { navigate(item.to); setSearchOpen(false); }}
                            onMouseEnter={() => setSearchIndex(idx)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${idx === searchIndex ? "bg-slate-100 text-slate-900 dark:bg-[#282832] dark:text-[#f1f5f9]" : "text-slate-700 hover:bg-slate-50 dark:text-[#e2e8f0] dark:hover:bg-[#282832]"}`}
                          >
                            <NavIcon name={item.icon} className="h-4 w-4 shrink-0 text-slate-400 dark:text-[#64748b]" />
                            <span className="flex-1 text-left">{item.label}</span>
                            {item.group && <span className="text-[11px] text-slate-400 dark:text-[#475569]">{item.group}</span>}
                          </button>
                        ))}
                        {hasDataResults && <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Pages</p>}
                        {hasDataResults && filtered.slice(0, 5).map((item, idx) => (
                          <button
                            key={item.to + "|" + item.label}
                            data-search-item
                            onClick={() => { navigate(item.to); setSearchOpen(false); }}
                            onMouseEnter={() => setSearchIndex(idx)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${idx === searchIndex ? "bg-slate-100 text-slate-900 dark:bg-[#282832] dark:text-[#f1f5f9]" : "text-slate-700 hover:bg-slate-50 dark:text-[#e2e8f0] dark:hover:bg-[#282832]"}`}
                          >
                            <NavIcon name={item.icon} className="h-4 w-4 shrink-0 text-slate-400 dark:text-[#64748b]" />
                            <span className="flex-1 text-left">{item.label}</span>
                            {item.group && <span className="text-[11px] text-slate-400 dark:text-[#475569]">{item.group}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {hasDataResults && (
                      <div>
                        <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Data</p>
                        {dataLoading && <p className="px-3 py-2 text-xs text-slate-400 dark:text-[#64748b]">Searching...</p>}
                        {dataResults.map((item, idx) => {
                          const globalIdx = (hasNavResults ? Math.min(filtered.length, 5) : 0) + idx;
                          const iconMap: Record<string, string> = { ledger: "sitemap", party: "user", stock_item: "package", account_group: "folder-tree", voucher: "receipt" };
                          return (
                            <button
                              key={item.id}
                              data-search-item
                              onClick={() => { navigate(item.link); setSearchOpen(false); }}
                              onMouseEnter={() => setSearchIndex(globalIdx)}
                              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${globalIdx === searchIndex ? "bg-slate-100 text-slate-900 dark:bg-[#282832] dark:text-[#f1f5f9]" : "text-slate-700 hover:bg-slate-50 dark:text-[#e2e8f0] dark:hover:bg-[#282832]"}`}
                            >
                              <NavIcon name={iconMap[item.entity_type] || "search"} className="h-4 w-4 shrink-0 text-slate-400 dark:text-[#64748b]" />
                              <span className="flex-1 text-left truncate">{item.name}</span>
                              <span className="text-[11px] text-slate-400 dark:text-[#475569] shrink-0">{item.subtitle}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
