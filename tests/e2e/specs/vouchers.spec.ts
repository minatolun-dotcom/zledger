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

const RUN_ID = Date.now();

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
      await page.getByPlaceholder("Narration...").fill(`${E2E_PREFIX} Sales invoice ${RUN_ID}`);

      // Credit sale: account = sundry-debtor ledger (party auto-detected)
      await selectOption(page, "Select party / cash / bank...", PARTIES.royalEmporium);

      await fillItemLine(page, STOCK_ITEMS.a4Paper, 10, 150, "Search items...");

      await saveVoucher(page, "Save");

      await expect(page.getByText("Voucher Saved").first()).toBeVisible();
    });

    test("Purchase Invoice", async ({ page }) => {
      await selectVoucherType(page, "Purchase");

      await fillDate(page, "2026-07-02");
      await page.getByPlaceholder("Narration...").fill(`${E2E_PREFIX} Purchase invoice ${RUN_ID}`);

      // Credit purchase: account = sundry-creditor ledger
      await selectOption(page, "Select supplier / cash / bank...", "Bharat Distributors");

      // PurchaseItemTable: MasterSelector combobox is always visible (no dblclick needed).
      // Item cell is td[data-cell='0_0'], qty is td[data-cell='0_1'], rate is td[data-cell='0_3'].
      await selectOption(page, "Search items...", STOCK_ITEMS.wirelessMouse);
      await page.waitForTimeout(300);

      const row = page.locator("table").first().locator("tbody tr").first();
      await row.locator("td[data-cell='0_1'] input[type='number']").fill("5");
      await page.waitForTimeout(200);
      await row.locator("td[data-cell='0_3'] input[type='number']").fill("800");
      await page.waitForTimeout(200);

      await saveVoucher(page, "Save");

      await expect(page.getByText("Voucher Saved").first()).toBeVisible();
    });

    test("Credit Note", async ({ page }) => {
      await selectVoucherType(page, "Cr Note");

      await fillDate(page, "2026-07-03");
      await page.getByPlaceholder("Credit Note #").fill(`${E2E_PREFIX} CN-001`);
      await page.getByPlaceholder("Remarks or description").fill(`${E2E_PREFIX} Credit note ${RUN_ID}`);

      await selectOption(page, "Select party or account...", PARTIES.cityMart);
      await selectOption(page, "Select credit account...", LEDGERS.hdfcBank);

      // ItemLineTable uses "Select..." placeholder (not "Search items...").
      // No <table> element — number inputs are in a div layout.
      await selectOption(page, "Select...", STOCK_ITEMS.ballPen);
      await page.waitForTimeout(300);
      const cnInputs = page.locator("input[type='number']");
      await cnInputs.nth(0).fill("2");
      await cnInputs.nth(1).fill("200");

      await saveVoucher(page);

      await expect(page.getByText("Voucher Saved").first()).toBeVisible();
    });

    test("Debit Note", async ({ page }) => {
      await selectVoucherType(page, "Dr Note");

      await fillDate(page, "2026-07-04");
      await page.getByPlaceholder("Debit Note #").fill(`${E2E_PREFIX} DN-001`);
      await page.getByPlaceholder("Remarks or description").fill(`${E2E_PREFIX} Debit note ${RUN_ID}`);

      await selectOption(page, "Select party or account...", PARTIES.primeImports);
      await selectOption(page, "Select debit account...", LEDGERS.hdfcBank);

      // ItemLineTable uses "Select..." placeholder (not "Search items...").
      // No <table> element — number inputs are in a div layout.
      await selectOption(page, "Select...", STOCK_ITEMS.usbDrive);
      await page.waitForTimeout(300);
      const dnInputs = page.locator("input[type='number']");
      await dnInputs.nth(0).fill("3");
      await dnInputs.nth(1).fill("500");

      await saveVoucher(page);

      await expect(page.getByText("Voucher Saved").first()).toBeVisible();
    });
  });

  test.describe("Amount-based Vouchers", () => {
    test("Payment", async ({ page }) => {
      await selectVoucherType(page, "Payment");

      await fillDate(page, "2026-07-05");
      // Cash/bank account must be chosen FIRST — payment mode & reference
      // fields only render after it is set.
      await selectOption(page, "Select cash / bank account...", LEDGERS.hdfcBank);
      await page.getByPlaceholder("Cheque / UTR / Ref #").fill(`${E2E_PREFIX} PMT-001`);

      // Particulars: payee ledger + amount
      await selectOption(page, "Select ledger...", PARTIES.globalDistributors);
      // There are multiple rows with "0.00" placeholder — scope to the first row
      await page.getByRole("row").nth(1).getByPlaceholder("0.00").fill("5000");

      await page.getByPlaceholder("Narration...").fill(`${E2E_PREFIX} Payment ${RUN_ID}`);
      await saveVoucher(page, "Save");
      await expect(page.getByText("Voucher Saved").first()).toBeVisible();
    });

    test("Receipt", async ({ page }) => {
      await selectVoucherType(page, "Receipt");

      await fillDate(page, "2026-07-06");
      await selectOption(page, "Select cash / bank account...", LEDGERS.hdfcBank);
      await page.getByPlaceholder("Cheque / UTR / Ref #").fill(`${E2E_PREFIX} RCP-001`);

      await selectOption(page, "Select ledger...", PARTIES.royalEmporium);
      // There are multiple rows with "0.00" placeholder — scope to the first row
      await page.getByRole("row").nth(1).getByPlaceholder("0.00").fill("10000");

      await page.getByPlaceholder("Narration...").fill(`${E2E_PREFIX} Receipt ${RUN_ID}`);
      await saveVoucher(page, "Save");
      await expect(page.getByText("Voucher Saved").first()).toBeVisible();
    });

    test("Contra", async ({ page }) => {
      await selectVoucherType(page, "Contra");

      await fillDate(page, "2026-07-07");
      // Select the destination first (its placeholder vanishes once the
      // source is chosen, which would shift nth-indexing).
      await selectOption(page, "Select cash / bank...", LEDGERS.hdfcBank, 1);
      await selectOption(page, "Select cash / bank...", LEDGERS.cash, 0);

      // Transfer reference only renders after BOTH accounts are chosen
      await page.getByPlaceholder("UTR / Cheque # / Txn ID").fill(`${E2E_PREFIX} CTR-001`);
      await page.getByPlaceholder("0.00").fill("2000");
      await page.getByPlaceholder("Narration...").fill(`${E2E_PREFIX} Contra ${RUN_ID}`);

      await saveVoucher(page, "Save");
      await expect(page.getByText("Voucher Saved").first()).toBeVisible();
    });

  });

  test.describe("Ledger-based Vouchers", () => {
    test("Journal", async ({ page }) => {
      await selectVoucherType(page, "Journal");

      await fillDate(page, "2026-07-08");
      await page.getByPlaceholder("Remarks or description").fill(`${E2E_PREFIX} Journal ${RUN_ID}`);

      await fillLedgerLine(page, 0, LEDGERS.sundryDebtors, 5000, 0);
      await fillLedgerLine(page, 1, LEDGERS.sundryCreditors, 0, 5000);

      await saveVoucher(page);

      await expect(page.getByText("Voucher Saved").first()).toBeVisible();
    });
  });
});
