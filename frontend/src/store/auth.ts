import { create } from "zustand";
import { api, setToken, getToken, getCompanyId, setCompanyId, ApiError } from "../api/client";

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
  logo_url: string | null;
  modules: string[];
}

/** Remember the most recently used company's branding so the login screen
 *  can greet returning users with their own logo + name. Survives logout. */
const LAST_COMPANY_KEY = "zledger.lastCompany";

function cacheLastCompany(companies: Company[], activeId: string | null) {
  const c = companies.find((x) => x.id === activeId);
  if (!c) return;
  try {
    localStorage.setItem(
      LAST_COMPANY_KEY,
      JSON.stringify({ name: c.name, logoUrl: c.logo_url })
    );
  } catch {
    /* ignore storage errors */
  }
}

export function getLastCompanyBranding(): { name?: string; logoUrl?: string | null } | null {
  try {
    const raw = localStorage.getItem(LAST_COMPANY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

interface AuthState {
  token: string | null;
  user: User | null;
  companies: Company[];
  activeCompanyId: string | null;
  /** True once /auth/me has resolved (success or 401). Gates the company check. */
  meLoaded: boolean;
  /** Non-401 /auth/me failure message (timeout, network, 5xx). Cleared on success. */
  meError: string | null;
  /** Effective permission sets per company id (from /me/permissions). */
  permissionsByCompany: Record<string, string[]>;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  fetchPermissions: (companyId: string) => Promise<void>;
  setActiveCompany: (id: string) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: getToken(),
  user: null,
  companies: [],
  activeCompanyId: getCompanyId(),
  meLoaded: false,
  meError: null,
  permissionsByCompany: {},

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
    setCompanyId(null);
    set({ token: null, user: null, companies: [], activeCompanyId: null, meLoaded: true, meError: null });
  },

  fetchMe: async () => {
    try {
      const res = await api.get<{ user: User; companies: Company[] }>("/auth/me");
      const activeId = getCompanyId();
      const valid = activeId && res.companies.some((c) => c.id === activeId);
      // Drop a restored company id that no longer belongs to this user
      // (e.g. after a DB reseed the old id is gone) so we re-prompt instead
      // of firing company-scoped calls with a stale X-Company-Id.
      if (activeId && !valid) {
        setCompanyId(null);
        set({ activeCompanyId: null });
      }
      set({ user: res.user, companies: res.companies, meLoaded: true, meError: null });
      if (valid) {
        cacheLastCompany(res.companies, activeId);
        void get().fetchPermissions(activeId!);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        set({ token: null, user: null, companies: [], activeCompanyId: null, meLoaded: true, meError: null });
      } else {
        // Timeout / network / 5xx — keep the token (still logged in) but let
        // the company picker surface the failure with a Retry button.
        set({
          meLoaded: true,
          meError: err instanceof Error ? err.message : "Couldn't load your companies",
        });
      }
    }
  },

  setActiveCompany: (id) => {
    setCompanyId(id);
    set({ activeCompanyId: id });
    cacheLastCompany(get().companies, id);
    const perms = get().permissionsByCompany;
    if (id && !perms[id]) {
      void get().fetchPermissions(id);
    }
  },

  fetchPermissions: async (companyId) => {
    if (!companyId) return;
    try {
      const res = await api.get<{ role: string; permissions: string[] }>(
        "/auth/me/permissions"
      );
      set((s) => ({
        permissionsByCompany: {
          ...s.permissionsByCompany,
          [companyId]: res.permissions,
        },
      }));
    } catch {
      /* leave permissions empty; role-based fallback still applies */
    }
  },
}));

/** Return the current user's role in the active company. */
export function getUserRole(): "owner" | "accountant" | "viewer" {
  const { companies, activeCompanyId, user } = useAuthStore.getState();
  if (user?.is_superadmin) return "owner";
  const active = companies.find((c) => c.id === activeCompanyId);
  return (active?.role as "owner" | "accountant" | "viewer") ?? "viewer";
}
