import { test, expect, type APIRequestContext } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:9090/api";

async function loginAs(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  return (await res.json()).access_token;
}

async function api(
  request: APIRequestContext,
  method: string,
  path: string,
  token: string,
  companyId?: string,
  params?: Record<string, string>
) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (companyId) headers["X-Company-Id"] = companyId;
  const opts: { headers: Record<string, string>; params?: Record<string, string> } = { headers };
  if (params) opts.params = params;
  let res;
  switch (method) {
    case "GET":
      res = await request.get(`${API}${path}`, opts);
      break;
    case "POST":
      res = await request.post(`${API}${path}`, opts);
      break;
    case "PATCH":
      res = await request.patch(`${API}${path}`, opts);
      break;
    case "DELETE":
      res = await request.delete(`${API}${path}`, opts);
      break;
    default:
      throw new Error(`Unknown method: ${method}`);
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status(), body: json };
}

test("Phase 1: Bill-wise Accounting & Outstanding Management", async ({ request }) => {
  test.setTimeout(60000);

  // Login
  const token = await loginAs(request, ADMIN.email, ADMIN.password);

  // Get active company
  const meRes = await api(request, "GET", "/auth/me", token);
  const cid = meRes.body.companies[0].id;

  // Get active FY
  const fyRes = await api(request, "GET", "/coa/financial-years", token, cid);
  const fyId = fyRes.body.pop().id;

  // Get ledgers
  const ledgersRes = await api(request, "GET", "/coa/ledgers", token, cid);
  const ledgers = ledgersRes.body;
  const supplierLedger = ledgers.find((l: { name: string }) => l.name.includes("Supplier"))?.id;

  // Get outstanding bills by ledger
  const outstandingRes = await api(request, "GET", "/bills/outstanding-by-ledger", token, cid, {
    ledger_id: supplierLedger,
    financial_year_id: fyId,
  });
  expect(outstandingRes.status).toBe(200);
  expect(Array.isArray(outstandingRes.body)).toBe(true);

  // Get outstanding by party (alternative)
  const byPartyRes = await api(request, "GET", "/bills/outstanding-by-party", token, cid, {
    financial_year_id: fyId,
  });
  expect(byPartyRes.status).toBe(200);

  // Get aging analysis
  const agingRes = await api(request, "GET", "/bills/aging", token, cid, {
    financial_year_id: fyId,
  });
  expect(agingRes.status).toBe(200);

  // Get outstanding summary
  const summaryRes = await api(request, "GET", "/bills/summary", token, cid, {
    financial_year_id: fyId,
  });
  expect(summaryRes.status).toBe(200);
});
