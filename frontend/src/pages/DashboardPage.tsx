import { useState } from "react";
import { Outlet } from "react-router-dom";
import TopHeader from "../components/TopHeader";
import AppSidebar from "../components/AppSidebar";

interface CompanyDetails {
  id: string; name: string; gstin: string | null; legal_name: string | null;
  state_code: string | null; is_active: boolean; logo_url: string | null;
}

export default function DashboardPage() {
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);

  const handleCompanyUpdate = (details: CompanyDetails, logoVer: number) => {
    setCompanyDetails(details);
    setLogoVersion(logoVer);
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[#08080c]">
      <TopHeader onCompanyUpdate={handleCompanyUpdate} />
      <AppSidebar />
      <main className="flex-1 overflow-y-auto pt-14 lg:pl-60 pl-0 bg-white dark:bg-[#08080c]">
        <div className="px-4 py-6 lg:px-8 lg:py-8">
          <Outlet context={{ companyDetails, logoVersion }} />
        </div>
      </main>
    </div>
  );
}
