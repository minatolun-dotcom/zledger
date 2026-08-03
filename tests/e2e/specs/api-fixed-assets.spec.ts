import { test, expect, type APIRequestContext } from "@playwright/test";

// API is reached through the web container's reverse proxy (only :9090 is published).
const API = "http://localhost:9090/api";
// Matches BOOTSTRAP_ADMIN_PASSWORD in .env for this environment.
const ADMIN_EMAIL = "admin@zledger.com";
const ADMIN_PWD = "katheikei";

async function loginAs(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(res.status(), `login failed for ${email}`).toBe(200);
  return (await res.json()).access_token as string;
}

async function adminToken(request: APIRequestContext) {
  return loginAs(request, ADMIN_EMAIL, ADMIN_PWD);
}

async function api(
  request: APIRequestContext,
  method: string,
  path: string,
  token?: string | null,
  companyId?: string | null,
  body?: any,
) {
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
    default: throw new Error(`Unknown method: ${method}`);
  }
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status(), body: json };
}

function daysInclusive(start: string, end: string) {
  const s = new Date(start + "T00:00:00Z").getTime();
  const e = new Date(end + "T00:00:00Z").getTime();
  return Math.round((e - s) / 86400000) + 1;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

const state: any = {};

test.describe.serial("API: Fixed Asset Register + Depreciation", () => {
  test.beforeAll(async ({ request }) => {
    const ts = Date.now();
    // Owner user (non-superadmin) so we can test viewer 403 + self-cleanup
    const ownerEmail = `fa-owner-${ts}@test.example.com`;
    const viewerEmail = `fa-viewer-${ts}@test.example.com`;
    const reg = await request.post(`${API}/auth/register`, {
      data: { email: ownerEmail, name: "FA Owner", password: "test12345" },
    });
    state.ownerUserId = (await reg.json()).user.id;
    state.ownerToken = await loginAs(request, ownerEmail, "test12345");

    const vreg = await request.post(`${API}/auth/register`, {
      data: { email: viewerEmail, name: "FA Viewer", password: "test12345" },
    });
    state.viewerUserId = (await vreg.json()).user.id;
    state.viewerToken = await loginAs(request, viewerEmail, "test12345");

    // Isolated company (cleaned up in afterAll)
    const c = await api(request, "POST", "/companies", state.ownerToken, null, {
      name: `Test Co FABackend ${ts}`,
      legal_name: "Test Co FABackend",
      state_code: "MH",
    });
    expect(c.status).toBe(201);
    state.companyId = c.body.id;

    // Fresh FY (no overlap with seeded data)
    const fy = await api(request, "POST", "/coa/financial-years", state.ownerToken, state.companyId, {
      name: "2030-31",
      start_date: "2030-04-01",
      end_date: "2031-03-31",
    });
    expect(fy.status).toBe(201);
    state.fyId = fy.body.id;

    // Add viewer member
    const m = await api(request, "POST", "/members", state.ownerToken, state.companyId, {
      email: viewerEmail,
      role: "viewer",
    });
    expect(m.status).toBe(201);
  });

  test.afterAll(async ({ request }) => {
    const at = await adminToken(request);
    // Force-delete company cascades assets/categories/vouchers
    await api(request, "PATCH", `/admin/companies/${state.companyId}`, at, null, { is_active: false });
    await api(request, "DELETE", `/admin/companies/${state.companyId}?force=true`, at);
    await api(request, "DELETE", `/admin/users/${state.ownerUserId}/hard`, at);
    await api(request, "DELETE", `/admin/users/${state.viewerUserId}/hard`, at);
  });

  // ───────────────────────── Categories ─────────────────────────
  test("Category CRUD + validation", async ({ request }) => {
    // Create
    const c1 = await api(request, "POST", "/fixed-assets/categories", state.ownerToken, state.companyId, {
      name: "Machinery",
      depreciation_method: "wdv",
      rate_pct: 12.5,
      useful_life_years: 8,
    });
    expect(c1.body.depreciation_method).toBe("wdv");
    // rate_pct is auto-computed from useful_life_years per Schedule II (WDV, 5% residual):
    // 1 - 0.05^(1/8) = 31.23% — the provided rate_pct is derived, not stored verbatim.
    expect(c1.body.rate_pct).toBe(31.23);
    state.catWdv = c1.body.id;

    const c2 = await api(request, "POST", "/fixed-assets/categories", state.ownerToken, state.companyId, {
      name: "Office Fitout",
      depreciation_method: "slm",
      rate_pct: 10,
      useful_life_years: 10,
    });
    expect(c2.status).toBe(201);
    state.catSlm = c2.body.id;
    state.catSlmRate = c2.body.rate_pct; // slm(10) = (1-0.05)/10 = 9.5%

    // List contains both
    const list = await api(request, "GET", "/fixed-assets/categories", state.ownerToken, state.companyId);
    expect(list.status).toBe(200);
    const names = list.body.map((x: any) => x.name);
    expect(names).toContain("Machinery");
    expect(names).toContain("Office Fitout");

    // Get by id
    const one = await api(request, "GET", `/fixed-assets/categories/${state.catWdv}`, state.ownerToken, state.companyId);
    expect(one.status).toBe(200);
    expect(one.body.name).toBe("Machinery");
    // Patch — name updates; rate_pct stays derived from useful_life_years (Schedule II
    // auto-compute) while the category has a useful life, so 15 is ignored → 31.23.
    const upd = await api(request, "PATCH", `/fixed-assets/categories/${state.catWdv}`, state.ownerToken, state.companyId, {
      rate_pct: 15,
      name: "Machinery (rev)",
    });
    expect(upd.status).toBe(200);
    expect(upd.body.rate_pct).toBe(31.23);
    expect(upd.body.name).toBe("Machinery (rev)");

    // Patching useful_life_years re-derives the rate: WDV(10) = 1 - 0.05^(1/10) = 25.89
    const upd2 = await api(request, "PATCH", `/fixed-assets/categories/${state.catWdv}`, state.ownerToken, state.companyId, {
      useful_life_years: 10,
    });
    expect(upd2.status).toBe(200);
    expect(upd2.body.rate_pct).toBe(25.89);
    state.catWdvRate = upd2.body.rate_pct;

    // Validation: missing name -> 422
    const bad = await api(request, "POST", "/fixed-assets/categories", state.ownerToken, state.companyId, {
      depreciation_method: "wdv",
    });
    expect(bad.status).toBe(422);

    // Validation: bad method -> 422
    const bad2 = await api(request, "POST", "/fixed-assets/categories", state.ownerToken, state.companyId, {
      name: "X", depreciation_method: "xyz",
    });
    expect(bad2.status).toBe(422);

    // Validation: rate > 100 -> 422
    const bad3 = await api(request, "POST", "/fixed-assets/categories", state.ownerToken, state.companyId, {
      name: "X", rate_pct: 150,
    });
    expect(bad3.status).toBe(422);
  });

  // ───────────────────────── Assets ─────────────────────────
  test("Asset CRUD + validation + filters", async ({ request }) => {
    // WDV asset, mid-year put-to-use
    const a1 = await api(request, "POST", "/fixed-assets/assets", state.ownerToken, state.companyId, {
      category_id: state.catWdv,
      asset_code: "WDV-001",
      name: "CNC Machine",
      purchase_date: "2030-06-15",
      put_to_use_date: "2030-07-01",
      cost: 100000,
      salvage_value: 0,
    });
    expect(a1.status).toBe(201);
    expect(a1.body.wdv).toBe(100000);
    expect(a1.body.accumulated_depreciation).toBe(0);
    state.assetWdv = a1.body.id;

    // SLM asset, full year
    const a2 = await api(request, "POST", "/fixed-assets/assets", state.ownerToken, state.companyId, {
      category_id: state.catSlm,
      asset_code: "SLM-001",
      name: "Showroom Shelving",
      purchase_date: "2030-04-01",
      cost: 120000,
      salvage_value: 12000,
    });
    expect(a2.status).toBe(201);
    state.assetSlm = a2.body.id;

    // Inactive asset (should be excluded from depreciation)
    const a3 = await api(request, "POST", "/fixed-assets/assets", state.ownerToken, state.companyId, {
      category_id: state.catWdv,
      asset_code: "INACT-001",
      name: "Retired Laptop",
      purchase_date: "2030-05-01",
      cost: 50000,
      is_active: false,
    });
    expect(a3.status).toBe(201);
    state.assetInactive = a3.body.id;

    // List + filter by category
    const all = await api(request, "GET", "/fixed-assets/assets", state.ownerToken, state.companyId);
    expect(all.status).toBe(200);
    expect(all.body.length).toBe(3);

    const filt = await api(request, "GET", `/fixed-assets/assets?category_id=${state.catWdv}`, state.ownerToken, state.companyId);
    expect(filt.body.length).toBe(2);

    const onlyActive = await api(request, "GET", "/fixed-assets/assets?is_active=true", state.ownerToken, state.companyId);
    expect(onlyActive.body.length).toBe(2);

    // Get + Patch
    const getOne = await api(request, "GET", `/fixed-assets/assets/${state.assetWdv}`, state.ownerToken, state.companyId);
    expect(getOne.status).toBe(200);
    const patched = await api(request, "PATCH", `/fixed-assets/assets/${state.assetWdv}`, state.ownerToken, state.companyId, {
      name: "CNC Machine (renamed)", cost: 110000,
    });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe("CNC Machine (renamed)");
    expect(patched.body.wdv).toBe(110000); // wdv re-derived from cost - accum

    // Validation: unknown category -> 404
    const badCat = await api(request, "POST", "/fixed-assets/assets", state.ownerToken, state.companyId, {
      category_id: "00000000-0000-0000-0000-000000000000",
      name: "X", purchase_date: "2030-04-01", cost: 1000,
    });
    expect(badCat.status).toBe(404);

    // Validation: negative cost -> 422
    const badCost = await api(request, "POST", "/fixed-assets/assets", state.ownerToken, state.companyId, {
      category_id: state.catWdv, name: "X", purchase_date: "2030-04-01", cost: -5,
    });
    expect(badCost.status).toBe(422);

    // Validation: bad date -> 422
    const badDate = await api(request, "POST", "/fixed-assets/assets", state.ownerToken, state.companyId, {
      category_id: state.catWdv, name: "X", purchase_date: "07/01/2030", cost: 5,
    });
    expect(badDate.status).toBe(422);
  });

  // ───────────────────────── Depreciation schedule ─────────────────────────
  test("Depreciation schedule is computed correctly (WDV + SLM, days-apportioned)", async ({ request }) => {
    const fyStart = "2030-04-01";
    const fyEnd = "2031-03-31";
    const sched = await api(
      request, "GET", `/fixed-assets/depreciation/schedule?financial_year_id=${state.fyId}`,
      state.ownerToken, state.companyId,
    );
    // Build lookup by asset_code
    const byCode: Record<string, any> = Object.fromEntries(sched.body.lines.map((l: any) => [l.asset_code, l]));
    // WDV asset: cost 110000, rate derived from category (Schedule II WDV, useful_life 10y → 25.89%), put_to_use 2030-07-01
    const wdvLine = byCode["WDV-001"];
    const daysInFy = daysInclusive(fyStart, fyEnd);
    const daysInUse = daysInclusive("2030-07-01", fyEnd);
    const wdvRate = state.catWdvRate ?? 25.89;
    const wdvExpected = round2((110000 * (wdvRate / 100) * daysInUse) / daysInFy);
    expect(wdvLine.opening_wdv).toBe(110000);
    expect(wdvLine.depreciation).toBeCloseTo(wdvExpected, 2);
    expect(wdvLine.closing_wdv).toBeCloseTo(round2(110000 - wdvExpected), 2);
    expect(wdvLine.closing_wdv).toBeCloseTo(wdvLine.opening_wdv - wdvLine.depreciation, 2);


    // SLM asset: cost 120000, salvage 12000, full year — rate derived from
    // category (Schedule II SLM, useful_life 10y → (1-0.05)/10 = 9.5%)
    const slmLine = byCode["SLM-001"];
    const slmRate = state.catSlmRate ?? 9.5;
    const slmExpected = round2(((120000 - 12000) * (slmRate / 100) * daysInFy) / daysInFy);
    expect(slmLine.depreciation).toBeCloseTo(slmExpected, 2);
    expect(slmLine.closing_wdv).toBeCloseTo(round2(120000 - slmExpected), 2);

    // Total == sum of lines
    const sum = round2(sched.body.lines.reduce((s: number, l: any) => s + l.depreciation, 0));
    expect(sched.body.total_depreciation).toBeCloseTo(sum, 2);
    expect(sched.body.total_depreciation).toBeGreaterThan(0);
  });

  // ───────────────────────── Depreciation run + idempotency ─────────────────────────
  test("Depreciation run posts a journal, is idempotent, and force re-runs", async ({ request }) => {
    const before = await api(request, "GET", "/fixed-assets/assets", state.ownerToken, state.companyId);
    const wdvBefore = before.body.find((a: any) => a.id === state.assetWdv);

    // Run 1
    const run1 = await api(
      request, "POST", "/fixed-assets/depreciation/run", state.ownerToken, state.companyId,
      { financial_year_id: state.fyId },
    );
    expect(run1.status).toBe(200);
    expect(run1.body.voucher_id).toBeTruthy();
    expect(run1.body.total_depreciation).toBeGreaterThan(0);
    expect(run1.body.message).toMatch(/posted/i);
    state.voucher1 = run1.body.voucher_id;

    // Verify journal voucher: Dr Depreciation Expense == Cr Accumulated Depreciation == total
    const v = await api(request, "GET", `/vouchers/${run1.body.voucher_id}`, state.ownerToken, state.companyId);
    expect(v.status).toBe(200);
    const total = run1.body.total_depreciation;
    const debitSum = v.body.lines.filter((l: any) => l.debit > 0).reduce((s: number, l: any) => s + l.debit, 0);
    const creditSum = v.body.lines.filter((l: any) => l.credit > 0).reduce((s: number, l: any) => s + l.credit, 0);
    expect(round2(debitSum)).toBeCloseTo(round2(total), 2);
    expect(round2(creditSum)).toBeCloseTo(round2(total), 2);

    // Asset WDV reduced, accumulated increased
    const after = await api(request, "GET", "/fixed-assets/assets", state.ownerToken, state.companyId);
    const wdvAfter = after.body.find((a: any) => a.id === state.assetWdv);
    expect(wdvAfter.wdv).toBeLessThan(wdvBefore.wdv);
    expect(wdvAfter.accumulated_depreciation).toBeGreaterThan(0);

    // Run 2 (no force) -> idempotent no-op
    const run2 = await api(
      request, "POST", "/fixed-assets/depreciation/run", state.ownerToken, state.companyId,
      { financial_year_id: state.fyId },
    );
    expect(run2.status).toBe(200);
    expect(run2.body.voucher_id).toBeNull();
    expect(run2.body.total_depreciation).toBe(0);
    expect(run2.body.message).toMatch(/no new depreciation/i);

    // Force run -> posts again
    const run3 = await api(
      request, "POST", "/fixed-assets/depreciation/run", state.ownerToken, state.companyId,
      { financial_year_id: state.fyId, force: true },
    );
    expect(run3.status).toBe(200);
    expect(run3.body.voucher_id).toBeTruthy();
    expect(run3.body.total_depreciation).toBeGreaterThan(0);
    state.voucher2 = run3.body.voucher_id;
  });

  // ───────────────────────── Role gating ─────────────────────────
  test("Viewer can read but cannot write", async ({ request }) => {
    const read = await api(request, "GET", "/fixed-assets/categories", state.viewerToken, state.companyId);
    expect(read.status).toBe(200);

    const write = await api(request, "POST", "/fixed-assets/categories", state.viewerToken, state.companyId, {
      name: "Should Fail", depreciation_method: "wdv", rate_pct: 10,
    });
    expect(write.status).toBe(403);

    const writeAsset = await api(request, "POST", "/fixed-assets/assets", state.viewerToken, state.companyId, {
      category_id: state.catWdv, name: "X", purchase_date: "2030-04-01", cost: 1000,
    });
    expect(writeAsset.status).toBe(403);
  });
});
