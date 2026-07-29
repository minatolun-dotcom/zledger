import { useState, useEffect, useMemo, useRef } from "react";
import { api } from "../../api/client";
import type { EntityKey, QuickCreateField } from "./masterConfigs";
import { ENTITY_CONFIGS } from "./masterConfigs";
import SearchableSelect from "../SearchableSelect";
import useEscapeToClose from "../../hooks/useEscapeToClose";
import MasterSelector from "./MasterSelector";

interface MasterSelectorModalProps {
  entityKey: EntityKey;
  mode?: "create" | "edit";
  defaultName?: string;
  createdFrom?: string;
  item?: { id: string; name?: string };
  depth?: number;
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

function applyDefaultName(form: FormState, defaultName: string): FormState {
  if (defaultName) {
    if ("name" in form) return { ...form, name: defaultName };
    if ("code" in form) return { ...form, code: defaultName };
  }
  return form;
}

export default function MasterSelectorModal({
  entityKey,
  mode = "create",
  defaultName,
  createdFrom,
  item,
  depth = 0,
  onClose,
  onCreated,
}: MasterSelectorModalProps) {
  const config = ENTITY_CONFIGS[entityKey];
  const [form, setForm] = useState<FormState>(() => applyDefaultName(getDefaultForm(entityKey), defaultName || ""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, { value: string; label: string }[]>>({});
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [createdCache, setCreatedCache] = useState<Record<string, { value: string; label: string }[]>>({});
  const [editLoading, setEditLoading] = useState(mode === "edit");

  useEscapeToClose(true, onClose);

  // Load dynamic (fetchOptions) selects
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

  // Edit mode: fetch the entity and prefill
  useEffect(() => {
    if (mode !== "edit" || !item?.id) return;
    let cancelled = false;
    setEditLoading(true);
    api
      .get<any>(`${config.apiPath}/${item.id}`)
      .then((res) => {
        if (cancelled) return;
        setForm((prev) => {
          const next = { ...prev };
          for (const field of config.fields) {
            if (res[field.name] !== undefined && res[field.name] !== null) {
              next[field.name] = res[field.name];
            }
          }
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) setFetchError("Failed to load record for editing");
      })
      .finally(() => {
        if (!cancelled) setEditLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, item, entityKey, config.fields, config.apiPath]);

  const setField = (name: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const isFieldVisible = (field: QuickCreateField): boolean => {
    if (!field.showWhen) return true;
    const { field: depField, labelIncludes } = field.showWhen;
    const depVal = form[depField];
    if (depVal === "" || depVal === undefined || depVal === null) return false;
    const depFieldDef = config.fields.find((f) => f.name === depField);
    const allOpts = [...(depFieldDef?.options || []), ...(dynamicOptions[depField] || [])];
    const match = allOpts.find((o) => o.value === String(depVal));
    const label = (match?.label || "").toLowerCase();
    return labelIncludes.some((sub) => label.includes(sub.toLowerCase()));
  };

  const visibleFields = useMemo(
    () => config.fields.filter((f) => isFieldVisible(f)),
    [config.fields, form, dynamicOptions]
  );

  // Init defaults for newly-visible conditional fields
  useEffect(() => {
    for (const field of config.fields) {
      if (field.showWhen && isFieldVisible(field) && (form[field.name] === undefined || form[field.name] === "")) {
        setForm((prev) => ({ ...prev, [field.name]: field.type === "number" ? 0 : "" }));
      }
    }
  }, [visibleFields]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    for (const field of visibleFields) {
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
    for (const field of visibleFields) {
      const val = form[field.name];
      if (val !== "" && val !== null) {
        payload[field.name] = field.type === "number" ? Number(val) : val;
      }
    }
    if (mode === "create" && createdFrom) payload.created_from = createdFrom;

    try {
      const result =
        mode === "edit" && item?.id
          ? await api.patch<any>(`${config.apiPath}/${item.id}`, payload)
          : await api.post<any>(config.apiPath, payload);
      onCreated(result);
    } catch (err: any) {
      const detail = err?.detail;
      if (typeof detail === "string") {
        setFetchError(detail);
      } else if (Array.isArray(detail) && detail[0]?.msg) {
        setFetchError(detail[0].msg);
      } else {
        setFetchError("Failed to save. It may already exist.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const zIndex = 9999 + depth * 20;
  const bodyRef = useRef<HTMLDivElement>(null);

  // Auto-focus first text input when modal opens (wait for loading to finish)
  useEffect(() => {
    if (editLoading) return;
    setTimeout(() => {
      const el = bodyRef.current?.querySelector<HTMLInputElement>("input[type='text'], input:not([type]), textarea");
      el?.focus();
    }, 50);
  }, [entityKey, mode, editLoading]);

  // Trap Tab focus inside the modal
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;

    const focusableSelector =
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const el = body;
      if (!el) return;
      const focusable = el.querySelectorAll<HTMLElement>(focusableSelector);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      style={{ zIndex }}
      data-master-popup
      onClick={onClose}
    >
      <div
        ref={bodyRef}
        className="w-full max-w-md rounded-xl bg-white dark:bg-[#16161f] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-[#f1f5f9]">
            {mode === "edit" ? `Edit ${config.label}` : `New ${config.label}`}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-xl text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#e2e8f0]"
          >
            &times;
          </button>
        </div>

        {editLoading ? (
          <div className="py-6 text-center text-sm text-slate-400 dark:text-[#64748b]">Loading...</div>
        ) : (
          <div className="space-y-3">
            {visibleFields.map((field) => {
              const opts = [
                ...(field.options || dynamicOptions[field.name] || []),
                ...(createdCache[field.name] || []),
              ];
              const isDynamicSelect = !!field.fetchOptions;
              const isStaticSelect = !!field.options;
              const isNested = !!field.createEntity;
              const val = form[field.name];

              return (
                <div key={field.name}>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1]">
                    {field.label}
                    {field.required && <span className="ml-0.5 text-red-500">*</span>}
                  </label>
                  {isNested ? (
                    <MasterSelector
                      entityKey={field.createEntity as EntityKey}
                      value={typeof val === "number" ? String(val) : val}
                      onChange={(v) => setField(field.name, v)}
                      options={opts}
                      placeholder={loadingOptions ? "Loading..." : `Select or create ${field.label}...`}
                      createdFrom={createdFrom}
                      className="mt-0.5 block w-full"
                      onItemCreated={(it) => {
                        setField(field.name, it.id);
                        setCreatedCache((prev) => ({
                          ...prev,
                          [field.name]: [...(prev[field.name] || []), { value: it.id, label: it.name }],
                        }));
                      }}
                      depth={depth + 1}
                    />
                  ) : isDynamicSelect || isStaticSelect ? (
                    <SearchableSelect
                      value={typeof val === "number" ? String(val) : val}
                      onChange={(v) => setField(field.name, v)}
                      disabled={loadingOptions && isDynamicSelect}
                      options={opts}
                      searchable={true}
                      placeholder={loadingOptions ? "Loading..." : `Select ${field.label}...`}
                      className="mt-0.5 block w-full"
                    />
                  ) : field.type === "number" ? (
                    <input
                      type="number"
                      value={typeof val === "number" ? val : ""}
                      onChange={(e) => setField(field.name, e.target.value ? Number(e.target.value) : 0)}
                      min={field.min}
                      step={field.step}
                      placeholder={field.placeholder}
                      className="mt-0.5 block w-full rounded-md border border-slate-300 dark:border-[#282832] px-2.5 py-1.5 text-sm focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20"
                    />
                  ) : field.type === "textarea" ? (
                    <textarea
                      value={typeof val === "string" ? val : ""}
                      onChange={(e) => setField(field.name, e.target.value)}
                      placeholder={field.placeholder}
                      rows={2}
                      className="mt-0.5 block w-full rounded-md border border-slate-300 dark:border-[#282832] px-2.5 py-1.5 text-sm focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20"
                    />
                  ) : (
                    <input
                      type="text"
                      value={typeof val === "string" ? val : ""}
                      onChange={(e) => setField(field.name, e.target.value)}
                      placeholder={field.placeholder}
                      className="mt-0.5 block w-full rounded-md border border-slate-300 dark:border-[#282832] px-2.5 py-1.5 text-sm focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20"
                    />
                  )}
                  {errors[field.name] && <p className="mt-0.5 text-xs text-red-500">{errors[field.name]}</p>}
                </div>
              );
            })}
          </div>
        )}

        {fetchError && (
          <div className="mt-3 rounded-md bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{fetchError}</div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#16161f] px-4 py-2 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1a1a24]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || editLoading}
            className="btn-primary px-4 py-2 text-sm font-semibold"
          >
            {submitting ? "Saving..." : mode === "edit" ? `Save ${config.label}` : `Create ${config.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
