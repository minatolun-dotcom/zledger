import { test, expect } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:9091/api";

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

test.describe("E-Way Bill Workflow", () => {
  let token: string;
  let cid: string;
  let ewayEnabled = false;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
    cid = await getCompanyId(request, token);

    // Check if e-way bill is enabled
    const r = await api(request, "GET", "/eway-bill", token, cid);
    if (r.status !== 400) ewayEnabled = true;
  });

  test("GET /eway-bill returns list or disabled error", async ({ request }) => {
    const r = await api(request, "GET", "/eway-bill", token, cid);
    if (ewayEnabled) {
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body)).toBe(true);
    } else {
      expect(r.status).toBe(400);
      expect(r.body.detail || "").toContain("E-Way Bill");
    }
  });

  test("POST /eway-bill/create validates voucher existence", async ({ request }) => {
    const r = await api(request, "POST", "/eway-bill/create", token, cid, {
      voucher_id: "00000000-0000-0000-0000-000000000000",
      gstin_id: "00000000-0000-0000-0000-000000000000",
    });
    if (ewayEnabled) {
      expect([400, 404]).toContain(r.status);
    } else {
      expect(r.status).toBe(400);
      expect(r.body.detail || "").toContain("E-Way Bill");
    }
  });

  test("GET /eway-bill/{id} returns 404 for non-existent", async ({ request }) => {
    const r = await api(request, "GET", "/eway-bill/nonexistent-id", token, cid);
    if (ewayEnabled) {
      expect(r.status).toBe(404);
    } else {
      expect(r.status).toBe(400);
      expect(r.body.detail || "").toContain("E-Way Bill");
    }
  });

  test("POST /eway-bill/{id}/generate validates non-existent", async ({ request }) => {
    const r = await api(request, "POST", "/eway-bill/nonexistent-id/generate", token, cid);
    if (ewayEnabled) {
      expect(r.status).toBe(404);
    } else {
      expect(r.status).toBe(400);
      expect(r.body.detail || "").toContain("E-Way Bill");
    }
  });

  test("POST /eway-bill/{id}/cancel validates non-existent", async ({ request }) => {
    const r = await api(request, "POST", "/eway-bill/nonexistent-id/cancel", token, cid, {
      cancel_reason: "3",
      cancel_remark: "Test cancellation",
    });
    if (ewayEnabled) {
      expect(r.status).toBe(404);
    } else {
      expect(r.status).toBe(400);
      expect(r.body.detail || "").toContain("E-Way Bill");
    }
  });

  test("POST /eway-bill/{id}/vehicle validates non-existent", async ({ request }) => {
    const r = await api(request, "POST", "/eway-bill/nonexistent-id/vehicle", token, cid, {
      vehicle_number: "MH01AB1234",
    });
    if (ewayEnabled) {
      expect(r.status).toBe(404);
    } else {
      expect(r.status).toBe(400);
      expect(r.body.detail || "").toContain("E-Way Bill");
    }
  });
});
