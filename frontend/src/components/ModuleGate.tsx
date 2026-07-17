import { useModules } from "../config/modules";
import NavIcon from "./NavIcon";

/** Map of routes to the module IDs that gate them. */
export const ROUTE_MODULES: Record<string, string> = {
  "/fixed-assets": "fixed_assets",
  "/bank-reconciliation": "bank_reconciliation",
  "/inventory": "inventory",
  "/manufacturing": "manufacturing",
  "/batch-trace": "batches",
  "/batches": "batches",
  "/gst": "gst",
  "/tds-tcs": "tds_tcs",
  "/payments": "payments",
  "/tally-import": "import_export",
};

export default function ModuleGate({ route, children }: { route: string; children: React.ReactNode }) {
  const enabledModules = useModules();
  const moduleId = ROUTE_MODULES[route];
  if (moduleId && !enabledModules.includes(moduleId)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-[#282832] mb-4">
          <NavIcon name="shield-check" className="h-8 w-8 text-slate-400 dark:text-[#64748b]" />
        </div>
        <h2 className="text-lg font-semibold text-slate-700 dark:text-[#f1f5f9]">Module Not Enabled</h2>
        <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-[#64748b]">
          This feature is not enabled for the current company. Enable it in <span className="font-medium text-slate-600 dark:text-[#cbd5e1]">Company Settings → Modules</span>.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
