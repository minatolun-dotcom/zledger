// Lightweight typed API client. Wraps fetch with auth header + JSON handling.
// Base path "/api" is proxied to the backend (vite dev proxy or nginx in prod).

// Every request gets a timeout so a stalled backend (container restart, proxy
// hiccup, DB lock) can never leave the UI stuck on an infinite spinner — e.g.
// the login button showing "Signing in…" forever. nginx bounds upstream reads
// at 90s, so our client timeout always fires first and can show a proper
// message instead of a bare browser error.
const DEFAULT_TIMEOUT_MS = 30_000;
// File uploads / CSV parsing can legitimately take longer than a JSON call.
const FORM_DATA_TIMEOUT_MS = 60_000;

const TOKEN_KEY = "zledger.token";
const COMPANY_KEY = "zledger.company";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// Company selection is persisted in localStorage so it survives browser/tab
// restarts (the token is also in localStorage). Previously this lived in
// sessionStorage and was wiped on restart, leaving the user "logged in" with
// no active company — which rendered the app shell with no X-Company-Id and
// errored on navigation.
export function getCompanyId(): string | null {
  return localStorage.getItem(COMPANY_KEY);
}

export function setCompanyId(id: string | null): void {
  if (id) localStorage.setItem(COMPANY_KEY, id);
  else localStorage.removeItem(COMPANY_KEY);
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

// RequestInit plus our per-call timeout override (ms).
export interface RequestOptions extends RequestInit {
  timeout?: number;
}

/** Timeout error — surfaces when the server never answered within the limit. */
export const TIMEOUT_ERROR_MESSAGE =
  "The request timed out. Check that the server is running, then try again.";

/** Network-level failure — connection refused / DNS failure / aborted. */
export const NETWORK_ERROR_MESSAGE =
  "Cannot reach the server. Check your connection and try again.";

function buildSignal(
  options: RequestOptions,
  controller: AbortController
): AbortSignal {
  // If the caller supplied their own signal (e.g. a component aborting on
  // unmount), combine it with our timeout signal so both can abort.
  if (options.signal) {
    if (typeof AbortSignal.any === "function") {
      return AbortSignal.any([options.signal, controller.signal]);
    }
    return controller.signal;
  }
  return controller.signal;
}

async function request<T>(
  path: string,
  options: RequestOptions = {}
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

  // For FormData, let the browser set Content-Type with multipart boundary
  if (isFormData) {
    delete headers["Content-Type"];
  }

  const timeoutMs =
    options.timeout ?? (isFormData ? FORM_DATA_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const fetchOptions: RequestInit = { ...options, headers };

  try {
    const res = await fetch(`/api${path}`, {
      ...fetchOptions,
      signal: buildSignal(options, controller),
    });

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
  } catch (err) {
    // Our own timeout fired — distinguish from a caller-initiated abort.
    if (controller.signal.aborted) {
      throw new ApiError(408, TIMEOUT_ERROR_MESSAGE);
    }
    // fetch rejects with TypeError on network failure (refused, DNS, offline).
    if (err instanceof TypeError) {
      throw new ApiError(0, NETWORK_ERROR_MESSAGE);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function download(path: string, options: RequestOptions = {}): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const companyId = getCompanyId();
  if (companyId) headers["X-Company-Id"] = companyId;

  // Report generation / exports can take longer than a plain JSON call.
  const timeoutMs = options.timeout ?? 60_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`/api${path}`, {
      headers,
      signal: buildSignal(options, controller),
    });
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
  } catch (err) {
    if (controller.signal.aborted) {
      throw new ApiError(408, TIMEOUT_ERROR_MESSAGE);
    }
    if (err instanceof TypeError) {
      throw new ApiError(0, NETWORK_ERROR_MESSAGE);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: "GET", ...options }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
      ...options,
    }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      method: "PUT",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
      ...options,
    }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      method: "PATCH",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
      ...options,
    }),
  del: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: "DELETE", ...options }),
  download,
};
