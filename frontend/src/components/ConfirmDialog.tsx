import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "./Modal";

interface ConfirmState {
  open: boolean;
  message: string;
  title: string;
  confirmLabel: string;
  danger: boolean;
  /** When set, the confirm button stays disabled until this exact text is typed. */
  requireInput: string | null;
  resolve: ((value: boolean) => void) | null;
}

const DEFAULT_STATE: ConfirmState = {
  open: false,
  message: "",
  title: "Confirm",
  confirmLabel: "Confirm",
  danger: false,
  requireInput: null,
  resolve: null,
};

let globalResolve: ((value: boolean) => void) | null = null;

export function showConfirm(
  message: string,
  options?: { title?: string; confirmLabel?: string; danger?: boolean; requireInput?: string },
): Promise<boolean> {
  return new Promise((resolve) => {
    globalResolve = resolve;
    confirmState.setState({
      open: true,
      message,
      title: options?.title ?? "Confirm",
      confirmLabel: options?.confirmLabel ?? "Confirm",
      danger: options?.danger ?? false,
      requireInput: options?.requireInput ?? null,
      resolve,
    });
  });
}

const confirmState = {
  listeners: new Set<() => void>(),
  state: { ...DEFAULT_STATE } as ConfirmState,
  setState(s: ConfirmState) {
    this.state = s;
    this.listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  },
  getSnapshot() {
    return this.state;
  },
};

function useConfirmState(): ConfirmState {
  const [, rerender] = useState(0);
  const stateRef = useRef(confirmState.getSnapshot());

  useCallback(() => {
    return confirmState.subscribe(() => {
      stateRef.current = confirmState.getSnapshot();
      rerender((n) => n + 1);
    });
  }, [])();

  return stateRef.current;
}

export function ConfirmDialog() {
  const state = useConfirmState();
  const [typed, setTyped] = useState("");

  // Reset the typed value every time the dialog (re)opens.
  useEffect(() => {
    if (state.open) setTyped("");
  }, [state.open]);

  const handleConfirm = () => {
    confirmState.setState({ ...DEFAULT_STATE });
    globalResolve?.(true);
    globalResolve = null;
  };

  const handleCancel = () => {
    confirmState.setState({ ...DEFAULT_STATE });
    globalResolve?.(false);
    globalResolve = null;
  };

  const inputMatches = !state.requireInput || typed.trim() === state.requireInput;

  return (
    <Modal
      open={state.open}
      onClose={handleCancel}
      maxWidth="sm"
      panelClassName="overflow-hidden"
      label={state.title}
    >
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">
            {state.title}
          </h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-[#cbd5e1]">
            {state.message}
          </p>
          {state.requireInput && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">
                Type{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-brand-600 dark:bg-[#282832] dark:text-blue-400">
                  {state.requireInput}
                </code>{" "}
                to confirm
              </label>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && inputMatches) handleConfirm();
                }}
                autoFocus
                autoComplete="off"
                className="w-full rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-2 text-sm text-slate-900 dark:text-[#f1f5f9] focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20"
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            onClick={handleCancel}
            className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!inputMatches}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium text-white ${
              state.danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-brand-600 hover:bg-brand-700"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {state.confirmLabel}
          </button>
        </div>
    </Modal>
  );
}
