import { useEffect, useState, useRef } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useFyStore } from "../store/fy";
import { api } from "../api/client";

interface FinancialYear { id: string; name: string; start_date: string; end_date: string; }

interface CompanyDetails {
  id: string; name: string; gstin: string | null; legal_name: string | null;
  state_code: string | null; is_active: boolean;
}

interface NavItem { to: string; label: string; icon: string; end?: boolean; }

interface NavGroup {
  label: string; key: string; icon: string;
  items: (NavItem | { type: "subgroup"; label: string; icon: string; key: string; items: NavItem[] })[];
}

const groups: NavGroup[] = [
  {
    label: "Masters", key: "masters", icon: "book-open",
    items: [
      { to: "/chart-of-accounts", label: "Chart of Accounts", icon: "sitemap" },
      { to: "/masters", label: "Ledgers & Groups", icon: "folder-tree" },
      { to: "/inventory", label: "Inventory", icon: "package" },
      {
        type: "subgroup", label: "Company", icon: "building", key: "company",
        items: [
          { to: "/company-settings", label: "Company Settings", icon: "settings" },
          { to: "/financial-years", label: "Financial Years", icon: "calendar" },
        ],
      },
    ],
  },
  {
    label: "Transactions", key: "transactions", icon: "arrow-path",
    items: [
      { to: "/vouchers", label: "Vouchers", icon: "receipt" },
      { to: "#", label: "Banking", icon: "bank", end: true },
      { to: "/bank-reconciliation", label: "Reconciliation", icon: "scale" },
    ],
  },
  {
    label: "Reports", key: "reports", icon: "chart-bar",
    items: [
      { to: "/daybook", label: "Day Book", icon: "book" },
      { to: "/reports", label: "Reports", icon: "chart" },
    ],
  },
  {
    label: "Compliance", key: "compliance", icon: "shield-check",
    items: [
      { to: "/gst", label: "GST", icon: "gst" },
      { to: "/tds-tcs", label: "TDS / TCS", icon: "tax" },
      { to: "/einvoice", label: "E-Invoice", icon: "file-invoice" },
      { to: "/eway-bill", label: "E-Way Bill", icon: "truck" },
    ],
  },
];

// ── Inline SVG Icons ─────────────────────────────────────────────────────
const iconMap: Record<string, React.ReactNode> = {
  dashboard: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
  ),
  sitemap: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 12h-4.5M9 12l2.25 2.25M9 12l-2.25 2.25M15 12h4.5M15 12l2.25 2.25M15 12l-2.25 2.25M15 12V6.75A2.25 2.25 0 0012.75 4.5h-1.5A2.25 2.25 0 009 6.75V12m12 6v-2.25A2.25 2.25 0 0018.75 13.5h-13.5A2.25 2.25 0 003 15.75V18m18 0v2.25A2.25 2.25 0 0118.75 20.25h-13.5A2.25 2.25 0 013 18.75V18" />
  ),
  "folder-tree": (
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v15.75A2.25 2.25 0 006 21h12.75A2.25 2.25 0 0021 18.75V6.75a2.25 2.25 0 00-2.25-2.25H9.75a.75.75 0 01-.53-.22L7.47 2.53A.75.75 0 006.94 2.25H5.25A2.25 2.25 0 003 4.5v0zm6 6h3.75M12 12v.75m-2.25 3h6" />
  ),
  package: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-8.25-4.5L3.75 7.5m16.5 0l-8.25 4.5m8.25-4.5v9l-8.25 4.5M3.75 7.5v9l8.25 4.5M3.75 7.5l8.25 4.5" />
  ),
  receipt: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
  ),
  bank: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
  ),
  book: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  ),
  chart: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zm6.75-4.5c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zm6.75-4.5c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
  ),
  tax: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
  ),
  gst: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v-.75A.75.75 0 014.5 3h1.5a.75.75 0 01.75.75v.75M3.75 4.5h16.5M3.75 4.5v12.75M21 4.5v12.75M12 4.5v12.75M4.5 15.75h15m-12.75 3h10.5" />
  ),
  "file-invoice": (
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  ),
  truck: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H17.25m-2.25-3H12m-1.5-3V7.5a1.5 1.5 0 011.5-1.5h3a1.5 1.5 0 011.5 1.5v.75M6.75 10.5h.008v.008H6.75v-.008z" />
  ),
  "arrow-path": (
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
  ),
  "chart-bar": (
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zm6.75-4.5c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zm6.75-4.5c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
  ),
  "shield-check": (
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  ),
  building: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
  ),
  scale: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
  ),
  search: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  ),
  "chevron-down": (
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  ),
  user: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  ),
  "arrow-right-on-rectangle": (
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
  ),
  "arrow-left-on-rectangle": (
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
  ),
  "book-open": (
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  ),
  calendar: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
  ),
  "chevron-right": (
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  ),
  settings: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
  ),
};

