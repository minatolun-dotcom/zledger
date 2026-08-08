import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { selectOption, fillDate, selectVoucherType, saveVoucher } from "../helpers/interaction";
import { ADMIN, PARTIES, STOCK_ITEMS, LEDGERS, E2E_PREFIX } from "../helpers/fixtures";
import { activeFyStart } from "../helpers/dates";

const API = "http://localhost:9090/api";
const RUN_ID = Date.now();

// ── API helpers ────────────────────────────────────────────────────────────

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

/** Find a voucher by narration substring → returns the full voucher object. */
async function findVoucher(request: any, token: string, cid: string, narration: string) {
  const r = await api(request, "GET", `/vouchers?limit=500`, token, cid);
  if (r.status !== 200 || !r.body.items) return null;
  return r.body.items.find((v: any) => (v.narration || "").includes(narration)) || null;
}

// ── UI helpers (real-user flows) ───────────────────────────────────────────

async function openVouchersPage(page: Page) {
  await page.getByRole("link", { name: "Vouchers" }).click();
  await page.waitForURL("**/vouchers");
  await page.waitForTimeout(800);
}

async function expectSaved(page: Page) {
  await expect(page.getByText("Voucher Saved").first()).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(600);
}

async function createSalesVoucher(page: Page, narration: string) {
  await selectVoucherType(page, "Sales");
  await fillDate(page, "2026-07-01");
  await page.getByPlaceholder("Narration...").fill(narration);
  await selectOption(page, "Select party / cash / bank...", PARTIES.royalEmporium);
  await selectOption(page, "Search items...", STOCK_ITEMS.a4Paper);
  await page.waitForTimeout(400);
  const row = page.locator("table").first().locator("tbody tr").last();
  const inputs = row.locator("input[type='number']");
  await inputs.nth(0).fill("10");
  await inputs.nth(1).fill("150");
  await saveVoucher(page, "Save");
  await expectSaved(page);
}

async function createReceiptVoucher(page: Page, narration: string) {
  await selectVoucherType(page, "Receipt");
  await fillDate(page, "2026-07-06");
  await selectOption(page, "Select cash / bank account...", LEDGERS.hdfcBank);
  await page.getByPlaceholder("Cheque / UTR / Ref #").fill(`${E2E_PREFIX} PW-RCP-${RUN_ID}`);
  await selectOption(page, "Select ledger...", PARTIES.royalEmporium);
  await page.getByRole("row").nth(1).getByPlaceholder("0.00").fill("10000");
  await page.getByPlaceholder("Narration...").fill(narration);
  await saveVoucher(page, "Save");
  await expectSaved(page);
}

async function createPaymentVoucher(page: Page, narration: string) {
  await selectVoucherType(page, "Payment");
  await fillDate(page, "2026-07-05");
  await selectOption(page, "Select cash / bank account...", LEDGERS.hdfcBank);
  await page.getByPlaceholder("Cheque / UTR / Ref #").fill(`${E2E_PREFIX} PW-PMT-${RUN_ID}`);
  await selectOption(page, "Select ledger...", PARTIES.globalDistributors);
  await page.getByRole("row").nth(1).getByPlaceholder("0.00").fill("5000");
  await page.getByPlaceholder("Narration...").fill(narration);
  await saveVoucher(page, "Save");
  await expectSaved(page);
}

/** Open the detail modal for the given invoice row, then allocate from the Record Payment modal. */
async function allocateViaPaymentsPage(page: Page, voucherNumber: string, paymentVoucherNumber: string, paymentType: "receipt" | "payment", amount: string) {
  await page.goto("/payments");
  await expect(page.getByRole("heading", { name: "Payments & Receivables" })).toBeVisible({ timeout: 10000 });

  // If allocating a payment (payables), switch to the Payables tab first
  if (paymentType === "payment") {
    await page.getByRole("tab", { name: /Payables/ }).click();
    await page.waitForTimeout(800);
  }

  // Find the invoice row by its voucher number EXACTLY — the numeric number
  // is a substring of amounts (₹2,534.04 contains "53") so hasText would match
  // the wrong seed invoice and open the wrong detail modal.
  const row = page
    .locator("tbody tr")
    .filter({ has: page.getByText(voucherNumber, { exact: true }) })
    .first();
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.click();
  await page.waitForTimeout(800);

  // Detail modal → Record Payment
  await page.getByRole("button", { name: "Record Payment" }).click();
  await page.waitForTimeout(500);

  // Record Payment modal (rendered last on top of the detail modal)
  const recordModal = page.locator('[role="dialog"]').last();
  await expect(recordModal.getByRole("heading", { name: "Record Payment" })).toBeVisible({ timeout: 5000 });

  // Select the payment/receipt voucher → options are "<number> (<type>)"
  await selectOption(page, "Select payment...", `${paymentVoucherNumber} (${paymentType})`);
  await page.waitForTimeout(300);

  // Fill the amount
  const amountInput = recordModal.locator("input[type='number']");
  await amountInput.fill(amount);

  await recordModal.getByRole("button", { name: "Allocate Payment" }).click();
  await expect(page.getByText("Payment allocated").first()).toBeVisible({ timeout: 8000 });
}

