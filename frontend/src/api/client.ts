// Lightweight typed API client. Wraps fetch with auth header + JSON handling.
// Base path "/api" is proxied to the backend (vite dev proxy or nginx in prod).

const TOKEN_KEY = "zledger.token";
const TAB_ID_KEY = "zledger.tabId";

// ── Tab isolation: each tab gets its own company context ────────────────
// sessionStorage is per-tab (not shared across tabs like localStorage).
// We store companyId in sessionStorage[tabId] so each tab is independent.

let _tabId: string;

function getTabId(): string {
  if (_tabId) return _tabId;
  // Reuse existing tab ID or generate a new one
  _tabId = sessionStorage.getItem(TAB_ID_KEY) || crypto.randomUUID();
  sessionStorage.setItem(TAB_ID_KEY, _tabId);
  return _tabId;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getCompanyId(): string | null {
  return sessionStorage.getItem(`zledger.company.${getTabId()}`);
}

export function setCompanyId(id: string | null): void {
  const key = `zledger.company.${getTabId()}`;
  if (id) sessionStorage.setItem(key, id);
  else sessionStorage.removeItem(key);
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    const msg =
      typeof detail === "string"
        ? detail
        : (detail as Record<string, unknown>)?.detail
          ? String((detail as Record<string, unknown>).detail)
          : `API error ${status}`;
    super(msg);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {};

  // Only set Content-Type for non-FormData bodies (FormData sets its own boundary)
  const isFormData = options.body instanceof FormData;
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  Object.assign(headers, (options.headers as Record<string, string>) ?? {});

  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const companyId = getCompanyId();
  if (companyId) headers["X-Company-Id"] = companyId;

  const fetchOptions: RequestInit = { ...options, headers };

  // For FormData, let the browser set Content-Type with multipart boundary
  if (isFormData) {
    delete (fetchOptions.headers as Record<string, string>)["Content-Type"];
  }

  const res = await fetch(`/api${path}`, fetchOptions);

  // Always read as text first to avoid "Body has already been consumed"
  const text = await res.text();

  if (!res.ok) {
    let detail: unknown = text;
    try {
      detail = JSON.parse(text);
    } catch {
      // not JSON, keep as text
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return (text ? JSON.parse(text) : undefined) as T;
}

async function download(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const companyId = getCompanyId();
  if (companyId) headers["X-Company-Id"] = companyId;

  const res = await fetch(`/api${path}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    let detail: unknown = text;
    try {
      detail = JSON.parse(text);
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, detail);
  }
  return res.blob();
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  download,
};
