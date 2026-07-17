import { test, expect, type APIRequestContext } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:9091/api";

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

async function getCompanyId(request: APIRequestContext, token: string) {
  const r = await api(request, "GET", "/auth/me", token);
  return r.body.companies?.[0]?.id as string;
}

async function getLedgerIds(
  request: APIRequestContext,
  token: string,
  cid: string,
  names: string[],
): Promise<Map<string, string>> {
  const r = await api(request, "GET", "/coa/ledgers", token, cid);
  const map = new Map<string, string>();
  if (r.status === 200 && Array.isArray(r.body)) {
    for (const ledger of r.body) {
      if (names.includes(ledger.name)) map.set(ledger.name, ledger.id);
    }
  }
  return map;
}

// ═══════════════════════════════════════════
// SHARED STATE (like api-fixed-assets pattern)
// ═══════════════════════════════════════════

const s: any = {};

test.describe.serial("Loans & Advances — Full Workflow", () => {
  test.beforeAll(async ({ request }) => {
    const ts = Date.now();
    const email = `loans-e2e-${ts}@test.example.com`;

    // Register user
    const reg = await api(request, "POST", "/auth/register", null, null, {
      email, name: "Loans E2E", password: "test12345",
    });
    expect(reg.status).toBe(201);
    s.userId = reg.body.user.id;
    s.email = email;

    s.token = await loginAs(request, email, "test12345");

    // Create company (register does NOT auto-create one)
    const co = await api(request, "POST", "/companies", s.token, null, {
      name: `Loans E2E Co ${ts}`,
    });
    expect(co.status).toBe(201);
    s.cid = co.body.id;

    // Enable loans module
    await api(request, "PATCH", `/companies/${s.cid}`, s.token, s.cid, {
      modules: ["core", "reports", "loans"],
    });

    // Get Cash ledger
    const ledgers = await getLedgerIds(request, s.token, s.cid, ["Cash"]);
    s.bankLedgerId = ledgers.get("Cash") || "";
    expect(s.bankLedgerId).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    if (!s.token || !s.cid) return;
    // Delete all loans first
    const loansRes = await api(request, "GET", "/loans", s.token, s.cid);
    if (loansRes.status === 200 && loansRes.body.items) {
      for (const loan of loansRes.body.items) {
        await api(request, "DELETE", `/loans/${loan.id}`, s.token, s.cid);
      }
    }
    // Delete test user
    const at = await adminToken(request);
    await api(request, "DELETE", `/admin/users/${s.userId}/hard`, at);
  });

  // ── 1. Empty state ────────────────────────────────────────────────────

  test("1. GET /loans returns empty list", async ({ request }) => {
    const r = await api(request, "GET", "/loans", s.token, s.cid);
    expect(r.status).toBe(200);
    expect(r.body.items).toEqual([]);
    expect(r.body.total).toBe(0);
  });

  test("2. GET /loans/summary returns zeros", async ({ request }) => {
    const r = await api(request, "GET", "/loans/summary", s.token, s.cid);
    expect(r.status).toBe(200);
    expect(r.body.total_given).toBe(0);
    expect(r.body.total_taken).toBe(0);
  });

  // ── 3. Create loan given ──────────────────────────────────────────────

  test("3. POST /loans creates loan given with auto-voucher", async ({ request }) => {
    const r = await api(request, "POST", "/loans", s.token, s.cid, {
      loan_type: "given",
      party_name: "Ravi Kumar",
      principal_amount: 100000,
      interest_rate: 12,
      interest_type: "simple",
      disbursement_date: "2026-01-15",
      due_date: "2026-12-31",
      emi_amount: 10000,
      bank_ledger_id: s.bankLedgerId,
    });
    expect(r.status).toBe(201);
    expect(r.body.loan_type).toBe("given");
    expect(r.body.party_name).toBe("Ravi Kumar");
    expect(r.body.status).toBe("active");
    expect(r.body.outstanding_balance).toBe(100000);
    expect(r.body.disbursement_voucher_id).toBeTruthy();
    s.loanId = r.body.id;
  });

  // ── 4. Get detail ─────────────────────────────────────────────────────

  test("4. GET /loans/:id returns loan with accrued interest", async ({ request }) => {
    const r = await api(request, "GET", `/loans/${s.loanId}`, s.token, s.cid);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(s.loanId);
    expect(r.body.accrued_interest).toBeGreaterThan(0);
  });

  // ── 5. List ───────────────────────────────────────────────────────────

  test("5. GET /loans lists one loan", async ({ request }) => {
    const r = await api(request, "GET", "/loans", s.token, s.cid);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
  });

  test("6. GET /loans?loan_type=given filters correctly", async ({ request }) => {
    const r = await api(request, "GET", "/loans?loan_type=given", s.token, s.cid);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
    expect(r.body.items[0].loan_type).toBe("given");
  });

  test("6b. GET /loans?loan_type=taken returns empty", async ({ request }) => {
    const r = await api(request, "GET", "/loans?loan_type=taken", s.token, s.cid);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(0);
  });

  // ── 7. Record payment ─────────────────────────────────────────────────

  test("7. POST /loans/:id/payments records payment with interest split", async ({ request }) => {
    const r = await api(request, "POST", `/loans/${s.loanId}/payments`, s.token, s.cid, {
      total_amount: 10000,
      payment_date: "2026-02-15",
      bank_ledger_id: s.bankLedgerId,
    });
    expect(r.status).toBe(201);
    expect(r.body.total_amount).toBe(10000);
    expect(r.body.interest_portion).toBeGreaterThan(0);
    expect(r.body.principal_portion).toBeGreaterThan(0);
    expect(r.body.voucher_id).toBeTruthy();
    s.firstPaymentId = r.body.id;
  });

  // ── 8. Outstanding reduced ────────────────────────────────────────────

  test("8. Loan outstanding reduced after payment", async ({ request }) => {
    const r = await api(request, "GET", `/loans/${s.loanId}`, s.token, s.cid);
    expect(r.status).toBe(200);
    expect(r.body.outstanding_balance).toBeLessThan(100000);
    expect(r.body.status).toBe("active");
  });

  // ── 9. List payments ──────────────────────────────────────────────────

  test("9. GET /loans/:id/payments lists payments", async ({ request }) => {
    const r = await api(request, "GET", `/loans/${s.loanId}/payments`, s.token, s.cid);
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(1);
  });

  // ── 10. Manual interest ───────────────────────────────────────────────

  test("10. Payment with manual interest split", async ({ request }) => {
    const r = await api(request, "POST", `/loans/${s.loanId}/payments`, s.token, s.cid, {
      total_amount: 10000,
      payment_date: "2026-03-15",
      bank_ledger_id: s.bankLedgerId,
      is_manual_interest: true,
      interest_portion: 3000,
    });
    expect(r.status).toBe(201);
    expect(r.body.interest_portion).toBe(3000);
    expect(r.body.principal_portion).toBe(7000);
  });

  // ── 11. Summary after payments ────────────────────────────────────────

  test("11. Summary reflects given + outstanding", async ({ request }) => {
    const r = await api(request, "GET", "/loans/summary", s.token, s.cid);
    expect(r.status).toBe(200);
    expect(r.body.total_given).toBe(100000);
    expect(r.body.outstanding_given).toBeLessThan(100000);
    expect(r.body.outstanding_given).toBeGreaterThan(0);
  });

  // ── 12. Interest endpoint ─────────────────────────────────────────────

  test("12. GET /loans/:id/interest returns accrued interest", async ({ request }) => {
    const r = await api(request, "GET", `/loans/${s.loanId}/interest?as_of=2026-06-15`, s.token, s.cid);
    expect(r.status).toBe(200);
    expect(r.body.accrued_interest).toBeGreaterThan(0);
    expect(r.body.as_of).toBe("2026-06-15");
  });

  // ── 13. Update ────────────────────────────────────────────────────────

  test("13. PATCH /loans/:id updates notes", async ({ request }) => {
    const r = await api(request, "PATCH", `/loans/${s.loanId}`, s.token, s.cid, {
      notes: "Updated via E2E",
    });
    expect(r.status).toBe(200);
    expect(r.body.notes).toBe("Updated via E2E");
  });

  // ── 14. Close ─────────────────────────────────────────────────────────

  test("14. PATCH /loans/:id closes loan", async ({ request }) => {
    const r = await api(request, "PATCH", `/loans/${s.loanId}`, s.token, s.cid, {
      status: "closed",
    });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("closed");
  });

  // ── 15. Cannot pay closed ─────────────────────────────────────────────

  test("15. Payment on closed loan returns 400", async ({ request }) => {
    const r = await api(request, "POST", `/loans/${s.loanId}/payments`, s.token, s.cid, {
      total_amount: 5000, payment_date: "2026-04-01", bank_ledger_id: s.bankLedgerId,
    });
    expect(r.status).toBe(400);
  });

  // ── 16. Create loan taken ─────────────────────────────────────────────

  test("16. POST /loans creates loan taken", async ({ request }) => {
    const r = await api(request, "POST", "/loans", s.token, s.cid, {
      loan_type: "taken",
      party_name: "HDFC Bank",
      principal_amount: 500000,
      interest_rate: 9,
      interest_type: "compound",
      disbursement_date: "2026-03-01",
      due_date: "2028-03-01",
      emi_amount: 22000,
      bank_ledger_id: s.bankLedgerId,
    });
    expect(r.status).toBe(201);
    expect(r.body.loan_type).toBe("taken");
    expect(r.body.principal_amount).toBe(500000);
    s.takenLoanId = r.body.id;
  });

  // ── 17. Summary both types ────────────────────────────────────────────

  test("17. Summary aggregates given and taken", async ({ request }) => {
    const r = await api(request, "GET", "/loans/summary", s.token, s.cid);
    expect(r.status).toBe(200);
    expect(r.body.total_given).toBe(100000);
    expect(r.body.total_taken).toBe(500000);
  });

  // ── 18. Error: invalid bank ledger ────────────────────────────────────

  test("18. POST /loans with bad bank ledger returns 400", async ({ request }) => {
    const r = await api(request, "POST", "/loans", s.token, s.cid, {
      loan_type: "given", party_name: "X", principal_amount: 10000,
      interest_rate: 0, interest_type: "none", disbursement_date: "2026-01-01",
      emi_amount: 0, bank_ledger_id: "nonexistent",
    });
    expect(r.status).toBe(400);
  });

  // ── 19. Error: missing fields ─────────────────────────────────────────

  test("19. POST /loans with empty body returns 422", async ({ request }) => {
    const r = await api(request, "POST", "/loans", s.token, s.cid, {});
    expect(r.status).toBe(422);
  });

  // ── 20. Cannot delete loan with payments ──────────────────────────────

  test("20. DELETE loan with payments returns 400", async ({ request }) => {
    const r = await api(request, "DELETE", `/loans/${s.loanId}`, s.token, s.cid);
    expect(r.status).toBe(400);
  });

  // ── 21. Delete loan without payments ──────────────────────────────────

  test("21. DELETE clean loan succeeds", async ({ request }) => {
    const create = await api(request, "POST", "/loans", s.token, s.cid, {
      loan_type: "given", party_name: "Delete Me", principal_amount: 5000,
      interest_rate: 0, interest_type: "none", disbursement_date: "2026-06-01",
      emi_amount: 0, bank_ledger_id: s.bankLedgerId,
    });
    expect(create.status).toBe(201);
    const r = await api(request, "DELETE", `/loans/${create.body.id}`, s.token, s.cid);
    expect(r.status).toBe(204);
    const get = await api(request, "GET", `/loans/${create.body.id}`, s.token, s.cid);
    expect(get.status).toBe(404);
  });

  // ── 22. Cross-company isolation ───────────────────────────────────────

  test("22. Different company cannot see these loans", async ({ request }) => {
    const reg = await api(request, "POST", "/auth/register", null, null, {
      email: `loans-iso-${Date.now()}@test.example.com`, name: "Iso", password: "test12345",
    });
    const t2 = await loginAs(request, reg.body.user.email, "test12345");
    // Create a separate company for the isolation user
    const co2 = await api(request, "POST", "/companies", t2, null, {
      name: `Iso Co ${Date.now()}`,
    });
    const c2 = co2.body.id;
    // Enable loans module on isolation company so the endpoint doesn't 403
    await api(request, "PATCH", `/companies/${c2}`, t2, c2, {
      modules: ["core", "reports", "loans"],
    });
    const r = await api(request, "GET", "/loans", t2, c2);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(0);
    // Cannot see our loan
    const r2 = await api(request, "GET", `/loans/${s.loanId}`, t2, c2);
    expect(r2.status).toBe(404);
    // Cleanup
    const at = await adminToken(request);
    await api(request, "DELETE", `/admin/users/${reg.body.user.id}/hard`, at);
  });

  // ── 23. No auth ───────────────────────────────────────────────────────

  test("23. GET /loans without auth returns 401/403", async ({ request }) => {
    const r = await api(request, "GET", "/loans");
    expect([401, 403]).toContain(r.status);
  });

  // ── 24. Simple vs compound ────────────────────────────────────────────

  test("24. Simple and compound interest differ", async ({ request }) => {
    const sr = await api(request, "POST", "/loans", s.token, s.cid, {
      loan_type: "given", party_name: "Simple", principal_amount: 100000,
      interest_rate: 12, interest_type: "simple", disbursement_date: "2026-01-01",
      emi_amount: 0, bank_ledger_id: s.bankLedgerId,
    });
    const cr = await api(request, "POST", "/loans", s.token, s.cid, {
      loan_type: "given", party_name: "Compound", principal_amount: 100000,
      interest_rate: 12, interest_type: "compound", disbursement_date: "2026-01-01",
      emi_amount: 0, bank_ledger_id: s.bankLedgerId,
    });
    expect(sr.status).toBe(201);
    expect(cr.status).toBe(201);
    const si = await api(request, "GET", `/loans/${sr.body.id}/interest?as_of=2026-07-01`, s.token, s.cid);
    const ci = await api(request, "GET", `/loans/${cr.body.id}/interest?as_of=2026-07-01`, s.token, s.cid);
    expect(si.body.accrued_interest).toBeGreaterThan(0);
    expect(ci.body.accrued_interest).toBeGreaterThan(0);
    expect(si.body.accrued_interest).not.toBe(ci.body.accrued_interest);
    await api(request, "DELETE", `/loans/${sr.body.id}`, s.token, s.cid);
    await api(request, "DELETE", `/loans/${cr.body.id}`, s.token, s.cid);
  });

  // ── 25. Full lifecycle ────────────────────────────────────────────────

  test("25. Create → pay in full → auto-closes", async ({ request }) => {
    const cr = await api(request, "POST", "/loans", s.token, s.cid, {
      loan_type: "given", party_name: "FullPay", principal_amount: 5000,
      interest_rate: 0, interest_type: "none", disbursement_date: "2026-06-01",
      emi_amount: 5000, bank_ledger_id: s.bankLedgerId,
    });
    expect(cr.status).toBe(201);
    expect(cr.body.status).toBe("active");

    const pr = await api(request, "POST", `/loans/${cr.body.id}/payments`, s.token, s.cid, {
      total_amount: 10000, payment_date: "2026-06-15", bank_ledger_id: s.bankLedgerId,
    });
    expect(pr.status).toBe(201);

    const detail = await api(request, "GET", `/loans/${cr.body.id}`, s.token, s.cid);
    expect(detail.body.status).toBe("closed");
    expect(detail.body.outstanding_balance).toBe(0);
  });
});
