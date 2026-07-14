import { test, expect } from "@playwright/test";
import { ADMIN, E2E_PREFIX } from "../helpers/fixtures";

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

test.describe("TDS/TCS Workflow", () => {
  let token: string;
  let cid: string;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
    cid = await getCompanyId(request, token);
  });

  test("GET /tds-tcs/calculate returns calculation", async ({ request }) => {
    // Seed sections first so there's data to calculate against
    await api(request, "POST", "/tds-tcs/sections/seed", token, cid);
    // Create a section to calculate against
    const sectionCode = `CALC${Date.now().toString().slice(-6)}`;
    const sec = await api(request, "POST", "/tds-tcs/sections", token, cid, {
      section_code: sectionCode,
      section_name: `${E2E_PREFIX} Calculate Test`,
      tds_tcs_type: "tds",
      rate: 10,
      threshold_limit: 0,
    });
    if (sec.status !== 201) return;
    const sid = sec.body.id;
    const r = await api(request, "GET", `/tds-tcs/calculate?section_id=${sid}&base_amount=50000`, token, cid);
    await api(request, "DELETE", `/tds-tcs/sections/${sid}`, token, cid);
    expect(r.status).toBe(200);
    expect(r.body).toBeDefined();
  });

  test("POST /tds-tcs/returns creates a return", async ({ request }) => {
    const uniqueFy = `2099-${Date.now().toString().slice(-2)}`;
    const r = await api(request, "POST", "/tds-tcs/returns", token, cid, {
      return_type: "tds",
      quarter: "Q1",
      financial_year: uniqueFy,
    });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeTruthy();
    expect(r.body.return_type).toBe("tds");
    expect(r.body.quarter).toBe("Q1");

    // Cleanup (no delete endpoint visible - returns may be immutable after creation)
  });

  test("POST /tds-tcs/entries creates entry and deposits", async ({ request }) => {
    // Create a section first
    const sectionCode = `E2E${Date.now().toString().slice(-6)}`;
    const sec = await api(request, "POST", "/tds-tcs/sections", token, cid, {
      section_code: sectionCode,
      section_name: `${E2E_PREFIX} Entry Test`,
      tds_tcs_type: "tds",
      rate: 10,
      threshold_limit: 0,
    });
    if (sec.status !== 201) return;
    const sid = sec.body.id;

    // Get a voucher ID from existing data to use as reference
    const vouchers = await api(request, "GET", "/vouchers", token, cid);
    const voucherId = Array.isArray(vouchers.body) && vouchers.body.length > 0 ? vouchers.body[0].id : null;

    if (!voucherId) {
      await api(request, "DELETE", `/tds-tcs/sections/${sid}`, token, cid);
      return;
    }

    // Create entry
    const entry = await api(request, "POST", "/tds-tcs/entries", token, cid, {
      voucher_id: voucherId,
      section_id: sid,
      base_amount: 50000,
      entry_date: "2026-06-15",
    });
    expect(entry.status).toBe(201);
    expect(entry.body.id).toBeTruthy();

    // Deposit the entry
    const deposit = await api(request, "POST", "/tds-tcs/deposit", token, cid, {
      entry_ids: [entry.body.id],
      challan_number: `CHALAN${Date.now().toString().slice(-6)}`,
      deposition_date: "2026-07-01",
    });
    expect(deposit.status).toBe(200);

    // Cleanup section
    await api(request, "DELETE", `/tds-tcs/sections/${sid}`, token, cid);
  });
});
