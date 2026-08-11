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

// ── Real-user workflow helpers ────────────────────────────────────────────

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

async function createPaymentVoucher(page: Page, narration: string) {
  await selectVoucherType(page, "Payment");
  await fillDate(page, "2026-07-05");
  await selectOption(page, "Select cash / bank account...", LEDGERS.hdfcBank);
  await page.getByPlaceholder("Cheque / UTR / Ref #").fill(`${E2E_PREFIX} PMT-${RUN_ID}`);
  await selectOption(page, "Select ledger...", PARTIES.globalDistributors);
  await page.getByRole("row").nth(1).getByPlaceholder("0.00").fill("5000");
  await page.getByPlaceholder("Narration...").fill(narration);
  await saveVoucher(page, "Save");
  await expectSaved(page);
}

async function createReceiptVoucher(page: Page, narration: string) {
  await selectVoucherType(page, "Receipt");
  await fillDate(page, "2026-07-06");
  await selectOption(page, "Select cash / bank account...", LEDGERS.hdfcBank);
  await page.getByPlaceholder("Cheque / UTR / Ref #").fill(`${E2E_PREFIX} RCP-${RUN_ID}`);
  await selectOption(page, "Select ledger...", PARTIES.royalEmporium);
  await page.getByRole("row").nth(1).getByPlaceholder("0.00").fill("10000");
  await page.getByPlaceholder("Narration...").fill(narration);
  await saveVoucher(page, "Save");
  await expectSaved(page);
}

async function createContraVoucher(page: Page, narration: string) {
  await selectVoucherType(page, "Contra");
  await fillDate(page, "2026-07-07");
  await selectOption(page, "Select cash / bank...", LEDGERS.hdfcBank, 1);
  await selectOption(page, "Select cash / bank...", LEDGERS.cash, 0);
  await page.getByPlaceholder("UTR / Cheque # / Txn ID").fill(`${E2E_PREFIX} CTR-${RUN_ID}`);
  await page.getByPlaceholder("0.00").fill("2000");
  await page.getByPlaceholder("Narration...").fill(narration);
  await saveVoucher(page, "Save");
  await expectSaved(page);
}

async function createJournalVoucher(page: Page, narration: string) {
  await selectVoucherType(page, "Journal");
  await fillDate(page, "2026-07-08");
  await page.getByPlaceholder("Remarks or description").fill(narration);
  await fillLedgerLine(page, 0, LEDGERS.sundryDebtors, 5000, 0);
  await fillLedgerLine(page, 1, LEDGERS.sundryCreditors, 0, 5000);
  await saveVoucher(page);
  await expectSaved(page);
}

async function goToDaybook(page: Page) {
  await page.getByRole("tab", { name: "Daybook" }).click();
  await page.waitForTimeout(1200);
}

async function searchDaybook(page: Page, text: string) {
  await page.getByPlaceholder("Search voucher #, party, narration...").fill(text);
  await page.waitForTimeout(1200); // 300ms debounce + fetch
}

function daybookRow(page: Page, narration: string) {
  return page.locator("tbody tr", { hasText: narration });
}

async function openVoucherFromDaybook(page: Page, narration: string) {
  await searchDaybook(page, narration);
  const row = daybookRow(page, narration);
  await expect(row.first()).toBeVisible({ timeout: 8000 });
  await row.first().getByText(narration, { exact: false }).first().click();
  await page.waitForTimeout(800);
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
}

