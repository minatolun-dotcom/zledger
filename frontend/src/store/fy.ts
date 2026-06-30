import { create } from "zustand";

const FY_KEY = "zledger.fyId";

interface FyState {
  activeFyId: string | null;
  setActiveFy: (id: string | null) => void;
}

export const useFyStore = create<FyState>((set) => ({
  activeFyId: localStorage.getItem(FY_KEY),
  setActiveFy: (id) => {
    if (id) localStorage.setItem(FY_KEY, id);
    else localStorage.removeItem(FY_KEY);
    set({ activeFyId: id });
  },
}));
