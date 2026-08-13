/**
 * Debit-Note Adjust E2E Tests
 *
 * Covers the full payables-side adjustment workflow (audit round 6 + 8):
 * 1. Purchase invoice auto-creates a payable bill
 * 2. Debit note is listed as unapplied for the party
 * 3. Partial adjustment (amount input) reduces the bill's outstanding
 * 4. Over-adjustment is rejected by the API
 * 5. Browser: the Outstanding Bills report's Payables tab Adjust modal lists
 *    the debit note and applies a partial amount with the toast confirming it
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

async function getParties(request: APIRequestContext, token: string, cid: string, type: "customer" | "supplier"): Promise<any[]> {
  const r = await api(request, "GET", `/coa/parties?party_type=${type}`, token, cid);
  return r.status === 200 ? (r.body || []) : [];
}

test.describe("Debit-Note Adjust (payables side)", () => {
  let token: string;
  let cid: string;
  let supplier: any;
  let supplierLedger: any;
  let purchasesId: string;
  let fyStart: string;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
    cid = await getCompanyId(request, token);

    // Clean up stale E2E debit-note/purchase vouchers from previous runs.
    const vouchers = await api(request, "GET", "/vouchers?limit=500", token, cid);
    if (vouchers.status === 200 && vouchers.body.items) {
      for (const v of vouchers.body.items) {
        const narr = v.narration || "";
        if (narr.includes("[E2E] debit-note-adjust") && v.status === "posted") {
          await api(request, "POST", `/vouchers/${v.id}/cancel`, token, cid, { reason: "E2E cleanup" });
        }
      }
    }

    const suppliers = await getParties(request, token, cid, "supplier");
    supplier = suppliers[0];
    expect(supplier).toBeTruthy();

    const ledgers = await api(request, "GET", "/coa/ledgers", token, cid);
    supplierLedger = ledgers.body.find((l: any) => l.id === supplier.ledger_id);
    purchasesId = (await getLedgerIds(request, token, cid, ["Purchases"])).get("Purchases");
    expect(supplierLedger).toBeTruthy();
    expect(purchasesId).toBeTruthy();

    fyStart = await activeFyStart(request, token, cid);
  });

  test("Purchase invoice + debit note: partial adjust, over-adjust guard, UI modal", async ({ request, page }) => {
    // 0. Dedicated supplier so the bill list / adjust modal contain ONLY our
    //    data (the demo supplier ships seed bills + unapplied debit notes).
    const stamp = Date.now();
    const newSup = await api(request, "POST", "/coa/parties", token, cid, {
      name: `E2E DN Supplier ${stamp}`,
      party_type: "supplier",
    });
    expect(newSup.status).toBe(201);
    supplier = newSup.body;
    const ledgersAfter = await api(request, "GET", "/coa/ledgers", token, cid);
    supplierLedger = ledgersAfter.body.find((l: any) => l.id === supplier.ledger_id);
    expect(supplierLedger).toBeTruthy();

    // 1. Purchase invoice ₹1000 → bill auto-created.

    const purchase = await api(request, "POST", "/vouchers", token, cid, {
      company_id: cid,
      voucher_type: "purchase",
      voucher_date: fyStart,
      narration: `[E2E] debit-note-adjust purchase ${stamp}`,
      party_id: supplier.id,
      lines: [
        // Item line (qty × rate) — grand_total is derived from item lines.
        { ledger_id: purchasesId, quantity: 1, rate: 1000.0 },
        { ledger_id: supplierLedger.id, credit: 1000.0 },
      ],
    });
    expect(purchase.status).toBe(201);
    const purchaseId = purchase.body.id;

    const outstanding = await api(request, "GET", `/bills/outstanding/${supplier.id}?voucher_type=purchase`, token, cid);
    const bills = outstanding.body.bills.filter((b: any) => b.invoice_voucher_number === purchase.body.voucher_number);
    expect(bills.length, JSON.stringify(outstanding.body).slice(0, 400)).toBe(1);
    const bill = bills[0];
    expect(bill.outstanding_amount).toBe(1000);

    // 2. Debit note ₹600 for the same supplier.
    const dn = await api(request, "POST", "/vouchers", token, cid, {
      company_id: cid,
      voucher_type: "debit_note",
      voucher_date: fyStart,
      narration: `[E2E] debit-note-adjust dn ${stamp}`,
      party_id: supplier.id,
      lines: [
        // Item line — debit-note semantics make it the CREDIT side.
        { ledger_id: purchasesId, quantity: 1, rate: 600.0 },
        { ledger_id: supplierLedger.id, debit: 600.0 },
      ],
    });
    expect(dn.status).toBe(201);
    const dnId = dn.body.id;

    // 3. Listed as unapplied.
    const notes = await api(request, "GET", `/bills/debit-notes/${supplier.id}`, token, cid);
    const listed = notes.body.debit_notes.find((n: any) => n.note_id === dnId);
    expect(listed).toBeTruthy();
    expect(listed.unapplied_amount).toBe(600);

    // 4. Partial adjust ₹250 → outstanding 750, remaining unapplied 350.
    const adjust = await api(request, "POST", `/bills/debit-note/${dnId}/adjust/${bill.bill_reference_id}?amount=250`, token, cid);
    expect(adjust.status).toBe(200);
    expect(adjust.body.applied_amount).toBe(250);
    expect(adjust.body.outstanding_amount).toBe(750);

    const notesAfter = await api(request, "GET", `/bills/debit-notes/${supplier.id}`, token, cid);
    const after = notesAfter.body.debit_notes.find((n: any) => n.note_id === dnId);
    expect(after.unapplied_amount).toBe(350);

    // 5. Browser: Payables tab → supplier card → Adjust modal lists the debit note.
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

    await page.click("text=Payables (Suppliers)");
    await page.waitForTimeout(2500);

    // The supplier card holds our bill row with its bill number.
    const card = page.locator("div", { has: page.locator(`h3:has-text("${supplier.name}")`) }).first();
    await expect(card).toBeVisible();

    const row = card.locator("tr", { hasText: bill.bill_number });
    await expect(row).toBeVisible();
    await expect(row).toContainText("750.00"); // 1000 − 250 adjusted

    await row.locator("button", { hasText: "Adjust" }).click();
    await page.waitForTimeout(1500);

    await expect(page.locator("text=Adjust Bill with Debit Note")).toBeVisible();
    await expect(page.getByText(String(dn.body.voucher_number), { exact: true })).toBeVisible();
    await expect(page.locator("text=Unapplied").first()).toBeVisible();

    // 6. Apply a partial ₹150 from the modal → row refreshes to 600.
    const amountInput = page.locator('input[type="number"]').last();
    await amountInput.fill("150");
    await page.locator("button", { hasText: "Apply" }).first().click();
    await page.waitForTimeout(2500);

    // Toast confirms the applied amount; the row refreshes to 600.
    await expect(page.locator("text=₹150.00").first()).toBeVisible();
    await expect(row).toContainText("600.00");

    // 7. Over-adjustment is CAPPED to the remaining unapplied (350 − 150
    // already applied via the UI = 200) — never applied in full, never
    // negative, and the response reports what was truly applied.
    const over = await api(request, "POST", `/bills/debit-note/${dnId}/adjust/${bill.bill_reference_id}?amount=99999`, token, cid);
    expect(over.status).toBe(200);
    expect(over.body.applied_amount).toBe(200);
    expect(over.body.outstanding_amount).toBe(400);

    const notesFinal = await api(request, "GET", `/bills/debit-notes/${supplier.id}`, token, cid);
    const final = notesFinal.body.debit_notes.find((n: any) => n.note_id === dnId);
    expect(final).toBeFalsy(); // fully applied → no longer listed as unapplied
  });
});
