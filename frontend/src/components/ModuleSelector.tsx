import { MODULES, ALWAYS_ON, COMPANY_TYPES } from "../config/modules";

interface ModuleSelectorProps {
  selectedModules: string[];
  onModulesChange: (modules: string[]) => void;
  companyType: string;
  onCompanyTypeChange: (type: string) => void;
  showCompanyType?: boolean;
}

export default function ModuleSelector({
  selectedModules,
  onModulesChange,
  companyType,
  onCompanyTypeChange,
  showCompanyType = true,
}: ModuleSelectorProps) {
  const handleTypeChange = (typeId: string) => {
    onCompanyTypeChange(typeId);
    const ct = COMPANY_TYPES.find((t) => t.id === typeId);
    if (ct) {
      onModulesChange(ct.defaultModules);
    }
  };

  return (
    <div className="space-y-4">
      {showCompanyType && (
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Company Type</label>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-[#64748b]">Select a type to auto-pick modules, then customise below.</p>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {COMPANY_TYPES.map((ct) => (
              <button
                key={ct.id}
                type="button"
                onClick={() => handleTypeChange(ct.id)}
                className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  companyType === ct.id
                    ? "border-blue-500/50 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-[#282832] dark:bg-[#0f0f16] dark:hover:border-[#383848]"
                }`}
              >
                <span className={`block font-medium ${companyType === ct.id ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-[#cbd5e1]"}`}>
                  {ct.label}
                </span>
                <span className="block text-[11px] text-slate-400 dark:text-[#64748b] mt-0.5">
                  {ct.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Modules</h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-[#64748b]">Choose which features this company needs.</p>
        <div className="mt-3 space-y-1.5">
          {MODULES.map((m) => {
            const isOn = selectedModules.includes(m.id);
            const locked = ALWAYS_ON.includes(m.id);
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
                className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                  isOn
                    ? "border-blue-500/50 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-[#282832] dark:bg-[#0f0f16] dark:hover:border-[#383848]"
                } ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="min-w-0 flex-1">
                  <span className={`block font-medium ${isOn ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-[#cbd5e1]"}`}>
                    {m.label}
                  </span>
                  <span className="block text-xs text-slate-400 dark:text-[#64748b] mt-0.5">
                    {m.description}
                  </span>
                </div>
                <div className={`shrink-0 h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
                  isOn
                    ? "border-blue-500 bg-blue-500 dark:border-blue-400 dark:bg-blue-400"
                    : "border-slate-300 dark:border-[#383848]"
                }`}>
                  {isOn && (
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
