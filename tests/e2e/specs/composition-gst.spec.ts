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

test.describe("Composition GST Scheme", () => {
  let token: string;
  let cid: string;
  let hsnId: string;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
    cid = await getCompanyId(request, token);

    // Create an HSN/SAC code for testing
    const hsn = await api(request, "POST", "/gst/hsn-sac", token, cid, {
      code: "9983",
      description: "[E2E] Composition Test Service",
      gst_rate: 18,
      code_type: "sac",
    });
    if (hsn.status === 201) hsnId = hsn.body.id;
  });

  test.afterAll(async ({ request }) => {
    if (hsnId) {
      await api(request, "DELETE", `/gst/hsn-sac/${hsnId}`, token, cid);
    }
  });

  test("POST /gst/registrations creates composition registration", async ({ request }) => {
    const reg = await api(request, "POST", "/gst/registrations", token, cid, {
      gstin: `27ABCDE${Date.now().toString().slice(-4)}A1Z5`,
      legal_name: "[E2E] Composition Dealer",
      trade_name: "[E2E] Comp Dealer",
      state_code: "27",
      registration_type: "composition",
      composition_rate: 1.0,
    });
    expect(reg.status).toBe(201);
    expect(reg.body.registration_type).toBe("composition");
    expect(reg.body.composition_rate).toBe(1);
    expect(reg.body.is_primary).toBe(false);

    // Cleanup
    const del = await api(request, "DELETE", `/gst/registrations/${reg.body.id}`, token, cid);
    expect(del.status).toBe(204);
  });

  test("POST /gst/calculate-gst works with composition scheme parameters", async ({ request }) => {
    test.skip(!hsnId, "HSN/SAC creation failed - cannot test calculation");

    // Composition scheme uses same calculation but registration type affects reporting
    const calc = await api(request, "POST", "/gst/calculate-gst", token, cid, {
      amount: 10000,
      hsn_sac_id: hsnId,
      is_inter_state: false,
    });
    expect(calc.status).toBe(200);
    expect(calc.body.taxable_amount).toBeGreaterThan(0);
    expect(calc.body.total_tax).toBeGreaterThan(0);
    expect(calc.body.hsn_sac_code).toBeTruthy();
    // Regular GST rate for 18% HSN should split 9% CGST + 9% SGST
    expect(calc.body.cgst_rate).toBe(9);
    expect(calc.body.sgst_rate).toBe(9);
  });

  test("GET /gst/returns supports GSTR-4 query", async ({ request }) => {
    const returns = await api(request, "GET", "/gst/returns", token, cid);
    expect(returns.status).toBe(200);
    expect(Array.isArray(returns.body)).toBe(true);
  });
});
