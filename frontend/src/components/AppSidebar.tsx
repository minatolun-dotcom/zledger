import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";

/* ── Navigation groups ────────────────────────────────────────────────── */
interface NavItem { to: string; label: string; icon: string; end?: boolean; }
interface NavGroup {
  label: string; key: string; icon: string;
  items: (NavItem | { type: "subgroup"; label: string; icon: string; key: string; items: NavItem[] })[];
}

const groups: NavGroup[] = [
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
  { label: "Company", key: "company", icon: "building", items: [
    { to: "/company-settings", label: "Company Settings", icon: "settings" },
    { to: "/financial-years", label: "Financial Years", icon: "calendar" },
    { to: "/recurring-templates", label: "Recurring Templates", icon: "receipt" },
    { to: "/tally-import", label: "Import / Export", icon: "upload" },
  ]},
];

/* ── SVG Icon paths ───────────────────────────────────────────────────── */
const iconMap: Record<string, React.ReactNode> = {
  dashboard: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />,
  sitemap: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 12h-4.5M9 12l2.25 2.25M9 12l-2.25 2.25M15 12h4.5M15 12l2.25 2.25M15 12l-2.25 2.25M15 12V6.75A2.25 2.25 0 0012.75 4.5h-1.5A2.25 2.25 0 009 6.75V12m12 6v-2.25A2.25 2.25 0 0018.75 13.5h-13.5A2.25 2.25 0 003 15.75V18m18 0v2.25A2.25 2.25 0 0118.75 20.25h-13.5A2.25 2.25 0 013 18.75V18" />,
  "folder-tree": <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v15.75A2.25 2.25 0 006 21h12.75A2.25 2.25 0 0021 18.75V6.75a2.25 2.25 0 00-2.25-2.25H9.75a.75.75 0 01-.53-.22L7.47 2.53A.75.75 0 006.94 2.25H5.25A2.25 2.25 0 003 4.5v0zm6 6h3.75M12 12v.75m-2.25 3h6" />,
  package: <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-8.25-4.5L3.75 7.5m16.5 0l-8.25 4.5m8.25-4.5v9l-8.25 4.5M3.75 7.5v9l8.25 4.5M3.75 7.5l8.25 4.5" />,
  receipt: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />,
  "book-open": <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />,
  book: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />,
  chart: <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zm6.75-4.5c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zm6.75-4.5c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />,
  tax: <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />,
  gst: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v-.75A.75.75 0 014.5 3h1.5a.75.75 0 01.75.75v.75M3.75 4.5h16.5M3.75 4.5v12.75M21 4.5v12.75M12 4.5v12.75M4.5 15.75h15m-12.75 3h10.5" />,
  "shield-check": <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />,
  currency: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
  "chart-bar": <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zm6.75-4.5c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zm6.75-4.5c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />,
  building: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />,
  scale: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />,
  cog: <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124" />,
  layers: <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25-9.75 5.25-9.75-5.25 4.179-2.25" />,
  assets: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5h16.5v6H3.75v-6zm0 9h6v6h-6v-6zm9 0h6v6h-6v-6zM3.75 3v1.5m16.5-1.5V4.5m-16.5 13.5V19.5m16.5-1.5V19.5M3.75 3h16.5v1.5H3.75V3zm16.5 13.5h-16.5" />,
  calendar: <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />,
  upload: <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />,
  settings: <><path strokeLinecap="round" strokeLinejoin="round" d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>,
  search: <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />,
};

