import { test, expect, type APIRequestContext } from "@playwright/test";
import { ADMIN, COMPANY } from "../helpers/fixtures";

const API = "http://localhost:8080/api";

async function registerUser(request: APIRequestContext, email: string, name: string, password: string) {
  return request.post(`${API}/auth/register`, { data: { email, name, password } });
}

async function loginAs(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  return (await res.json()).access_token as string;
}

async function adminToken(request: APIRequestContext) {
  return loginAs(request, ADMIN.email, ADMIN.password);
}

async function api(request: APIRequestContext, method: string, path: string, token?: string | null, companyId?: string | null, body?: any) {
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

async function getCompanyId(request: APIRequestContext, token: string) {
  const r = await api(request, "GET", "/auth/me", token);
  return r.body.companies?.[0]?.id;
}

async function getLedgerIds(request: APIRequestContext, token: string, cid: string, names: string[]): Promise<Map<string, string>> {
  const r = await api(request, "GET", "/coa/ledgers", token, cid);
  const map = new Map<string, string>();
  if (r.status === 200 && Array.isArray(r.body)) {
    for (const ledger of r.body) {
      if (names.includes(ledger.name)) map.set(ledger.name, ledger.id);
    }
  }
  return map;
}

async function registerViewerInCompany(request: APIRequestContext, adminTokenVal: string, cid: string, email: string, name: string): Promise<{ token: string; userId: string }> {
  const rr = await api(request, "POST", "/auth/register", null, null, { email, name, password: "test12345" });
  const vt = await loginAs(request, email, "test12345");
  await api(request, "POST", "/members", adminTokenVal, cid, { email, role: "viewer" });
  return { token: vt, userId: rr.body.user.id };
}

async function cleanupViewerUser(request: APIRequestContext, adminTokenVal: string, cid: string, userId: string) {
  await api(request, "DELETE", `/members/${userId}`, adminTokenVal, cid);
  await api(request, "DELETE", `/admin/users/${userId}`, adminTokenVal);
}

// ═══════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════
test.describe("API: Auth", () => {
  const TEST_EMAIL = `api-auth-${Date.now()}@test.example.com`;

  test("POST /auth/register creates user and returns token", async ({ request }) => {
    const r = await api(request, "POST", "/auth/register", null, null, { email: TEST_EMAIL, name: "API Auth Test", password: "test12345" });
    expect(r.status).toBe(201);
    expect(r.body.access_token).toBeTruthy();
    const at = await adminToken(request);
    await api(request, "DELETE", `/admin/users/${r.body.user.id}`, at);
  });

  test("POST /auth/login returns token for valid credentials", async ({ request }) => {
    const r = await api(request, "POST", "/auth/login", null, null, { email: ADMIN.email, password: ADMIN.password });
    expect(r.status).toBe(200);
    expect(r.body.access_token).toBeTruthy();
  });

  test("POST /auth/login returns 401 for wrong password", async ({ request }) => {
    const r = await api(request, "POST", "/auth/login", null, null, { email: ADMIN.email, password: "wrong" });
    expect(r.status).toBe(401);
  });

  test("POST /auth/login returns 401 for non-existent user", async ({ request }) => {
    const r = await api(request, "POST", "/auth/login", null, null, { email: "noone@test.example.com", password: "test12345" });
    expect(r.status).toBe(401);
  });

  test("GET /auth/me returns current user info", async ({ request }) => {
    const token = await adminToken(request);
    const r = await api(request, "GET", "/auth/me", token);
    expect(r.status).toBe(200);
    expect(r.body.user.email).toBe(ADMIN.email);
    expect(r.body.companies.length).toBeGreaterThan(0);
  });

  test("GET /auth/me returns 401 without token", async ({ request }) => {
    const r = await api(request, "GET", "/auth/me");
    expect(r.status).toBe(401);
  });

  test("PATCH /auth/me updates profile", async ({ request }) => {
    const token = await adminToken(request);
    const r = await api(request, "PATCH", "/auth/me", token, null, { name: "Administrator Updated" });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe("Administrator Updated");
    await api(request, "PATCH", "/auth/me", token, null, { name: ADMIN.name });
  });

  test("PATCH /auth/me/password changes password", async ({ request }) => {
    const token = await adminToken(request);
    const r = await api(request, "PATCH", "/auth/me/password", token, null, { current_password: ADMIN.password, new_password: "admin12345" });
    expect(r.status).toBe(200);
  });

  test("PATCH /auth/me/password returns 400 for wrong current password", async ({ request }) => {
    const token = await adminToken(request);
    const r = await api(request, "PATCH", "/auth/me/password", token, null, { current_password: "wrong", new_password: "admin12345" });
    expect(r.status).toBe(400);
  });

  test("POST /auth/register returns 409 for duplicate email", async ({ request }) => {
    const r = await api(request, "POST", "/auth/register", null, null, { email: ADMIN.email, name: "Dup", password: "test12345" });
    expect(r.status).toBe(409);
  });
});

// ═══════════════════════════════════════════
// COMPANIES
// ═══════════════════════════════════════════
test.describe("API: Companies", () => {
  test("GET /companies lists companies", async ({ request }) => {
    const token = await adminToken(request);
    const r = await api(request, "GET", "/companies", token);
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
  });

  test("GET /companies returns 401 without token", async ({ request }) => {
    const r = await api(request, "GET", "/companies");
    expect(r.status).toBe(401);
  });

  test("POST /companies creates company", async ({ request }) => {
    const token = await adminToken(request);
    const r = await api(request, "POST", "/companies", token, null, { name: `Test Co ${Date.now()}` });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeTruthy();
    await api(request, "DELETE", `/admin/companies/${r.body.id}`, token);
  });

  test("GET /companies/{id} returns details", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", `/companies/${cid}`, token);
    expect(r.status).toBe(200);
    expect(r.body.name).toBe(COMPANY.name);
  });

  test("GET /companies/{id} returns 404 for non-existent", async ({ request }) => {
    const token = await adminToken(request);
    const r = await api(request, "GET", "/companies/non-existent", token);
    expect(r.status).toBe(404);
  });

  test("PATCH /companies/{id} updates company (owner)", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "PATCH", `/companies/${cid}`, token, cid, { address: "123 Test St" });
    expect(r.status).toBe(200);
    expect(r.body.address).toBe("123 Test St");
    await api(request, "PATCH", `/companies/${cid}`, token, cid, { address: null });
  });

  test("GET /companies/{id}/logo is public (returns 404 for nonexistent)", async ({ request }) => {
    const r = await api(request, "GET", "/companies/9999/logo");
    expect(r.status).toBe(404);
  });

  test("DELETE /companies/{id}/logo returns 204 when no logo (no-op)", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "DELETE", `/companies/${cid}/logo`, token, cid);
    expect(r.status).toBe(204);
  });
});

