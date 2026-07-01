import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import {
  selectOption,
  fillDate,
  selectVoucherType,
  fillItemLine,
  fillLedgerLine,
  saveVoucher,
} from "../helpers/interaction";
import { PARTIES, STOCK_ITEMS, LEDGERS, E2E_PREFIX } from "../helpers/fixtures";

const NARRATION_PLACEHOLDER = "Remarks or description";

test.describe("Voucher Creation — All 8 Types", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Vouchers" }).click();
    await page.waitForURL("**/vouchers");
  });

  test.describe("Item-based Vouchers", () => {
    test("Sales Invoice", async ({ page }) => {
      await selectVoucherType(page, "Sales");

      await fillDate(page, "2026-07-01");
      await page.getByPlaceholder("Invoice #").fill(`${E2E_PREFIX} Sales-001`);
      await page.getByPlaceholder(NARRATION_PLACEHOLDER).fill(`${E2E_PREFIX} Sales invoice created`);

      await selectOption(page, "Select party or account...", PARTIES.royalEmporium);
      await selectOption(page, "Select debit account", LEDGERS.hdfcBank);

      await fillItemLine(page, STOCK_ITEMS.a4Paper, 10, 150);

      await saveVoucher(page);

      await expect(page.getByText(`${E2E_PREFIX} Sales invoice created`).first()).toBeVisible();
    });

    test("Purchase Invoice", async ({ page }) => {
      await selectVoucherType(page, "Purchase");

      await fillDate(page, "2026-07-02");
      await page.getByPlaceholder("Invoice #").fill(`${E2E_PREFIX} Pur-001`);
      await page.getByPlaceholder(NARRATION_PLACEHOLDER).fill(`${E2E_PREFIX} Purchase invoice created`);

      await selectOption(page, "Select party or account...", PARTIES.globalDistributors);
      await selectOption(page, "Select credit account", LEDGERS.hdfcBank);

      await fillItemLine(page, STOCK_ITEMS.wirelessMouse, 5, 800);

      await saveVoucher(page);

      await expect(page.getByText(`${E2E_PREFIX} Purchase invoice created`).first()).toBeVisible();
    });

    test("Credit Note", async ({ page }) => {
      await selectVoucherType(page, "Cr Note");

      await fillDate(page, "2026-07-03");
      await page.getByPlaceholder("Credit Note #").fill(`${E2E_PREFIX} CN-001`);
      await page.getByPlaceholder(NARRATION_PLACEHOLDER).fill(`${E2E_PREFIX} Credit note created`);

      await selectOption(page, "Select party or account...", PARTIES.cityMart);
      await selectOption(page, "Select debit account", LEDGERS.hdfcBank);

      await fillItemLine(page, STOCK_ITEMS.ballPen, 2, 200);

      await saveVoucher(page);

      await expect(page.getByText(`${E2E_PREFIX} Credit note created`).first()).toBeVisible();
    });

    test("Debit Note", async ({ page }) => {
      await selectVoucherType(page, "Dr Note");

      await fillDate(page, "2026-07-04");
      await page.getByPlaceholder("Debit Note #").fill(`${E2E_PREFIX} DN-001`);
      await page.getByPlaceholder(NARRATION_PLACEHOLDER).fill(`${E2E_PREFIX} Debit note created`);

      await selectOption(page, "Select party or account...", PARTIES.primeImports);
      await selectOption(page, "Select credit account", LEDGERS.hdfcBank);

      await fillItemLine(page, STOCK_ITEMS.usbDrive, 3, 500);

      await saveVoucher(page);

      await expect(page.getByText(`${E2E_PREFIX} Debit note created`).first()).toBeVisible();
    });
  });

  test.describe("Amount-based Vouchers", () => {
    test("Payment", async ({ page }) => {
      await selectVoucherType(page, "Payment");

      await fillDate(page, "2026-07-05");
      await page.getByPlaceholder("Cheque / UTR #").fill(`${E2E_PREFIX} PMT-001`);
      await page.getByPlaceholder(NARRATION_PLACEHOLDER).fill(`${E2E_PREFIX} Payment made`);

      await selectOption(page, "Select party or account...", PARTIES.globalDistributors);
      await selectOption(page, "Select the bank or cash account", LEDGERS.hdfcBank);
      await selectOption(page, "Select the party or expense ledger", PARTIES.globalDistributors);

      const amountInput = page.locator("input[type='number']").last();
      await amountInput.fill("5000");

      await saveVoucher(page);
      await expect(page.getByText(`${E2E_PREFIX} Payment made`).first()).toBeVisible();
    });

    test("Receipt", async ({ page }) => {
      await selectVoucherType(page, "Receipt");

      await fillDate(page, "2026-07-06");
      await page.getByPlaceholder("Cheque / UTR #").fill(`${E2E_PREFIX} RCP-001`);
      await page.getByPlaceholder(NARRATION_PLACEHOLDER).fill(`${E2E_PREFIX} Receipt received`);

      await selectOption(page, "Select party or account...", PARTIES.royalEmporium);
      await selectOption(page, "Select the party or income ledger", PARTIES.royalEmporium);
      await selectOption(page, "Select the bank or cash account", LEDGERS.hdfcBank);

      const amountInput = page.locator("input[type='number']").last();
      await amountInput.fill("10000");

      await saveVoucher(page);
      await expect(page.getByText(`${E2E_PREFIX} Receipt received`).first()).toBeVisible();
    });

    test("Contra", async ({ page }) => {
      await selectVoucherType(page, "Contra");

      await fillDate(page, "2026-07-07");
      await page.getByPlaceholder("UTR #").fill(`${E2E_PREFIX} CTR-001`);
      await page.getByPlaceholder(NARRATION_PLACEHOLDER).fill(`${E2E_PREFIX} Contra transfer`);

      await selectOption(page, "Select source account", LEDGERS.cash);
      await selectOption(page, "Select destination account", LEDGERS.hdfcBank);

      const amountInput = page.locator("input[type='number']").last();
      await amountInput.fill("2000");

      await saveVoucher(page);
      await expect(page.getByText(`${E2E_PREFIX} Contra transfer`).first()).toBeVisible();
    });
  });

  test.describe("Ledger-based Vouchers", () => {
    test("Journal", async ({ page }) => {
      await selectVoucherType(page, "Journal");

      await fillDate(page, "2026-07-08");
      await page.getByPlaceholder(NARRATION_PLACEHOLDER).fill(`${E2E_PREFIX} Journal entry`);

      await fillLedgerLine(page, 0, LEDGERS.sundryDebtors, 5000, 0);
      await fillLedgerLine(page, 1, LEDGERS.sundryCreditors, 0, 5000);

      await saveVoucher(page);

      await expect(page.getByText(`${E2E_PREFIX} Journal entry`).first()).toBeVisible();
    });
  });
});
