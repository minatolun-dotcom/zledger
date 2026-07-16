import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import CompliancePage from "./CompliancePage";
import EInvoicePage from "./EInvoicePage";
import EwayBillPage from "./EwayBillPage";
import HsnSacPage from "./HsnSacPage";
import GstRegistrationsPage from "./GstRegistrationsPage";
import Tabs from "../components/Tabs";

type GstTab = "compliance" | "einvoice" | "eway-bill" | "hsn-sac" | "registrations";

const tabs: { key: GstTab; label: string }[] = [
  { key: "compliance", label: "Compliance" },
  { key: "einvoice", label: "E-Invoice" },
  { key: "eway-bill", label: "E-Way Bill" },
  { key: "hsn-sac", label: "HSN / SAC" },
  { key: "registrations", label: "Registrations" },
];

export default function GstPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<GstTab>("compliance");

  // Auto-open tab from command palette (?tab=compliance|einvoice|eway-bill|hsn-sac|registrations)
  useEffect(() => {
    const paramTab = searchParams.get("tab") as GstTab | null;
    if (!paramTab) return;
    setSearchParams({}, { replace: true });
    setTab(paramTab);
  }, [searchParams]);

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">GST</h1>
      <Tabs
        tabs={tabs}
        active={tab}
        onChange={(k) => setTab(k as GstTab)}
        className="mt-4 mb-6 overflow-x-auto"
      />

      {/* Tab content */}
      <div>
        {tab === "compliance" && <CompliancePage />}
        {tab === "einvoice" && <EInvoicePage />}
        {tab === "eway-bill" && <EwayBillPage />}
        {tab === "hsn-sac" && <HsnSacPage />}
        {tab === "registrations" && <GstRegistrationsPage />}
      </div>
    </div>
  );
}
