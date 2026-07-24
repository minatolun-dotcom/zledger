import { test, expect, type APIRequestContext } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:9090/api";

async function loginAs(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  return (await res.json()).access_token as string;
}

async function adminToken(request: APIRequestContext) {
  return loginAs(request, ADMIN.email, ADMIN.password);
}

async function api(
  request: APIRequestContext,
  method: string,
  path: string,
  token?: string | null,
  companyId?: string | null,
  body?: any
) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (companyId) headers["X-Company-Id"] = companyId;
  const opts: any = { headers };
  if (body !== undefined) opts.data = body;
  let res;
  switch (method) {
    case "GET":
      res = await request.get(`${API}${path}`, opts);
      break;
    case "POST":
      res = await request.post(`${API}${path}`, opts);
      break;
    default:
      throw new Error(`Unknown method: ${method}`);
  }
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status(), body: json };
}

async function getCompanyId(request: APIRequestContext, token: string) {
  const r = await api(request, "GET", "/auth/me", token);
  return r.body.companies?.[0]?.id as string;
}

test.describe("Quick Create — created_from audit trail", () => {
  test("Account group created inline records created_from in audit", async ({ request }) => {
    const at = await adminToken(request);
    const cid = await getCompanyId(request, at);
    const from = "Sales Voucher";
    const name = `QC Audit Group ${Date.now()}`;

    const create = await api(
      request,
      "POST",
      "/coa/groups",
      at,
      cid,
      { name, created_from: from }
    );
    expect(create.status).toBe(201);
    const groupId = (create.body as any).id;

    const audit = await api(
      request,
      "GET",
      `/audit?entity_type=account_group&entity_id=${groupId}`,
      at,
      cid
    );
    expect(audit.status).toBe(200);
    const items = (audit.body as any).items as any[];
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].description).toContain(`(from: ${from})`);
  });

  test("Ledger created inline records created_from and references a freshly created group", async ({ request }) => {
    const at = await adminToken(request);
    const cid = await getCompanyId(request, at);
    const from = "Payment Voucher";

    // Simulate the nested-create path: create the group first, then the ledger.
    const grp = await api(request, "POST", "/coa/groups", at, cid, {
      name: `QC Audit Group2 ${Date.now()}`,
    });
    expect(grp.status).toBe(201);
    const groupId = (grp.body as any).id;

    const ledger = await api(
      request,
      "POST",
      "/coa/ledgers",
      at,
      cid,
      { name: `QC Audit Ledger ${Date.now()}`, group_id: groupId, created_from: from }
    );
    expect(ledger.status).toBe(201);
    const ledgerId = (ledger.body as any).id;

    const audit = await api(
      request,
      "GET",
      `/audit?entity_type=ledger&entity_id=${ledgerId}`,
      at,
      cid
    );
    const items = (audit.body as any).items as any[];
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].description).toContain(`(from: ${from})`);
  });
});
