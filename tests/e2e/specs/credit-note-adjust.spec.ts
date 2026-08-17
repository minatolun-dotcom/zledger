/**
 * Credit-Note Adjust E2E Tests
 *
 * Receivables-side mirror of debit-note-adjust.spec.ts. Covers the full
 * customer adjustment workflow:
 * 1. Sales invoice auto-creates a receivable bill
 * 2. Credit note is listed as unapplied for the party
 * 3. Partial adjustment (amount input) reduces the bill's outstanding
 * 4. Over-adjustment is capped to the note's unapplied remainder (never
 *    negative, never applied in full)
 * 5. Browser: the Outstanding Bills report's Receivables tab Adjust modal
 *    lists the credit note and applies a partial amount with the toast
 * 6. Cancelling the credit note restores the bill's outstanding (Tally parity)
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";
import { activeFyStart } from "../helpers/dates";

const API = "http://localhost:9090/api";
const WEB = "http://localhost:9090";

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

test.describe("Credit-Note Adjust — receivables bill-wise workflow", () => {
  test("Sales invoice + credit note: partial adjust, over-adjust cap, UI modal, cancel restores", async ({ request, page }) => {
    const at = await adminToken(request);
    const cid = await getCompanyId(request, at);
    const fyStart = await activeFyStart(request, at, cid);
    const ledgers = await getLedgerIds(request, at, cid, ["Sales", "HDFC Bank - Current A/c", "Cash"]);
    const salesId = ledgers.get("Sales");
    const bankId = ledgers.get("HDFC Bank - Current A/c") || ledgers.get("Cash");
    expect(salesId).toBeTruthy();
    expect(bankId).toBeTruthy();

    // 0. Dedicated customer so the bill list / adjust modal contain ONLY our
    //    data (the demo customers ship seed bills + unapplied credit notes).
    const stamp = Date.now();
    const newCust = await api(request, "POST", "/coa/parties", at, cid, {
      name: `E2E CN Customer ${stamp}`,
      party_type: "customer",
    });
    expect(newCust.status).toBe(201);
    const customer = newCust.body;
    const ledgersAfter = await api(request, "GET", "/coa/ledgers", at, cid);
    const customerLedger = ledgersAfter.body.find((l: any) => l.id === customer.ledger_id);
    expect(customerLedger).toBeTruthy();

    // 1. Sales invoice ₹1000 → bill auto-created.
    const sale = await api(request, "POST", "/vouchers", at, cid, {
      company_id: cid,
      voucher_type: "sales",
      voucher_date: fyStart,
      narration: `[E2E] credit-note-adjust sale ${stamp}`,
      party_id: customer.id,
      lines: [
        { ledger_id: salesId, quantity: 1, rate: 1000.0 },
        { ledger_id: customerLedger.id, debit: 1000.0 },
      ],
    });
    expect(sale.status, JSON.stringify(sale.body).slice(0, 400)).toBe(201);
    const saleId = sale.body.id;

    const outstanding = await api(request, "GET", `/bills/outstanding/${customer.id}?voucher_type=sales`, at, cid);
    const bills = outstanding.body.bills.filter((b: any) => b.invoice_voucher_number === sale.body.voucher_number);
    expect(bills.length, JSON.stringify(outstanding.body).slice(0, 400)).toBe(1);
    const bill = bills[0];
    expect(bill.outstanding_amount).toBe(1000);

    // 2. Credit note ₹600 for the same customer. Same structure as the
    //    backend integrity test: item line + bank credited (credit note
    //    reverses a sale — the party account is the debit side).
    const cn = await api(request, "POST", "/vouchers", at, cid, {
      company_id: cid,
      voucher_type: "credit_note",
      voucher_date: fyStart,
      narration: `[E2E] credit-note-adjust cn ${stamp}`,
      party_id: customer.id,
      lines: [
        { ledger_id: salesId, quantity: 1, rate: 600.0 },
        { ledger_id: bankId, debit: 0, credit: 600.0 },
      ],
    });
    expect(cn.status, JSON.stringify(cn.body).slice(0, 400)).toBe(201);
    const cnId = cn.body.id;

    // 3. Listed as unapplied.
    const notes = await api(request, "GET", `/bills/credit-notes/${customer.id}`, at, cid);
    const listed = notes.body.credit_notes.find((n: any) => n.note_id === cnId);
    expect(listed).toBeTruthy();
    expect(listed.unapplied_amount).toBe(600);

    // 4. Partial adjust ₹250 → outstanding 750, remaining unapplied 350.
    const adjust = await api(request, "POST", `/bills/credit-note/${cnId}/adjust/${bill.bill_reference_id}?amount=250`, at, cid);
    expect(adjust.status).toBe(200);
    expect(adjust.body.applied_amount).toBe(250);
    expect(adjust.body.outstanding_amount).toBe(750);

    const notesAfter = await api(request, "GET", `/bills/credit-notes/${customer.id}`, at, cid);
    const after = notesAfter.body.credit_notes.find((n: any) => n.note_id === cnId);
    expect(after.unapplied_amount).toBe(350);

    // 5. Browser: Receivables tab → customer card → Adjust modal lists the credit note.
    await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
    await page.fill('input[type="email"]', ADMIN.email);
    await page.fill('input[type="password"]', ADMIN.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(4000);
    const picker = await page.$("text=Apex Enterprises");
    if (picker) {
      await page.click("text=Apex Enterprises");
      await page.waitForTimeout(3000);
    }

    await page.goto(`${WEB}/reports/outstanding-bills`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);

    await page.click("text=Receivables (Customers)");
    await page.waitForTimeout(2500);

    const card = page.locator("div", { has: page.locator(`h3:has-text("${customer.name}")`) }).first();
    await expect(card).toBeVisible();

    const row = card.locator("tr", { hasText: bill.bill_number });
    await expect(row).toBeVisible();
    await expect(row).toContainText("750.00"); // 1000 − 250 adjusted

    await row.locator("button", { hasText: "Adjust" }).click();
    await page.waitForTimeout(1500);

    await expect(page.locator("text=Adjust Bill with Credit Note")).toBeVisible();
    await expect(page.getByText(String(cn.body.voucher_number), { exact: true })).toBeVisible();
    await expect(page.locator("text=Unapplied").first()).toBeVisible();

    // 6. Apply a partial ₹150 from the modal → row refreshes to 600.
    const amountInput = page.locator('input[type="number"]').last();
    await amountInput.fill("150");
    await page.locator("button", { hasText: "Apply" }).first().click();
    await page.waitForTimeout(2500);

    await expect(page.locator("text=₹150.00").first()).toBeVisible();
    await expect(row).toContainText("600.00");

    // 7. Over-adjustment is CAPPED to the remaining unapplied (350 − 150
    //    already applied via the UI = 200) — never applied in full, never
    //    negative, and the response reports what was truly applied.
    const over = await api(request, "POST", `/bills/credit-note/${cnId}/adjust/${bill.bill_reference_id}?amount=99999`, at, cid);
    expect(over.status).toBe(200);
    expect(over.body.applied_amount).toBe(200);
    expect(over.body.outstanding_amount).toBe(400);

    const notesFinal = await api(request, "GET", `/bills/credit-notes/${customer.id}`, at, cid);
    const final = notesFinal.body.credit_notes.find((n: any) => n.note_id === cnId);
    expect(final).toBeFalsy(); // fully applied → no longer listed as unapplied

    // 8. Cancel the credit note → the applied adjustments are reversed and the
    //    bill's outstanding is restored (Tally parity: cancel restores books).
    const cancel = await api(request, "POST", `/vouchers/${cnId}/cancel`, at, cid, { reason: "E2E credit-note cancel test" });
    expect(cancel.status, JSON.stringify(cancel.body).slice(0, 400)).toBe(200);

    const restored = await api(request, "GET", `/bills/outstanding/${customer.id}?voucher_type=sales`, at, cid);
    const restoredBill = restored.body.bills.find((b: any) => b.bill_reference_id === bill.bill_reference_id);
    expect(restoredBill).toBeTruthy();
    expect(restoredBill.outstanding_amount).toBe(1000); // fully restored
  });
});
