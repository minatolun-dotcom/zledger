import { useState } from "react";

import CompliancePage from "./CompliancePage";
import EInvoicePage from "./EInvoicePage";
import EwayBillPage from "./EwayBillPage";
import HsnSacPage from "./HsnSacPage";
import GstRegistrationsPage from "./GstRegistrationsPage";

type GstTab = "compliance" | "einvoice" | "eway-bill" | "hsn-sac" | "registrations";

const tabs: { key: GstTab; label: string }[] = [
  { key: "compliance", label: "Compliance" },
  { key: "einvoice", label: "E-Invoice" },
  { key: "eway-bill", label: "E-Way Bill" },
  { key: "hsn-sac", label: "HSN / SAC" },
  { key: "registrations", label: "Registrations" },
];

export default function GstPage() {
  const [tab, setTab] = useState<GstTab>("compliance");

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">GST</h1>
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-[#16161f] mt-4 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? "bg-white text-slate-900 shadow-sm dark:bg-[#282832] dark:text-[#f1f5f9]"
                : "text-slate-500 hover:text-slate-700 dark:text-[#94a3b8] dark:hover:text-[#f1f5f9]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

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