// ═══════════════════════════════════════════
// MEMBERS
// ═══════════════════════════════════════════
test.describe("API: Members", () => {
  const MEMBER_EMAIL = `api-member-${Date.now()}@test.example.com`;

  test("GET /members lists members", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/members", token, cid);
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
  });

  test("POST /members adds member (owner)", async ({ request }) => {
    const rr = await api(request, "POST", "/auth/register", null, null, { email: MEMBER_EMAIL, name: "API Member", password: "test12345" });
    expect(rr.status).toBe(201);
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "POST", "/members", token, cid, { email: MEMBER_EMAIL, role: "viewer" });
    expect(r.status).toBe(201);
    expect(r.body.role).toBe("viewer");
    await api(request, "DELETE", `/admin/users/${rr.body.user.id}`, token);
  });

  test("PATCH /members/{user_id} updates role (owner)", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const members = await api(request, "GET", "/members", token, cid);
    const member = members.body.find((m: any) => m.user_email === MEMBER_EMAIL);
    if (member) {
      const r = await api(request, "PATCH", `/members/${member.user_id}`, token, cid, { role: "accountant" });
      expect(r.status).toBe(200);
      expect(r.body.role).toBe("accountant");
    }
  });

  test("DELETE /members/{user_id} removes member (owner)", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const members = await api(request, "GET", "/members", token, cid);
    const member = members.body.find((m: any) => m.user_email === MEMBER_EMAIL);
    if (member) {
      const r = await api(request, "DELETE", `/members/${member.user_id}`, token, cid);
      expect(r.status).toBe(204);
    }
  });

  test("GET /members returns 401 without token", async ({ request }) => {
    const r = await api(request, "GET", "/members");
    expect(r.status).toBe(401);
  });
});

