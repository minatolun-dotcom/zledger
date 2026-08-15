import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { selectOption, selectVoucherType } from "../helpers/interaction";
import { E2E_PREFIX } from "../helpers/fixtures";

/**
 * Locks in rounds 23–25: every group-filtered MasterSelector in the voucher
 * forms passes `createDefaults`, so quick-create opens the New Ledger/Party
 * modal with the group the field actually lists pre-filled — and after create
 * the field shows the new account immediately (no empty flash, no popup).
 *
 * Matrix under test:
 *   Sales      party account      → New Ledger Group = Trade Receivables
 *   Purchase   party account      → New Ledger Group = Trade Payables
 *   Receipt    Account (Deposit To) → New Ledger Group = Bank Accounts
 *   Payment    Account (Paid From)  → New Ledger Group = Bank Accounts
 *   Contra     Transfer From      → New Ledger Group = Bank Accounts
 *   Credit note party             → New Party Party Type = Customer
 *   Debit note party              → New Party Party Type = Supplier
 *   Receipt    particulars line   → New Ledger Group = Trade Receivables
 *   Payment    particulars line   → New Ledger Group = Trade Payables
 */

const RUN_ID = Date.now();

/** Type a fresh name into the selector, open the create modal, assert the
 *  pre-filled group, submit, and assert the field shows the new account.
 *
 *  fieldSel: a `[data-field=…]` wrapper — a selected MasterSelector renders
 *  placeholder="", so we scope the combobox input by its wrapper instead. */
async function quickCreateLedger(
  page: Page,
  fieldSel: string,
  expectedGroup: string,
  tag: string
) {
  const name = `${E2E_PREFIX} QC ${tag} ${RUN_ID}`;
  const combo = page.locator(`${fieldSel} input[role="combobox"]`).first();
  await combo.focus();
  await page.waitForTimeout(300);
  await combo.fill(name);
  await page.waitForTimeout(400);

  // The "Create <name>" row appears at the bottom of the popup. It renders
  // typographic quotes (Create “name” via &ldquo;/&rdquo;), so match those.
  await page
    .locator("[data-master-popup] div.cursor-pointer", { hasText: `Create “${name}”` })
    .click();

  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 10000 });

  // Group is a nested MasterSelector — its combobox value is the group label
  // (when a value is selected the input renders placeholder="", so assert the
  // value, not the placeholder). It's the only combobox in the ledger modal.
  const groupInput = dialog.getByRole("combobox").first();
  await expect(groupInput).toHaveValue(expectedGroup, { timeout: 10000 });

  await dialog.getByRole("button", { name: "Create Ledger" }).click();
  await dialog.waitFor({ state: "hidden", timeout: 10000 });

  // No-flash: the field shows the new account immediately after the modal closes.
  await expect(combo).toHaveValue(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), { timeout: 10000 });
  return name;
}

/** Party quick-create (Credit/Debit notes): assert the pre-filled Party Type. */
async function quickCreateParty(
  page: Page,
  fieldSel: string,
  expectedPartyType: string,
  tag: string
) {
  const name = `${E2E_PREFIX} QC ${tag} ${RUN_ID}`;
  const combo = page.locator(`${fieldSel} input[role="combobox"]`).first();
  await combo.focus();
  await page.waitForTimeout(300);
  await combo.fill(name);
  await page.waitForTimeout(400);

  await page
    .locator("[data-master-popup] div.cursor-pointer", { hasText: `Create “${name}”` })
    .click();

  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 10000 });

  // Party Type is a Select trigger button showing the pre-filled value.
  await expect(
    dialog.getByRole("button", { name: expectedPartyType, exact: true })
  ).toBeVisible({ timeout: 10000 });

  await dialog.getByRole("button", { name: "Create Party" }).click();
  await dialog.waitFor({ state: "hidden", timeout: 10000 });

  await expect(combo).toHaveValue(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), { timeout: 10000 });
  return name;
}

test.describe("Quick Create — group/party pre-fill matrix (rounds 23–25)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Vouchers" }).click();
    await page.waitForURL("**/vouchers");
  });

  test("Sales — Party Account quick-create pre-fills Trade Receivables", async ({ page }) => {
    await selectVoucherType(page, "Sales");
    await quickCreateLedger(page, '[data-field="account"]', "Trade Receivables", "Sales");
  });

  test("Purchase — Party Account quick-create pre-fills Trade Payables", async ({ page }) => {
    await selectVoucherType(page, "Purchase");
    await quickCreateLedger(page, '[data-field="account"]', "Trade Payables", "Purchase");
  });

  test("Receipt — Account quick-create pre-fills Bank Accounts", async ({ page }) => {
    await selectVoucherType(page, "Receipt");
    await quickCreateLedger(page, '[data-field="account"]', "Bank Accounts", "Receipt");
  });

  test("Payment — Account quick-create pre-fills Bank Accounts", async ({ page }) => {
    await selectVoucherType(page, "Payment");
    await quickCreateLedger(page, '[data-field="account"]', "Bank Accounts", "Payment");
  });

  test("Contra — Transfer From quick-create pre-fills Bank Accounts", async ({ page }) => {
    await selectVoucherType(page, "Contra");
    await quickCreateLedger(page, '[data-field="from_account"]', "Bank Accounts", "Contra");
  });

  test("Credit Note — party quick-create pre-fills Customer", async ({ page }) => {
    await selectVoucherType(page, "Cr Note");
    await quickCreateParty(page, '[data-field="party"]', "Customer", "CrNote");
  });

  test("Debit Note — party quick-create pre-fills Supplier", async ({ page }) => {
    await selectVoucherType(page, "Dr Note");
    await quickCreateParty(page, '[data-field="party"]', "Supplier", "DrNote");
  });

  test("Receipt — particulars party line quick-create pre-fills Trade Receivables", async ({ page }) => {
    await selectVoucherType(page, "Receipt");
    // The particulars table renders only after an account is selected.
    await selectOption(page, "Select cash / bank account...", "HDFC Bank - Current A/c");
    await page.waitForTimeout(600);
    await quickCreateLedger(page, '[data-field="ledger_0"]', "Trade Receivables", "RcptLine");
  });

  test("Payment — particulars party line quick-create pre-fills Trade Payables", async ({ page }) => {
    await selectVoucherType(page, "Payment");
    await selectOption(page, "Select cash / bank account...", "HDFC Bank - Current A/c");
    await page.waitForTimeout(600);
    await quickCreateLedger(page, '[data-field="ledger_0"]', "Trade Payables", "PmtLine");
  });
});
