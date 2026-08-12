import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import {
  selectOption,
  fillDate,
  selectVoucherType,
  saveVoucher,
} from "../helpers/interaction";
import { PARTIES, STOCK_ITEMS, E2E_PREFIX } from "../helpers/fixtures";

const RUN_ID = Date.now();
const API = "http://localhost:9090/api";

/**
 * Round-off is verified end-to-end with a fractional item line:
 * qty 3 × ₹100.50 = ₹301.50 taxable + 12% GST (₹18.09 CGST + ₹18.09 SGST)
 * = ₹337.68 baseline.
 *   None  → ₹337.68 (no Round Off row)
 *   Auto  → ₹338.00 (nearest, +0.32 adjustment)
 *   Round Up → ₹338.00
 *   Round Down → ₹337.00 (−0.68 adjustment)
 */
const BASELINE = 337.68;

// ── Helpers ────────────────────────────────────────────────────────────────

async function openVouchersPage(page: Page) {
  await page.getByRole("link", { name: "Vouchers" }).first().click();
  await page.waitForURL("**/vouchers");
  await page.waitForTimeout(800);
}

/** Switch the footer "Round off to" Select to the given mode label. */
async function setRoundOffMode(page: Page, label: string) {
  const wrapper = page.locator("span", { hasText: "Round off to" }).last().locator("xpath=..");
  await wrapper.getByRole("button").first().click();
  await page.waitForTimeout(300);
  await page
    .locator("div.cursor-pointer", { hasText: new RegExp(`^${label}$`) })
    .filter({ visible: true })
    .first()
    .click({ timeout: 5000 });
  await page.waitForTimeout(500);
}

/** Fill a fractional sales line: party Royal Emporium + A4 Paper Ream 3 × 100.50. */
async function fillFractionalSalesLine(page: Page, narration: string) {
  await selectVoucherType(page, "Sales");
  await fillDate(page, "2026-07-15");
  await page.getByPlaceholder("Narration...").fill(narration);
  await selectOption(page, "Select party / cash / bank...", PARTIES.royalEmporium);
  await selectOption(page, "Search items...", STOCK_ITEMS.a4Paper);
  await page.waitForTimeout(400);
  const row = page.locator("table").first().locator("tbody tr").last();
  const inputs = row.locator("input[type='number']");
  await inputs.nth(0).fill("3");
  await inputs.nth(1).fill("100.50");
  await page.waitForTimeout(600);
}

/** Summary card scoped locator: the card that contains the "Voucher Summary" heading. */
function summaryCard(page: Page) {
  return page.locator("h3", { hasText: "Voucher Summary" }).locator("xpath=..");
}

async function grandTotalValue(page: Page): Promise<string> {
  const row = summaryCard(page).locator("div.flex.justify-between", { hasText: "Grand Total" }).first();
  return (await row.locator("span").nth(1).textContent()) || "";
}

// ── API helpers (mirror api-backend.spec.ts) ───────────────────────────────

async function adminToken(request: APIRequestContext) {
  const res = await request.post(`${API}/auth/login`, { data: { email: "admin@zledger.com", password: "katheikei" } });
  return (await res.json()).access_token as string;
}

async function api(request: APIRequestContext, method: string, path: string, token: string, cid: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (cid) headers["X-Company-Id"] = cid;
  let res: { status: () => number; json: () => Promise<any> };
  switch (method) {
    case "GET": res = await request.get(`${API}${path}`, { headers }); break;
    default: throw new Error(`Unsupported method ${method}`);
  }
  return { status: res.status(), body: await res.json() };
}

async function apexCompanyId(request: APIRequestContext, token: string) {
  const r = await api(request, "GET", "/companies", token, "");
  const body = Array.isArray(r.body) ? r.body : (r.body as { items?: unknown[] }).items || [];
  return (body as Array<{ name: string; id: string }>).find((c) => c.name === "Apex Enterprises")?.id as string;
}

async function findVoucher(request: APIRequestContext, token: string, cid: string, narration: string) {
  const r = await api(request, "GET", "/vouchers?limit=500", token, cid);
  const items = (r.body as { items?: unknown[] }).items || [];
  return (items as Array<{ narration: string; id: string }>).find((v) => v.narration === narration);
}

async function roundOffLedgerId(request: APIRequestContext, token: string, cid: string) {
  const r = await api(request, "GET", "/coa/ledgers", token, cid);
  const body = r.body as Array<{ id: string; system_code: string | null }>;
  return body.find((l) => l.system_code === "SYS_ROUND_OFF")?.id;
}