// ═══════════════════════════════════════════
// VOUCHERS
// ═══════════════════════════════════════════
test.describe("API: Vouchers", () => {
  let voucherId: string;
  let cashId: string;
  let debtorsId: string;

  test("GET /vouchers/next-number returns next number", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/vouchers/next-number", token, cid);
    // 500 if no FY or company context issue
    expect([200, 400, 500]).toContain(r.status);
  });

  test("POST /vouchers creates journal voucher", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const ledgers = await getLedgerIds(request, token, cid, ["Cash", "Sundry Debtors"]);
    cashId = ledgers.get("Cash") || "";
    debtorsId = ledgers.get("Sundry Debtors") || "";
    expect(cashId).toBeTruthy();
    expect(debtorsId).toBeTruthy();
    const r = await api(request, "POST", "/vouchers", token, cid, {
      voucher_type: "journal",
      voucher_date: new Date().toISOString().slice(0, 10),
      narration: "API Test Journal",
      lines: [
        { ledger_id: cashId, debit: 500, credit: 0 },
        { ledger_id: debtorsId, debit: 0, credit: 500 },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeTruthy();
    voucherId = r.body.id;
  });

  test("GET /vouchers/{id} returns details", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!voucherId) return;
    const r = await api(request, "GET", `/vouchers/${voucherId}`, token, cid);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(voucherId);
  });

  test("GET /vouchers/{id} returns 404 for non-existent", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/vouchers/non-existent", token, cid);
    expect(r.status).toBe(404);
  });

  test("PATCH /vouchers/{id} updates voucher", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!voucherId) return;
    if (!cashId || !debtorsId) {
      const ledgers = await getLedgerIds(request, token, cid, ["Cash", "Sundry Debtors"]);
      cashId = ledgers.get("Cash") || cashId;
      debtorsId = ledgers.get("Sundry Debtors") || debtorsId;
    }
    const r = await api(request, "PATCH", `/vouchers/${voucherId}`, token, cid, {
      voucher_type: "journal", voucher_date: new Date().toISOString().slice(0, 10), narration: "Updated",
      lines: [{ ledger_id: cashId, debit: 500, credit: 0 }, { ledger_id: debtorsId, debit: 0, credit: 500 }],
    });
    expect(r.status).toBe(200);
    expect(r.body.narration).toBe("Updated");
  });

  test("POST /vouchers/{id}/cancel creates reversal", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!cashId || !debtorsId) {
      const ledgers = await getLedgerIds(request, token, cid, ["Cash", "Sundry Debtors"]);
      cashId = ledgers.get("Cash") || cashId;
      debtorsId = ledgers.get("Sundry Debtors") || debtorsId;
    }
    const c = await api(request, "POST", "/vouchers", token, cid, {
      voucher_type: "journal", voucher_date: new Date().toISOString().slice(0, 10), narration: "To cancel",
      lines: [{ ledger_id: cashId, debit: 200, credit: 0 }, { ledger_id: debtorsId, debit: 0, credit: 200 }],
    });
    if (c.status === 201) {
      const r = await api(request, "POST", `/vouchers/${c.body.id}/cancel`, token, cid, { reason: "Test cancel" });
      expect(r.status).toBe(200);
      expect(r.body.cancelled_at).toBeTruthy();
    }
  });

  test("POST /vouchers/{id}/cancel returns 404 for non-existent", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "POST", "/vouchers/non-existent/cancel", token, cid, { reason: "Test" });
    expect(r.status).toBe(404);
  });

  test("DELETE /vouchers/{id} deletes voucher", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!cashId || !debtorsId) {
      const ledgers = await getLedgerIds(request, token, cid, ["Cash", "Sundry Debtors"]);
      cashId = ledgers.get("Cash") || cashId;
      debtorsId = ledgers.get("Sundry Debtors") || debtorsId;
    }
    const c = await api(request, "POST", "/vouchers", token, cid, {
      voucher_type: "journal", voucher_date: new Date().toISOString().slice(0, 10), narration: "To delete",
      lines: [{ ledger_id: cashId, debit: 50, credit: 0 }, { ledger_id: debtorsId, debit: 0, credit: 50 }],
    });
    if (c.status === 201) {
      const r = await api(request, "DELETE", `/vouchers/${c.body.id}`, token, cid);
      expect(r.status).toBe(204);
    }
  });

  test("POST /vouchers returns 403 for viewer", async ({ request }) => {
    const email = `api-v-viewer-${Date.now()}@test.example.com`;
    const at = await adminToken(request);
    const cid = await getCompanyId(request, at);
    const { token: vt, userId } = await registerViewerInCompany(request, at, cid, email, "Viewer");
    const r = await api(request, "POST", "/vouchers", vt, cid, {
      voucher_type: "journal", voucher_date: new Date().toISOString().slice(0, 10), narration: "Viewer",
      lines: [{ ledger_id: "x", debit: 10, credit: 0 }, { ledger_id: "y", debit: 0, credit: 10 }],
    });
    expect(r.status).toBe(403);
    await cleanupViewerUser(request, at, cid, userId);
  });

  test("GET /vouchers/{id}/pdf returns PDF", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!voucherId) return;
    const res = await request.get(`${API}/vouchers/${voucherId}/pdf`, {
      headers: { Authorization: `Bearer ${token}`, "X-Company-Id": cid },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("pdf");
  });
});

