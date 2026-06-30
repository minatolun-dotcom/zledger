import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useFyStore } from "../store/fy";
import { api } from "../api/client";

interface FinancialYear { id: string; name: string; start_date: string; end_date: string; }

interface NavItem { to: string; label: string; icon: string; end?: boolean; }

const sections: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Masters",
    items: [
      { to: "/chart-of-accounts", label: "Chart of Accounts", icon: "sitemap" },
      { to: "/masters", label: "Ledgers & Groups", icon: "folder-tree" },
      { to: "/financial-years", label: "Financial Years", icon: "calendar" },
      { to: "/inventory", label: "Inventory", icon: "package" },
    ],
  },
  {
    heading: "Transactions",
    items: [
      { to: "/vouchers", label: "Vouchers", icon: "receipt" },
      { to: "/bank-reconciliation", label: "Reconcile", icon: "bank" },
    ],
  },
  {
    heading: "Reports",
    items: [
      { to: "/daybook", label: "Day Book", icon: "book" },
      { to: "/reports", label: "Reports", icon: "chart" },
      { to: "/tds-tcs", label: "TDS / TCS", icon: "tax" },
    ],
  },
  {
    heading: "Compliance",
    items: [
      { to: "/gst", label: "GST", icon: "gst" },
      { to: "/compliance", label: "Compliance", icon: "shield" },
      { to: "/einvoice", label: "E-Invoice", icon: "file-invoice" },
      { to: "/eway-bill", label: "E-Way Bill", icon: "truck" },
    ],
  },
  {
    heading: "Administration",
    items: [
      { to: "/members", label: "Members", icon: "users" },
      { to: "/audit", label: "Audit Log", icon: "history" },
      { to: "/company-settings", label: "Settings", icon: "settings" },
    ],
  },
];

// ── SVG icons (keep bundle small — inline paths) ─────────────────────────
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
  calendar: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
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
  shield: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  ),
  "file-invoice": (
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  ),
  truck: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H17.25m-2.25-3H12m-1.5-3V7.5a1.5 1.5 0 011.5-1.5h3a1.5 1.5 0 011.5 1.5v.75M6.75 10.5h.008v.008H6.75v-.008z" />
  ),
  users: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
  ),
  history: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
  settings: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
  ),
};

function NavIcon({ name }: { name: string }) {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      {iconMap[name] ?? iconMap.dashboard}
    </svg>
  );
}

export default function DashboardPage() {
  const { user, companies, activeCompanyId, logout, setActiveCompany } = useAuthStore();
  const { activeFyId, setActiveFy } = useFyStore();
  const activeCompany = companies.find((c) => c.id === activeCompanyId);
  const [fys, setFys] = useState<FinancialYear[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<FinancialYear[]>("/coa/financial-years").then((data) => {
      setFys(data);
      if (!activeFyId && data.length > 0) {
        setActiveFy(data[data.length - 1].id);
      }
    });
  }, []);

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        {/* ── Brand ── */}
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3.5">
          <button onClick={() => navigate("/")} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none">
                <path d="M5 5h14M5 12h14M5 19h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-base font-bold tracking-tight text-slate-900">Zledger</span>
          </button>
        </div>

        {/* ── Context Switcher ── */}
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="rounded-lg bg-slate-50 p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Company</span>
              {companies.length > 1 && (
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">{companies.length}</span>
              )}
            </div>
            {companies.length > 1 ? (
              <select
                value={activeCompanyId ?? ""}
                onChange={(e) => setActiveCompany(e.target.value)}
                className="w-full rounded-md border-0 bg-white px-2 py-1 text-xs font-medium text-slate-800 shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500"
              >
                {companies.map((co) => (
                  <option key={co.id} value={co.id}>{co.name}</option>
                ))}
              </select>
            ) : (
              <p className="truncate px-1 text-xs font-semibold text-slate-800">{activeCompany?.name}</p>
            )}
            {fys.length > 0 && (
              <div className="mt-2">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Period</span>
                <select
                  value={activeFyId ?? ""}
                  onChange={(e) => setActiveFy(e.target.value || null)}
                  className="w-full rounded-md border-0 bg-white px-2 py-1 text-xs font-medium text-slate-800 shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500"
                >
                  {fys.map((fy) => (
                    <option key={fy.id} value={fy.id}>{fy.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* ── Navigation ── */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {/* Dashboard link */}
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `mb-1 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`
            }
          >
            <NavIcon name="dashboard" />
            Dashboard
          </NavLink>

          {sections.map((section) => (
            <div key={section.heading} className="mb-1 mt-4">
              <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {section.heading}
              </p>
              <div className="space-y-0.5">
                {section.items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-brand-50 text-brand-700"
                          : "text-slate-600 hover:bg-slate-50"
                      }`
                    }
                  >
                    <NavIcon name={n.icon} />
                    {n.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}

          {/* ── Superadmin section ── */}
          {user?.is_superadmin && (
            <div className="mb-1 mt-4">
              <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-purple-400">
                Admin
              </p>
              <div className="space-y-0.5">
                <NavLink
                  to="/admin/users"
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-purple-50 text-purple-700"
                        : "text-purple-600 hover:bg-purple-50"
                    }`
                  }
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                  Users
                </NavLink>
                <NavLink
                  to="/admin/companies"
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-purple-50 text-purple-700"
                        : "text-purple-600 hover:bg-purple-50"
                    }`
                  }
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                  </svg>
                  Companies
                </NavLink>
              </div>
            </div>
          )}
        </nav>

        {/* ── User footer ── */}
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate("/profile")}
              className="flex items-center gap-2 truncate text-sm font-medium text-slate-700 hover:text-brand-600"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700 uppercase">
                {user?.name?.charAt(0) ?? "?"}
              </div>
              <span className="truncate">{user?.name}</span>
            </button>
            <button
              onClick={logout}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Sign out"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
