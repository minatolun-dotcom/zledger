import { test, expect } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:8080/api";

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

test.describe("Financial Year Validation", () => {
  let token: string;
  let cid: string;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
    cid = await getCompanyId(request, token);
  });

  test("POST /coa/financial-years rejects overlapping dates", async ({ request }) => {
    const r = await api(request, "POST", "/coa/financial-years", token, cid, {
      name: "[E2E] Overlap Test",
      start_date: "2026-01-01",
      end_date: "2027-12-31",
    });
    expect(r.status).toBe(400);
    expect(r.body.detail?.toLowerCase() || "").toContain("overlap");
  });

  test("POST /coa/financial-years creates valid FY", async ({ request }) => {
    const fyName = `[E2E] FY ${Date.now().toString().slice(-6)}`;
    const r = await api(request, "POST", "/coa/financial-years", token, cid, {
      name: fyName,
      start_date: "2035-04-01",
      end_date: "2036-03-31",
    });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeTruthy();
    expect(r.body.name).toBe(fyName);

    // Cleanup
    const del = await api(request, "DELETE", `/coa/financial-years/${r.body.id}`, token, cid);
    expect(del.status).toBe(204);
  });

  test("PATCH /coa/financial-years with overlapping dates", async ({ request }) => {
    const fyName = `[E2E] Patch ${Date.now().toString().slice(-6)}`;
    const created = await api(request, "POST", "/coa/financial-years", token, cid, {
      name: fyName,
      start_date: "2050-04-01",
      end_date: "2051-03-31",
    });
    expect(created.status).toBe(201);
    const fyId = created.body.id;

    // Try updating to overlap with existing FY (2026-2027)
    const patch = await api(request, "PATCH", `/coa/financial-years/${fyId}`, token, cid, {
      start_date: "2026-01-01",
      end_date: "2026-06-30",
    });
    expect(patch.status).toBe(400);
    expect(patch.body.detail?.toLowerCase() || "").toContain("overlap");

    // Cleanup
    const del = await api(request, "DELETE", `/coa/financial-years/${fyId}`, token, cid);
    expect(del.status).toBe(204);
  });
});
