import { test, expect } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:9090/api";

async function loginAs(request: any, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  return (await res.json()).access_token as string;
}

async function adminToken(request: any) {
  return loginAs(request, ADMIN.email, ADMIN.password);
}

async function api(request: any, method: string, path: string, token?: string | null, companyId?: string | null, body?: any) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (companyId) headers["X-Company-Id"] = companyId;
  const opts: any = { headers };
  if (body !== undefined) opts.data = body;
  let res;
  switch (method) {
    case "GET": res = await request.get(`${API}${path}`, opts); break;
    case "POST": res = await request.post(`${API}${path}`, opts); break;
    case "PATCH": res = await request.patch(`${API}${path}`, opts); break;
    case "DELETE": res = await request.delete(`${API}${path}`, opts); break;
  }
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status(), body: json };
}

async function getCompanyId(request: any, token: string) {
  const r = await api(request, "GET", "/auth/me", token);
  return r.body.companies?.[0]?.id;
}

test.describe("E-Invoice Workflow", () => {
  let token: string;
  let cid: string;
  let einvoiceEnabled = false;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
    cid = await getCompanyId(request, token);

    // The list endpoint returns 200 [] even when e-invoice is disabled (so the
    // GST page renders cleanly), so it can't signal enablement. Probe the
    // {id} endpoint instead: 400 when disabled, 404 (not found) when enabled.
    const r = await api(request, "GET", "/einvoice/nonexistent-id", token, cid);
    if (r.status === 404) einvoiceEnabled = true;
  });

  test("GET /einvoice returns list (empty when disabled)", async ({ request }) => {
    // The list endpoint always returns 200 — an empty array when the feature
    // is disabled (read-only list must not 400), real rows when enabled.
    const r = await api(request, "GET", "/einvoice", token, cid);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  test("POST /einvoice/create validates voucher existence", async ({ request }) => {
    const r = await api(request, "POST", "/einvoice/create", token, cid, {
      voucher_id: "00000000-0000-0000-0000-000000000000",
      gstin_id: "00000000-0000-0000-0000-000000000000",
    });
    if (einvoiceEnabled) {
      // With e-invoice enabled, should fail with 404 (voucher not found)
      expect([400, 404]).toContain(r.status);
    } else {
      expect(r.status).toBe(400);
      expect(r.body.detail || "").toContain("E-Invoice");
    }
  });

  test("GET /einvoice/{id} returns 404 for non-existent", async ({ request }) => {
    const r = await api(request, "GET", "/einvoice/nonexistent-id", token, cid);
    if (einvoiceEnabled) {
      expect(r.status).toBe(404);
    } else {
      expect(r.status).toBe(400);
      expect(r.body.detail || "").toContain("E-Invoice");
    }
  });

  test("POST /einvoice/{id}/generate validates non-existent", async ({ request }) => {
    const r = await api(request, "POST", "/einvoice/nonexistent-id/generate", token, cid);
    if (einvoiceEnabled) {
      expect(r.status).toBe(404);
    } else {
      expect(r.status).toBe(400);
      expect(r.body.detail || "").toContain("E-Invoice");
    }
  });
});
