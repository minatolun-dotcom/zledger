import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import TopHeader from "../components/TopHeader";
import AppSidebar, { getSidebarCollapsed } from "../components/AppSidebar";

interface CompanyDetails {
  id: string; name: string; gstin: string | null; legal_name: string | null;
  state_code: string | null; is_active: boolean; logo_url: string | null;
}

export default function DashboardPage() {
  const location = useLocation();
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => getSidebarCollapsed());

  useEffect(() => {
    const handler = () => setSidebarCollapsed(getSidebarCollapsed());
    window.addEventListener("zledger.sidebar.change", handler);
    // Also poll every 200ms as fallback (storage events don't fire in same tab)
    const interval = setInterval(handler, 200);
    return () => { window.removeEventListener("zledger.sidebar.change", handler); clearInterval(interval); };
  }, []);

  const handleCompanyUpdate = (details: CompanyDetails, logoVer: number) => {
    setCompanyDetails(details);
    setLogoVersion(logoVer);
  };

  const sidebarWidth = sidebarCollapsed ? "lg:pl-16" : "lg:pl-64";

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[#08080c]">
      <TopHeader onCompanyUpdate={handleCompanyUpdate} />
      <AppSidebar />
      <main className={`flex-1 overflow-y-auto pt-16 pl-0 ${sidebarWidth} transition-all duration-300 bg-white dark:bg-[#08080c]`}>
        <div className="px-4 py-6 lg:px-8 lg:py-8">
          {/* Keyed by pathname → each route change fades/slides the new page in */}
          <div key={location.pathname} className="animate-pageIn">
            <Outlet context={{ companyDetails, logoVersion }} />
          </div>
        </div>
      </main>
    </div>
  );
}
