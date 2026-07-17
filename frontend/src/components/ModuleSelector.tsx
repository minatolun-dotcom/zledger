import { MODULES, ALWAYS_ON, COMPANY_TYPES } from "../config/modules";
import Select from "./Select";

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

  const selectedType = COMPANY_TYPES.find((t) => t.id === companyType);

  return (
    <div className="space-y-4">
      {showCompanyType && (
        <div>
          <Select
            value={companyType}
            onChange={handleTypeChange}
            options={[
              { value: "", label: "Select company type (optional)" },
              ...COMPANY_TYPES.map((ct) => ({ value: ct.id, label: ct.label })),
            ]}
            label="Company Type"
          />
          {selectedType && (
            <p className="mt-1 text-xs text-slate-400 dark:text-[#64748b]">{selectedType.description}</p>
          )}
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Modules</h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-[#64748b]">Choose which features this company needs.</p>
        <div className="mt-3 space-y-2">
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
                className={`w-full flex items-center gap-2.5 rounded-full border px-3.5 py-2 text-sm transition-all ${
                  isOn
                    ? "border-blue-500/60 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-[#282832] dark:bg-[#0f0f16] dark:hover:border-[#383848]"
                } ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
              >
                {/* Circular checkbox */}
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  isOn
                    ? "border-blue-500 bg-blue-500 dark:border-blue-400 dark:bg-blue-400"
                    : "border-slate-300 dark:border-[#383848]"
                }`}>
                  {isOn && (
                    <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                      <circle cx="6" cy="6" r="2.5" fill="currentColor" />
                    </svg>
                  )}
                </span>
                <span className={`font-medium ${isOn ? "text-blue-700 dark:text-blue-300" : "text-slate-600 dark:text-[#cbd5e1]"}`}>
                  {m.label}
                </span>
                {isOn && (
                  <span className="text-[10px] text-slate-400 dark:text-[#64748b]">
                    {m.description}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