/** Assert the saved voucher: rounded grand_total, Dr == Cr, round-off line. */
async function assertRoundedVoucher(
  request: APIRequestContext, token: string, cid: string,
  narration: string, expectedGrand: number, expectedRoundLine: { debit: number; credit: number },
) {
  const v = await findVoucher(request, token, cid, narration);
  expect(v, `voucher with narration ${narration} not found`).toBeTruthy();
  const detail = await api(request, "GET", `/vouchers/${v!.id}`, token, cid);
  expect(detail.status).toBe(200);
  const body = detail.body as { grand_total: number; lines: Array<{ ledger_id: string; debit: number; credit: number }> };
  expect(Math.abs(Number(body.grand_total) - expectedGrand)).toBeLessThan(0.011);

  const roId = await roundOffLedgerId(request, token, cid);
  expect(roId, "Round Off ledger (SYS_ROUND_OFF) should exist after a rounded save").toBeTruthy();

  const lines = body.lines;
  const sumD = lines.reduce((a, l) => a + (Number(l.debit) || 0), 0);
  const sumC = lines.reduce((a, l) => a + (Number(l.credit) || 0), 0);
  expect(Math.abs(sumD - sumC)).toBeLessThan(0.011);

  const roLine = lines.find((l) => l.ledger_id === roId);
  expect(roLine, "round-off adjustment line should be posted").toBeTruthy();
  expect(Math.abs((Number(roLine!.debit) || 0) - expectedRoundLine.debit)).toBeLessThan(0.021);
  expect(Math.abs((Number(roLine!.credit) || 0) - expectedRoundLine.credit)).toBeLessThan(0.021);
}

// ── Specs ──────────────────────────────────────────────────────────────────

test.describe.serial("Voucher round-off — modes, balance, rounded grand_total", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await openVouchersPage(page);
  });

  test("All 4 modes update the sidebar summary (None/Auto/Up/Down)", async ({ page }) => {
    const narration = `${E2E_PREFIX} RO modes ${RUN_ID}`;
    await fillFractionalSalesLine(page, narration);

    // Default mode is Auto → rounded to ₹338 with a Round Off row.
    await setRoundOffMode(page, "Auto");
    expect(await grandTotalValue(page)).toContain("338.00");
    await expect(summaryCard(page).locator("div.flex.justify-between", { hasText: "Round Off" })).toBeVisible();

    // None → exact paise total, no Round Off row.
    await setRoundOffMode(page, "None");
    expect(await grandTotalValue(page)).toContain("337.68");
    await expect(summaryCard(page).locator("div.flex.justify-between", { hasText: "Round Off" })).toHaveCount(0);

    // Round Up → ₹338.
    await setRoundOffMode(page, "Round Up");
    expect(await grandTotalValue(page)).toContain("338.00");

    // Round Down → ₹337.
    await setRoundOffMode(page, "Round Down");
    expect(await grandTotalValue(page)).toContain("337.00");
  });

  test("Auto-mode save stores the ROUNDED grand_total and balances (regression)", async ({ page, request }) => {
    const narration = `${E2E_PREFIX} RO auto ${RUN_ID}`;
    await fillFractionalSalesLine(page, narration);
    await setRoundOffMode(page, "Auto");

    await saveVoucher(page, "Save");
    await expect(page.getByText("Voucher Saved").first()).toBeVisible({ timeout: 10000 });

    const token = await adminToken(request);
    const cid = await apexCompanyId(request, token);
    expect(cid).toBeTruthy();

    // ₹337.68 rounds up to ₹338.00; +0.32 adjustment credits Round Off.
    await assertRoundedVoucher(request, token, cid, narration, 338, { debit: 0, credit: 0.32 });
  });

  test("Round Down save posts the −0.68 adjustment as a debit", async ({ page, request }) => {
    const narration = `${E2E_PREFIX} RO down ${RUN_ID}`;
    await fillFractionalSalesLine(page, narration);
    await setRoundOffMode(page, "Round Down");

    await saveVoucher(page, "Save");
    await expect(page.getByText("Voucher Saved").first()).toBeVisible({ timeout: 10000 });

    const token = await adminToken(request);
    const cid = await apexCompanyId(request, token);
    expect(cid).toBeTruthy();

    // ₹337.68 floors to ₹337.00; −0.68 adjustment debits Round Off.
    await assertRoundedVoucher(request, token, cid, narration, 337, { debit: 0.68, credit: 0 });
  });

  test("None-mode save keeps the exact paise total without a round-off line", async ({ page, request }) => {
    const narration = `${E2E_PREFIX} RO none ${RUN_ID}`;
    await fillFractionalSalesLine(page, narration);
    await setRoundOffMode(page, "None");

    await saveVoucher(page, "Save");
    await expect(page.getByText("Voucher Saved").first()).toBeVisible({ timeout: 10000 });

    const token = await adminToken(request);
    const cid = await apexCompanyId(request, token);
    expect(cid).toBeTruthy();

    const v = await findVoucher(request, token, cid, narration);
    expect(v).toBeTruthy();
    const detail = await api(request, "GET", `/vouchers/${v!.id}`, token, cid);
    const body = detail.body as { grand_total: number; lines: Array<{ ledger_id: string }> };
    expect(Math.abs(Number(body.grand_total) - BASELINE)).toBeLessThan(0.011);

    const roId = await roundOffLedgerId(request, token, cid);
    if (roId) {
      expect(body.lines.some((l) => l.ledger_id === roId)).toBe(false);
    }
    const sumD = body.lines.reduce((a, l) => a + (Number((l as { debit?: number }).debit) || 0), 0);
    const sumC = body.lines.reduce((a, l) => a + (Number((l as { credit?: number }).credit) || 0), 0);
    expect(Math.abs(sumD - sumC)).toBeLessThan(0.011);
  });
});
