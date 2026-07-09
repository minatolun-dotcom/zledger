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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">GST</h1>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
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