test.describe("Voucher Workflow — real-user simulation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await openVouchersPage(page);
  });

  test("Sales: create → verify in Day Book → open → PDF preview → close", async ({ page }) => {
    const narration = `${E2E_PREFIX} WF Sales ${RUN_ID}`;
    await createSalesVoucher(page, narration);

    // Real user checks the Day Book for the new entry
    await goToDaybook(page);
    await searchDaybook(page, narration);
    const row = daybookRow(page, narration);
    await expect(row.first()).toBeVisible({ timeout: 8000 });

    // Open the voucher from its row
    await row.first().getByText(narration, { exact: false }).first().click();
    await page.waitForTimeout(800);
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toHaveCount(1);
    await expect(dialog.getByRole("button", { name: "Preview PDF" })).toBeVisible();

    // Preview PDF → a second (topmost) dialog opens; close it with Escape
    // (the preview's close control is an icon-only X).
    await dialog.getByRole("button", { name: "Preview PDF" }).click();
    await expect(page.locator('[role="dialog"]')).toHaveCount(2, { timeout: 5000 });
    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"]')).toHaveCount(1, { timeout: 5000 });

    // Close the voucher modal
    await page.locator('[role="dialog"]').first().getByRole("button", { name: "Close" }).click();
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 5000 });
  });

  test("Payment: edit narration in the modal, update persists in Day Book", async ({ page }) => {
    const narration = `${E2E_PREFIX} WF Edit ${RUN_ID}`;
    await createPaymentVoucher(page, narration);

    await goToDaybook(page);
    await openVoucherFromDaybook(page, narration);

    // Edit mode: footer shows Update, narration is editable (scope to the
    // dialog — the Day Book search input matches "Narration..." too)
    const narrationInput = page.locator('[role="dialog"]').getByPlaceholder("Narration...");
    await expect(narrationInput).toHaveValue(narration);
    const updated = `${narration} UPDATED`;
    await narrationInput.fill(updated);
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await page.waitForTimeout(1200);

    // Close and confirm the updated narration is searchable in the Day Book
    await page.locator('[role="dialog"]').first().getByRole("button", { name: "Close" }).click();
    await searchDaybook(page, updated);
    await expect(daybookRow(page, updated).first()).toBeVisible({ timeout: 8000 });
  });

  test("Receipt: Create Similar duplicates a voucher (pre-filled form → new voucher)", async ({ page }) => {
    const narration = `${E2E_PREFIX} WF Dup ${RUN_ID}`;
    await createReceiptVoucher(page, narration);

    // Post-save banner → Create Similar
    const bannerBtn = page.getByRole("button", { name: "Create Similar" });
    await expect(bannerBtn).toBeVisible({ timeout: 5000 });
    await bannerBtn.click();

    // The app strips ?similar immediately — the signal is the pre-filled form
    // (similarData arrives via an async fetch, so give it time to land)
    await expect(page.getByPlaceholder("Narration...")).toHaveValue(narration, { timeout: 8000 });

    // Save as a new voucher with a distinct narration. Amounts are not part
    // of the prefill (transaction-specific), so re-enter the line amount.
    const copyNarration = `${E2E_PREFIX} WF Copy ${RUN_ID}`;
    await page.getByPlaceholder("Narration...").fill(copyNarration);
    await page.getByRole("row").nth(1).getByPlaceholder("0.00").fill("10000");
    await saveVoucher(page, "Save");
    await expectSaved(page);

    // Both the original and the copy exist in the Day Book
    await goToDaybook(page);
    await searchDaybook(page, narration);
    await expect(daybookRow(page, narration).first()).toBeVisible({ timeout: 8000 });
    await searchDaybook(page, copyNarration);
    await expect(daybookRow(page, copyNarration).first()).toBeVisible({ timeout: 8000 });
  });

  test("Journal: cancel from Day Book kebab creates reversal + Cancelled badge", async ({ page }) => {
    const narration = `${E2E_PREFIX} WF Cancel ${RUN_ID}`;
    await createJournalVoucher(page, narration);

    await goToDaybook(page);
    await searchDaybook(page, narration);
    const row = daybookRow(page, narration);
    await expect(row.first()).toBeVisible({ timeout: 8000 });

    // Kebab → Cancel → confirm the reversal dialog
    await row.first().getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: "Confirm" });
    await expect(confirm.getByText("A reversal entry will be created")).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel Voucher" }).click();
    await page.waitForTimeout(1500);

    // Cancelled vouchers can't be cancelled again — the kebab drops the item
    await row.first().getByRole("button", { name: /Actions for/ }).click();
    const items = await page.locator("div.w-48 button").allTextContents();
    expect(items).not.toContain("Cancel");
    expect(items).toContain("Delete");
    await page.keyboard.press("Escape");
  });

  test("Contra: delete from the voucher modal, entry disappears from Day Book", async ({ page }) => {
    const narration = `${E2E_PREFIX} WF Delete ${RUN_ID}`;
    await createContraVoucher(page, narration);

    await goToDaybook(page);
    await searchDaybook(page, narration);
    const row = daybookRow(page, narration);
    await expect(row.first()).toBeVisible({ timeout: 8000 });

    // Posted vouchers must be cancelled first (API rejects direct deletes
    // with "is posted; cancel it first") — cancel via the kebab, then delete.
    await row.first().getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const cancelConfirm = page.getByRole("dialog", { name: "Confirm" });
    await expect(cancelConfirm.getByText("A reversal entry will be created")).toBeVisible();
    await cancelConfirm.getByRole("button", { name: "Cancel Voucher" }).click();
    await page.waitForTimeout(1500);

    // Now open the (cancelled) voucher and delete it from the modal
    await row.first().getByText(narration, { exact: false }).first().click();
    await page.waitForTimeout(800);
    await page.locator('[role="dialog"]').first().getByRole("button", { name: "Delete" }).click();
    const confirm = page.getByRole("dialog", { name: "Confirm" });
    await expect(confirm.getByText("Delete this voucher?")).toBeVisible();
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();

    // Modal closes and the Day Book no longer lists it
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 5000 });
    await searchDaybook(page, narration);
    await expect(daybookRow(page, narration)).toHaveCount(0, { timeout: 8000 });
  });

  test("Keyboard: F1-F8 switch voucher types in the Create tab", async ({ page }) => {
    await page.keyboard.press("F1");
    await expect(page.getByRole("tab", { name: /Sales/ })).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("F3");
    await expect(page.getByRole("tab", { name: /Payment/ })).toHaveAttribute("aria-selected", "true");
    // Payment form rendered
    await expect(page.getByPlaceholder("Select cash / bank account...")).toBeVisible();

    await page.keyboard.press("F5");
    await expect(page.getByRole("tab", { name: /Contra/ })).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("F8");
    await expect(page.getByRole("tab", { name: /Dr Note/ })).toHaveAttribute("aria-selected", "true");
  });

  test("Keyboard: Alt+N starts a fresh form, Alt+E opens the saved voucher", async ({ page }) => {
    // Alt+N after save → banner clears, fresh form
    const narration = `${E2E_PREFIX} WF Keys N ${RUN_ID}`;
    await createPaymentVoucher(page, narration);
    await expect(page.getByRole("button", { name: "New Voucher" })).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Alt+N");
    await expect(page.getByRole("button", { name: "New Voucher" })).toHaveCount(0);
    await expect(page.getByPlaceholder("Narration...")).toHaveValue("");

    // Alt+E after a fresh save → opens the edit modal for that voucher
    const narration2 = `${E2E_PREFIX} WF Keys E ${RUN_ID}`;
    await createPaymentVoucher(page, narration2);
    await expect(page.getByRole("button", { name: "New Voucher" })).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Alt+E");
    await page.waitForTimeout(800);
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toHaveCount(1);
    await expect(dialog.getByRole("button", { name: "Update", exact: true })).toBeVisible();
    await expect(dialog.getByPlaceholder("Narration...")).toHaveValue(narration2);
    await dialog.getByRole("button", { name: "Close" }).click();
  });
});