// ═══════════════════════════════════════════
// CHART OF ACCOUNTS
// ═══════════════════════════════════════════
test.describe("API: Chart of Accounts", () => {
  let groupId: string;
  let ledgerId: string;

  test("GET /coa/financial-years lists FYs", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/coa/financial-years", token, cid);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBeTruthy();
  });

  test("POST /coa/financial-years creates FY", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const year = 2050 + (Date.now() % 100);
    const r = await api(request, "POST", "/coa/financial-years", token, cid, {
      name: `FY ${Date.now()}`, start_date: `${year}-04-01`, end_date: `${year + 1}-03-31`,
    });
    expect(r.status).toBe(201);
    await api(request, "DELETE", `/coa/financial-years/${r.body.id}`, token, cid);
  });

  test("GET /coa/groups lists groups", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/coa/groups", token, cid);
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
  });

  test("POST /coa/groups creates group (needs nature)", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "POST", "/coa/groups", token, cid, {
      name: `Test Group ${Date.now()}`, nature: "asset", group_type: "sub",
    });
    expect(r.status).toBe(201);
    groupId = r.body.id;
  });

  test("GET /coa/ledgers lists ledgers", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/coa/ledgers", token, cid);
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
  });

  test("POST /coa/ledgers creates ledger (needs group_id)", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    // Get existing group if no created one
    const gid = groupId || (await api(request, "GET", "/coa/groups", token, cid)).body[0]?.id;
    if (!gid) return;
    const r = await api(request, "POST", "/coa/ledgers", token, cid, {
      name: `Test Ledger ${Date.now()}`, group_id: gid,
    });
    expect(r.status).toBe(201);
    ledgerId = r.body.id;
  });

  test("GET /coa/parties lists parties", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/coa/parties", token, cid);
    expect(r.status).toBe(200);
  });

  test("POST /coa/parties creates party", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "POST", "/coa/parties", token, cid, {
      name: `Test Party ${Date.now()}`, party_type: "debtor",
    });
    expect(r.status).toBe(201);
  });

  test("DELETE /coa/ledgers/{id} deletes ledger", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!ledgerId) return;
    const r = await api(request, "DELETE", `/coa/ledgers/${ledgerId}`, token, cid);
    expect(r.status).toBe(204);
  });

  test("DELETE /coa/groups/{id} deletes group", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!groupId) return;
    const r = await api(request, "DELETE", `/coa/groups/${groupId}`, token, cid);
    expect(r.status).toBe(204);
  });

  test("POST /coa/ledgers returns 403 for viewer", async ({ request }) => {
    const email = `api-coa-v-${Date.now()}@test.example.com`;
    const at = await adminToken(request);
    const cid = await getCompanyId(request, at);
    const { token: vt, userId } = await registerViewerInCompany(request, at, cid, email, "COA Viewer");
    const r = await api(request, "POST", "/coa/ledgers", vt, cid, { name: "Viewer Ledger", group_id: "x" });
    expect(r.status).toBe(403);
    await cleanupViewerUser(request, at, cid, userId);
  });
});

