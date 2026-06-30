import { useState, useEffect } from "react";
import { api } from "../../../../api/client";
import type { EntityKey } from "./configs";
import { ENTITY_CONFIGS } from "./configs";

interface QuickCreateModalProps {
  entityKey: EntityKey;
  onClose: () => void;
  onCreated: (item: any) => void;
}

type FormState = Record<string, string | number>;

function getDefaultForm(entityKey: EntityKey): FormState {
  const config = ENTITY_CONFIGS[entityKey];
  const form: FormState = {};
  for (const field of config.fields) {
    form[field.name] = field.type === "number" ? 0 : "";
  }
  return form;
}

export default function QuickCreateModal({ entityKey, onClose, onCreated }: QuickCreateModalProps) {
  const config = ENTITY_CONFIGS[entityKey];
  const [form, setForm] = useState<FormState>(() => getDefaultForm(entityKey));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, { value: string; label: string }[]>>({});
  const [loadingOptions, setLoadingOptions] = useState(false);

  useEffect(() => {
    const loadDynamicOptions = async () => {
      setLoadingOptions(true);
      const result: Record<string, { value: string; label: string }[]> = {};
      for (const field of config.fields) {
        if (field.fetchOptions) {
          try {
            result[field.name] = await field.fetchOptions();
          } catch {
            result[field.name] = [];
          }
        }
      }
      setDynamicOptions(result);
      setLoadingOptions(false);
    };
    loadDynamicOptions();
  }, [entityKey, config.fields]);

  const setField = (name: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    for (const field of config.fields) {
      if (field.required) {
        const val = form[field.name];
        if (val === "" || val === undefined || val === null || (typeof val === "number" && isNaN(val))) {
          errs[field.name] = `${field.label} is required`;
        }
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSubmitting(true);
    setFetchError("");

    const payload: Record<string, any> = {};
    for (const field of config.fields) {
      const val = form[field.name];
      if (val !== "" && val !== null) {
        payload[field.name] = field.type === "number" ? Number(val) : val;
      }
    }

    try {
      const result = await api.post<any>(config.apiPath, payload);
      onCreated(result);
    } catch (err: any) {
      const detail = err?.detail;
      if (typeof detail === "string") {
        setFetchError(detail);
      } else {
        setFetchError("Failed to create. It may already exist.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-800 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">New {config.label}</h3>
          <button type="button" onClick={onClose} className="text-xl text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">&times;</button>
        </div>

        <div className="space-y-3">
          {config.fields.map((field) => {
            const opts = field.options || dynamicOptions[field.name] || [];
            const isDynamicSelect = !!field.fetchOptions;
            const isStaticSelect = !!field.options;
            const val = form[field.name];

            return (
              <div key={field.name}>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {field.label}
                  {field.required && <span className="ml-0.5 text-red-500">*</span>}
                </label>
                {isDynamicSelect || isStaticSelect ? (
                  <select
                    value={typeof val === "number" ? String(val) : val}
                    onChange={(e) => setField(field.name, e.target.value)}
                    disabled={loadingOptions && isDynamicSelect}
                    className="mt-0.5 block w-full rounded-md border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-sm focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-brand-400"
                  >
                    <option value="">{loadingOptions ? "Loading..." : `Select ${field.label}...`}</option>
                    {opts.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : field.type === "number" ? (
                  <input
                    type="number"
                    value={typeof val === "number" ? val : ""}
                    onChange={(e) => setField(field.name, e.target.value ? Number(e.target.value) : 0)}
                    min={field.min}
                    step={field.step}
                    placeholder={field.placeholder}
                    className="mt-0.5 block w-full rounded-md border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-sm focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-brand-400"
                  />
                ) : field.type === "textarea" ? (
                  <textarea
                    value={typeof val === "string" ? val : ""}
                    onChange={(e) => setField(field.name, e.target.value)}
                    placeholder={field.placeholder}
                    rows={2}
                    className="mt-0.5 block w-full rounded-md border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-sm focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-brand-400"
                  />
                ) : (
                  <input
                    type="text"
                    value={typeof val === "string" ? val : ""}
                    onChange={(e) => setField(field.name, e.target.value)}
                    placeholder={field.placeholder}
                    className="mt-0.5 block w-full rounded-md border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-sm focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-brand-400"
                  />
                )}
                {errors[field.name] && <p className="mt-0.5 text-xs text-red-500">{errors[field.name]}</p>}
              </div>
            );
          })}
        </div>

        {fetchError && (
          <div className="mt-3 rounded-md bg-red-50 dark:bg-red-900/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">{fetchError}</div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? "Creating..." : `Create ${config.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
