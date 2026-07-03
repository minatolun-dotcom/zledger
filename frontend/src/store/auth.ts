import { create } from "zustand";
import { api, setToken, getToken, ApiError } from "../api/client";

export interface User {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  is_superadmin: boolean;
}

export interface Company {
  id: string;
  name: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  companies: Company[];
  activeCompanyId: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  setActiveCompany: (id: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: getToken(),
  user: null,
  companies: [],
  activeCompanyId: localStorage.getItem("zledger.companyId"),

  login: async (email, password) => {
    const res = await api.post<{ access_token: string; user: User }>(
      "/auth/login",
      { email, password }
    );
    setToken(res.access_token);
    set({ token: res.access_token, user: res.user });
  },

  register: async (email, name, password) => {
    const res = await api.post<{ access_token: string; user: User }>(
      "/auth/register",
      { email, name, password }
    );
    setToken(res.access_token);
    set({ token: res.access_token, user: res.user });
  },

  logout: () => {
    setToken(null);
    localStorage.removeItem("zledger.companyId");
    set({ token: null, user: null, companies: [], activeCompanyId: null });
  },

  fetchMe: async () => {
    try {
      const res = await api.get<{ user: User; companies: Company[] }>("/auth/me");
      set({ user: res.user, companies: res.companies });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        set({ token: null, user: null, companies: [], activeCompanyId: null });
      }
    }
  },

  setActiveCompany: (id) => {
    localStorage.setItem("zledger.companyId", id);
    set({ activeCompanyId: id });
  },
}));