test.describe("Payments workflow — real-user simulation", () => {
  test.describe.configure({ mode: "serial" });

  test("1. Receivables: sales invoice appears, receipt allocated via Record Payment", async ({ page, request }) => {
    const salesNarr = `${E2E_PREFIX} PW Sales ${RUN_ID}`;
    const receiptNarr = `${E2E_PREFIX} PW Receipt ${RUN_ID}`;

    // Real user creates the sales invoice + receipt voucher through the UI
    await loginAsAdmin(page);
    await openVouchersPage(page);
    await createSalesVoucher(page, salesNarr);
    await createReceiptVoucher(page, receiptNarr);

    // Fetch identifiers via API
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const invoice = await findVoucher(request, token, cid, salesNarr);
    const receipt = await findVoucher(request, token, cid, receiptNarr);
    expect(invoice, "sales invoice should exist").toBeTruthy();
    expect(receipt, "receipt voucher should exist").toBeTruthy();
    const invoiceNumber = invoice!.voucher_number as string;
    const receiptNumber = receipt!.voucher_number as string;

    // The invoice shows in receivables with a positive unpaid amount
    const recv = await api(request, "GET", "/payments/receivables", token, cid);
    const recvItem = recv.body.items?.find((i: any) => i.voucher_id === invoice!.id);
    expect(recvItem, "invoice should appear in receivables").toBeTruthy();
    const unpaidBefore = recvItem.unpaid_amount as number;
    expect(unpaidBefore).toBeGreaterThan(0);

    // Allocate the full unpaid amount via the Payments page UI
    await allocateViaPaymentsPage(page, invoiceNumber, receiptNumber, "receipt", String(unpaidBefore));

    // Allocation persisted
    const allocs = await api(request, "GET", `/payments/allocations/${invoice!.id}`, token, cid);
    expect(Array.isArray(allocs.body)).toBe(true);
    const mine = allocs.body.find((a: any) => a.payment_voucher_id === receipt!.id);
    expect(mine, "allocation linking receipt → invoice should exist").toBeTruthy();
    expect(Math.abs(Number(mine.amount) - unpaidBefore)).toBeLessThan(0.01);

    // Fully-paid invoice drops out of the receivables list
    const recvAfter = await api(request, "GET", "/payments/receivables", token, cid);
    const stillThere = recvAfter.body.items?.find((i: any) => i.voucher_id === invoice!.id);
    expect(stillThere, "fully-paid invoice should leave the receivables list").toBeFalsy();
  });

  test("2. Payables: purchase invoice paid via Record Payment allocation", async ({ page, request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    const fyStart = await activeFyStart(request, token, cid);

    // Setup via API: a purchase invoice (₹4000) + its payment voucher via UI
    const ledgers = await getLedgerIds(request, token, cid, [LEDGERS.sundryCreditors, LEDGERS.hdfcBank, "Purchases"]);
    const parties = await getPartyIds(request, token, cid, [PARTIES.globalDistributors]);
    const creditorId = ledgers.get(LEDGERS.sundryCreditors);
    const purchasesId = ledgers.get("Purchases");
    const partyId = parties.get(PARTIES.globalDistributors);
    if (!creditorId || !purchasesId || !partyId) {
      test.skip(true, "seed missing creditor/purchases ledger or party");
      return;
    }

    const purchaseNarr = `${E2E_PREFIX} PW Purchase ${RUN_ID}`;
    // Purchase: mirror the frontend payload — the Purchases line carries the
    // qty×rate (populates subtotal → grand_total) plus an explicit debit; the
    // supplier (creditor) ledger is the credit side. Without a qty×rate line
    // subtotal stays 0, grand_total = 0, and the invoice never shows in payables.
    const purchase = await api(request, "POST", "/vouchers", token, cid, {
      voucher_type: "purchase",
      voucher_date: fyStart,
      party_id: partyId,
      narration: purchaseNarr,
      lines: [
        { ledger_id: purchasesId, quantity: 1, rate: 4000, debit: 4000, credit: 0 },
        { ledger_id: creditorId, debit: 0, credit: 4000 },
      ],
    });
    expect(purchase.status).toBe(201);
    const purchaseNumber = purchase.body.voucher_number as string;

    // Create the payment voucher through the UI (real-user path)
    const paymentNarr = `${E2E_PREFIX} PW Payment ${RUN_ID}`;
    await loginAsAdmin(page);
    await openVouchersPage(page);
    await createPaymentVoucher(page, paymentNarr);
    const payment = await findVoucher(request, token, cid, paymentNarr);
    expect(payment, "payment voucher should exist").toBeTruthy();
    const paymentNumber = payment!.voucher_number as string;

    // Invoice shows in payables with unpaid 4000
    const payables = await api(request, "GET", "/payments/payables", token, cid);
    const payableItem = payables.body.items?.find((i: any) => i.voucher_id === purchase.body.id);
    expect(payableItem, "purchase invoice should appear in payables").toBeTruthy();
    expect(payableItem.unpaid_amount).toBe(4000);

    // Allocate ₹4000 via the Payments page (Payables tab)
    await allocateViaPaymentsPage(page, purchaseNumber, paymentNumber, "payment", "4000");

    // Allocation persisted and invoice fully paid → leaves the payables list
    const allocs = await api(request, "GET", `/payments/allocations/${purchase.body.id}`, token, cid);
    const mine = allocs.body.find((a: any) => a.payment_voucher_id === payment!.id);
    expect(mine, "allocation linking payment → purchase invoice should exist").toBeTruthy();
    expect(Number(mine.amount)).toBe(4000);

    const payablesAfter = await api(request, "GET", "/payments/payables", token, cid);
    const stillThere = payablesAfter.body.items?.find((i: any) => i.voucher_id === purchase.body.id);
    expect(stillThere, "fully-paid purchase invoice should leave the payables list").toBeFalsy();
  });

  test("3. Removing an allocation restores the outstanding balance", async ({ page, request }) => {
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);

    const salesNarr = `${E2E_PREFIX} PW Restore ${RUN_ID}`;
    const receiptNarr = `${E2E_PREFIX} PW Restore RCP ${RUN_ID}`;

    await loginAsAdmin(page);
    await openVouchersPage(page);
    await createSalesVoucher(page, salesNarr);
    await createReceiptVoucher(page, receiptNarr);

    const invoice = await findVoucher(request, token, cid, salesNarr);
    const receipt = await findVoucher(request, token, cid, receiptNarr);
    expect(invoice).toBeTruthy();
    expect(receipt).toBeTruthy();

    const recv = await api(request, "GET", "/payments/receivables", token, cid);
    const item = recv.body.items?.find((i: any) => i.voucher_id === invoice!.id);
    const unpaid = item?.unpaid_amount as number;

    await allocateViaPaymentsPage(page, invoice!.voucher_number, receipt!.voucher_number, "receipt", String(unpaid));

    // Find the allocation id via API, then remove it from the detail modal's trash button
    const allocs = await api(request, "GET", `/payments/allocations/${invoice!.id}`, token, cid);
    const mine = allocs.body.find((a: any) => a.payment_voucher_id === receipt!.id);
    expect(mine).toBeTruthy();

    // The detail modal is still open → delete the allocation via its trash button.
    // (Locate the allocation ROW by its "Allocated on" label, not the amount —
    // the modal header also shows "₹X outstanding" + a close button.)
    const detailModal = page.locator('[role="dialog"]').first();
    const allocRow = detailModal.locator("div.rounded-lg", { hasText: "Allocated on" }).first();
    await expect(allocRow).toBeVisible({ timeout: 8000 });
    await allocRow.getByRole("button").click();
    const confirm = page.getByRole("dialog", { name: "Confirm" });
    await expect(confirm.getByText("Remove this allocation?")).toBeVisible();
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("Allocation removed").first()).toBeVisible({ timeout: 8000 });

    // Outstanding restored — invoice is back in receivables with full unpaid
    const recvAfter = await api(request, "GET", "/payments/receivables", token, cid);
    const back = recvAfter.body.items?.find((i: any) => i.voucher_id === invoice!.id);
    expect(back, "invoice should reappear after allocation removal").toBeTruthy();
    expect(Math.abs(Number(back.unpaid_amount) - unpaid)).toBeLessThan(0.01);
  });
});
