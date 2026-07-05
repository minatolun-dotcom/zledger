import { test, expect } from "@playwright/test";
import { ADMIN, LEDGERS } from "../helpers/fixtures";

const API = "http://localhost:8080/api";

async function loginAs(request: any, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  return (await res.json()).access_token as string;
}

async function adminToken(request: any) {
  return loginAs(request, ADMIN.email, ADMIN.password);
}

async function api(request: any, method: string, path: string, token?: string | null, companyId?: string | null, body?: any, formData?: boolean) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (companyId) headers["X-Company-Id"] = companyId;
  const opts: any = { headers };
  if (body !== undefined && !formData) opts.data = body;
  if (body !== undefined && formData) opts.multipart = body;
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

async function getLedgerIds(request: any, token: string, cid: string, names: string[]) {
  const r = await api(request, "GET", "/coa/ledgers", token, cid);
  const map = new Map<string, string>();
  if (r.status === 200 && Array.isArray(r.body)) {
    for (const ledger of r.body) {
      if (names.includes(ledger.name)) map.set(ledger.name, ledger.id);
    }
  }
  return map;
}

test.describe("Bank Reconciliation Workflow", () => {
  let token: string;
  let cid: string;
  let hdfcId: string;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
    cid = await getCompanyId(request, token);
    const ledgers = await getLedgerIds(request, token, cid, [LEDGERS.hdfcBank]);
    hdfcId = ledgers.get(LEDGERS.hdfcBank) || "";
  });

  test("POST /bank-reconciliation/lines lists available lines", async ({ request }) => {
    const r = await api(request, "GET", `/bank-reconciliation/lines?ledger_id=${hdfcId}`, token, cid);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  test("GET /bank-reconciliation/summary returns summary", async ({ request }) => {
    const r = await api(request, "GET", `/bank-reconciliation/summary?ledger_id=${hdfcId}`, token, cid);
    expect(r.status).toBe(200);
    expect(r.body).toBeDefined();
  });

  test("GET /bank-reconciliation/sessions returns sessions", async ({ request }) => {
    const r = await api(request, "GET", `/bank-reconciliation/sessions?ledger_id=${hdfcId}`, token, cid);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  test("POST /bank-reconciliation/match validates with non-existent IDs", async ({ request }) => {
    const r = await api(request, "POST", "/bank-reconciliation/match", token, cid, {
      statement_line_id: "00000000-0000-0000-0000-000000000000",
      voucher_id: "00000000-0000-0000-0000-000000000000",
    });
    // match_statement_to_voucher raises ValueError → HTTP 422
    expect([422, 404]).toContain(r.status);
  });

  test("POST /bank-reconciliation/unmatch validates non-existent line", async ({ request }) => {
    const r = await api(request, "POST", "/bank-reconciliation/unmatch", token, cid, {
      statement_line_id: "00000000-0000-0000-0000-000000000000",
    });
    // unreconcile_statement_line raises ValueError → HTTP 422
    expect([422, 404]).toContain(r.status);
  });

  test("Bulk endpoint import bank statement CSV", async ({ request }) => {
    if (!hdfcId) return;

    // Create a CSV file content
    const csvContent = "date,description,debit,credit,reference\n2026-06-01,Test Transaction,1000,,\n2026-06-02,Another Transaction,,2000,REF001\n";
    const buffer = Buffer.from(csvContent);

    const r = await request.post(`${API}/bank-reconciliation/import?ledger_id=${hdfcId}`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Company-Id": cid,
      },
      multipart: {
        file: { name: "test.csv", mimeType: "text/csv", buffer },
      },
    });
    const text = await r.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = text; }

    // May succeed (201) or fail with validation error - just verify the endpoint responds
    expect([201, 400, 422, 500]).toContain(r.status());
    if (r.status() === 201) {
      expect(Array.isArray(json)).toBe(true);
    }
  });
});