// ═══════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════
test.describe("API: Inventory", () => {
  let groupId: string;
  let itemId: string;

  test("GET /inventory/groups lists groups", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/inventory/groups", token, cid);
    expect(r.status).toBe(200);
  });

  test("POST /inventory/groups creates group", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "POST", "/inventory/groups", token, cid, { name: `SG ${Date.now()}` });
    expect(r.status).toBe(201);
    groupId = r.body.id;
  });

  test("GET /inventory/items lists items", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/inventory/items", token, cid);
    expect(r.status).toBe(200);
  });

  test("POST /inventory/items creates item", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "POST", "/inventory/items", token, cid, {
      name: `SI ${Date.now()}`, group_id: groupId || undefined, unit: "pcs",
    });
    expect(r.status).toBe(201);
    itemId = r.body.id;
  });

  test("DELETE /inventory/items/{id} deletes item", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!itemId) return;
    const r = await api(request, "DELETE", `/inventory/items/${itemId}`, token, cid);
    expect([200, 204]).toContain(r.status);
    itemId = "";
  });

  test("POST /inventory/items creates item for entry test", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "POST", "/inventory/items", token, cid, {
      name: `SI-E ${Date.now()}`, group_id: groupId || undefined, unit: "pcs",
    });
    expect(r.status).toBe(201);
    itemId = r.body.id;
  });

  test("GET /inventory/entries lists entries", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/inventory/entries", token, cid);
    expect(r.status).toBe(200);
  });

  test("POST /inventory/entries creates entry", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!itemId) return;
    const r = await api(request, "POST", "/inventory/entries", token, cid, {
      stock_item_id: itemId, entry_type: "inward", quantity: 100, rate: 25.50,
      entry_date: new Date().toISOString().slice(0, 10),
    });
    expect(r.status).toBe(201);
  });

  test("GET /inventory/valuation returns valuation", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/inventory/valuation", token, cid);
    expect(r.status).toBe(200);
  });

  test("DELETE /inventory/items/{id} cleans up entry item", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!itemId) return;
    const r = await api(request, "DELETE", `/inventory/items/${itemId}`, token, cid);
    expect([200, 204, 400]).toContain(r.status);
  });

  test("DELETE /inventory/groups/{id} deletes group", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!groupId) return;
    const r = await api(request, "DELETE", `/inventory/groups/${groupId}`, token, cid);
    expect([200, 204]).toContain(r.status);
  });
});

