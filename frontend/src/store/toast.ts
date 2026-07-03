import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

let nextId = 0;

interface ToastStore {
  toasts: Toast[];
  show: (message: string, type?: Toast["type"], durationMs?: number) => number;
  success: (message: string) => number;
  error: (message: string) => number;
  info: (message: string) => number;
  remove: (id: number) => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  show: (message, type = "info", durationMs = 4000) => {
    const id = ++nextId;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => get().remove(id), durationMs);
    return id;
  },
  success: (msg) => get().show(msg, "success"),
  error: (msg) => get().show(msg, "error", 6000),
  info: (msg) => get().show(msg, "info"),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
