import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import {
  selectOption,
  fillDate,
  selectVoucherType,
  fillLedgerLine,
  saveVoucher,
} from "../helpers/interaction";
import { PARTIES, STOCK_ITEMS, LEDGERS, E2E_PREFIX } from "../helpers/fixtures";

const RUN_ID = Date.now();

// ── Helpers (mirror voucher-workflow.spec.ts) ─────────────────────────────

async function openVouchersPage(page: Page) {
  await page.getByRole("link", { name: "Vouchers" }).click();
  await page.waitForURL("**/vouchers");
  await page.waitForTimeout(800);
}

async function expectSaved(page: Page) {
  await expect(page.getByText("Voucher Saved").first()).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(600);
}

async function createPaymentVoucher(page: Page, narration: string, amount: string) {
  await selectVoucherType(page, "Payment");
  await fillDate(page, "2026-07-05");
  await selectOption(page, "Select cash / bank account...", LEDGERS.hdfcBank);
  await page.getByPlaceholder("Cheque / UTR / Ref #").fill(`${E2E_PREFIX} TOT-PMT-${RUN_ID}`);
  await selectOption(page, "Select ledger...", PARTIES.globalDistributors);
  await page.getByRole("row").nth(1).getByPlaceholder("0.00").fill(amount);
  await page.getByPlaceholder("Narration...").fill(narration);
  await saveVoucher(page, "Save");
  await expectSaved(page);
}

async function createReceiptVoucher(page: Page, narration: string, amount: string) {
  await selectVoucherType(page, "Receipt");
  await fillDate(page, "2026-07-06");
  await selectOption(page, "Select cash / bank account...", LEDGERS.hdfcBank);
  await page.getByPlaceholder("Cheque / UTR / Ref #").fill(`${E2E_PREFIX} TOT-RCP-${RUN_ID}`);
  await selectOption(page, "Select ledger...", PARTIES.royalEmporium);
  await page.getByRole("row").nth(1).getByPlaceholder("0.00").fill(amount);
  await page.getByPlaceholder("Narration...").fill(narration);
  await saveVoucher(page, "Save");
  await expectSaved(page);
}

async function createContraVoucher(page: Page, narration: string, amount: string) {
  await selectVoucherType(page, "Contra");
  await fillDate(page, "2026-07-07");
  await selectOption(page, "Select cash / bank...", LEDGERS.hdfcBank, 1);
  await selectOption(page, "Select cash / bank...", LEDGERS.cash, 0);
  await page.getByPlaceholder("UTR / Cheque # / Txn ID").fill(`${E2E_PREFIX} TOT-CTR-${RUN_ID}`);
  await page.getByPlaceholder("0.00").fill(amount);
  await page.getByPlaceholder("Narration...").fill(narration);
  await saveVoucher(page, "Save");
  await expectSaved(page);
}

async function createJournalVoucher(page: Page, narration: string, amount: string) {
  await selectVoucherType(page, "Journal");
  await fillDate(page, "2026-07-08");
  await page.getByPlaceholder("Remarks or description").fill(narration);
  await fillLedgerLine(page, 0, LEDGERS.sundryDebtors, Number(amount), 0);
  await fillLedgerLine(page, 1, LEDGERS.sundryCreditors, 0, Number(amount));
  await saveVoucher(page);
  await expectSaved(page);
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

/**
 * Assert the Browse list's Amount column (which renders the server-side
 * grand_total) shows the expected single-side amount. This is the regression
 * guard for the subtotal double-count fix: a ₹1,000 payment must show
 * ₹1,000.00 in the Amount column — never ₹2,000.00.
 *
 * The list search is server-side, so the freshly-created voucher is found
 * even though it would sit on page 2 of the default date-desc sort.
 */
async function assertGrandTotal(page: Page, narration: string, expected: string) {
  // The voucher list (with its server-side search) lives on the Browse tab;
  // after saving, the Create tab shows the SavedVoucherBanner instead.
  await page.getByRole("tab", { name: "Browse", exact: true }).click();
  const search = page.getByPlaceholder("Search by voucher #, party, or narration...");
  await expect(search).toBeVisible({ timeout: 8000 });
  await search.fill(narration);
  await page.waitForTimeout(1500); // debounce + server fetch
  const row = page.locator("tbody tr", { hasText: narration });
  await expect(row.first()).toBeVisible({ timeout: 8000 });
  // The only ₹ amount in a row is the Amount (grand_total) cell.
  await expect(row.first()).toContainText(`₹${expected}`, { timeout: 5000 });
}

test.describe("Voucher totals — TallyPrime parity (single-side grand total)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await openVouchersPage(page);
  });

  test("Payment ₹5,000 shows Grand Total ₹5,000.00 (not ₹10,000)", async ({ page }) => {
    const narration = `${E2E_PREFIX} TOT Pay ${RUN_ID}`;
    await createPaymentVoucher(page, narration, "5000");
    await assertGrandTotal(page, narration, "5,000.00");
  });

  test("Receipt ₹10,000 shows Grand Total ₹10,000.00 (not ₹20,000)", async ({ page }) => {
    const narration = `${E2E_PREFIX} TOT Rec ${RUN_ID}`;
    await createReceiptVoucher(page, narration, "10000");
    await assertGrandTotal(page, narration, "10,000.00");
  });

  test("Contra ₹2,000 shows Grand Total ₹2,000.00 (not ₹4,000)", async ({ page }) => {
    const narration = `${E2E_PREFIX} TOT Ctr ${RUN_ID}`;
    await createContraVoucher(page, narration, "2000");
    await assertGrandTotal(page, narration, "2,000.00");
  });

  test("Journal ₹5,000 shows Grand Total ₹5,000.00 (not ₹10,000)", async ({ page }) => {
    const narration = `${E2E_PREFIX} TOT Jrn ${RUN_ID}`;
    await createJournalVoucher(page, narration, "5000");
    await assertGrandTotal(page, narration, "5,000.00");
  });

  test("Sales 10 × ₹150 @12% GST shows Grand Total ₹1,680.00", async ({ page }) => {
    const narration = `${E2E_PREFIX} TOT Sal ${RUN_ID}`;
    await createSalesVoucher(page, narration);
    // 10 × ₹150 = ₹1,500 taxable + 12% GST (₹90 CGST + ₹90 SGST) = ₹1,680
    await assertGrandTotal(page, narration, "1,680.00");
  });
});
