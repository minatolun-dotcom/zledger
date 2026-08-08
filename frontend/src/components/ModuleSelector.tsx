import { MODULES, ALWAYS_ON, COMPANY_TYPES } from "../config/modules";
import Select from "./Select";
import NavIcon from "./NavIcon";

interface ModuleSelectorProps {
  selectedModules: string[];
  onModulesChange: (modules: string[]) => void;
  companyType: string;
  onCompanyTypeChange: (type: string) => void;
  showCompanyType?: boolean;
  /** Hide the built-in "Modules" heading (when the parent renders its own section header). */
  showHeading?: boolean;
}

/**
 * Module picker for company creation/onboarding.
 *
 * Compact layout: company-type preset and Select all / Clear live in a single
 * header row; modules render as an icon-card grid (2 cols, 3 on xl) with lock
 * badges for always-enabled modules.
 */
export default function ModuleSelector({
  selectedModules,
  onModulesChange,
  companyType,
  onCompanyTypeChange,
  showCompanyType = true,
  showHeading = true,
}: ModuleSelectorProps) {
  const handleTypeChange = (typeId: string) => {
    onCompanyTypeChange(typeId);
    const ct = COMPANY_TYPES.find((t) => t.id === typeId);
    if (ct) {
      onModulesChange(ct.defaultModules);
    }
  };

  const selectedType = COMPANY_TYPES.find((t) => t.id === companyType);
  const lockedSet = new Set(ALWAYS_ON);
  const allEnabled = MODULES.every((m) => selectedModules.includes(m.id));
  const enabledCount = MODULES.filter((m) => selectedModules.includes(m.id)).length;

  return (
    <div className="space-y-2.5">
      {/* Header row: optional heading + company-type preset + count + select-all */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {showHeading && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Modules</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-[#64748b]">
              Choose which features this company needs.
            </p>
          </div>
        )}

        <div className={`flex flex-wrap items-center gap-2 ${showHeading ? "" : "ml-auto"}`}>
          {showCompanyType && (
            <div title={selectedType?.description ?? ""} className={showHeading ? "" : "w-full sm:w-auto"}>
              <Select
                value={companyType}
                onChange={handleTypeChange}
                options={[
                  { value: "", label: "Company type (optional)" },
                  ...COMPANY_TYPES.map((ct) => ({ value: ct.id, label: ct.label })),
                ]}
                className="w-full sm:w-52"
                placeholder="Company type (optional)"
              />
            </div>
          )}
          <span className="hidden whitespace-nowrap text-[11px] font-medium text-slate-400 sm:inline dark:text-[#64748b]">
            {enabledCount}/{MODULES.length} enabled
          </span>
          <button
            type="button"
            onClick={() => onModulesChange(allEnabled ? [...ALWAYS_ON] : MODULES.map((m) => m.id))}
            className="whitespace-nowrap rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-600 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:border-blue-500/40 dark:hover:text-blue-400"
          >
            {allEnabled ? "Clear" : "Select all"}
          </button>
        </div>
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-3">
        {MODULES.map((m) => {
          const isOn = selectedModules.includes(m.id);
          const locked = lockedSet.has(m.id);
          return (
            <button
              key={m.id}
              type="button"
              disabled={locked}
              onClick={() => {
                if (locked) return;
                onModulesChange(
                  isOn
                    ? selectedModules.filter((id) => id !== m.id)
                    : [...selectedModules, m.id]
                );
              }}
              aria-pressed={isOn}
              className={`group flex items-center gap-2 rounded-lg border p-2 text-left transition-all ${
                isOn
                  ? "border-blue-500/70 bg-blue-50/70 shadow-sm dark:border-blue-500/40 dark:bg-blue-500/10"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm dark:border-[#282832] dark:bg-[#0f0f16] dark:hover:border-[#383848]"
              } ${locked ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
                  isOn
                    ? "bg-blue-500 text-white shadow-sm shadow-blue-500/30 dark:bg-blue-500 dark:text-white"
                    : "bg-slate-100 text-slate-500 group-hover:text-slate-600 dark:bg-[#1a1a24] dark:text-[#64748b] dark:group-hover:text-[#cbd5e1]"
                }`}
              >
                <NavIcon name={m.icon} className="h-4 w-4" strokeWidth={1.6} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={`truncate text-[13px] font-semibold leading-tight ${isOn ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-[#cbd5e1]"}`}>
                    {m.label}
                  </span>
                  {locked && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-[#282832] dark:text-[#94a3b8]">
                      <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                      always on
                    </span>
                  )}
                </span>
                <span className="block truncate text-[11px] leading-snug text-slate-500 dark:text-[#64748b]">
                  {m.description}
                </span>
              </span>

              {/* Check indicator */}
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  isOn
                    ? "border-blue-500 bg-blue-500 dark:border-blue-400 dark:bg-blue-400"
                    : "border-slate-300 dark:border-[#383848]"
                }`}
              >
                {isOn && (
                  <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6.5L5 9l4.5-5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