function NavIcon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  return (
    <svg className={`${className} shrink-0`} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      {iconMap[name] ?? iconMap.dashboard}
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────
const EXPAND_KEY = "zledger.sidebar.expanded";
function loadExpanded(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(EXPAND_KEY) || "{}"); } catch { return {}; }
}
function saveExpanded(state: Record<string, boolean>) {
  localStorage.setItem(EXPAND_KEY, JSON.stringify(state));
}

const SUB_KEY = "zledger.sidebar.subgroups";
function loadSubgroups(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(SUB_KEY) || "{}"); } catch { return {}; }
}
function saveSubgroups(state: Record<string, boolean>) {
  localStorage.setItem(SUB_KEY, JSON.stringify(state));
}

export default function DashboardPage() {
  const { user, companies, activeCompanyId, logout } = useAuthStore();
  const { activeFyId, setActiveFy } = useFyStore();
  const activeCompany = companies.find((c) => c.id === activeCompanyId);
  const [fys, setFys] = useState<FinancialYear[]>([]);
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(loadExpanded);
  const [subgroups, setSubgroups] = useState<Record<string, boolean>>(loadSubgroups);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Load FYs
  useEffect(() => {
    api.get<FinancialYear[]>("/coa/financial-years").then((data) => {
      setFys(data);
      if (!activeFyId && data.length > 0) {
        setActiveFy(data[data.length - 1].id);
      }
    });
  }, []);

  // Load company details (for GSTIN etc.)
  useEffect(() => {
    if (!activeCompanyId) return;
    api.get<CompanyDetails>(`/companies/${activeCompanyId}`)
      .then(setCompanyDetails)
      .catch(() => {});
  }, [activeCompanyId]);

  // Click outside to close profile menu
  useEffect(() => {
    if (!profileOpen) return;
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileOpen]);

  const toggleGroup = (key: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveExpanded(next);
      return next;
    });
  };

  const toggleSubgroup = (key: string) => {
    setSubgroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveSubgroups(next);
      return next;
    });
  };

  const go = (path: string) => {
    navigate(path);
    setProfileOpen(false);
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        {/* ── Global Search ── */}
        <div className="border-b border-slate-100 px-4 py-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-400">
            <NavIcon name="search" className="h-3.5 w-3.5" />
            <span className="flex-1 text-xs font-medium">Search (Ctrl+K)</span>
            <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[9px] font-medium text-slate-400">/</kbd>
          </div>
        </div>

        {/* ── Brand ── */}
        <div className="flex items-center border-b border-slate-100 px-4 py-2.5">
          <button onClick={() => navigate("/")} className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                <path d="M5 5h14M5 12h14M5 19h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-sm font-bold tracking-tight text-slate-900">Zledger</span>
          </button>
        </div>

        {/* ── Company Card ── */}
        <div className="border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/50 px-4 py-2.5">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <NavIcon name="building" className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{activeCompany?.name ?? "Select Company"}</p>
              <p className="truncate text-[10px] font-medium text-slate-400">
                {companyDetails?.gstin
                  ? `GSTIN ${companyDetails.gstin}`
                  : companyDetails?.legal_name
                    ? companyDetails.legal_name
                    : "No GST registered"}
              </p>
            </div>
          </div>
          {fys.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="whitespace-nowrap text-[10px] font-medium text-slate-400">FY</span>
              <select
                value={activeFyId ?? ""}
                onChange={(e) => setActiveFy(e.target.value || null)}
                className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
              >
                {fys.map((fy) => (
                  <option key={fy.id} value={fy.id}>{fy.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ── Navigation ── */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {/* Dashboard */}
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
              }`
            }
          >
            <NavIcon name="dashboard" />
            Dashboard
          </NavLink>

          {/* Grouped sections */}
          {groups.map((group) => {
            const isExpanded = expanded[group.key] !== false; // default open
            const isAnyActive = group.items.some((item) => {
              if ("to" in item) return location.pathname.startsWith(item.to);
              if (item.type === "subgroup") return item.items.some((sub) => location.pathname.startsWith(sub.to));
              return false;
            });
            return (
              <div key={group.key} className="mt-0.5">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    isAnyActive
                      ? "text-slate-700"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <NavIcon name={group.icon} className="h-3.5 w-3.5" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <svg
                    className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-0" : "-rotate-90"}`}
                    fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {/* Group items */}
                {isExpanded && (
                  <div className="ml-1 mt-0.5 space-y-0.5">
                    {group.items.map((item) => {
                      if ("type" in item && item.type === "subgroup") {
                        const subExpanded = subgroups[item.key] !== false;
                        const subActive = item.items.some((s) => location.pathname.startsWith(s.to));
                        return (
                          <div key={item.key}>
                            <button
                              onClick={() => toggleSubgroup(item.key)}
                              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                                subActive
                                  ? "text-brand-700"
                                  : "text-slate-500 hover:text-slate-700"
                              }`}
                            >
                              <NavIcon name={item.icon} className="h-4 w-4" />
                              <span className="flex-1 text-left">{item.label}</span>
                              <svg
                                className={`h-2.5 w-2.5 transition-transform ${subExpanded ? "rotate-90" : ""}`}
                                fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                              </svg>
                            </button>
                            {subExpanded && (
                              <div className="ml-3 border-l border-slate-100 pl-2">
                                {item.items.map((sub) => (
                                  <NavLink
                                    key={sub.to}
                                    to={sub.to}
                                    end={sub.end}
                                    className={({ isActive }) =>
                                      `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                                        isActive
                                          ? "bg-brand-50 text-brand-700"
                                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
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
                      const isDisabled = navItem.to === "#";
                      return (
                        <NavLink
                          key={navItem.to}
                          to={navItem.to}
                          end={navItem.end}
                          onClick={isDisabled ? (e) => e.preventDefault() : undefined}
                          className={({ isActive }) =>
                            `flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                              isDisabled
                                ? "cursor-not-allowed text-slate-300"
                                : isActive
                                  ? "bg-brand-50 text-brand-700"
                                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                            }`
                          }
                        >
                          <NavIcon name={navItem.icon} className={`h-4 w-4 ${isDisabled ? "opacity-50" : ""}`} />
                          {navItem.label}
                          {isDisabled && (
                            <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase text-slate-400">Soon</span>
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

        {/* ── User Profile ── */}
        <div ref={profileRef} className="relative border-t border-slate-100">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700 uppercase">
              {user?.name?.charAt(0) ?? "?"}
            </div>
            <div className="min-w-0 flex-1 truncate text-left">
              <p className="truncate text-sm font-medium text-slate-700">{user?.name}</p>
              <p className="truncate text-[10px] font-medium text-slate-400">{user?.email}</p>
            </div>
            <svg className={`h-3.5 w-3.5 text-slate-400 transition-transform ${profileOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {profileOpen && (
            <div className="absolute bottom-full left-0 right-0 z-50 mb-1 rounded-lg border border-slate-200 bg-white shadow-lg">
              <div className="p-1.5">
                {/* My Profile */}
                <button onClick={() => go("/profile")} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800">
                  <NavIcon name="user" className="h-4 w-4" />
                  My Profile
                </button>

                {/* Preferences (placeholder) */}
                <button className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-slate-400 cursor-not-allowed">
                  <NavIcon name="settings" className="h-4 w-4 opacity-50" />
                  <span>Preferences</span>
                  <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase text-slate-400">Soon</span>
                </button>

                {/* Switch Company */}
                {companies.length > 1 && (
                  <button onClick={() => go("/companies")} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800">
                    <NavIcon name="arrow-left-on-rectangle" className="h-4 w-4" />
                    Switch Company
                  </button>
                )}

                <div className="my-1 border-t border-slate-100" />

                {/* Members */}
                <button onClick={() => go("/members")} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                  Members
                </button>

                {/* Settings */}
                <button onClick={() => go("/company-settings")} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800">
                  <NavIcon name="settings" className="h-4 w-4" />
                  Settings
                </button>

                {/* Audit Log */}
                <button onClick={() => go("/audit")} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Audit Log
                </button>

                {/* Super Admin section */}
                {user?.is_superadmin && (
                  <>
                    <div className="my-1 border-t border-slate-100" />
                    <button onClick={() => go("/admin/users")} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50">
                      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                      Users
                    </button>
                    <button onClick={() => go("/admin/companies")} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50">
                      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                      </svg>
                      Companies
                    </button>
                  </>
                )}

                <div className="my-1 border-t border-slate-100" />

                {/* Sign Out */}
                <button onClick={logout} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                  <NavIcon name="arrow-right-on-rectangle" className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
