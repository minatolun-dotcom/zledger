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
      await selectOption(page, "Select Account...", PARTIES.royalEmporium);

      await fillItemLine(page, STOCK_ITEMS.a4Paper, 10, 150, "Search items...");

      await saveVoucher(page, "Save Sale");

      await expect(page.getByText("Voucher Saved").first()).toBeVisible();
    });

    test("Purchase Invoice", async ({ page }) => {
      await selectVoucherType(page, "Purchase");

      await fillDate(page, "2026-07-02");
      await page.getByPlaceholder("Narration...").fill(`${E2E_PREFIX} Purchase invoice ${RUN_ID}`);

      // Credit purchase: account = sundry-creditor ledger
      await selectOption(page, "Select Supplier/Cash/Bank...", "Bharat Distributors");

      // PurchaseItemTable is click-to-edit: dblclick the item cell, pick the item,
      // then dblclick qty/rate cells to set values (display cells carry the
      // onDoubleClick handler; edit inputs get data-field attrs).
      const row = page.locator("table").first().locator("tbody tr").first();
      await row.locator("td[data-field='item']").first().dblclick();
      await page.waitForTimeout(300);
      await selectOption(page, "Select item/service", STOCK_ITEMS.wirelessMouse);
      await page.waitForTimeout(300);

      await row.locator("td.text-right").first().dblclick(); // qty
      await page.locator("input[data-field='qty']").fill("5");
      await page.keyboard.press("Enter"); // commit → moves to rate
      await page.waitForTimeout(200);
      await page.locator("input[data-field='rate']").fill("800");
      await page.keyboard.press("Escape");

      await saveVoucher(page, "Save Purchase");

      await expect(page.getByText("Voucher Saved").first()).toBeVisible();
    });

    test("Credit Note", async ({ page }) => {
      await selectVoucherType(page, "Cr Note");

      await fillDate(page, "2026-07-03");
      await page.getByPlaceholder("Credit Note #").fill(`${E2E_PREFIX} CN-001`);
      await page.getByPlaceholder("Remarks or description").fill(`${E2E_PREFIX} Credit note ${RUN_ID}`);

      await selectOption(page, "Select party or account...", PARTIES.cityMart);
      await selectOption(page, "Select credit account...", LEDGERS.hdfcBank);

      await fillItemLine(page, STOCK_ITEMS.ballPen, 2, 200);

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

      await fillItemLine(page, STOCK_ITEMS.usbDrive, 3, 500);

      await saveVoucher(page);

      await expect(page.getByText("Voucher Saved").first()).toBeVisible();
    });
  });

  test.describe("Amount-based Vouchers", () => {
    test("Payment", async ({ page }) => {
      await selectVoucherType(page, "Payment");

      await fillDate(page, "2026-07-05");
      await page.getByPlaceholder("Cheque / UTR / Ref #").fill(`${E2E_PREFIX} PMT-001`);
      await page.getByPlaceholder("Enter payment narration...").fill(`${E2E_PREFIX} Payment ${RUN_ID}`);

      await selectOption(page, "Select cash / bank...", LEDGERS.hdfcBank);
      await selectOption(page, "Select supplier / expense / asset...", PARTIES.globalDistributors);

      await page.getByPlaceholder("0.00").fill("5000");

      await saveVoucher(page, "Save Payment");
      await expect(page.getByText("Voucher Saved").first()).toBeVisible();
    });

    test("Receipt", async ({ page }) => {
      await selectVoucherType(page, "Receipt");

      await fillDate(page, "2026-07-06");
      await page.getByPlaceholder("Cheque / UTR / Ref #").fill(`${E2E_PREFIX} RCP-001`);
      await page.getByPlaceholder("Enter receipt narration...").fill(`${E2E_PREFIX} Receipt ${RUN_ID}`);

      await selectOption(page, "Select cash / bank...", LEDGERS.hdfcBank);
      await selectOption(page, "Select customer / supplier...", PARTIES.royalEmporium);

      await page.getByPlaceholder("0.00").fill("10000");

      await saveVoucher(page, "Save Receipt");
      await expect(page.getByText("Voucher Saved").first()).toBeVisible();
    });

    test("Contra", async ({ page }) => {
      await selectVoucherType(page, "Contra");

      await fillDate(page, "2026-07-07");
      await page.getByPlaceholder("Cheque / UTR / Ref #").fill(`${E2E_PREFIX} CTR-001`);
      await page.getByPlaceholder("Enter transfer narration...").fill(`${E2E_PREFIX} Contra ${RUN_ID}`);

      // Select the destination first (its placeholder vanishes once the
      // source is chosen, which would shift nth-indexing).
      await selectOption(page, "Select cash / bank...", LEDGERS.hdfcBank, 1);
      await selectOption(page, "Select cash / bank...", LEDGERS.cash, 0);

      await page.getByPlaceholder("0.00").fill("2000");

      await saveVoucher(page, "Save Contra");
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
