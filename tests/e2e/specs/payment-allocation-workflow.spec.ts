import { test, expect } from "@playwright/test";
import { ADMIN, LEDGERS, PARTIES, E2E_PREFIX } from "../helpers/fixtures";

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

async function getPartyIds(request: any, token: string, cid: string, names: string[]) {
  const r = await api(request, "GET", "/coa/parties", token, cid);
  const map = new Map<string, string>();
  if (r.status === 200 && Array.isArray(r.body)) {
    for (const party of r.body) {
      if (names.includes(party.name)) map.set(party.name, party.id);
    }
  }
  return map;
}

test.describe("Payment Allocation Workflow", () => {
  let token: string;
  let cid: string;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
    cid = await getCompanyId(request, token);
  });

  test("POST /payments/allocate creates allocation", async ({ request }) => {
    // Create a sales invoice voucher, then allocate a payment against it
    const ledgers = await getLedgerIds(request, token, cid, [LEDGERS.sundryDebtors, LEDGERS.cash, LEDGERS.sundryCreditors, LEDGERS.sales]);
    const parties = await getPartyIds(request, token, cid, [PARTIES.royalEmporium]);
    const debtorId = ledgers.get(LEDGERS.sundryDebtors);
    const cashId = ledgers.get(LEDGERS.cash);
    const creditorId = ledgers.get(LEDGERS.sundryCreditors);
    const salesId = ledgers.get(LEDGERS.sales);
    const partyId = parties.get(PARTIES.royalEmporium);
    if (!debtorId || !cashId || !creditorId || !salesId || !partyId) return; // skip if seed data missing

    // Create a balanced sales voucher with quantity/rate so grand_total > 0
    const invoice = await api(request, "POST", "/vouchers", token, cid, {
      voucher_type: "sales",
      voucher_date: "2026-06-01",
      party_id: partyId,
      narration: `${E2E_PREFIX} Payment Allocation Test Invoice`,
      lines: [
        { ledger_id: debtorId, quantity: 1, rate: 5000 },
        { ledger_id: salesId, debit: 5000, credit: 0 },
      ],
    });
    expect(invoice.status).toBe(201);
    const invoiceId = invoice.body.id;

    // Create a payment voucher: Dr Sundry Creditors, Cr Cash
    const payment = await api(request, "POST", "/vouchers", token, cid, {
      voucher_type: "payment",
      voucher_date: "2026-06-15",
      party_id: partyId,
      narration: `${E2E_PREFIX} Payment for Allocation Test`,
      lines: [
        { ledger_id: creditorId, debit: 5000, credit: 0 },
        { ledger_id: cashId, debit: 0, credit: 5000 },
      ],
    });
    expect(payment.status).toBe(201);
    const paymentId = payment.body.id;

    // Allocate payment to invoice
    const alloc = await api(request, "POST", "/payments/allocate", token, cid, {
      invoice_voucher_id: invoiceId,
      payment_voucher_id: paymentId,
      amount: 5000,
      allocation_date: "2026-06-15",
      remarks: `${E2E_PREFIX} test allocation`,
    });
    expect(alloc.status).toBe(201);
    expect(alloc.body.id).toBeTruthy();
    expect(alloc.body.amount).toBe(5000);

    // Verify allocations list
    const listAlloc = await api(request, "GET", `/payments/allocations/${invoiceId}`, token, cid);
    expect(listAlloc.status).toBe(200);
    expect(Array.isArray(listAlloc.body)).toBe(true);
    expect(listAlloc.body.length).toBeGreaterThanOrEqual(1);

    // Delete allocation
    const del = await api(request, "DELETE", `/payments/allocations/${alloc.body.id}`, token, cid);
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);

    // Cleanup vouchers
    await api(request, "DELETE", `/vouchers/${paymentId}`, token, cid);
    await api(request, "DELETE", `/vouchers/${invoiceId}`, token, cid);
  });

  test("GET /payments/allocations returns 200 for non-existent voucher", async ({ request }) => {
    const r = await api(request, "GET", "/payments/allocations/nonexistent-id", token, cid);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});