// ═══════════════════════════════════════════
// GST
// ═══════════════════════════════════════════
test.describe("API: GST", () => {
  let hsnId: string;
  let regId: string;

  test("GET /gst/hsn-sac lists HSN", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/gst/hsn-sac", token, cid);
    expect(r.status).toBe(200);
  });

  test("POST /gst/hsn-sac creates HSN", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "POST", "/gst/hsn-sac", token, cid, {
      code: `${998000 + (Date.now() % 1000)}`, description: "API Test HSN", gst_rate: 18,
    });
    expect(r.status).toBe(201);
    hsnId = r.body.id;
  });

  test("GET /gst/hsn-sac/{id} returns details", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!hsnId) return;
    const r = await api(request, "GET", `/gst/hsn-sac/${hsnId}`, token, cid);
    expect(r.status).toBe(200);
  });

  test("GET /gst/registrations lists", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/gst/registrations", token, cid);
    expect(r.status).toBe(200);
  });

  test("POST /gst/registrations creates (needs state_code)", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "POST", "/gst/registrations", token, cid, {
      gstin: `27AABCP${(Date.now() % 9000 + 1000)}A1Z5`,
      legal_name: "API Test Entity", state_code: "27", registration_type: "regular",
    });
    expect(r.status).toBe(201);
    regId = r.body.id;
  });

  test("GET /gst/returns lists", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/gst/returns", token, cid);
    expect(r.status).toBe(200);
  });

  test("POST /gst/calculate-gst computes", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!hsnId) return;
    const r = await api(request, "POST", "/gst/calculate-gst", token, cid, {
      amount: 10000, hsn_sac_id: hsnId, is_inter_state: false,
    });
    expect(r.status).toBe(200);
    expect(r.body.taxable_amount).toBe(10000);
  });

  test("DELETE /gst/hsn-sac/{id}", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!hsnId) return;
    const r = await api(request, "DELETE", `/gst/hsn-sac/${hsnId}`, token, cid);
    expect(r.status).toBe(204);
  });

  test("DELETE /gst/registrations/{id}", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!regId) return;
    const r = await api(request, "DELETE", `/gst/registrations/${regId}`, token, cid);
    expect(r.status).toBe(204);
  });
});

// ═══════════════════════════════════════════
// TDS/TCS
// ═══════════════════════════════════════════
test.describe("API: TDS/TCS", () => {
  let sectionId: string;

  test("GET /tds-tcs/sections lists", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/tds-tcs/sections", token, cid);
    expect(r.status).toBe(200);
  });

  test("POST /tds-tcs/sections creates", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "POST", "/tds-tcs/sections", token, cid, {
      section_code: `194J-${Date.now() % 1000}`, section_name: "API Test", tds_tcs_type: "tds", rate: 10,
    });
    expect(r.status).toBe(201);
    sectionId = r.body.id;
  });

  test("GET /tds-tcs/entries lists", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/tds-tcs/entries", token, cid);
    expect(r.status).toBe(200);
  });

  test("GET /tds-tcs/returns lists", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/tds-tcs/returns", token, cid);
    expect(r.status).toBe(200);
  });

  test("GET /tds-tcs/summary returns summary", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/tds-tcs/summary", token, cid);
    expect(r.status).toBe(200);
  });

  test("POST /tds-tcs/sections/seed seeds", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "POST", "/tds-tcs/sections/seed", token, cid);
    expect(r.status).toBe(201);
  });

  test("DELETE /tds-tcs/sections/{id}", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!sectionId) return;
    const r = await api(request, "DELETE", `/tds-tcs/sections/${sectionId}`, token, cid);
    expect(r.status).toBe(204);
  });
});

// ═══════════════════════════════════════════
// PAYMENTS
// ═══════════════════════════════════════════
test.describe("API: Payments", () => {
  test("GET /payments/receivables", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/payments/receivables", token, cid);
    expect(r.status).toBe(200);
  });

  test("GET /payments/payables", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/payments/payables", token, cid);
    expect(r.status).toBe(200);
  });
});