function NavIcon({ name, className = "h-4 w-4", strokeWidth = 1.5 }: { name: string; className?: string; strokeWidth?: number }) {
  return (
    <svg className={`${className} shrink-0`} fill="none" viewBox="0 0 24 24" strokeWidth={strokeWidth} stroke="currentColor">
      {iconMap[name] ?? iconMap.dashboard}
    </svg>
  );
}

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

  const isGroupActive = (group: NavGroup) =>
    group.items.some((item) => {
      if ("type" in item && item.type === "subgroup") return item.items.some((sub) => location.pathname.startsWith(sub.to));
      return location.pathname === (item as NavItem).to || location.pathname.startsWith((item as NavItem).to + "/");
    });

  const sidebarWidth = isExpanded ? "w-60" : "w-16";

  const navContent = (
    <nav className="flex-1 overflow-y-auto px-2 py-2">
      {/* Home */}
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors mb-1 ${
            isActive
              ? "bg-blue-500/15 text-blue-400 dark:bg-blue-500/15 dark:text-blue-400"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-[#cbd5e1] dark:hover:bg-[#16161f] dark:hover:text-[#f1f5f9]"
          }`
        }
      >
        <NavIcon name="dashboard" className={isExpanded ? "h-4 w-4" : "h-5 w-5"} strokeWidth={isExpanded ? 1.5 : 2} />
        {isExpanded && <span>Dashboard</span>}
        {!isExpanded && <span className="pointer-events-none absolute left-full ml-2 rounded-lg bg-[#16161f] dark:bg-[#282832] px-2.5 py-1.5 text-xs font-medium text-[#f1f5f9] whitespace-nowrap opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">Dashboard</span>}
      </NavLink>

      {groups.map((group) => {
        const groupActive = isGroupActive(group);
        const groupExpanded = expanded[group.key] !== false;
        return (
          <div key={group.key} className="mt-1">
            <button
              onClick={() => { toggleGroup(group.key); if (collapsed) setCollapsed(false); }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors group relative ${
                groupActive ? "text-white dark:text-white" : "text-slate-500 hover:text-slate-700 dark:text-white/60 dark:hover:text-[#f1f5f9]"
              }`}
            >
              <NavIcon name={group.icon} className={isExpanded ? "h-4 w-4" : "h-5 w-5"} strokeWidth={isExpanded ? 1.5 : 2} />
              {isExpanded && (
                <>
                  <span className="flex-1 text-left">{group.label}</span>
                  <svg className={`h-3 w-3 transition-transform duration-200 ${groupExpanded ? "rotate-0" : "-rotate-90"}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </>
              )}
              {!isExpanded && <span className="pointer-events-none absolute left-full ml-2 rounded-lg bg-[#16161f] dark:bg-[#282832] px-2.5 py-1.5 text-xs font-medium text-[#f1f5f9] whitespace-nowrap opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">{group.label}</span>}
            </button>

            {isExpanded && groupExpanded && (
              <div className="ml-3 border-l border-slate-100 dark:border-[#1a1a24] pl-2 mt-0.5 space-y-0.5">
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
                          <NavIcon name={item.icon} className="h-4 w-4" />
                          <span className="flex-1 text-left">{item.label}</span>
                          <svg className={`h-2.5 w-2.5 transition-transform duration-200 ${subExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </button>
                        {subExpanded && (
                          <div className="ml-3 border-l border-slate-100 dark:border-[#1a1a24] pl-2 mt-0.5 space-y-0.5">
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
                                <NavIcon name={sub.icon} className="h-3.5 w-3.5" />
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
                        `flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                          disabled ? "cursor-not-allowed text-slate-300 dark:text-[#334155]" : isActive ? "bg-blue-500/15 text-blue-400" : "text-slate-600 hover:bg-slate-50 hover:text-slate-800 dark:text-[#cbd5e1] dark:hover:bg-[#16161f] dark:hover:text-[#f1f5f9]"
                        }`
                      }
                    >
                      <NavIcon name={navItem.icon} className={`h-3.5 w-3.5 ${disabled ? "opacity-40" : ""}`} />
                      {navItem.label}
                      {disabled && (
                        <span className="ml-auto rounded-md bg-slate-100 dark:bg-[#1a1a24] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-400 dark:text-[#475569]">Soon</span>
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
        className={`hidden lg:flex flex-col fixed top-14 bottom-0 left-0 z-20 bg-white dark:bg-[#0f0f16] border-r border-slate-200 dark:border-[#1a1a24] transition-all duration-300 ${sidebarWidth}`}
      >
        {navContent}
        {/* Collapse toggle */}
        <div className="border-t border-slate-100 dark:border-[#1a1a24] p-2">
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
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`flex flex-col fixed top-14 bottom-0 left-0 z-40 w-60 bg-white dark:bg-[#0f0f16] border-r border-slate-200 dark:border-[#1a1a24] transition-transform duration-300 lg:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {navContent}
      </aside>
    </>
  );
}