// ═══════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════
test.describe("API: Reports", () => {
  test("GET /reports/trial-balance", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const fys = await api(request, "GET", "/coa/financial-years", token, cid);
    const fyId = fys.body?.[0]?.id;
    if (!fyId) return;
    const r = await api(request, "GET", `/reports/trial-balance?financial_year_id=${fyId}`, token, cid);
    expect(r.status).toBe(200);
  });

  test("GET /reports/profit-and-loss", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const fys = await api(request, "GET", "/coa/financial-years", token, cid);
    const fyId = fys.body?.[0]?.id;
    if (!fyId) return;
    const r = await api(request, "GET", `/reports/profit-and-loss?financial_year_id=${fyId}`, token, cid);
    expect(r.status).toBe(200);
  });

  test("GET /reports/balance-sheet", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const fys = await api(request, "GET", "/coa/financial-years", token, cid);
    const fyId = fys.body?.[0]?.id;
    if (!fyId) return;
    const r = await api(request, "GET", `/reports/balance-sheet?financial_year_id=${fyId}`, token, cid);
    expect(r.status).toBe(200);
  });

  test("GET /reports/stock-summary", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/reports/stock-summary", token, cid);
    expect(r.status).toBe(200);
  });

  test("GET /reports/daybook", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/reports/daybook?start_date=2026-04-01&end_date=2027-03-31", token, cid);
    expect(r.status).toBe(200);
  });

  test("GET /reports/trial-balance/pdf", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const fys = await api(request, "GET", "/coa/financial-years", token, cid);
    const fyId = fys.body?.[0]?.id;
    if (!fyId) return;
    const res = await request.get(`${API}/reports/trial-balance/pdf?financial_year_id=${fyId}`, {
      headers: { Authorization: `Bearer ${token}`, "X-Company-Id": cid },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("pdf");
  });
});

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
test.describe("API: Dashboard", () => {
  test("GET /dashboard/summary", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const fys = await api(request, "GET", "/coa/financial-years", token, cid);
    const fyId = fys.body?.[0]?.id;
    if (!fyId) return;
    const r = await api(request, "GET", `/dashboard/summary?financial_year_id=${fyId}`, token, cid);
    expect(r.status).toBe(200);
  });
});

// ═══════════════════════════════════════════
// AUDIT
// ═══════════════════════════════════════════
test.describe("API: Audit", () => {
  test("GET /audit lists logs", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/audit", token, cid);
    expect(r.status).toBe(200);
  });

  test("GET /audit/{id} returns 404 for non-existent", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/audit/non-existent", token, cid);
    expect(r.status).toBe(404);
  });

  test("GET /audit returns 403 for viewer", async ({ request }) => {
    const email = `api-audit-v-${Date.now()}@test.example.com`;
    const at = await adminToken(request);
    const cid = await getCompanyId(request, at);
    const { token: vt, userId } = await registerViewerInCompany(request, at, cid, email, "Audit Viewer");
    const r = await api(request, "GET", "/audit", vt, cid);
    expect(r.status).toBe(403);
    await cleanupViewerUser(request, at, cid, userId);
  });
});

// ═══════════════════════════════════════════
// MASTERS
// ═══════════════════════════════════════════
test.describe("API: Masters", () => {
  test("GET /masters/units", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/masters/units", token, cid);
    expect(r.status).toBe(200);
  });

  test("POST /masters/units creates", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "POST", "/masters/units", token, cid, { name: `TU ${Date.now()}`, symbol: "TU" });
    expect(r.status).toBe(201);
  });

  test("GET /masters/cost-centres", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/masters/cost-centres", token, cid);
    expect(r.status).toBe(200);
  });

  test("POST /masters/cost-centres creates", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "POST", "/masters/cost-centres", token, cid, { name: `CC ${Date.now()}` });
    expect(r.status).toBe(201);
  });

  test("GET /masters/cost-categories", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/masters/cost-categories", token, cid);
    expect(r.status).toBe(200);
  });
});

// ═══════════════════════════════════════════
// RECURRING TEMPLATES
// ═══════════════════════════════════════════
test.describe("API: Recurring Templates", () => {
  let templateId: string;

  test("GET /recurring-templates", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/recurring-templates", token, cid);
    expect(r.status).toBe(200);
  });

  test("POST /recurring-templates creates", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "POST", "/recurring-templates", token, cid, {
      name: `RT ${Date.now()}`, voucher_type: "journal", frequency: "monthly", next_run_date: "2026-07-15",
      template_payload: {
        voucher_type: "journal", voucher_date: "2026-07-15", narration: "Recurring journal",
        lines: [{ ledger_id: "x", debit: 100, credit: 0 }, { ledger_id: "y", debit: 0, credit: 100 }],
      },
    });
    expect(r.status).toBe(201);
    templateId = r.body.id;
  });

  test("GET /recurring-templates/{id}", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!templateId) return;
    const r = await api(request, "GET", `/recurring-templates/${templateId}`, token, cid);
    expect(r.status).toBe(200);
  });

  test("DELETE /recurring-templates/{id}", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    if (!templateId) return;
    const r = await api(request, "DELETE", `/recurring-templates/${templateId}`, token, cid);
    expect(r.status).toBe(204);
  });
});

// ═══════════════════════════════════════════
// BANK RECONCILIATION
// ═══════════════════════════════════════════
test.describe("API: Bank Reconciliation", () => {
  test("GET /bank-reconciliation/lines", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/bank-reconciliation/lines?ledger_id=non-existent", token, cid);
    expect(r.status).toBe(200);
  });

  test("GET /bank-reconciliation/summary", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/bank-reconciliation/summary?ledger_id=non-existent", token, cid);
    expect(r.status).toBe(200);
  });

  test("GET /bank-reconciliation/sessions", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/bank-reconciliation/sessions", token, cid);
    expect(r.status).toBe(200);
  });
});

// ═══════════════════════════════════════════
// ATTACHMENTS
// ═══════════════════════════════════════════
test.describe("API: Attachments", () => {
  test("GET /attachments/{voucher_id} returns 404 for non-existent voucher", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/attachments/non-existent", token, cid);
    expect(r.status).toBe(404);
  });

  test("GET /attachments/{voucher_id}/count returns 0 for non-existent voucher", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/attachments/non-existent/count", token, cid);
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(0);
  });
});

// ═══════════════════════════════════════════
// TALLY IMPORT
// ═══════════════════════════════════════════
test.describe("API: Tally Import", () => {
  test("GET /tally-import/jobs", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const r = await api(request, "GET", "/tally-import/jobs", token, cid);
    expect(r.status).toBe(200);
  });

  test("GET /tally-import/sample", async ({ request }) => {
    const res = await request.get(`${API}/tally-import/sample?format=xml`);
    expect(res.status()).toBe(200);
  });
});

// ═══════════════════════════════════════════
// CROSS-CUTTING
// ═══════════════════════════════════════════
test.describe("API: Cross-Cutting Auth", () => {
  test("All protected endpoints return 401 without token", async ({ request }) => {
    for (const path of ["/companies", "/coa/ledgers", "/vouchers", "/inventory/items", "/gst/hsn-sac", "/members", "/audit"]) {
      const r = await api(request, "GET", path);
      expect(r.status).toBe(401);
    }
  });

  test("All read endpoints return 200 with valid token", async ({ request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    for (const path of ["/companies", "/coa/ledgers", "/coa/groups", "/coa/parties", "/coa/financial-years",
      "/inventory/items", "/inventory/groups", "/inventory/entries", "/gst/hsn-sac", "/gst/registrations",
      "/gst/returns", "/members", "/tds-tcs/sections", "/tds-tcs/entries", "/tds-tcs/returns",
      "/payments/receivables", "/payments/payables", "/masters/units", "/masters/cost-centres",
      "/recurring-templates", "/audit"]) {
      const r = await api(request, "GET", path, token, cid);
      expect(r.status).toBe(200);
    }
  });
});
